import clsx from 'clsx';
import { Camera, ChevronLeft, ChevronRight, CircleAlert, Crop, FileUp, RefreshCcw, RotateCcw, RotateCw, ScanText, Trash2, TriangleAlert, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, Textarea } from '../components/ui';
import { ENGINE_LABEL } from '../lib/constants';
import type { ImageEdits, RotateDirection } from '../lib/image';
import type { PendingPage } from '../lib/pages-store';
import { ImageEditor } from './ImageEditor';
import { qualityCopy } from './quality';
import { ScanProgressBar } from './ScanProgressBar';
import type { ScanProgress } from './ScanSession';
import { STATUS } from './status';
import { usePresence } from './usePresence';
import { useObjectUrl } from './useObjectUrl';
import { ZoomStage, type ZoomStageHandle } from './ZoomStage';

export type RetakeSource = 'camera' | 'file';

interface Props {
  open: boolean;
  pages: PendingPage[];
  progress: Record<string, ScanProgress>;
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  onSaveText: (id: string, text: string) => void;
  onRead: (id: string) => void;
  onRotate: (id: string, direction: RotateDirection) => Promise<void>;
  onEdit: (id: string, edits: ImageEdits) => Promise<void>;
  onRetake: (id: string, source: RetakeSource) => void;
  onRemove: (id: string) => void;
}

/** Fullscreen sheet viewer: zoomable photo, swipe between sheets, photo tools and the recognized text. */
export function SheetViewer(props: Props) {
  const { open, pages, index } = props;
  const { mounted, shown } = usePresence(open, 200);
  const page = pages[index];
  if (!mounted || !page) return null;
  return (
    <div
      className={clsx(
        'fixed inset-0 z-50 transition-[opacity,transform] ease-out-strong',
        shown ? 'scale-100 opacity-100 duration-250' : 'scale-[0.985] opacity-0 duration-200',
      )}
    >
      <ViewerBody {...props} page={page} />
    </div>
  );
}

