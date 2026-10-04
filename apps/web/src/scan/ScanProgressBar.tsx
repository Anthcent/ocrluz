import clsx from 'clsx';
import type { ScanProgress } from './ScanSession';

/** Progress of the sheet being read, with a moving highlight while work runs. */
export function ScanProgressBar({ progress, size = 'md', dark }: { progress?: ScanProgress; size?: 'sm' | 'md'; dark?: boolean }) {
  const value = progress?.value ?? 0;
  const percent = Math.round(value * 100);
  return (
    <div
      role="progressbar"
      aria-label={progress?.label ?? 'Leyendo la hoja'}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="w-full"
    >
      {size === 'md' && (
        <div className={clsx('mb-1.5 flex items-center justify-between gap-2 text-xs font-semibold', dark ? 'text-white' : 'text-eel')}>
          <span className="truncate">{progress?.label ?? 'Leyendo la hoja…'}</span>
          <span className={clsx('shrink-0 tabular-nums', dark ? 'text-white/80' : 'text-macaw-dark')}>{percent}%</span>
        </div>
      )}
      <div className={clsx('w-full overflow-hidden rounded-full', size === 'md' ? 'h-2' : 'h-1.5', dark ? 'bg-white/20' : 'bg-swan')}>
        <div
          className="progress-shimmer h-full origin-left rounded-full bg-feather transition-transform duration-300 ease-out-strong"
          style={{ transform: `scaleX(${Math.max(0.04, value)})` }}
        />
      </div>
    </div>
  );
}
