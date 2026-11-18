import clsx from 'clsx';
import { Ban, ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { formatNumber } from '../lib/format';
import type { DayCount, UserRole } from '../lib/types';
import { errorMessage } from './feedback';
import { Badge, Button } from './ui';

const DAY_LABEL = new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
const DAY_LONG = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/** `YYYY-MM-DD` as a UTC date, so the label never shifts with the viewer's timezone. */
const dayDate = (day: string) => new Date(`${day}T00:00:00Z`);

export function RoleBadge({ role }: { role: UserRole }) {
  if (role === 'superadmin') return <Badge tone="ink">Superadministrador</Badge>;
  if (role === 'operator') return <Badge tone="blue">Operador</Badge>;
  return role === 'admin' ? <Badge tone="purple">Administrador</Badge> : <Badge>Usuario</Badge>;
}

/** Only shown for deactivated accounts; the text carries the state, not just the color. */
export function StatusBadge({ disabledAt }: { disabledAt: string | null }) {
  return disabledAt ? (
    <Badge tone="red">
      <Ban className="size-3" aria-hidden="true" /> Desactivada
    </Badge>
  ) : null;
}

export interface StatItem {
  key: string;
  label: string;
  value: number;
  icon: LucideIcon;
  tile: string;
}

/** Row of headline totals; wraps to two columns on phones. */
export function StatGrid({ items, className }: { items: StatItem[]; className?: string }) {
  return (
    <dl className={clsx('grid grid-cols-2 gap-2 sm:grid-cols-3', items.length === 5 ? 'xl:grid-cols-5' : 'xl:grid-cols-6', className)}>
      {items.map(({ key, label, value, icon: Icon, tile }) => (
        <div key={key} className="flex min-w-0 items-center gap-3 rounded-2xl bg-white p-3 shadow-surface" title={`${formatNumber(value)} ${label}`}>
          <span aria-hidden="true" className={clsx('flex size-9 shrink-0 items-center justify-center rounded-xl', tile)}>
            <Icon className="size-[18px]" />
          </span>
          <div className="flex min-w-0 flex-col">
            <dt className="order-2 truncate text-xs font-semibold text-wolf">{label}</dt>
            <dd className="order-1 truncate text-xl font-bold leading-tight tabular-nums text-eel">{formatNumber(value)}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}

/** Plain white panel with a title; used for each block of the admin pages (never nested). */
export function Panel({ title, subtitle, actions, children, className }: { title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('rounded-[20px] bg-white p-4 shadow-surface sm:rounded-[24px] sm:p-5', className)} aria-label={title}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-eel">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-wolf">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/**
 * Single-series column chart of scans per day. Each column shows its exact value on hover/focus
 * (native tooltip) and the same numbers are available to screen readers as a list.
 */
export function DailyChart({ data, label }: { data: DayCount[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((sum, d) => sum + d.count, 0);
  // Label every column when there is room; otherwise only some of them.
  const step = data.length > 14 ? 7 : data.length > 7 ? 2 : 1;
  return (
    <figure>
      <figcaption className="sr-only">
        {label}: {formatNumber(total)} en total
      </figcaption>
      <div aria-hidden="true" className="flex h-40 items-end gap-[2px] border-b border-swan">
        {data.map((d) => (
          <div key={d.day} className="group relative flex h-full min-w-0 flex-1 items-end" title={`${DAY_LONG.format(dayDate(d.day))}: ${d.count} ${d.count === 1 ? 'hoja' : 'hojas'}`}>
            <div
              className={clsx('w-full rounded-t-[4px] transition-colors duration-150', d.count ? 'bg-macaw group-hover:bg-macaw-dark' : 'bg-transparent')}
              style={{ height: `${(d.count / max) * 100}%` }}
            />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="mt-1.5 flex gap-[2px]">
        {data.map((d, i) => (
          <span key={d.day} className="min-w-0 flex-1 truncate text-center text-[11px] font-semibold text-wolf">
            {(data.length - 1 - i) % step === 0 ? DAY_LABEL.format(dayDate(d.day)) : ''}
          </span>
        ))}
      </div>
      <ul className="sr-only">
        {data.map((d) => (
          <li key={d.day}>
            {DAY_LONG.format(dayDate(d.day))}: {d.count}
          </li>
        ))}
      </ul>
    </figure>
  );
}

export const PAGE_SIZES = [10, 20, 50] as const;

/** Page numbers to show: always the first and last, and the neighbours of the current one. */
function pageWindow(page: number, pages: number): (number | 'gap')[] {
  const wanted = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const sorted = [...wanted].sort((a, b) => a - b);
  return sorted.flatMap((p, i) => (i > 0 && p - sorted[i - 1] > 1 ? ['gap' as const, p] : [p]));
}

/**
 * Previous/next with page numbers (from `sm` up), the visible range over the total and, when
 * `onPageSizeChange` is given, a page-size selector.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1 && (!onPageSizeChange || total <= PAGE_SIZES[0])) return null;
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Paginación" className="mt-4 flex flex-col gap-3 border-t border-swan pt-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-wolf">
        <span className="tabular-nums">
          {formatNumber(first)}–{formatNumber(last)} de {formatNumber(total)}
        </span>
        {onPageSizeChange && (
          <label className="flex items-center gap-2">
            <span>Por página</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-9 rounded-full bg-polar px-3 text-sm font-semibold text-eel outline-none focus-visible:ring-4 focus-visible:ring-macaw/35"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <Button variant="ghost" size="sm" icon={<ChevronLeft className="size-4" />} disabled={page <= 1} onClick={() => onChange(page - 1)}>
            Anterior
          </Button>
          <span className="text-sm font-semibold tabular-nums text-wolf sm:hidden" aria-live="polite">
            Página {page} de {pages}
          </span>
          <ol className="hidden items-center gap-1 sm:flex">
            {pageWindow(page, pages).map((p, i) =>
              p === 'gap' ? (
                <li key={`gap-${i}`} aria-hidden="true" className="px-1 text-sm text-wolf">
                  …
                </li>
              ) : (
                <li key={p}>
                  <button
                    type="button"
                    onClick={() => onChange(p)}
                    aria-current={p === page ? 'page' : undefined}
                    aria-label={`Página ${p}`}
                    className={clsx(
                      'flex size-9 items-center justify-center rounded-full text-sm font-bold tabular-nums transition-colors duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-macaw/35',
                      p === page ? 'bg-eel text-white' : 'text-wolf hover:bg-polar hover:text-eel',
                    )}
                  >
                    {p}
                  </button>
                </li>
              ),
            )}
          </ol>
          <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
            Siguiente
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </nav>
  );
}

/** Pill-shaped filter chips that scroll sideways on narrow screens instead of squeezing. */
export function ChipFilter<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={clsx(
            'min-h-10 shrink-0 rounded-full px-4 text-sm font-bold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-macaw/35',
            value === o.value ? 'bg-eel text-white' : 'bg-polar text-wolf hover:text-eel',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Small labelled control for filter rows (select, search or date input), sized for touch. */
export function FilterField({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={clsx('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-xs font-semibold text-wolf">{label}</span>
      {children}
    </label>
  );
}

export const filterInputClass =
  'h-11 w-full min-w-0 rounded-xl bg-polar px-3 text-sm font-semibold text-eel outline-none transition-[background-color,box-shadow] duration-200 focus:bg-white focus:shadow-[0_0_0_3px_rgba(163,142,249,0.35)]';

/** A `YYYY-MM-DD` date input as the start of that local day in ISO; `endOfDay` gives the next day's start (the server's `to` is exclusive). */
export function dayToIso(day: string, endOfDay = false) {
  if (!day) return undefined;
  const date = new Date(`${day}T00:00:00`);
  if (Number.isNaN(date.getTime())) return undefined;
  if (endOfDay) date.setDate(date.getDate() + 1);
  return date.toISOString();
}

/** Debounced copy of a value, for search boxes that query the server. */
export function useDebounced<T>(value: T, ms = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/**
 * Loads a page of data whenever `deps` change; keeps the previous data while reloading so the list
 * does not jump. `reload` refetches the same page (after an action changed a row).
 */
export function usePaged<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    load()
      .then((r) => active && setData(r))
      .catch((err) => active && setError(errorMessage(err)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [...deps, version]);
  return { data, setData, error, loading, reload: () => setVersion((v) => v + 1) };
}

export function UserAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span aria-hidden="true" className={clsx('flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-on-accent', className)}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
