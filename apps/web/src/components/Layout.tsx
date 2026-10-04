import clsx from 'clsx';
import { Archive, Eye, FileScan, FileText, Folder, House, LogOut, Plus, ScanLine, Search, Settings, Type } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { GROUP_STYLES } from '../lib/constants';
import { formatNumber } from '../lib/format';
import type { Stats } from '../lib/types';
import { useScanSession } from '../scan/ScanSession';
import { LabeledProgress } from './ActionTile';
import { FolderCard } from './FolderCard';
import { Logo } from './Logo';

const NAV = [
  { to: '/', label: 'Inicio', icon: House, end: true },
  { to: '/escanear', label: 'Escanear', icon: ScanLine },
  { to: '/archivo', label: 'Archivo', icon: Archive },
  { to: '/documentos', label: 'Documentos', icon: FileScan },
  { to: '/buscar', label: 'Buscar', icon: Search },
  { to: '/ajustes', label: 'Ajustes', icon: Settings },
];

const MOBILE_NAV = ['/', '/archivo', '/escanear', '/documentos', '/buscar'].map((to) => NAV.find((item) => item.to === to)!);

function useStats() {
  const location = useLocation();
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    api.stats().then(setStats).catch(() => {});
  }, [location.pathname]);
  return stats;
}

function StatChip({ icon, value, label, from }: { icon: ReactNode; value: ReactNode; label: string; from?: 'sm' | 'md' }) {
  return (
    <span
      title={label}
      aria-label={`${label}: ${value}`}
      className={clsx(
        'items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-eel shadow-[0_1px_2px_rgba(41,36,68,0.06)]',
        from === 'sm' ? 'hidden sm:inline-flex' : from === 'md' ? 'hidden md:inline-flex' : 'inline-flex',
      )}
    >
      <span className="text-macaw-dark">{icon}</span>
      {value}
    </span>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const stats = useStats();
  const pendingPages = useScanSession().pages.length;

  return (
    <div className="min-h-dvh bg-polar lg:pl-[17.5rem]">
      <aside className="fixed inset-y-4 left-4 z-40 hidden w-60 flex-col overflow-hidden rounded-[28px] bg-eel p-4 text-white shadow-[0_12px_32px_rgba(30,27,48,0.18)] lg:flex">
        <Logo className="px-2 py-3 text-white" />
        <nav className="mt-6 flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  'group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98]',
                  isActive ? 'bg-white text-eel' : 'text-white/65 hover:bg-white/10 hover:text-white',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={clsx('flex size-9 items-center justify-center rounded-xl', isActive ? 'bg-macaw-light text-macaw-dark' : 'bg-white/8')}>
                    <Icon className="size-5" strokeWidth={2} />
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <ContinueCard stats={stats} />

        <div className="mt-auto flex items-center gap-3 rounded-2xl bg-white/8 p-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-macaw text-base font-bold text-eel">
            {user?.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{user?.name}</div>
            <div className="truncate text-xs text-white/55">{user?.email}</div>
          </div>
          <button onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión" className="rounded-full p-2 text-white/55 transition hover:bg-white/10 hover:text-white">
            <LogOut className="size-5" />
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-30 bg-polar/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:px-6 lg:h-20 lg:px-8">
          <Logo className="lg:hidden" />
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2" data-testid="top-stats">
            {pendingPages > 0 && (
              <Link to="/escanear" title="Hojas en el escáner sin guardar" className="inline-flex items-center gap-1.5 rounded-full bg-bee px-3 py-1.5 text-sm font-semibold text-eel transition active:scale-[0.98]">
                <ScanLine className="size-4" /> {pendingPages} <span className="hidden sm:inline">sin guardar</span>
              </Link>
            )}
            <StatChip icon={<FileText className="size-4" />} value={formatNumber(stats?.totals.scans ?? 0)} label="Escaneos" />
            <StatChip icon={<Folder className="size-4" />} value={formatNumber(stats?.totals.groups ?? 0)} label="Carpetas" from="sm" />
            <StatChip icon={<Type className="size-4" />} value={formatNumber(stats?.totals.words ?? 0)} label="Palabras" from="md" />
            <NavLink to="/ajustes" aria-label="Ajustes" className={({ isActive }) => clsx('flex size-10 items-center justify-center rounded-full transition lg:hidden', isActive ? 'bg-eel text-white' : 'bg-white text-wolf')}>
              <Settings className="size-5" strokeWidth={2} />
            </NavLink>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 pb-28 pt-4 sm:px-6 lg:px-8 lg:pb-12 lg:pt-5">
        <Outlet />
      </main>

      <nav className="pb-safe fixed inset-x-4 bottom-3 z-40 rounded-[22px] bg-eel px-1.5 shadow-[0_12px_32px_rgba(30,27,48,0.28)] lg:hidden">
        <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center gap-1">
          {MOBILE_NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className="flex justify-center">
              {({ isActive }) => (
                <span className={clsx('flex min-w-12 flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5 text-[10px] font-semibold transition-[background-color,color,transform] duration-200 active:scale-95', isActive ? 'bg-white text-eel' : 'text-white/55')}>
                  <Icon className="size-5" strokeWidth={2} />
                  {label}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

function ContinueCard({ stats }: { stats: Stats | null }) {
  const folder = stats?.recentGroups[0];
  if (!stats) return null;
  if (!folder) {
    return (
      <div className="mt-5 rounded-2xl bg-white/8 p-4">
        <div className="font-semibold text-white">Empieza tu archivo</div>
        <p className="mt-1 text-sm text-white/55">Escanea documentos y guárdalos en carpetas.</p>
        <Link to="/escanear" className="mt-3 flex items-center justify-center gap-1.5 rounded-full bg-macaw py-2 text-xs font-semibold text-eel transition active:scale-[0.98]">
          <ScanLine className="size-4" /> Escanear documentos
        </Link>
      </div>
    );
  }
  const style = GROUP_STYLES[folder.color];
  return (
    <div className="mt-5 rounded-2xl bg-white p-3 text-eel" data-testid="continue-card">
      <div className="mb-2 text-xs font-semibold text-wolf">Carpeta reciente</div>
      <Link to={`/archivo/carpeta/${folder.id}`} className="flex items-center gap-3">
        <FolderCard group={folder} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-bold leading-tight">{folder.title}</div>
          {folder.author && <div className={clsx('truncate text-xs font-semibold', style.text)}>Responsable: {folder.author}</div>}
          <div className="mt-1 text-xs text-wolf">
            {folder.scanCount} {folder.scanCount === 1 ? 'hoja' : 'hojas'}
            {folder.totalPages ? ` de ${folder.totalPages}` : ''}
          </div>
        </div>
      </Link>
      {folder.totalPages ? <div className="mt-3"><LabeledProgress value={(folder.scanCount / folder.totalPages) * 100} /></div> : null}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link to={`/archivo/carpeta/${folder.id}?visor=1`} className="flex items-center justify-center gap-1 rounded-full bg-eel py-2 text-xs font-semibold text-white transition active:scale-[0.98]">
          <Eye className="size-3.5" /> Ver
        </Link>
        <Link to={`/escanear?grupo=${folder.id}`} className="flex items-center justify-center gap-1 rounded-full bg-polar py-2 text-xs font-semibold text-eel transition active:scale-[0.98]">
          <Plus className="size-3.5" /> Hojas
        </Link>
      </div>
    </div>
  );
}
