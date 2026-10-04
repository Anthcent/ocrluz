import clsx from 'clsx';
import { Archive, Eye, FileScan, FolderOpen, House, Layers, LogOut, Plus, ScanLine, Search, Settings } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { GROUP_STYLES } from '../lib/constants';
import type { Stats } from '../lib/types';
import { useScanSession } from '../scan/ScanSession';
import { SidebarTotals } from './ArchiveTotals';
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

export function Layout() {
  const { user, logout } = useAuth();
  const stats = useStats();
  const pendingPages = useScanSession().pages.length;
  const initial = user?.name.charAt(0).toUpperCase();

  return (
    <div className="min-h-dvh bg-polar lg:pl-[17.5rem]">
      <aside className="fixed inset-y-4 left-4 z-40 hidden w-60 flex-col overflow-hidden rounded-[24px] bg-eel p-3 text-white shadow-floating lg:flex">
        <Logo className="px-2.5 pb-2 pt-2.5 text-white" />
        <nav aria-label="Principal" className="mt-4 flex flex-col gap-0.5">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  'group flex min-h-11 items-center gap-3 rounded-2xl px-2 py-1.5 text-sm font-semibold transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98]',
                  isActive ? 'bg-white text-eel' : 'text-white/65 hover:bg-white/10 hover:text-white',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={clsx('flex size-8 items-center justify-center rounded-xl transition-colors duration-200', isActive ? 'bg-macaw-light text-macaw-dark' : 'bg-white/[0.07]')}>
                    <Icon className="size-[18px]" strokeWidth={2} />
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Summary blocks sit at the bottom; on short screens the less important one hides instead of scrolling. */}
        <div className="scrollbar-none mt-4 min-h-0 flex-1 overflow-y-auto">
          <div className="flex min-h-full flex-col justify-end gap-2 pb-2">
            <ContinueCard stats={stats} className="[@media(max-height:689px)]:hidden" />
            <SidebarTotals stats={stats} className="[@media(max-height:579px)]:hidden" />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2.5 rounded-2xl bg-white/[0.06] p-2">
          <div aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-macaw text-sm font-bold text-eel">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{user?.name}</div>
            <div className="truncate text-xs text-white/60">{user?.email}</div>
          </div>
          <button
            onClick={logout}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-white/60 transition-colors duration-200 hover:bg-white/10 hover:text-white"
          >
            <LogOut className="size-[18px]" />
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-30 bg-polar/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:px-6 lg:h-16 lg:px-8">
          <Link to="/" aria-label="Ocryon, ir al inicio" className="-ml-1 rounded-xl p-1 lg:hidden">
            <Logo compact />
          </Link>
          <div className="ml-auto flex items-center gap-2" data-testid="top-stats">
            {pendingPages > 0 && (
              <Link
                to="/escanear"
                title="Hojas en el lote sin archivar"
                aria-label={`${pendingPages} ${pendingPages === 1 ? 'hoja' : 'hojas'} en el lote sin archivar`}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-bee py-1 pl-1 pr-3 text-sm font-semibold text-eel shadow-surface transition-transform duration-200 active:scale-[0.98]"
              >
                <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full bg-white/70">
                  <Layers className="size-4" />
                </span>
                <span className="tabular-nums">{pendingPages}</span> <span className="hidden min-[400px]:inline">por archivar</span>
              </Link>
            )}
            <NavLink
              to="/ajustes"
              aria-label="Ajustes"
              title="Ajustes"
              className={({ isActive }) =>
                clsx(
                  'flex size-11 items-center justify-center rounded-full shadow-surface transition-[background-color,transform] duration-200 active:scale-95 lg:hidden',
                  isActive ? 'bg-eel text-white' : 'bg-white text-eel',
                )
              }
            >
              {({ isActive }) =>
                isActive ? (
                  <Settings className="size-5" strokeWidth={2} />
                ) : (
                  <span aria-hidden="true" className="relative flex size-8 items-center justify-center rounded-full bg-macaw text-sm font-bold text-eel">
                    {initial}
                    <span className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-white text-eel ring-2 ring-white">
                      <Settings className="size-3" strokeWidth={2.5} />
                    </span>
                  </span>
                )
              }
            </NavLink>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 pb-32 pt-2 sm:px-6 lg:px-8 lg:pb-12 lg:pt-3">
        <Outlet />
      </main>

      <nav aria-label="Principal" className="pb-safe fixed inset-x-3 bottom-3 z-40 rounded-[22px] bg-eel shadow-floating lg:hidden">
        <div className="mx-auto grid h-[4.25rem] max-w-md grid-cols-5 items-stretch px-1">
          {MOBILE_NAV.map(({ to, label, icon: Icon, end }) => {
            const primary = to === '/escanear';
            return (
              <NavLink key={to} to={to} end={end} className="group flex flex-col items-center justify-center gap-1 rounded-2xl outline-offset-[-2px]">
                {({ isActive }) => (
                  <>
                    <span
                      className={clsx(
                        'flex h-8 items-center justify-center rounded-full transition-[background-color,color,transform,width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-active:scale-95',
                        primary
                          ? clsx('w-14 bg-macaw text-eel', isActive && 'ring-2 ring-white/85 ring-offset-2 ring-offset-eel')
                          : clsx('w-12', isActive ? 'bg-white text-eel' : 'text-white/60'),
                      )}
                    >
                      <Icon className="size-5" strokeWidth={isActive || primary ? 2.25 : 2} />
                    </span>
                    <span className={clsx('max-w-full truncate px-0.5 text-[11px] font-semibold leading-none', isActive || primary ? 'text-white' : 'text-white/60')}>{label}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

/** "Carpeta reciente" row for the dark sidebar: open the folder, view it or add sheets. */
function ContinueCard({ stats, className }: { stats: Stats | null; className?: string }) {
  if (!stats) return null;
  const folder = stats.recentGroups[0];

  if (!folder) {
    return (
      <Link
        to="/escanear"
        className={clsx('flex items-center gap-2.5 rounded-2xl bg-white/[0.06] p-2 transition-colors duration-200 hover:bg-white/10', className)}
      >
        <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-macaw text-eel">
          <ScanLine className="size-[18px]" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-white">Empieza tu archivo</span>
          <span className="block truncate text-xs text-white/60">Escanea tu primera hoja</span>
        </span>
      </Link>
    );
  }

  const style = GROUP_STYLES[folder.color];
  const progress = folder.totalPages ? Math.min(100, (folder.scanCount / folder.totalPages) * 100) : null;
  return (
    <div className={clsx('rounded-2xl bg-white/[0.06] p-2', className)} data-testid="continue-card">
      <div className="flex items-center justify-between gap-2 pb-1 pl-1.5">
        <span className="text-xs font-semibold text-white/60">Carpeta reciente</span>
        <span className="flex gap-3 pr-1.5">
          <SidebarIconLink to={`/archivo/carpeta/${folder.id}?visor=1`} label={`Ver ${folder.title}`}>
            <Eye className="size-4" />
          </SidebarIconLink>
          <SidebarIconLink to={`/escanear?grupo=${folder.id}`} label={`Añadir hojas a ${folder.title}`}>
            <Plus className="size-4" />
          </SidebarIconLink>
        </span>
      </div>
      <Link to={`/archivo/carpeta/${folder.id}`} className="flex items-center gap-2.5 rounded-xl p-1 transition-colors duration-200 hover:bg-white/[0.06]">
        <span aria-hidden="true" className={clsx('flex size-9 shrink-0 items-center justify-center rounded-xl', style.soft, style.text)}>
          <FolderOpen className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-white">{folder.title}</span>
          <span className="block truncate text-xs text-white/60">
            {folder.scanCount} {folder.scanCount === 1 ? 'hoja' : 'hojas'}
            {folder.totalPages ? ` de ${folder.totalPages}` : ''}
          </span>
        </span>
      </Link>
      {progress !== null && (
        <div className="mx-1 mt-1.5 h-1 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Avance de la carpeta" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full origin-left rounded-full bg-feather" style={{ transform: `scaleX(${progress / 100})` }} />
        </div>
      )}
    </div>
  );
}

/** Small circular icon link with an expanded 44px hit area. */
function SidebarIconLink({ to, label, children }: { to: string; label: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      aria-label={label}
      title={label}
      className="relative flex size-8 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors duration-200 after:absolute after:-inset-1.5 hover:bg-white/20 hover:text-white"
    >
      {children}
    </Link>
  );
}
