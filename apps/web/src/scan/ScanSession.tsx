import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from '../lib/api';
import { get, set } from 'idb-keyval';
import { editImage, prepareImage, rotateImage, type ImageEdits, type RotateDirection } from '../lib/image';
import { loadPages, savePages, type PendingPage } from '../lib/pages-store';
import { tesseractRecognize } from '../lib/tesseract';
import type { Engine } from '../lib/types';
import { assessQuality } from './quality';

/** Avance del escaneo de una página (0 a 1) y qué se está haciendo. */
export interface ScanProgress {
  value: number;
  label: string;
}

interface ScanSession {
  pages: PendingPage[];
  /** Solo para las páginas que se están escaneando ahora mismo. */
  progress: Record<string, ScanProgress>;
  ready: boolean;
  engine: Engine;
  language: string;
  autoScan: boolean;
  setEngine: (e: Engine) => void;
  setLanguage: (l: string) => void;
  setAutoScan: (v: boolean) => void;
  /** Optional document type for the whole batch (a doc-templates key), remembered on this device. */
  docType: string | null;
  setDocType: (key: string | null) => void;
  /** Añade imágenes al final; devuelve los ids creados y cuántas no se pudieron leer. */
  addImages: (files: Blob[]) => Promise<{ ids: string[]; failed: number }>;
  queue: (ids?: string[]) => void;
  updateText: (id: string, text: string) => void;
  remove: (id: string) => void;
  removeMany: (ids: string[]) => void;
  move: (id: string, delta: number) => void;
  /** Moves a sheet to an absolute position (drag and drop). */
  reorder: (id: string, toIndex: number) => void;
  /** Gira la imagen 90° (útil si la foto salió de lado). Un texto ya leído vuelve a quedar por leer. */
  rotate: (id: string, direction?: RotateDirection) => Promise<void>;
  /** Applies crop/rotation/filter; like rotate, a processed sheet goes back to unprocessed. */
  edit: (id: string, edits: ImageEdits) => Promise<void>;
  /** Replaces the photo of a sheet in place (retake), keeping its position. */
  replace: (id: string, file: Blob) => Promise<void>;
}

const ScanSessionContext = createContext<ScanSession | null>(null);

// Errores de configuración: no tiene sentido seguir con la cola hasta que el usuario los corrija.
const batchKey = (userId: number) => `ocryon:scan-batch:${userId}`;

const BLOCKING_CODES = new Set(['missing_api_key', 'invalid_api_key', 'invalid_model', 'offline', 'unauthenticated']);

/**
 * Sesión de escaneo global: las páginas capturadas y la cola de OCR sobreviven
 * a la navegación entre pantallas y a recargas (se guardan en IndexedDB).
 */
