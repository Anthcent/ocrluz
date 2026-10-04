import clsx from 'clsx';
import { Check, RotateCcw, RotateCw, Undo2, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Button } from '../components/ui';
import { applyFilter, drawRotated, FULL_CROP, isFullCrop, type CropRect, type ImageEdits, type ImageFilter, type Rotation } from '../lib/image';

const PREVIEW_SIDE = 1400;
const MIN_SIZE = 0.08;

const FILTERS: { value: ImageFilter; label: string }[] = [
  { value: 'none', label: 'Original' },
  { value: 'gray', label: 'Escala de grises' },
  { value: 'bw', label: 'Blanco y negro' },
  { value: 'contrast', label: 'Más contraste' },
];

type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'move';

const HANDLE_LABEL: Record<Handle, string> = {
  nw: 'Esquina superior izquierda del recorte',
  ne: 'Esquina superior derecha del recorte',
  sw: 'Esquina inferior izquierda del recorte',
  se: 'Esquina inferior derecha del recorte',
  move: 'Área de recorte',
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Rotates a normalized crop rectangle together with the image. */
function rotateCrop(c: CropRect, dir: 'cw' | 'ccw'): CropRect {
  return dir === 'cw' ? { x: 1 - c.y - c.h, y: c.x, w: c.h, h: c.w } : { x: c.y, y: 1 - c.x - c.w, w: c.h, h: c.w };
}

function resize(start: CropRect, handle: Handle, dx: number, dy: number): CropRect {
  if (handle === 'move') {
    return { ...start, x: clamp(start.x + dx, 0, 1 - start.w), y: clamp(start.y + dy, 0, 1 - start.h) };
  }
  let left = start.x;
  let top = start.y;
  let right = start.x + start.w;
  let bottom = start.y + start.h;
  if (handle === 'nw' || handle === 'sw') left = clamp(left + dx, 0, right - MIN_SIZE);
  if (handle === 'ne' || handle === 'se') right = clamp(right + dx, left + MIN_SIZE, 1);
  if (handle === 'nw' || handle === 'ne') top = clamp(top + dy, 0, bottom - MIN_SIZE);
  if (handle === 'sw' || handle === 'se') bottom = clamp(bottom + dy, top + MIN_SIZE, 1);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/**
 * Fullscreen photo editor: rotate both ways, crop with a draggable frame (pointer and keyboard)
 * and apply a reading filter. The preview runs on a downscaled copy; the result is rendered
 * at full size by `editImage` when applied.
 */
export function ImageEditor({ image, sheetNumber, onCancel, onApply }: { image: Blob; sheetNumber: number; onCancel: () => void; onApply: (edits: ImageEdits) => Promise<void> }) {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [rotation, setRotation] = useState<Rotation>(0);
  const [filter, setFilter] = useState<ImageFilter>('none');
  const [crop, setCrop] = useState<CropRect>(FULL_CROP);
  const [applying, setApplying] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 1, h: 1 });

  useEffect(() => {
    let alive = true;
    let bmp: ImageBitmap | undefined;
    createImageBitmap(image).then((b) => {
      if (alive) {
        bmp = b;
        setBitmap(b);
      } else b.close();
    });
    return () => {
      alive = false;
      bmp?.close();
    };
  }, [image]);

  // Re-render the preview whenever rotation or filter changes.
  useEffect(() => {
    if (!bitmap || !canvas.current) return;
    const source = drawRotated(bitmap, rotation, PREVIEW_SIDE);
    applyFilter(source, filter);
    const target = canvas.current;
    target.width = source.width;
    target.height = source.height;
    target.getContext('2d')?.drawImage(source, 0, 0);
    setSize({ w: source.width, h: source.height });
  }, [bitmap, rotation, filter]);

  // Fit the preview inside the stage.
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const fit = () => {
      const { width, height } = el.getBoundingClientRect();
      const scale = Math.min(width / size.w, height / size.h);
      setBox({ w: Math.floor(size.w * scale), h: Math.floor(size.h * scale) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !applying && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, applying]);

  const rotate = (dir: 'cw' | 'ccw') => {
    setRotation((r) => (((r + (dir === 'cw' ? 90 : 270)) % 360) as Rotation));
    setCrop((c) => rotateCrop(c, dir));
  };

  const startDrag = (handle: Handle) => (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const start = crop;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const move = (ev: PointerEvent) => setCrop(resize(start, handle, (ev.clientX - x0) / box.w, (ev.clientY - y0) / box.h));
    const end = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointercancel', end);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  };

  const nudge = (handle: Handle) => (e: ReactKeyboardEvent) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!delta) return;
    e.preventDefault();
    setCrop((c) => resize(c, handle, delta[0], delta[1]));
  };

  const changed = rotation !== 0 || filter !== 'none' || !isFullCrop(crop);

  const apply = async () => {
    setApplying(true);
    try {
      await onApply({ rotation, filter, crop: isFullCrop(crop) ? null : crop });
    } finally {
      setApplying(false);
    }
  };

  const percent = (v: number) => `${(v * 100).toFixed(3)}%`;

  return (
    <div role="dialog" aria-modal="true" aria-label={`Ajustar foto de la hoja ${sheetNumber}`} className="fixed inset-0 z-[55] flex animate-fade-in flex-col bg-eel text-white">
      <div className="flex items-center justify-between gap-3 p-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={applying}
          aria-label="Cancelar ajustes"
          className="flex size-11 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
        >
          <X className="size-5" />
        </button>
        <h2 className="text-base font-bold">Ajustar foto · hoja {sheetNumber}</h2>
        <button
          type="button"
          onClick={() => {
            setRotation(0);
            setFilter('none');
            setCrop(FULL_CROP);
          }}
          disabled={!changed || applying}
          className="inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-sm font-bold text-white/85 transition-colors hover:bg-white/10 disabled:opacity-40"
        >
          <Undo2 className="size-4" /> Restablecer
        </button>
      </div>

      <div ref={stage} className="relative mx-4 flex min-h-0 flex-1 items-center justify-center">
        <div className="relative overflow-hidden" style={{ width: box.w, height: box.h }}>
          <canvas ref={canvas} className="block size-full" aria-label={`Vista previa de la hoja ${sheetNumber}`} role="img" />
          <div
            className="absolute cursor-move touch-none outline-none focus-visible:ring-4 focus-visible:ring-macaw/60"
            style={{
              left: percent(crop.x),
              top: percent(crop.y),
              width: percent(crop.w),
              height: percent(crop.h),
              boxShadow: '0 0 0 9999px color-mix(in srgb, var(--color-eel) 62%, transparent), inset 0 0 0 2px white',
            }}
            tabIndex={0}
            role="group"
            aria-label={`${HANDLE_LABEL.move}. Usa las flechas para desplazarla; con Mayúsculas, en pasos grandes`}
            onPointerDown={startDrag('move')}
            onKeyDown={nudge('move')}
          >
            <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3" aria-hidden>
              {Array.from({ length: 9 }, (_, i) => (
                <span key={i} className="border-[0.5px] border-white/25" />
              ))}
            </div>
            {(['nw', 'ne', 'sw', 'se'] as const).map((h) => (
              <button
                key={h}
                type="button"
                aria-label={`${HANDLE_LABEL[h]}. Usa las flechas para ajustarla`}
                onPointerDown={startDrag(h)}
                onKeyDown={nudge(h)}
                className={clsx(
                  'absolute flex size-11 touch-none items-center justify-center rounded-full outline-none focus-visible:bg-macaw/40',
                  h === 'nw' && '-left-5 -top-5 cursor-nwse-resize',
                  h === 'ne' && '-right-5 -top-5 cursor-nesw-resize',
                  h === 'sw' && '-bottom-5 -left-5 cursor-nesw-resize',
                  h === 'se' && '-bottom-5 -right-5 cursor-nwse-resize',
                )}
              >
                <span className="size-4 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.4)]" />
              </button>
            ))}
          </div>
        </div>
        {!bitmap && <p className="absolute text-sm font-semibold text-white/70">Cargando la foto…</p>}
      </div>

      <div className="pb-safe space-y-3 p-4">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => rotate('ccw')}
            aria-label="Girar a la izquierda"
            title="Girar a la izquierda"
            className="flex size-11 items-center justify-center rounded-full bg-white/10 transition-[transform,background-color] duration-150 ease-out hover:bg-white/20 active:scale-95"
          >
            <RotateCcw className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => rotate('cw')}
            aria-label="Girar a la derecha"
            title="Girar a la derecha"
            className="flex size-11 items-center justify-center rounded-full bg-white/10 transition-[transform,background-color] duration-150 ease-out hover:bg-white/20 active:scale-95"
          >
            <RotateCw className="size-5" />
          </button>
          <span className="mx-1 h-6 w-px bg-white/20" aria-hidden />
          <div className="flex flex-wrap justify-center gap-1" role="radiogroup" aria-label="Filtro de lectura">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={clsx(
                  'h-11 rounded-full px-3.5 text-sm font-bold transition-[background-color,color] duration-150 ease-out',
                  filter === f.value ? 'bg-white text-eel' : 'text-white/80 hover:bg-white/10 hover:text-white',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mx-auto grid max-w-md grid-cols-2 gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={applying}>
            Cancelar
          </Button>
          <Button variant="secondary" icon={<Check className="size-4" />} onClick={apply} loading={applying} disabled={!changed || !bitmap}>
            Aplicar ajustes
          </Button>
        </div>
      </div>
    </div>
  );
}
