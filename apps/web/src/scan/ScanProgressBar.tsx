import clsx from 'clsx';
import type { ScanProgress } from './ScanSession';

/** Barra de progreso de una página que se está escaneando. */
export function ScanProgressBar({ progress, size = 'md', dark }: { progress?: ScanProgress; size?: 'sm' | 'md'; dark?: boolean }) {
  const value = progress?.value ?? 0;
  const percent = Math.round(value * 100);
  return (
    <div
      role="progressbar"
      aria-label={progress?.label ?? 'Escaneando'}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="w-full"
    >
      {size === 'md' && (
        <div className={clsx('mb-1.5 flex items-center justify-between text-xs font-semibold', dark ? 'text-white' : 'text-eel')}>
          <span className="truncate">{progress?.label ?? 'Escaneando…'}</span>
          <span className="shrink-0 tabular-nums text-macaw-dark">{percent}%</span>
        </div>
      )}
      <div className={clsx('w-full overflow-hidden rounded-full', size === 'md' ? 'h-2.5' : 'h-2', dark ? 'bg-white/20' : 'bg-swan')}>
        <div className="h-full rounded-full bg-feather transition-[width] duration-300 ease-out" style={{ width: `${Math.max(4, percent)}%` }} />
      </div>
    </div>
  );
}
