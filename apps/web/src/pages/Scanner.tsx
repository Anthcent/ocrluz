import { Archive, Camera, ScanText, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { errorMessage, useFeedback } from '../components/feedback';
import { EMPTY_GROUP } from '../components/GroupFields';
import { Button } from '../components/ui';
import { api } from '../lib/api';
import type { DocTemplate } from '../lib/doc-templates';
import { detectPageLabel } from '../lib/page-number';
import type { Engine, Group, GroupInput, ScanEngine } from '../lib/types';
import { AddSurface } from '../scan/AddSurface';
import { BatchSheet, BatchSummaryButton, DesktopBatchPanel, type BatchStats } from '../scan/BatchPanel';
import { NEW_GROUP, templateFor, type BatchSettingsProps, type Mode } from '../scan/BatchSettings';
import { CameraCapture } from '../scan/CameraCapture';
import { CaptureDock } from '../scan/CaptureDock';
import { useScanSession } from '../scan/ScanSession';
import { SheetGrid } from '../scan/SheetGrid';
import { SheetViewer, type RetakeSource } from '../scan/SheetViewer';
import { useSettings } from '../settings/SettingsContext';

const isDesktop = () => window.matchMedia('(min-width: 1024px)').matches;

/** Folder category for a document type ("Documento general" maps to the generic category). */
const categoryFor = (t: DocTemplate) => (t.key === 'generico' ? 'Otro' : t.name);

const todayLabel = () => new Date().toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
const folderSuggestion = (t: DocTemplate) => `${t.name} · ${todayLabel()}`;

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

export function ScannerPage() {
  const session = useScanSession();
  const { settings } = useSettings();
  const { toast, confirm } = useFeedback();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const preselected = params.get('grupo');

  const [mode, setMode] = useState<Mode>(preselected ? 'group' : 'individual');
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState<string>(preselected ?? NEW_GROUP);
  const [newGroup, setNewGroup] = useState<GroupInput>(EMPTY_GROUP);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [retakeId, setRetakeId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [dragDepth, setDragDepth] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const systemCamera = useRef<HTMLInputElement>(null);
  const retakeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Arriving from a folder's "add sheets" action preselects that folder.
    if (preselected) {
      setMode('group');
      setGroupId(preselected);
    }
    api.groups
      .list()
      .then((r) => {
        setGroups(r.groups);
        if (!preselected && r.groups.length > 0) setGroupId(String(r.groups[0].id));
      })
      .catch(() => {});
  }, [preselected]);

  // A remembered document type pre-fills an empty new-folder form.
  useEffect(() => {
    const t = templateFor(session.docType);
    if (!t) return;
    setNewGroup((g) => (g.title || g.category ? g : { ...g, title: folderSuggestion(t), category: categoryFor(t) }));
  }, [session.docType]);

  const { pages, addImages } = session;
  const done = pages.filter((p) => p.status === 'done' && p.text.trim());
  const partial = Object.values(session.progress).reduce((sum, p) => sum + p.value, 0);
  const finished = pages.filter((p) => p.status === 'done' || p.status === 'error').length;
  const stats: BatchStats = {
    total: pages.length,
    withText: done.length,
    readable: pages.filter((p) => p.status === 'pending' || p.status === 'error').length,
    finished,
    overall: pages.length ? ((finished + partial) / pages.length) * 100 : 0,
    busy: pages.some((p) => p.status === 'queued' || p.status === 'scanning'),
    readingIndex: pages.findIndex((p) => p.status === 'scanning'),
  };

  const keysReady: Record<Engine, boolean> = {
    ocrspace: settings.keys.ocrspace.configured,
    gemini: settings.keys.gemini.configured,
    tesseract: true,
  };

  const addFiles = useCallback(
    async (files: FileList | Blob[] | null, origin: 'files' | 'paste' = 'files') => {
      // Copy now: the <input> FileList is emptied when the input is reset.
      const list = Array.from(files ?? []);
      if (list.length === 0) return;
      const images = list.filter((f) => !(f instanceof File) || f.type.startsWith('image/') || f.type === '');
      setAdding(true);
      try {
        const { ids, failed } = await addImages(images);
        const rejected = failed + (list.length - images.length);
        if (rejected > 0) {
          toast(`No se ${rejected === 1 ? 'pudo abrir 1 archivo' : `pudieron abrir ${rejected} archivos`}. Prueba con JPG, PNG o WEBP.`, 'error');
        } else if (origin === 'paste') {
          toast(ids.length === 1 ? 'Hoja pegada desde el portapapeles' : `${ids.length} hojas pegadas desde el portapapeles`);
        } else if (ids.length > 1) {
          toast(`${ids.length} hojas sumadas al lote`);
        }
      } catch (err) {
        toast(errorMessage(err), 'error');
      } finally {
        setAdding(false);
      }
    },
    [addImages, toast],
  );

  // Paste screenshots or copied images anywhere on the page.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.items ?? [])
        .filter((i) => i.kind === 'file' && i.type.startsWith('image/'))
        .map((i) => i.getAsFile())
        .filter((f): f is File => Boolean(f));
      if (files.length === 0) return;
      e.preventDefault();
      void addFiles(files, 'paste');
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addFiles]);

  const openCamera = () => {
    setRetakeId(null);
    setCameraOpen(true);
  };

  const onCameraUnavailable = useCallback(
    (reason: string) => {
      setCameraOpen(false);
      toast(reason, 'info');
      if (retakeId) {
        retakeInput.current?.setAttribute('capture', 'environment');
        retakeInput.current?.click();
      } else systemCamera.current?.click();
    },
    [toast, retakeId],
  );

  const replacePhoto = async (id: string, file: Blob) => {
    try {
      await session.replace(id, file);
      toast('Foto reemplazada');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const retake = (id: string, source: RetakeSource) => {
    setRetakeId(id);
    if (source === 'camera') setCameraOpen(true);
    else {
      retakeInput.current?.removeAttribute('capture');
      retakeInput.current?.click();
    }
  };

  const clearAll = async () => {
    const ok = await confirm({
      title: '¿Vaciar el lote?',
      message: `Se descartarán ${pages.length === 1 ? 'la hoja y su texto' : `las ${pages.length} hojas y su texto`}. Lo que ya archivaste no cambia.`,
      confirmLabel: 'Vaciar lote',
      danger: true,
    });
    if (ok) session.removeMany(pages.filter((p) => p.status !== 'scanning').map((p) => p.id));
  };

  const removeSheets = async (ids: string[]) => {
    if (ids.length === 0) return;
    if (ids.length > 1) {
      const ok = await confirm({
        title: `¿Descartar ${ids.length} hojas?`,
        message: 'Se quitarán del lote junto con su texto sin archivar.',
        confirmLabel: 'Descartar hojas',
        danger: true,
      });
      if (!ok) return;
    }
    session.removeMany(ids);
    if (viewerOpen) {
      const remaining = pages.length - ids.length;
      if (remaining <= 0) setViewerOpen(false);
      else setViewerIndex((i) => Math.min(i, remaining - 1));
    }
  };

  const rotateSheets = async (ids: string[]) => {
    for (const id of ids) await session.rotate(id, 'cw');
  };

  const focusFolderName = () => {
    const visible = Array.from(document.querySelectorAll<HTMLInputElement>('[aria-label="Nombre de la carpeta"]')).find((el) => el.offsetParent !== null);
    visible?.focus();
    visible?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  const archive = async () => {
    if (mode === 'group' && groupId === NEW_GROUP && !newGroup.title.trim()) {
      toast('Escribe el nombre de la carpeta nueva', 'error');
      if (isDesktop()) focusFolderName();
      else {
        setSheetOpen(true);
        setTimeout(focusFolderName, 320);
      }
      return;
    }
    const skipped = pages.length - done.length;
    if (skipped > 0) {
      const ok = await confirm({
        title: '¿Archivar solo las hojas con texto?',
        message: `${skipped} ${skipped === 1 ? 'hoja sigue sin texto y se quedará' : 'hojas siguen sin texto y se quedarán'} en el lote para leerlas más tarde.`,
        confirmLabel: 'Archivar',
      });
      if (!ok) return;
    }

    setSaving(true);
    try {
      const items = done.map((p) => ({
        text: p.text.trim(),
        engine: (p.engine ?? 'manual') as ScanEngine,
        language: session.language,
        pageLabel: detectPageLabel(p.text),
      }));
      const result = await api.scans.create(
        mode === 'individual'
          ? { items }
          : groupId === NEW_GROUP
            ? { newGroup: { ...newGroup, title: newGroup.title.trim() }, items }
            : { groupId: Number(groupId), items },
      );
      // Once the text is stored, the photos are discarded.
      session.removeMany(done.map((p) => p.id));
      toast(`Archivado: ${items.length} ${items.length === 1 ? 'hoja' : 'hojas'}`);
      navigate(result.groupId ? `/archivo/carpeta/${result.groupId}` : '/archivo?vista=individuales');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const changeDocType = (key: string | null) => {
    const prev = templateFor(session.docType);
    const next = templateFor(key);
    session.setDocType(key);
    setNewGroup((g) => {
      const wasSuggested = !g.title.trim() || (prev && g.title === folderSuggestion(prev));
      const wasAutoCategory = !g.category || (prev && g.category === categoryFor(prev));
      return {
        ...g,
        title: wasSuggested ? (next ? folderSuggestion(next) : '') : g.title,
        category: wasAutoCategory ? (next ? categoryFor(next) : '') : g.category,
      };
    });
  };

  const pageLabels = pages.map((p) => (p.status === 'done' ? detectPageLabel(p.text) : '')).filter(Boolean);
  const batchSettings: BatchSettingsProps = {
    destination: { mode, setMode, groups, groupId, setGroupId, newGroup, setNewGroup },
    engine: {
      engine: session.engine,
      setEngine: session.setEngine,
      language: session.language,
      setLanguage: session.setLanguage,
      autoScan: session.autoScan,
      setAutoScan: session.setAutoScan,
      keysReady,
    },
    docType: session.docType,
    onDocType: changeDocType,
    sheets: { count: pages.length, labels: pageLabels },
  };
  const actions = { onRead: () => session.queue(), onArchive: archive, onClear: clearAll, saving, adding };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    void addFiles(e.target.files);
    e.target.value = '';
  };

  return (
    <div
      className="mx-auto max-w-7xl pb-24 lg:pb-0"
      onDragEnter={(e) => hasFiles(e) && setDragDepth((d) => d + 1)}
      onDragLeave={(e) => hasFiles(e) && setDragDepth((d) => Math.max(0, d - 1))}
      onDragOver={(e) => hasFiles(e) && e.preventDefault()}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDragDepth(0);
        void addFiles(e.dataTransfer.files);
      }}
    >
      <header className="mb-5 lg:mb-6">
        <h1 className="text-[1.75rem] font-bold leading-[1.1] tracking-[-0.02em] text-balance sm:text-4xl">Digitalizar hojas</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-wolf text-pretty sm:text-base">
          <span className="lg:hidden">Captura, revisa y archiva cada hoja con su texto.</span>
          <span className="hidden lg:inline">Fotografía o trae las hojas, revisa cada una y archívalas con su texto.</span>
        </p>
      </header>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,1fr)_25rem]">
        <div className="min-w-0 space-y-4">
          <BatchSummaryButton settings={batchSettings} stats={stats} onOpen={() => setSheetOpen(true)} expanded={sheetOpen} />

          <AddSurface compact={pages.length > 0} dragging={dragDepth > 0} adding={adding} onFiles={() => fileInput.current?.click()} onCamera={openCamera} />

          {pages.length === 0 ? (
            <EmptyBatch />
          ) : (
            <SheetGrid
              pages={pages}
              progress={session.progress}
              onOpen={(id) => {
                setViewerIndex(pages.findIndex((p) => p.id === id));
                setViewerOpen(true);
              }}
              onRead={(ids) => session.queue(ids)}
              onRotate={(ids) => void rotateSheets(ids)}
              onRemove={(ids) => void removeSheets(ids)}
              onReorder={session.reorder}
              onAdd={() => fileInput.current?.click()}
              headerExtra={
                <span className="flex gap-1 lg:hidden">
                  {stats.withText > 0 && (stats.readable > 0 || stats.busy) && (
                    <Button variant="plain" size="sm" className="h-11" icon={<Archive className="size-4" />} onClick={archive} loading={saving} disabled={stats.busy}>
                      Archivar ({stats.withText})
                    </Button>
                  )}
                  <button
                    type="button"
                    onClick={clearAll}
                    aria-label="Vaciar lote"
                    title="Vaciar lote"
                    className="flex size-11 items-center justify-center rounded-full text-wolf transition-colors hover:bg-white hover:text-cardinal-dark"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </span>
              }
            />
          )}
        </div>

        <DesktopBatchPanel stats={stats} actions={actions} settings={batchSettings} />
      </div>

      <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={onFileChange} />
      <input ref={systemCamera} type="file" accept="image/*" capture="environment" hidden onChange={onFileChange} />
      <input
        ref={retakeInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && retakeId) void replacePhoto(retakeId, file);
          e.target.value = '';
          setRetakeId(null);
        }}
      />

      <CaptureDock
        stats={stats}
        onCamera={openCamera}
        onFiles={() => fileInput.current?.click()}
        onRead={() => session.queue()}
        onArchive={archive}
        onSettings={() => setSheetOpen(true)}
        saving={saving}
        adding={adding}
      />

      <BatchSheet open={sheetOpen} onClose={() => setSheetOpen(false)} settings={batchSettings} />

      <CameraCapture
        open={cameraOpen}
        onClose={() => {
          setCameraOpen(false);
          setRetakeId(null);
        }}
        onUnavailable={onCameraUnavailable}
        retake={
          retakeId
            ? {
                sheetNumber: pages.findIndex((p) => p.id === retakeId) + 1,
                onShot: (photo) => {
                  void replacePhoto(retakeId, photo);
                  setCameraOpen(false);
                  setRetakeId(null);
                },
              }
            : undefined
        }
      />

      <SheetViewer
        open={viewerOpen}
        pages={pages}
        progress={session.progress}
        index={viewerIndex}
        onIndex={setViewerIndex}
        onClose={() => setViewerOpen(false)}
        onSaveText={(id, text) => {
          session.updateText(id, text);
          toast('Cambios del texto aplicados');
        }}
        onRead={(id) => session.queue([id])}
        onRotate={session.rotate}
        onEdit={async (id, edits) => {
          try {
            await session.edit(id, edits);
            toast('Ajustes aplicados a la foto');
          } catch (err) {
            toast(errorMessage(err), 'error');
          }
        }}
        onRetake={retake}
        onRemove={(id) => void removeSheets([id])}
      />
    </div>
  );
}

/** Empty batch on mobile (desktop shows the drop surface instead). */
function EmptyBatch() {
  const steps = [
    { icon: Camera, title: 'Captura', text: 'Una foto por hoja; puedes tomar varias seguidas.' },
    { icon: ScanText, title: 'Lee', text: 'El texto de cada hoja se reconoce y puedes corregirlo.' },
    { icon: Archive, title: 'Archiva', text: 'Guárdalas como documentos sueltos o en una carpeta.' },
  ];
  return (
    <div className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(41,36,68,0.06)] lg:hidden">
      <h2 className="text-lg font-bold">El lote está vacío</h2>
      <p className="mt-1 text-sm text-wolf">Pulsa la cámara de abajo o elige fotos guardadas en tu teléfono.</p>
      <ol className="mt-4 space-y-3">
        {steps.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-macaw-light text-macaw-dark">
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block font-bold">{title}</span>
              <span className="block text-sm text-wolf">{text}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