export function ScanSessionProvider({
  children,
  userId,
  defaults,
}: {
  children: ReactNode;
  userId: number;
  defaults: { engine: Engine; language: string; autoScan: boolean };
}) {
  const [pages, setPages] = useState<PendingPage[]>([]);
  // El progreso va aparte de las páginas: cambia muchas veces por segundo y no debe guardarse en IndexedDB.
  const [progress, setProgress] = useState<Record<string, ScanProgress>>({});
  const [ready, setReady] = useState(false);
  const [engine, setEngine] = useState<Engine>(defaults.engine);
  const [language, setLanguage] = useState(defaults.language);
  const [autoScan, setAutoScan] = useState(defaults.autoScan);
  const [docType, setDocTypeState] = useState<string | null>(null);
  const running = useRef(false);

  useEffect(() => {
    get<{ docType?: string | null }>(batchKey(userId))
      .then((saved) => setDocTypeState(saved?.docType ?? null))
      .catch(() => {});
  }, [userId]);

  const setDocType = useCallback(
    (key: string | null) => {
      setDocTypeState(key);
      set(batchKey(userId), { docType: key }).catch(() => {});
    },
    [userId],
  );

  useEffect(() => {
    setEngine(defaults.engine);
    setLanguage(defaults.language);
    setAutoScan(defaults.autoScan);
  }, [defaults.engine, defaults.language, defaults.autoScan]);

  useEffect(() => {
    loadPages(userId).then((p) => {
      setPages(p);
      setReady(true);
    });
  }, [userId]);

  useEffect(() => {
    if (ready) void savePages(userId, pages);
  }, [pages, ready, userId]);

  const patch = useCallback((id: string, changes: Partial<PendingPage>) => {
    setPages((all) => all.map((p) => (p.id === id ? { ...p, ...changes } : p)));
  }, []);

  // Procesa la cola de una página a la vez.
  useEffect(() => {
    if (!ready || running.current) return;
    const next = pages.find((p) => p.status === 'queued');
    if (!next) return;

    running.current = true;
    patch(next.id, { status: 'scanning', error: undefined });
    const report = (value: number, label: string) =>
      setProgress((all) => ({ ...all, [next.id]: { value: Math.min(1, Math.max(0, value)), label } }));
    report(0.02, 'Iniciando…');
    let timer: ReturnType<typeof setInterval> | undefined;

    (async () => {
      try {
        if (engine !== 'tesseract' && !navigator.onLine) {
          throw new ApiError(0, 'Sin internet: elige Tesseract para leer sin conexión', 'offline');
        }
        let text: string;
        if (engine === 'tesseract') {
          text = await tesseractRecognize(next.image, language, report);
        } else {
          // La subida tiene progreso real (0–40 %); el procesado en el servidor se estima
          // acercándose poco a poco al 95 % hasta que llega la respuesta.
          let current = 0.02;
          let processing = false;
          timer = setInterval(() => {
            if (!processing) return;
            current += (0.95 - current) * 0.06;
            report(current, 'Reconociendo texto…');
          }, 200);
          const result = await api.ocr(next.image, engine, language, (fraction) => {
            current = 0.02 + fraction * 0.38;
            report(current, 'Enviando la foto…');
            if (fraction >= 1) processing = true;
          });
          text = result.text;
        }
        report(1, 'Terminado');
        patch(next.id, {
          status: 'done',
          text,
          engine,
          error: text ? undefined : 'La foto no tiene texto reconocible',
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No se pudo leer la hoja';
        patch(next.id, { status: 'error', error: message });
        if (err instanceof ApiError && err.code && BLOCKING_CODES.has(err.code)) {
          setPages((all) => all.map((p) => (p.status === 'queued' ? { ...p, status: 'pending' } : p)));
        }
      } finally {
        clearInterval(timer);
        setProgress(({ [next.id]: _done, ...rest }) => rest);
        // La cola se libera dentro de la misma actualización que registra el resultado. Si se liberara
        // aquí directamente, un efecto pendiente con el estado anterior (esta página aún «escaneando»
        // y las demás «en cola») podría arrancar la siguiente antes de aplicar, p. ej., el freno por
        // API key inválida. React ejecuta esos efectos pendientes antes de procesar esta actualización.
        setPages((all) => {
          running.current = false;
          return [...all];
        });
      }
    })();
  }, [pages, ready, engine, language, patch]);

  const addImages = useCallback(
    async (files: Blob[]) => {
      let failed = 0;
      const ids: string[] = [];
      for (const file of files) {
        let image: Blob;
        try {
          image = await prepareImage(file);
        } catch {
          failed++;
          continue;
        }
        const page: PendingPage = {
          id: crypto.randomUUID(),
          image,
          status: autoScan ? 'queued' : 'pending',
          text: '',
          createdAt: Date.now(),
          quality: await assessQuality(image),
        };
        ids.push(page.id);
        setPages((all) => [...all, page]);
      }
      return { ids, failed };
    },
    [autoScan],
  );

  const queue = useCallback((ids?: string[]) => {
    setPages((all) =>
      all.map((p) =>
        (ids ? ids.includes(p.id) : p.status === 'pending' || p.status === 'error') && p.status !== 'scanning'
          ? { ...p, status: 'queued', error: undefined }
          : p,
      ),
    );
  }, []);

  const updateText = useCallback((id: string, text: string) => {
    setPages((all) =>
      all.map((p) => (p.id === id ? { ...p, text, status: 'done', error: undefined, engine: p.engine ?? 'manual' } : p)),
    );
  }, []);

  const removeMany = useCallback((ids: string[]) => setPages((all) => all.filter((p) => !ids.includes(p.id))), []);
  const remove = useCallback((id: string) => removeMany([id]), [removeMany]);

  const move = useCallback((id: string, delta: number) => {
    setPages((all) => {
      const from = all.findIndex((p) => p.id === id);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= all.length) return all;
      const copy = [...all];
      const [item] = copy.splice(from, 1);
      copy.splice(to, 0, item);
      return copy;
    });
  }, []);

  const reorder = useCallback((id: string, toIndex: number) => {
    setPages((all) => {
      const from = all.findIndex((p) => p.id === id);
      const to = Math.max(0, Math.min(all.length - 1, toIndex));
      if (from < 0 || from === to) return all;
      const copy = [...all];
      const [item] = copy.splice(from, 1);
      copy.splice(to, 0, item);
      return copy;
    });
  }, []);

  const pagesRef = useRef(pages);
  pagesRef.current = pages;

  /** Swaps the image of an idle sheet; a processed sheet goes back to unprocessed (its text is kept). */
  const swapImage = useCallback(async (id: string, produce: (image: Blob) => Promise<Blob>, recheck: boolean) => {
    const page = pagesRef.current.find((p) => p.id === id);
    if (!page || page.status === 'scanning' || page.status === 'queued') return;
    const image = await produce(page.image);
    const quality = recheck ? await assessQuality(image) : page.quality;
    setPages((all) =>
      all.map((p) =>
        p.id === id && p.status !== 'scanning' && p.status !== 'queued'
          ? { ...p, image, quality, status: p.status === 'done' || p.status === 'error' ? 'pending' : p.status, error: undefined }
          : p,
      ),
    );
  }, []);

  const rotate = useCallback(
    (id: string, direction: RotateDirection = 'cw') => swapImage(id, (img) => rotateImage(img, direction), false),
    [swapImage],
  );

  const edit = useCallback((id: string, edits: ImageEdits) => swapImage(id, (img) => editImage(img, edits), true), [swapImage]);

  const replace = useCallback(
    async (id: string, file: Blob) => {
      const page = pagesRef.current.find((p) => p.id === id);
      if (!page || page.status === 'scanning') return;
      const image = await prepareImage(file);
      const quality = await assessQuality(image);
      setPages((all) =>
        all.map((p) =>
          p.id === id && p.status !== 'scanning'
            ? { ...p, image, quality, text: '', engine: undefined, error: undefined, status: autoScan ? 'queued' : 'pending' }
            : p,
        ),
      );
    },
    [autoScan],
  );

  return (
    <ScanSessionContext.Provider
      value={{
        pages,
        progress,
        ready,
        engine,
        language,
        autoScan,
        setEngine,
        setLanguage,
        setAutoScan,
        docType,
        setDocType,
        addImages,
        queue,
        updateText,
        remove,
        removeMany,
        move,
        reorder,
        rotate,
        edit,
        replace,
      }}
    >
      {children}
    </ScanSessionContext.Provider>
  );
}

export function useScanSession() {
  const ctx = useContext(ScanSessionContext);
  if (!ctx) throw new Error('useScanSession fuera de ScanSessionProvider');
  return ctx;
}
