import clsx from 'clsx';
import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatNumber } from '../lib/format';
import type { DayCount, UserRole } from '../lib/types';
import { Badge, Button } from './ui';

const DAY_LABEL = new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
const DAY_LONG = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/** `YYYY-MM-DD` as a UTC date, so the label never shifts with the viewer's timezone. */
const dayDate = (day: string) => new Date(`${day}T00:00:00Z`);

export function RoleBadge({ role }: { role: UserRole }) {
  if (role === 'superadmin') return <Badge tone="ink">Superadministrador</Badge>;
  return role === 'admin' ? <Badge tone="purple">Administrador</Badge> : <Badge>Usuario</Badge>;
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

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav aria-label="Paginación" className="mt-4 flex items-center justify-between gap-3">
      <Button variant="ghost" size="sm" icon={<ChevronLeft className="size-4" />} disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Anterior
      </Button>
      <span className="text-sm font-semibold tabular-nums text-wolf" aria-live="polite">
        Página {page} de {pages}
      </span>
      <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Siguiente
        <ChevronRight className="size-4" />
      </Button>
    </nav>
  );
}

export function UserAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span aria-hidden="true" className={clsx('flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-on-accent', className)}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
