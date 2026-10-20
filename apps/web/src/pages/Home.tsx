import clsx from 'clsx';
import {
  Archive,
  ArrowRight,
  Camera,
  CheckCircle2,
  Clock3,
  FilePlus2,
  Files,
  FileText,
  FolderOpen,
  Search,
  Settings2,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { Button, EmptyState, PageLoader } from '../components/ui';
import { api } from '../lib/api';
import { GROUP_STYLES } from '../lib/constants';
import { formatNumber, timeAgo } from '../lib/format';
import type { Scan, ScanEngine, Stats } from '../lib/types';
import { useScanSession } from '../scan/ScanSession';
import { useSettings } from '../settings/SettingsContext';

const ENGINE_LABEL: Record<ScanEngine, string> = { ocrspace: 'OCR.space', gemini: 'Gemini', tesseract: 'Tesseract', manual: 'Manual' };
const TODAY_LABEL = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' });

type Tone = 'violet' | 'mint' | 'amber' | 'red' | 'gray';
const TONE_TILE: Record<Tone, string> = {
  violet: 'bg-macaw-light text-macaw-dark',
  mint: 'bg-feather-light text-feather-dark',
  amber: 'bg-bee-light text-bee-dark',
  red: 'bg-cardinal-light text-cardinal-dark',
  gray: 'bg-polar text-eel',
};

interface Shortcut {
  id: string;
  to: string;
  label: string;
  icon: LucideIcon;
  tone: Tone;
}

const SHORTCUTS: Shortcut[] = [
  { id: 'scan', to: '/escanear', label: 'Escanear', icon: Camera, tone: 'violet' },
  { id: 'new-doc', to: '/documentos/nuevo', label: 'Nuevo documento', icon: FilePlus2, tone: 'mint' },
  { id: 'search', to: '/buscar', label: 'Buscar', icon: Search, tone: 'amber' },
  { id: 'archive', to: '/archivo', label: 'Archivo', icon: Archive, tone: 'violet' },
  { id: 'loose', to: '/archivo?vista=individuales', label: 'Sueltos', icon: FileText, tone: 'red' },
  { id: 'documents', to: '/documentos', label: 'Documentos', icon: Files, tone: 'mint' },
  { id: 'settings', to: '/ajustes', label: 'Ajustes', icon: Settings2, tone: 'gray' },
];

const USAGE_KEY = 'ocryon:shortcut-usage';

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function readUsage(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(USAGE_KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

export function HomePage() {
  const { user } = useAuth();
  const { settings, loaded } = useSettings();
  const { pages } = useScanSession();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [recentScans, setRecentScans] = useState<Scan[]>([]);
  const [looseScans, setLooseScans] = useState<Scan[]>([]);
  const [usage, setUsage] = useState(readUsage);

  const load = () => {
    setFailed(false);
    api
      .stats()
      .then(setStats)
      .catch(() => setFailed(true));
  };
  useEffect(load, []);
  useEffect(() => {
    api.scans.list({ scope: 'all', limit: 6 }).then((r) => setRecentScans(r.scans)).catch(() => {});
    api.scans.list({ scope: 'individual', limit: 3 }).then((r) => setLooseScans(r.scans)).catch(() => {});
  }, []);

  const search = (event: FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (value) navigate(`/buscar?q=${encodeURIComponent(value)}`);
  };

  const recordUsage = (id: string) => {
    const next = { ...usage, [id]: (usage[id] ?? 0) + 1 };
    setUsage(next);
    try {
      localStorage.setItem(USAGE_KEY, JSON.stringify(next));
    } catch {
      // Without storage the shortcuts simply keep their default order.
    }
  };

  if (failed) {
    return (
      <EmptyState icon={<WifiOff className="size-10" />} title="No se pudo cargar el inicio" action={<Button onClick={load}>Reintentar</Button>}>
        Revisa tu conexión con el servidor.
      </EmptyState>
    );
  }
  if (!stats) return <PageLoader />;

  const noKeys = loaded && !settings.keys.ocrspace.configured && !settings.keys.gemini.configured;
  const weekTotal = stats.week.reduce((sum, day) => sum + day.count, 0);
  const firstName = user?.name.split(' ')[0] ?? '';
  const hasUsage = Object.values(usage).some((count) => count > 0);
  const shortcuts = SHORTCUTS.map((s, index) => ({ ...s, index, count: usage[s.id] ?? 0 }))
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .slice(0, 6);

  const summary = weekTotal
    ? `${weekTotal} ${weekTotal === 1 ? 'hoja escaneada' : 'hojas escaneadas'} esta semana · ${formatNumber(stats.totals.words)} palabras en tu archivo.`
    : stats.totals.scans
      ? 'Esta semana todavía no escaneaste nada. ¿Seguimos?'
      : 'Tu espacio está listo: escanea tu primera hoja para empezar.';

  return (
    <div className="space-y-6 lg:space-y-8">
      <section className="animate-header-in relative overflow-hidden rounded-[24px] bg-brand text-white">
        <div aria-hidden="true" className="h-1.5 bg-accent" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-10 size-72 rounded-full bg-white/[0.05]" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 right-32 size-56 rounded-full bg-white/[0.04]" />

        <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.9fr)] lg:items-center lg:gap-10 lg:p-9">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white/60">{capitalize(TODAY_LABEL.format(new Date()))}</p>
            <h1 className="mt-1 truncate text-[1.75rem] font-bold leading-tight tracking-[-0.03em] sm:text-4xl">¡Hola, {firstName}!</h1>
            <p className="mt-2 max-w-md text-[0.9375rem] font-medium text-white/70 sm:text-base">{summary}</p>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <Link
                to="/escanear"
                onClick={() => recordUsage('scan')}
                className="inline-flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-full bg-accent px-5 text-sm font-bold text-on-accent transition-[transform,background-color] duration-200 hover:bg-accent-hover active:scale-[0.98]"
              >
                <Camera className="size-5 shrink-0" /> <span className="truncate">Escanear</span>
              </Link>
              <Link
                to="/documentos/nuevo"
                onClick={() => recordUsage('new-doc')}
                className="inline-flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-eel transition-[transform,background-color] duration-200 hover:bg-polar active:scale-[0.98]"
              >
                <FilePlus2 className="size-5 shrink-0" /> <span className="truncate">Nuevo documento</span>
              </Link>
            </div>
          </div>

          <div className="min-w-0 space-y-3">
            <form onSubmit={search} role="search" className="flex items-center gap-2 rounded-2xl bg-white p-1.5 pl-4 shadow-floating">
              <Search className="size-5 shrink-0 text-wolf" />
              <label htmlFor="dashboard-search" className="sr-only">Buscar en todo tu archivo</label>
              <input
                id="dashboard-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Busca un nombre, cédula o frase"
                className="min-w-0 flex-1 bg-transparent py-2.5 text-sm font-medium text-eel outline-none placeholder:text-wolf"
              />
              <button type="submit" aria-label="Buscar en el archivo" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white transition active:scale-95">
                <ArrowRight className="size-5" />
              </button>
            </form>
            <div className="grid grid-cols-3 gap-2">
              <HeroStat to="/archivo" value={stats.totals.groups} label={stats.totals.groups === 1 ? 'carpeta' : 'carpetas'} />
              <HeroStat to="/archivo" value={stats.totals.scans} label={stats.totals.scans === 1 ? 'hoja' : 'hojas'} />
              <HeroStat to="/archivo?vista=individuales" value={stats.totals.individual} label="sin organizar" alert={stats.totals.individual > 0} />
            </div>
          </div>
        </div>

        <div className="relative flex flex-wrap gap-2 border-t border-white/10 px-5 py-4 sm:px-7 lg:px-9">
          <StatusChip ok={!pages.length} label={pages.length ? `${pages.length} ${pages.length === 1 ? 'hoja' : 'hojas'} en cola` : 'Cola vacía'} to="/escanear" />
          <StatusChip ok label={`Motor: ${ENGINE_LABEL[settings.defaultEngine]}`} to="/ajustes" />
          <StatusChip ok={!noKeys} label={noKeys ? 'OCR en la nube sin configurar' : 'OCR en la nube listo'} to="/ajustes" />
        </div>
      </section>

      <section aria-labelledby="shortcuts-title">
        <SectionTitle id="shortcuts-title" title={hasUsage ? 'Tus accesos más usados' : 'Accesos rápidos'} subtitle="Se ordenan solos según lo que más usas." />
        <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-6">
          {shortcuts.map(({ id, to, label, icon: Icon, tone, count }) => (
            <Link
              key={id}
              to={to}
              onClick={() => recordUsage(id)}
              className="group flex min-w-0 flex-col items-center gap-2 rounded-2xl bg-white px-2 py-4 text-center shadow-surface transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_18px_rgba(41,36,68,0.10)] active:translate-y-0"
            >
              <span className={clsx('flex size-11 items-center justify-center rounded-2xl transition-transform duration-200 group-hover:scale-105', TONE_TILE[tone])}>
                <Icon className="size-5" />
              </span>
              <span className="w-full truncate text-sm font-bold text-eel">{label}</span>
              {count > 0 && <span className="-mt-1.5 text-[11px] font-semibold text-wolf">{count} {count === 1 ? 'uso' : 'usos'}</span>}
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] lg:items-start">
        <RecentActivity scans={recentScans} />
        <UnorganizedCard total={stats.totals.scans} count={stats.totals.individual} scans={looseScans} />
      </div>

      <section aria-labelledby="recent-folders-title">
        <SectionTitle
          id="recent-folders-title"
          title="Carpetas recientes"
          subtitle="Continúa desde la última carpeta actualizada."
          action={
            <Link to="/archivo" className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-1 text-sm font-bold text-eel hover:text-macaw-dark">
              Ver archivo <ArrowRight className="size-4" />
            </Link>
          }
        />
        {stats.recentGroups.length ? (
          <div className="scrollbar-none -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:scroll-px-6 sm:px-6 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 md:pb-0 xl:grid-cols-4">
            {stats.recentGroups.map((group, index) => {
              const style = GROUP_STYLES[group.color];
              const progress = group.totalPages ? Math.min(100, (group.scanCount / group.totalPages) * 100) : null;
              const featured = index === 0;
              return (
                <Link
                  key={group.id}
                  to={`/archivo/carpeta/${group.id}`}
                  className={clsx(
                    'group flex min-h-40 w-[78%] max-w-72 shrink-0 snap-start flex-col justify-between rounded-2xl p-4 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_18px_rgba(41,36,68,0.10)] active:translate-y-0 md:min-h-44 md:w-auto md:max-w-none',
                    featured ? 'bg-brand text-white' : style.soft,
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className={clsx('flex size-10 items-center justify-center rounded-xl', featured ? 'bg-accent text-on-accent' : 'bg-white/75 text-eel')}>
                      <FolderOpen className="size-5" />
                    </span>
                    <ArrowRight className={clsx('size-4 transition-transform group-hover:translate-x-0.5', featured ? 'text-white/55' : 'text-wolf')} />
                  </div>
                  <div className="mt-5 min-w-0">
                    <h3 className="truncate font-bold">{group.title}</h3>
                    <p className={clsx('mt-1 truncate text-sm', featured ? 'text-white/65' : 'text-wolf')}>
                      {group.author ? `Responsable: ${group.author}` : group.category || 'Sin detalles'}
                    </p>
                    <div className="mt-4 flex items-center justify-between gap-2 text-xs font-semibold">
                      <span>
                        {group.scanCount} {group.scanCount === 1 ? 'hoja' : 'hojas'}
                      </span>
                      <span className={featured ? 'text-white/60' : 'text-wolf'}>{timeAgo(group.updatedAt)}</span>
                    </div>
                    {progress !== null && (
                      <div className={clsx('mt-2 h-1.5 overflow-hidden rounded-full', featured ? 'bg-white/15' : 'bg-white/70')}>
                        <div className="h-full origin-left rounded-full bg-feather" style={{ transform: `scaleX(${progress / 100})` }} />
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-start gap-4 rounded-[24px] bg-white p-5 shadow-surface sm:flex-row sm:items-center sm:p-6">
            <span className="flex size-12 items-center justify-center rounded-xl bg-feather-light text-feather-dark">
              <FolderOpen className="size-6" />
            </span>
            <div className="flex-1">
              <h3 className="font-bold">Todavía no hay carpetas</h3>
              <p className="mt-1 text-sm text-wolf">Crea una carpeta para mantener juntas las hojas de un mismo documento o trámite.</p>
            </div>
            <Link to="/escanear" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-brand px-4 text-sm font-bold text-white transition-[transform,background-color] duration-200 hover:bg-brand-hover active:scale-[0.98]">
              <Camera className="size-4" /> Escanear documentos
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}

function SectionTitle({ id, title, subtitle, action }: { id: string; title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 id={id} className="text-lg font-bold sm:text-xl">
          {title}
        </h2>
        <p className="mt-0.5 text-sm text-wolf">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function HeroStat({ to, value, label, alert }: { to: string; value: number; label: string; alert?: boolean }) {
  return (
    <Link to={to} className="relative min-w-0 rounded-2xl bg-white/10 p-3 transition-colors duration-200 hover:bg-white/15" title={`${formatNumber(value)} ${label}`}>
      {alert && <span aria-hidden="true" className="absolute right-3 top-3 size-2 rounded-full bg-accent ring-2 ring-brand" />}
      <div className="truncate text-2xl font-bold tabular-nums">{formatNumber(value)}</div>
      <div className="truncate text-xs font-semibold text-white/65">{label}</div>
    </Link>
  );
}

function StatusChip({ ok, label, to }: { ok: boolean; label: string; to: string }) {
  return (
    <Link to={to} className="inline-flex min-h-8 items-center gap-2 rounded-full bg-white/10 px-3 text-xs font-semibold text-white/85 transition-colors hover:bg-white/15">
      <span aria-hidden="true" className={clsx('size-2 rounded-full', ok ? 'bg-feather' : 'bg-bee')} />
      {label}
    </Link>
  );
}

/** Timeline of the latest scans across the whole archive, linking straight to each one. */
function RecentActivity({ scans }: { scans: Scan[] }) {
  return (
    <section aria-labelledby="activity-title" className="rounded-[24px] bg-white p-5 shadow-surface sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="activity-title" className="text-lg font-bold sm:text-xl">
            Última actividad
          </h2>
          <p className="mt-0.5 text-sm text-wolf">Lo último que escaneaste, en todo el archivo.</p>
        </div>
        <span className="flex size-10 items-center justify-center rounded-xl bg-macaw-light text-macaw-dark">
          <Clock3 className="size-5" />
        </span>
      </div>

      {scans.length ? (
        <ol className="relative mt-5 space-y-1 before:absolute before:bottom-4 before:left-[19px] before:top-4 before:w-0.5 before:bg-swan">
          {scans.map((scan) => (
            <li key={scan.id}>
              <Link to={`/escaneo/${scan.id}`} className="group relative flex items-center gap-3 rounded-2xl py-2.5 pr-2 transition-colors hover:bg-polar">
                <span
                  aria-hidden="true"
                  className={clsx('relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full ring-4 ring-white', scan.groupId ? 'bg-macaw-light text-macaw-dark' : 'bg-cardinal-light text-cardinal-dark')}
                >
                  {scan.groupId ? <FolderOpen className="size-4" /> : <FileText className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-eel">{scan.title || 'Sin título'}</span>
                  <span className="block truncate text-sm text-wolf">
                    {scan.groupTitle ? scan.groupTitle : 'Suelto'} · {ENGINE_LABEL[scan.engine]} · {formatNumber(scan.wordCount)} palabras
                  </span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-hare">{timeAgo(scan.createdAt)}</span>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <div className="mt-5 rounded-2xl bg-polar p-5 text-center">
          <p className="font-bold text-eel">Sin actividad todavía</p>
          <p className="mt-1 text-sm text-wolf">Cuando escanees, aquí verás tus últimas hojas.</p>
        </div>
      )}
    </section>
  );
}

/** Loose scans (no folder): how much is left to organize, with direct access to each one. */
function UnorganizedCard({ total, count, scans }: { total: number; count: number; scans: Scan[] }) {
  const organized = total ? Math.round(((total - count) / total) * 100) : 100;
  return (
    <section aria-labelledby="unorganized-title" className="rounded-[24px] bg-white p-5 shadow-surface sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="unorganized-title" className="text-lg font-bold sm:text-xl">
            Sin organizar
          </h2>
          <p className="mt-0.5 text-sm text-wolf">Hojas que no están en ninguna carpeta.</p>
        </div>
        <span className={clsx('flex size-10 items-center justify-center rounded-xl', count ? 'bg-cardinal-light text-cardinal-dark' : 'bg-feather-light text-feather-dark')}>
          {count ? <FileText className="size-5" /> : <CheckCircle2 className="size-5" />}
        </span>
      </div>

      <div className="mt-5 flex items-end justify-between gap-3">
        <div>
          <div className="text-4xl font-bold tabular-nums text-eel">{formatNumber(count)}</div>
          <div className="text-sm font-semibold text-wolf">{count === 1 ? 'hoja suelta' : 'hojas sueltas'}</div>
        </div>
        <div className="text-right text-sm font-semibold text-wolf">
          <span className="font-bold text-eel">{organized}%</span> organizado
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-swan" role="progressbar" aria-label="Archivo organizado" aria-valuenow={organized} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full origin-left rounded-full bg-feather" style={{ transform: `scaleX(${organized / 100})` }} />
      </div>

      {count ? (
        <>
          <ul className="mt-4 divide-y divide-swan">
            {scans.map((scan) => (
              <li key={scan.id}>
                <Link to={`/escaneo/${scan.id}`} className="group flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-eel">{scan.title || 'Sin título'}</span>
                    <span className="block truncate text-xs text-wolf">{timeAgo(scan.createdAt)}</span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-hare transition-transform group-hover:translate-x-0.5 group-hover:text-eel" />
                </Link>
              </li>
            ))}
          </ul>
          <Link
            to="/archivo?vista=individuales"
            className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-full bg-brand px-4 text-sm font-bold text-white transition-[transform,background-color] duration-200 hover:bg-brand-hover active:scale-[0.98]"
          >
            Organizar ahora <ArrowRight className="size-4" />
          </Link>
        </>
      ) : (
        <p className="mt-4 rounded-2xl bg-feather-light p-4 text-sm font-semibold text-feather-dark">Todo tu archivo está en carpetas.</p>
      )}
    </section>
  );
}
