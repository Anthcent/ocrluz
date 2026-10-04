import clsx from 'clsx';
import type { ReactNode } from 'react';

const TONES = {
  green: 'bg-feather-light text-feather-dark',
  blue: 'bg-macaw-light text-macaw-dark',
  purple: 'bg-beetle-light text-beetle-dark',
  orange: 'bg-fox-light text-fox-dark',
  red: 'bg-cardinal-light text-cardinal-dark',
  gray: 'bg-polar text-wolf',
};

/** Acción principal con un marcador de color semántico. */
export function ActionTile({
  icon,
  label,
  shortLabel,
  tone = 'gray',
  onClick,
  disabled,
  compact,
}: {
  icon: ReactNode;
  label: string;
  /** Etiqueta corta para pantallas pequeñas; el nombre accesible sigue siendo `label`. */
  shortLabel?: string;
  tone?: keyof typeof TONES;
  onClick: () => void;
  disabled?: boolean;
  /** En móvil las fichas van en fila y se muestran más pequeñas. */
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={clsx(
        'flex min-w-0 flex-col items-center gap-2 rounded-2xl bg-white text-center shadow-[0_1px_2px_rgba(41,36,68,0.06)] transition-[transform,background-color,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[#fafafa] hover:shadow-[0_4px_8px_rgba(41,36,68,0.08)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 motion-reduce:transition-none',
        compact ? 'px-2 py-2.5' : 'px-3 py-4',
      )}
    >
      <span className={clsx('flex items-center justify-center rounded-xl', TONES[tone], compact ? 'size-9 [&>svg]:size-5' : 'size-11 [&>svg]:size-5')}>
        {icon}
      </span>
      <span className={clsx('w-full truncate font-bold leading-tight text-eel', compact ? 'text-[11px] sm:text-xs' : 'text-sm')}>
        {shortLabel ? (
          <>
            <span className="sm:hidden">{shortLabel}</span>
            <span className="hidden sm:inline">{label}</span>
          </>
        ) : (
          label
        )}
      </span>
    </button>
  );
}

/** Progreso de lectura con estado visible también sin movimiento. */
export function LessonProgress({ value, label }: { value: number; label?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-swan/80">
        <div
          className="h-full rounded-full bg-feather transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          style={{ width: `${Math.max(3, Math.min(100, value))}%` }}
        />
      </div>
      {label && <span className="shrink-0 text-sm font-semibold tabular-nums text-wolf">{label}</span>}
    </div>
  );
}
