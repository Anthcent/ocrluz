import clsx from 'clsx';
import { FileText, FolderOpen, Type } from 'lucide-react';
import { formatNumber } from '../lib/format';
import type { Stats } from '../lib/types';

/** The three archive counters (folders, sheets, words), always present, zeros included. */
export function archiveTotals(stats: Stats | null) {
  const groups = stats?.totals.groups ?? 0;
  const scans = stats?.totals.scans ?? 0;
  const words = stats?.totals.words ?? 0;
  return [
    { key: 'groups', value: groups, label: groups === 1 ? 'carpeta' : 'carpetas', icon: FolderOpen, tile: 'bg-macaw-light text-macaw-dark' },
    { key: 'scans', value: scans, label: scans === 1 ? 'hoja' : 'hojas', icon: FileText, tile: 'bg-feather-light text-feather-dark' },
    { key: 'words', value: words, label: words === 1 ? 'palabra' : 'palabras', icon: Type, tile: 'bg-bee-light text-bee-dark' },
  ];
}

/** Compact totals for the dark desktop sidebar. */
export function SidebarTotals({ stats, className }: { stats: Stats | null; className?: string }) {
  const empty = stats !== null && stats.totals.scans === 0;
  return (
    <section aria-labelledby="archive-totals-title" className={clsx('rounded-2xl bg-white/[0.06] px-3 py-2.5', className)} data-testid="archive-totals">
      <h2 id="archive-totals-title" className="text-xs font-semibold text-white/60">
        {empty ? 'Resumen · aún vacío' : 'Resumen'}
      </h2>
      <dl className="mt-1.5 grid grid-cols-3 gap-2">
        {archiveTotals(stats).map(({ key, value, label }) => (
          <div key={key} className="flex min-w-0 flex-col" title={`${formatNumber(value)} ${label}`}>
            <dt className="order-2 truncate text-xs font-medium text-white/60">{label}</dt>
            <dd className={clsx('order-1 truncate text-base font-bold tabular-nums', stats ? 'text-white' : 'text-white/30')}>{stats ? formatNumber(value) : '0'}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Light totals strip used on Home, readable on phones at 360px. */
export function TotalsStrip({ stats, className }: { stats: Stats | null; className?: string }) {
  return (
    <dl className={clsx('grid grid-cols-3 gap-1.5 sm:gap-2', className)} data-testid="home-totals">
      {archiveTotals(stats).map(({ key, value, label, icon: Icon, tile }) => (
        <div key={key} className="flex min-w-0 items-center gap-2 rounded-2xl bg-white p-2 sm:gap-3 sm:p-3" title={`${formatNumber(value)} ${label}`}>
          <span aria-hidden="true" className={clsx('hidden size-9 shrink-0 items-center justify-center rounded-xl min-[400px]:flex', tile)}>
            <Icon className="size-[18px]" />
          </span>
          <div className="flex min-w-0 flex-col">
            <dt className="order-2 truncate text-xs font-semibold text-wolf">{label}</dt>
            <dd className="order-1 truncate text-lg font-bold leading-tight tabular-nums text-eel sm:text-xl">{formatNumber(value)}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}
