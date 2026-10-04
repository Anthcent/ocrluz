import clsx from 'clsx';
import { Archive, FileText, FolderOpen, KeyRound, ScanText, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button, IconButton } from '../components/ui';
import { BatchSettings, destinationLabel, ENGINE_ICON, engineLabel, type BatchSettingsProps } from './BatchSettings';
import { usePresence } from './usePresence';

/** Derived numbers about the batch, computed once in the page. */
export interface BatchStats {
  total: number;
  /** Sheets with text, ready to be archived. */
  withText: number;
  /** Sheets that can be sent to read (unprocessed or failed). */
  readable: number;
  /** Sheets that finished reading (with or without success). */
  finished: number;
  /** Overall progress 0–100, including the part of the sheet being read. */
  overall: number;
  busy: boolean;
  /** Index of the sheet being read, or -1. */
  readingIndex: number;
}

export interface BatchActions {
  onRead: () => void;
  onArchive: () => void;
  onClear: () => void;
  saving: boolean;
  adding: boolean;
}

export function BatchProgress({ stats, compact }: { stats: BatchStats; compact?: boolean }) {
  if (stats.total === 0) return null;
  return (
    <div className={clsx('space-y-2', compact && 'space-y-1.5')}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-bold text-eel" data-testid="batch-progress">
          {stats.finished} de {stats.total} {stats.total === 1 ? 'hoja leída' : 'hojas leídas'}
        </span>
        {stats.readingIndex >= 0 && <span className="shrink-0 font-semibold text-macaw-dark">Leyendo la hoja {stats.readingIndex + 1}</span>}
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-swan">
        <div
          className={clsx('h-full origin-left rounded-full bg-feather transition-transform duration-300 ease-out-strong', stats.busy && 'progress-shimmer')}
          style={{ transform: `scaleX(${Math.max(0, Math.min(100, stats.overall)) / 100})` }}
        />
      </div>
    </div>
  );
}

/** Desktop side panel: batch progress and primary actions on top, every option below. */
export function DesktopBatchPanel({ stats, actions, settings }: { stats: BatchStats; actions: BatchActions; settings: BatchSettingsProps }) {
  return (
    <aside
      aria-label="Lote actual"
      className="hidden lg:sticky lg:top-24 lg:block lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto lg:rounded-2xl lg:bg-white lg:shadow-[0_1px_2px_rgba(41,36,68,0.06)]"
    >
      <div className="sticky top-0 z-10 space-y-4 border-b border-swan bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Lote</h2>
          {stats.total > 0 && (
            <Button variant="plain" size="sm" icon={<Trash2 className="size-4" />} onClick={actions.onClear} disabled={actions.adding}>
              Vaciar lote
            </Button>
          )}
        </div>
        {stats.total === 0 ? (
          <p className="text-sm text-wolf">Añade hojas para leer su texto. Aquí verás el avance y podrás archivarlas.</p>
        ) : (
          <BatchProgress stats={stats} />
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" icon={<ScanText className="size-4" />} disabled={stats.readable === 0} onClick={actions.onRead}>
            Leer texto{stats.readable > 0 && ` (${stats.readable})`}
          </Button>
          <Button icon={<Archive className="size-4" />} disabled={stats.withText === 0 || stats.busy} loading={actions.saving} onClick={actions.onArchive}>
            Archivar{stats.withText > 0 && ` (${stats.withText})`}
          </Button>
        </div>
      </div>
      <div className="p-5">
        <BatchSettings {...settings} />
      </div>
    </aside>
  );
}

/** Mobile header chip that summarizes the batch and opens its settings. */
export function BatchSummaryButton({ settings, onOpen, expanded }: { settings: BatchSettingsProps; onOpen: () => void; expanded: boolean }) {
  const { destination, engine } = settings;
  const EngineIcon = ENGINE_ICON[engine.engine];
  const missingKey = !engine.keysReady[engine.engine];
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-expanded={expanded}
      aria-haspopup="dialog"
      aria-label={`Ajustes del lote: ${destinationLabel(destination)}; ${engineLabel(engine)}`}
      className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-white px-3 py-2 text-left shadow-[0_1px_2px_rgba(41,36,68,0.06)] transition-[transform,background-color] duration-150 ease-out active:scale-[0.99] lg:hidden"
    >
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="flex items-center gap-1.5 truncate text-sm font-bold text-eel">
          {destination.mode === 'group' ? <FolderOpen className="size-4 shrink-0" aria-hidden /> : <FileText className="size-4 shrink-0" aria-hidden />}
          <span className="truncate">{destinationLabel(destination)}</span>
        </span>
        <span className={clsx('flex items-center gap-1.5 truncate text-xs font-semibold', missingKey ? 'text-bee-dark' : 'text-wolf')}>
          {missingKey ? <KeyRound className="size-3.5 shrink-0" aria-hidden /> : <EngineIcon className="size-3.5 shrink-0" aria-hidden />}
          <span className="truncate">{engineLabel(engine)}</span>
        </span>
      </span>
      <span className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-polar px-3 text-xs font-bold text-eel">
        <SlidersHorizontal className="size-4" aria-hidden /> Ajustar
      </span>
    </button>
  );
}

/** Mobile bottom sheet with all batch settings. */
export function BatchSheet({ open, onClose, settings }: { open: boolean; onClose: () => void; settings: BatchSettingsProps }) {
  const { mounted, shown } = usePresence(open, 220);
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      // Let an open dialog on top (the folder picker) handle Escape first.
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"][aria-label="Elegir carpeta de destino"]')) closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    panel.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open]);

  if (!mounted) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div
        className={clsx('absolute inset-0 bg-eel/40 transition-opacity duration-200 ease-out', shown ? 'opacity-100' : 'opacity-0')}
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-sheet-title"
        tabIndex={-1}
        className={clsx(
          'absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-3xl bg-white shadow-[0_-12px_32px_rgba(30,27,48,0.16)] outline-none',
          'transition-transform ease-drawer',
          shown ? 'translate-y-0 duration-300' : 'translate-y-full duration-200',
        )}
      >
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-swan" aria-hidden />
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-2 pt-3">
          <h2 id="batch-sheet-title" className="text-lg font-bold">
            Ajustes del lote
          </h2>
          <IconButton label="Cerrar ajustes" onClick={onClose} className="size-11">
            <X className="size-5" />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 pt-2">
          <BatchSettings {...settings} />
        </div>
        <div className="pb-safe shrink-0 border-t border-swan px-5 pt-3">
          <Button block onClick={onClose} className="mb-3">
            Volver a las hojas
          </Button>
        </div>
      </div>
    </div>
  );
}