function ViewerBody({ page, pages, progress, index, onIndex, onClose, onSaveText, onRead, onRotate, onEdit, onRetake, onRemove, open }: Props & { page: PendingPage }) {
  const url = useObjectUrl(page.image);
  const [text, setText] = useState(page.text);
  const [rotating, setRotating] = useState<RotateDirection | null>(null);
  const [editing, setEditing] = useState(false);
  const [retakeOpen, setRetakeOpen] = useState(false);
  const zoom = useRef<ZoomStageHandle>(null);
  const dialog = useRef<HTMLDivElement>(null);

  // Al cambiar de hoja, o cuando llega el texto leído, se actualiza el editor.
  useEffect(() => setText(page.text), [page.id, page.text]);
  useEffect(() => setRetakeOpen(false), [page.id]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => previous?.focus?.();
  }, [open]);

  useEffect(() => {
    if (editing || !open) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      else if (e.key === 'ArrowRight' && index < pages.length - 1) onIndex(index + 1);
      else if (e.key === '+' || e.key === '=') zoom.current?.zoomBy(1.5);
      else if (e.key === '-') zoom.current?.zoomBy(1 / 1.5);
      else if (e.key === '0') zoom.current?.reset();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, pages.length, onClose, onIndex, editing, open]);

  const status = STATUS[page.status];
  const StatusIcon = status.icon;
  const busy = page.status === 'scanning' || page.status === 'queued';
  const dirty = text !== page.text;
  const quality = qualityCopy(page.quality);
  const n = index + 1;

  const rotate = async (dir: RotateDirection) => {
    setRotating(dir);
    try {
      await onRotate(page.id, dir);
    } finally {
      setRotating(null);
    }
  };

  return (
    <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Hoja ${n}`} className="flex size-full flex-col bg-eel outline-none lg:flex-row">
      {/* Photo */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 p-3 text-white">
          <button
            type="button"
            onClick={onClose}
            aria-label="Volver al lote"
            className="flex size-11 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
          >
            <X className="size-5" />
          </button>
          <div className="text-base font-bold tabular-nums">
            Hoja {n} <span className="font-semibold text-white/60">/ {pages.length}</span>
          </div>
          <span key={page.status} className={clsx('inline-flex animate-swap-in items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', status.pill)}>
            <StatusIcon className="size-3.5" aria-hidden />
            {status.label}
          </span>
        </div>

        <div className="relative min-h-0 flex-1">
          <ZoomStage
            key={page.id}
            ref={zoom}
            src={url}
            alt={`Hoja ${n}`}
            canPrev={index > 0}
            canNext={index < pages.length - 1}
            onSwipe={(dir) => onIndex(index + dir)}
          />
          {page.status === 'scanning' && (
            <div className="pointer-events-none absolute inset-x-4 top-3 mx-auto max-w-md rounded-2xl bg-eel/85 p-3">
              <ScanProgressBar progress={progress[page.id]} dark />
            </div>
          )}
          <button
            type="button"
            onClick={() => onIndex(index - 1)}
            disabled={index === 0}
            aria-label="Hoja anterior"
            className="absolute left-2 top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-eel shadow-[0_4px_12px_rgba(0,0,0,0.18)] transition-[transform,opacity] duration-150 ease-out active:scale-95 disabled:pointer-events-none disabled:opacity-0 sm:flex"
          >
            <ChevronLeft className="size-6" />
          </button>
          <button
            type="button"
            onClick={() => onIndex(index + 1)}
            disabled={index === pages.length - 1}
            aria-label="Hoja siguiente"
            className="absolute right-2 top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-eel shadow-[0_4px_12px_rgba(0,0,0,0.18)] transition-[transform,opacity] duration-150 ease-out active:scale-95 disabled:pointer-events-none disabled:opacity-0 sm:flex"
          >
            <ChevronRight className="size-6" />
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto p-3" aria-label="Todas las hojas">
          {pages.map((p, i) => (
            <Thumb key={p.id} page={p} n={i + 1} active={i === index} onClick={() => onIndex(i)} />
          ))}
        </div>
      </div>

      {/* Tools and text */}
      <div className="pb-safe flex max-h-[50dvh] flex-col gap-4 overflow-y-auto rounded-t-3xl bg-white p-4 lg:max-h-none lg:w-[440px] lg:rounded-none lg:p-6">
        <div className="grid grid-cols-5 gap-1" role="toolbar" aria-label="Herramientas de la foto">
          <Tool label="Girar a la izquierda" short="Izquierda" onClick={() => rotate('ccw')} disabled={busy || rotating !== null} loading={rotating === 'ccw'}>
            <RotateCcw className="size-5" />
          </Tool>
          <Tool label="Girar a la derecha" short="Derecha" onClick={() => rotate('cw')} disabled={busy || rotating !== null} loading={rotating === 'cw'}>
            <RotateCw className="size-5" />
          </Tool>
          <Tool label="Ajustar foto: recorte y filtros" short="Ajustar" onClick={() => setEditing(true)} disabled={busy}>
            <Crop className="size-5" />
          </Tool>
          <Tool label="Repetir foto" short="Repetir" onClick={() => setRetakeOpen((v) => !v)} disabled={page.status === 'scanning'} pressed={retakeOpen}>
            <RefreshCcw className="size-5" />
          </Tool>
          <Tool label="Descartar hoja" short="Descartar" onClick={() => onRemove(page.id)} disabled={page.status === 'scanning'} danger>
            <Trash2 className="size-5" />
          </Tool>
        </div>

        {retakeOpen && (
          <div className="grid animate-swap-in grid-cols-2 gap-2">
            <Button variant="ghost" size="sm" icon={<Camera className="size-4" />} onClick={() => onRetake(page.id, 'camera')}>
              Con la cámara
            </Button>
            <Button variant="ghost" size="sm" icon={<FileUp className="size-4" />} onClick={() => onRetake(page.id, 'file')}>
              Desde un archivo
            </Button>
          </div>
        )}

        {quality && (
          <div className="flex gap-2 rounded-xl bg-bee-light p-3 text-sm" role="note">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-bee-dark" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="font-bold text-eel">{quality.label}</div>
              <p className="text-eel/80">{quality.hint}</p>
              {!retakeOpen && (
                <button type="button" onClick={() => setRetakeOpen(true)} className="mt-1 min-h-11 font-bold text-macaw-dark underline decoration-macaw/50 underline-offset-2">
                  Repetir esta foto
                </button>
              )}
            </div>
          </div>
        )}

        {page.error && (
          <p className="flex gap-2 rounded-xl bg-cardinal-light p-3 text-sm font-semibold text-cardinal-dark" role="alert">
            <CircleAlert className="size-5 shrink-0" /> {page.error}
          </p>
        )}

        <Button variant="secondary" icon={<ScanText className="size-4" />} disabled={busy} onClick={() => onRead(page.id)}>
          {page.status === 'done' ? 'Leer de nuevo' : page.status === 'error' ? 'Reintentar lectura' : busy ? 'Leyendo…' : 'Leer texto'}
        </Button>

        <div className="flex items-center justify-between">
          <h3 className="font-bold">Texto reconocido</h3>
          {page.engine && page.status === 'done' && <span className="text-xs font-semibold text-wolf">Leído con {ENGINE_LABEL[page.engine] ?? page.engine}</span>}
        </div>
        {page.status === 'pending' && page.text && (
          <p className="-mt-2 text-xs text-wolf">La foto cambió: puedes leerla de nuevo o confirmar el texto que ya tenía.</p>
        )}
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          disabled={busy}
          aria-label="Texto de la hoja"
          placeholder={busy ? 'Leyendo la hoja…' : 'Todavía sin leer. Si lo prefieres, escribe aquí el texto.'}
          className="min-h-40 flex-1 text-sm"
        />
        <Button block disabled={!text.trim() || busy || (!dirty && page.status === 'done')} onClick={() => onSaveText(page.id, text)}>
          Aplicar cambios
        </Button>
      </div>

      {editing && (
        <ImageEditor
          image={page.image}
          sheetNumber={n}
          onCancel={() => setEditing(false)}
          onApply={async (edits) => {
            await onEdit(page.id, edits);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

function Tool({
  label,
  short,
  onClick,
  disabled,
  loading,
  danger,
  pressed,
  children,
}: {
  label: string;
  short: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  danger?: boolean;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={clsx(
        'flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-bold transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.96] disabled:opacity-40',
        danger ? 'text-cardinal-dark hover:bg-cardinal-light' : pressed ? 'bg-macaw-light text-macaw-dark' : 'text-eel hover:bg-polar',
      )}
    >
      <span className={clsx(loading && 'animate-pulse')}>{children}</span>
      <span className="max-w-full truncate">{short}</span>
    </button>
  );
}

function Thumb({ page, n, active, onClick }: { page: PendingPage; n: number; active: boolean; onClick: () => void }) {
  const url = useObjectUrl(page.image);
  const status = STATUS[page.status];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Saltar a la hoja ${n} (${status.label})`}
      aria-current={active ? 'true' : undefined}
      className={clsx(
        'relative h-16 w-12 shrink-0 overflow-hidden rounded-lg ring-2 transition-[opacity,box-shadow] duration-150',
        active ? 'ring-macaw' : 'ring-transparent opacity-70 hover:opacity-100',
      )}
    >
      {url && <img src={url} alt="" className="size-full object-cover" />}
      <span className="absolute bottom-0 left-0 rounded-tr-md bg-white px-1 text-[10px] font-bold tabular-nums text-eel">{n}</span>
      <span className={clsx('absolute right-1 top-1 size-2.5 rounded-full ring-2 ring-white', status.dot)} aria-hidden />
    </button>
  );
}
