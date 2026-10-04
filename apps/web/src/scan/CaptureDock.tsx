import clsx from 'clsx';
import { Archive, Camera, ImageUp, LoaderCircle, ScanText, SlidersHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import type { BatchStats } from './BatchPanel';

type ContextAction = 'settings' | 'read' | 'reading' | 'archive';

/** The contextual slot changes with the batch: settings → read → reading → archive. */
function contextAction(stats: BatchStats): ContextAction {
  if (stats.total === 0) return 'settings';
  if (stats.busy) return 'reading';
  if (stats.readable > 0) return 'read';
  if (stats.withText > 0) return 'archive';
  return 'settings';
}

/**
 * Mobile floating dock in the thumb zone, above the app navigation:
 * files on the left, camera in the center and a contextual action on the right.
 */
export function CaptureDock({
  stats,
  onCamera,
  onFiles,
  onRead,
  onArchive,
  onSettings,
  saving,
  adding,
}: {
  stats: BatchStats;
  onCamera: () => void;
  onFiles: () => void;
  onRead: () => void;
  onArchive: () => void;
  onSettings: () => void;
  saving: boolean;
  adding: boolean;
}) {
  const action = contextAction(stats);
  const percent = Math.round(stats.overall);

  return (
    <div
      className="fixed inset-x-4 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-30 lg:hidden"
      role="toolbar"
      aria-label="Captura"
      data-testid="capture-dock"
    >
      <div className="mx-auto grid h-[4.5rem] max-w-md grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-[22px] bg-white px-2 shadow-[0_12px_32px_rgba(30,27,48,0.16)]">
        <DockButton label="Archivos" onClick={onFiles} disabled={adding} icon={<ImageUp className="size-5" />} />

        <button
          type="button"
          onClick={onCamera}
          aria-label="Abrir la cámara"
          className="-mt-7 flex size-[4.5rem] items-center justify-center rounded-full bg-eel text-white shadow-[0_8px_20px_rgba(30,27,48,0.28)] ring-4 ring-polar transition-[transform,background-color] duration-150 ease-out hover:bg-eel-hover active:scale-[0.95]"
        >
          <Camera className="size-8" strokeWidth={2} />
        </button>

        {/* The key remounts the content so each state crossfades in. */}
        {action === 'settings' && (
          <DockButton key="settings" label="Ajustes" onClick={onSettings} icon={<SlidersHorizontal className="size-5" />} />
        )}
        {action === 'read' && (
          <DockButton
            key="read"
            tone="accent"
            label={`Leer (${stats.readable})`}
            ariaLabel={`Leer el texto de ${stats.readable} ${stats.readable === 1 ? 'hoja' : 'hojas'}`}
            onClick={onRead}
            icon={<ScanText className="size-5" />}
          />
        )}
        {action === 'reading' && (
          <DockButton
            key="reading"
            label={`${percent}%`}
            ariaLabel={`Leyendo hojas, ${percent}% completado`}
            disabled
            icon={<LoaderCircle className="size-5 animate-spin" />}
          />
        )}
        {action === 'archive' && (
          <DockButton
            key="archive"
            tone="ink"
            label={saving ? 'Archivando' : `Archivar (${stats.withText})`}
            ariaLabel={`Archivar ${stats.withText} ${stats.withText === 1 ? 'hoja' : 'hojas'}`}
            onClick={onArchive}
            disabled={saving}
            icon={saving ? <LoaderCircle className="size-5 animate-spin" /> : <Archive className="size-5" />}
          />
        )}
      </div>
    </div>
  );
}

function DockButton({
  label,
  ariaLabel,
  icon,
  onClick,
  disabled,
  tone = 'plain',
}: {
  label: string;
  ariaLabel?: string;
  icon: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: 'plain' | 'accent' | 'ink';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={clsx(
        'flex h-14 min-w-0 animate-swap-in flex-col items-center justify-center gap-0.5 rounded-2xl px-2 text-xs font-bold transition-[transform,background-color,color] duration-150 ease-out active:scale-[0.96] disabled:active:scale-100',
        tone === 'plain' && 'text-eel hover:bg-polar disabled:text-wolf',
        tone === 'accent' && 'bg-macaw text-eel hover:bg-macaw-hover',
        tone === 'ink' && 'bg-eel text-white hover:bg-eel-hover',
      )}
    >
      {icon}
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}
