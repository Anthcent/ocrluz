import clsx from 'clsx';
import {
  Archive,
  ArrowRight,
  Camera,
  CheckCircle2,
  Cpu,
  FilePlus2,
  Files,
  FileText,
  FolderOpen,
  Layers,
  Search,
  Settings2,
  Type,
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
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

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
  { id: 'scan', to: '/escanear', label: 'Escanear hojas', icon: Camera, tone: 'violet' },
  { id: 'new-doc', to: '/documentos/nuevo', label: 'Nuevo documento', icon: FilePlus2, tone: 'mint' },
  { id: 'search', to: '/buscar', label: 'Buscar en el archivo', icon: Search, tone: 'amber' },
  { id: 'archive', to: '/archivo', label: 'Abrir archivo', icon: Archive, tone: 'violet' },
  { id: 'loose', to: '/archivo?vista=individuales', label: 'Hojas sueltas', icon: FileText, tone: 'red' },
  { id: 'documents', to: '/documentos', label: 'Documentos', icon: Files, tone: 'mint' },
  { id: 'settings', to: '/ajustes', label: 'Ajustes', icon: Settings2, tone: 'gray' },
];

const QUICK_SEARCHES = ['Cédula', 'Acta', 'Partida de nacimiento', 'Informe médico', 'Nómina', 'Inscripción'];

const USAGE_KEY = 'ocryon:shortcut-usage';

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
    .slice(0, 5);

  const summary = weekTotal
    ? `Esta semana escaneaste ${weekTotal} ${weekTotal === 1 ? 'hoja' : 'hojas'} y tu archivo ya suma ${formatNumber(stats.totals.words)} palabras buscables.`
    : stats.totals.scans
      ? 'Esta semana todavía no escaneaste nada. Tu archivo te espera.'
      : 'Tu espacio está listo: escanea tu primera hoja para empezar.';

  const nextStep: { icon: LucideIcon; text: string; action: string; to: string } = pages.length
    ? { icon: Layers, text: `Tienes ${pages.length} ${pages.length === 1 ? 'hoja' : 'hojas'} en el lote sin archivar.`, action: 'Continuar', to: '/escanear' }
    : !stats.totals.scans
      ? { icon: Camera, text: 'Escanea tu primera hoja: con la cámara o subiendo una foto.', action: 'Empezar', to: '/escanear' }
      : stats.totals.individual
        ? {
            icon: FolderOpen,
            text: `${stats.totals.individual} ${stats.totals.individual === 1 ? 'hoja suelta espera' : 'hojas sueltas esperan'} una carpeta.`,
            action: 'Organizar',
            to: '/archivo?vista=individuales',
          }
        : noKeys
          ? { icon: Settings2, text: 'Configura OCR.space o Gemini para leer con más precisión.', action: 'Configurar', to: '/ajustes' }
          : { icon: CheckCircle2, text: 'Todo al día. Encuentra cualquier dato con el buscador.', action: 'Buscar', to: '/buscar' };
  const NextIcon = nextStep.icon;

  return (
    <div className="space-y-5 lg:space-y-6">
      <div>
        <header className="animate-header-in relative overflow-hidden rounded-2xl bg-brand text-white">
          <div className="grid gap-6 px-5 pb-14 pt-6 sm:px-8 sm:pb-16 sm:pt-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-10 lg:px-10">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-white/70">
                <span aria-hidden="true" className="h-0.5 w-6 rounded-full bg-accent" />
                {capitalize(TODAY_LABEL.format(new Date()))}
              </p>
              <h1 className="mt-2 truncate text-[1.875rem] font-bold leading-tight tracking-[-0.03em] sm:text-[2.5rem]">Hola, {firstName}</h1>
              <p className="mt-2 max-w-xl text-[0.9375rem] text-white/75 sm:text-base">{summary}</p>

              <div className="mt-5 flex max-w-xl items-center gap-3 rounded-xl bg-white/10 p-2 pl-3 ring-1 ring-white/15">
                <NextIcon className="size-5 shrink-0 text-white/80" />
                <p className="min-w-0 flex-1 text-sm font-semibold">{nextStep.text}</p>
                <Link to={nextStep.to} className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg bg-white px-3 text-sm font-bold text-brand transition-colors hover:bg-polar">
                  {nextStep.action} <ArrowRight className="size-4" />
                </Link>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:flex">
                <Link
                  to="/escanear"
                  onClick={() => recordUsage('scan')}
                  className="inline-flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-on-accent transition-[transform,background-color] duration-200 hover:bg-accent-hover active:scale-[0.98]"
                >
                  <Camera className="size-5 shrink-0" /> <span className="truncate">Escanear</span>
                </Link>
                <Link
                  to="/documentos/nuevo"
                  onClick={() => recordUsage('new-doc')}
                  className="inline-flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-xl bg-white/10 px-5 text-sm font-bold text-white ring-1 ring-white/25 transition-[transform,background-color] duration-200 hover:bg-white/15 active:scale-[0.98]"
                >
                  <FilePlus2 className="size-5 shrink-0" /> <span className="truncate">Nuevo documento</span>
                </Link>
              </div>
            </div>
            <ScanIllustration className="hidden w-60 lg:block xl:w-72" />
          </div>
          <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 bg-accent" />
        </header>

        <div className="relative z-10 -mt-8 px-3 sm:px-6 lg:px-10">
          <form
            onSubmit={search}
            role="search"
            className="flex items-center gap-3 rounded-2xl bg-white p-2 pl-4 shadow-floating ring-2 ring-macaw/15 transition-shadow focus-within:ring-macaw sm:p-2.5 sm:pl-5"
          >
            <Search className="size-6 shrink-0 text-macaw-dark" />
            <label htmlFor="dashboard-search" className="sr-only">
              Buscar en todo tu archivo
            </label>
            <input
              id="dashboard-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Busca un nombre, una cédula o cualquier frase"
              className="min-h-11 min-w-0 flex-1 bg-transparent text-base font-semibold text-eel outline-none placeholder:font-medium placeholder:text-wolf sm:text-lg"
            />
            <button
              type="submit"
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-bold text-on-accent transition-colors hover:bg-accent-hover sm:min-h-12 sm:px-6"
            >
              <span className="hidden sm:inline">Buscar</span> <ArrowRight className="size-5" />
            </button>
          </form>
          <div className="scrollbar-none -mx-3 mt-3 flex items-center gap-2 overflow-x-auto px-3 sm:mx-0 sm:flex-wrap sm:px-0">
            <span className="shrink-0 text-xs font-semibold text-wolf">Búsquedas rápidas:</span>
            {QUICK_SEARCHES.map((term) => (
              <Link
                key={term}
                to={`/buscar?q=${encodeURIComponent(term)}`}
                className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-eel ring-1 ring-swan transition-colors hover:bg-macaw-light hover:text-macaw-dark hover:ring-macaw/30"
              >
                {term}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-swan shadow-surface ring-1 ring-swan lg:grid-cols-4">
        <Kpi to="/archivo" icon={FolderOpen} tone="violet" value={stats.totals.groups} label={stats.totals.groups === 1 ? 'Carpeta' : 'Carpetas'} />
        <Kpi to="/archivo" icon={Layers} tone="mint" value={stats.totals.scans} label={stats.totals.scans === 1 ? 'Hoja escaneada' : 'Hojas escaneadas'} />
        <Kpi to="/buscar" icon={Type} tone="amber" value={stats.totals.words} label="Palabras buscables" />
        <Kpi
          to="/archivo?vista=individuales"
          icon={FileText}
          tone={stats.totals.individual ? 'red' : 'mint'}
          value={stats.totals.individual}
          label="Sin organizar"
          alert={stats.totals.individual > 0}
        />
      </dl>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="min-w-0 space-y-5 lg:space-y-6">
          <ActivityTable scans={recentScans} onOpen={(scan) => navigate(`/escaneo/${scan.id}`)} />
          <FolderList groups={stats.recentGroups} />
        </div>

        <div className="space-y-5 lg:space-y-6">
          <Panel title={hasUsage ? 'Tus accesos más usados' : 'Accesos rápidos'} subtitle="Se ordenan solos según tu uso.">
            <ul className="-mx-2">
              {shortcuts.map(({ id, to, label, icon: Icon, tone, count }) => (
                <li key={id}>
                  <Link to={to} onClick={() => recordUsage(id)} className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-polar">
                    <span className={clsx('flex size-9 shrink-0 items-center justify-center rounded-lg', TONE_TILE[tone])}>
                      <Icon className="size-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-eel">{label}</span>
                    {count > 0 && <span className="shrink-0 rounded-full bg-polar px-2 py-0.5 text-[11px] font-semibold tabular-nums text-wolf">{count}</span>}
                    <ArrowRight className="size-4 shrink-0 text-hare transition-transform group-hover:translate-x-0.5 group-hover:text-eel" />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          <UnorganizedPanel total={stats.totals.scans} count={stats.totals.individual} scans={looseScans} />

          <Panel title="Estado del sistema" subtitle="Lo necesario para seguir escaneando.">
            <ul className="space-y-1">
              <StatusRow
                ok={!pages.length}
                icon={Layers}
                label="Cola de escaneo"
                value={pages.length ? `${pages.length} ${pages.length === 1 ? 'hoja pendiente' : 'hojas pendientes'}` : 'Sin pendientes'}
                to="/escanear"
              />
              <StatusRow ok icon={Cpu} label="Motor predeterminado" value={ENGINE_LABEL[settings.defaultEngine]} to="/ajustes" />
              <StatusRow ok={!noKeys} icon={Settings2} label="OCR en la nube" value={noKeys ? 'Falta configurar una clave' : 'Disponible'} to="/ajustes" />
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function ScanIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 170" aria-hidden="true" className={className}>
      <rect x="62" y="18" width="118" height="146" rx="10" fill="#fff" fillOpacity="0.08" transform="rotate(-8 121 91)" />
      <rect x="70" y="12" width="118" height="146" rx="10" fill="#fff" fillOpacity="0.14" transform="rotate(5 129 85)" />
      <rect x="64" y="10" width="118" height="148" rx="10" fill="#fff" />
      <rect x="80" y="28" width="52" height="8" rx="4" fill="var(--color-brand)" />
      <rect x="80" y="46" width="86" height="5" rx="2.5" fill="var(--color-swan)" />
      <rect x="80" y="58" width="74" height="5" rx="2.5" fill="var(--color-swan)" />
      <rect x="80" y="70" width="82" height="5" rx="2.5" fill="var(--color-swan)" />
      <rect x="80" y="90" width="40" height="22" rx="4" fill="var(--color-macaw-light)" />
      <rect x="124" y="90" width="42" height="22" rx="4" fill="var(--color-macaw-light)" />
      <rect x="80" y="116" width="40" height="22" rx="4" fill="var(--color-polar)" />
      <rect x="124" y="116" width="42" height="22" rx="4" fill="var(--color-polar)" />
      <g className="motion-safe:animate-scan-sweep">
        <rect x="56" y="38" width="134" height="14" fill="var(--color-accent)" fillOpacity="0.14" />
        <rect x="56" y="44" width="134" height="2.5" rx="1.25" fill="var(--color-accent)" />
      </g>
      <circle cx="184" cy="146" r="17" fill="var(--color-feather)" />
      <path d="m176 146 6 6 10-12" fill="none" stroke="var(--color-feather-dark)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Panel({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-surface ring-1 ring-swan sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-bold text-eel sm:text-lg">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-wolf">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Kpi({ to, icon: Icon, tone, value, label, alert }: { to: string; icon: LucideIcon; tone: Tone; value: number; label: string; alert?: boolean }) {
  return (
    <Link to={to} className="group relative flex min-w-0 items-center gap-3 bg-white p-4 transition-colors hover:bg-snow sm:p-5">
      {alert && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-accent" />}
      <span className={clsx('hidden size-11 shrink-0 items-center justify-center rounded-xl min-[400px]:flex', TONE_TILE[tone])}>
        <Icon className="size-5" />
      </span>
      <div className="flex min-w-0 flex-col">
        <dt className="order-2 truncate text-xs font-semibold text-wolf sm:text-sm">{label}</dt>
        <dd className="order-1 truncate text-2xl font-bold tabular-nums text-eel">{formatNumber(value)}</dd>
      </div>
    </Link>
  );
}

function StatusRow({ ok, icon: Icon, label, value, to }: { ok: boolean; icon: LucideIcon; label: string; value: string; to: string }) {
  return (
    <li>
      <Link to={to} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-polar">
        <Icon className="size-[18px] shrink-0 text-wolf" />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-wolf">{label}</span>
          <span className="block truncate text-sm font-bold text-eel">{value}</span>
        </span>
        <span aria-hidden="true" className={clsx('size-2.5 shrink-0 rounded-full', ok ? 'bg-feather-dark' : 'bg-bee-dark')} />
      </Link>
    </li>
  );
}

function Location({ scan }: { scan: Scan }) {
  return scan.groupTitle ? (
    <span className="inline-flex max-w-full items-center gap-1 truncate rounded-md bg-macaw-light px-2 py-0.5 text-xs font-semibold text-macaw-dark">
      <FolderOpen className="size-3 shrink-0" /> <span className="truncate">{scan.groupTitle}</span>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-md bg-cardinal-light px-2 py-0.5 text-xs font-semibold text-cardinal-dark">
      <FileText className="size-3 shrink-0" /> Suelto
    </span>
  );
}

/** Latest scans across the whole archive: a table on wide screens, a compact list on phones. */
function ActivityTable({ scans, onOpen }: { scans: Scan[]; onOpen: (scan: Scan) => void }) {
  return (
    <Panel
      title="Última actividad"
      subtitle="Lo último que escaneaste, en todo el archivo."
      action={
        <Link to="/archivo" className="inline-flex min-h-9 shrink-0 items-center gap-1 text-sm font-bold text-macaw-dark hover:text-eel">
          Ver todo <ArrowRight className="size-4" />
        </Link>
      }
    >
      {scans.length ? (
        <div className="-mx-4 sm:-mx-5">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="hidden border-y border-swan bg-snow text-xs font-semibold text-wolf md:table-header-group">
              <tr>
                <th className="px-5 py-2.5 font-semibold">Documento</th>
                <th className="w-[30%] px-3 py-2.5 font-semibold">Ubicación</th>
                <th className="w-24 px-3 py-2.5 font-semibold">Motor</th>
                <th className="w-36 px-5 py-2.5 text-right font-semibold">Cuándo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-swan border-t border-swan md:border-t-0">
              {scans.map((scan) => (
                <tr key={scan.id} onClick={() => onOpen(scan)} className="cursor-pointer transition-colors hover:bg-snow">
                  <td className="px-4 py-3 sm:px-5">
                    <Link to={`/escaneo/${scan.id}`} onClick={(e) => e.stopPropagation()} className="block truncate font-bold text-eel hover:text-macaw-dark">
                      {scan.title || 'Sin título'}
                    </Link>
                    <span className="mt-0.5 block truncate text-xs text-wolf">{formatNumber(scan.wordCount)} palabras</span>
                    <span className="mt-1.5 flex items-center justify-between gap-2 md:hidden">
                      <Location scan={scan} />
                      <span className="shrink-0 text-xs text-hare">{timeAgo(scan.createdAt)}</span>
                    </span>
                  </td>
                  <td className="hidden px-3 py-3 md:table-cell">
                    <Location scan={scan} />
                  </td>
                  <td className="hidden truncate px-3 py-3 text-wolf md:table-cell">{ENGINE_LABEL[scan.engine]}</td>
                  <td className="hidden whitespace-nowrap px-5 py-3 text-right text-wolf md:table-cell">{timeAgo(scan.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl bg-polar p-5 text-center">
          <p className="font-bold text-eel">Sin actividad todavía</p>
          <p className="mt-1 text-sm text-wolf">Cuando escanees, aquí verás tus últimas hojas.</p>
        </div>
      )}
    </Panel>
  );
}

function FolderList({ groups }: { groups: Stats['recentGroups'] }) {
  return (
    <Panel
      title="Carpetas recientes"
      subtitle="Continúa donde quedaste."
      action={
        <Link to="/archivo" className="inline-flex min-h-9 shrink-0 items-center gap-1 text-sm font-bold text-macaw-dark hover:text-eel">
          Archivo <ArrowRight className="size-4" />
        </Link>
      }
    >
      {groups.length ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {groups.map((group) => {
            const style = GROUP_STYLES[group.color];
            const progress = group.totalPages ? Math.min(100, Math.round((group.scanCount / group.totalPages) * 100)) : null;
            return (
              <li key={group.id}>
                <Link to={`/archivo/carpeta/${group.id}`} className="group flex h-full items-center gap-3 rounded-xl p-3 ring-1 ring-swan transition-colors hover:bg-snow">
                  <span className={clsx('flex size-10 shrink-0 items-center justify-center rounded-lg', style.soft, style.text)}>
                    <FolderOpen className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-eel">{group.title}</span>
                    <span className="block truncate text-xs text-wolf">
                      {group.scanCount} {group.scanCount === 1 ? 'hoja' : 'hojas'}
                      {group.totalPages ? ` de ${group.totalPages}` : ''} · {timeAgo(group.updatedAt)}
                    </span>
                    {progress !== null && (
                      <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-swan">
                        <span className="block h-full origin-left rounded-full bg-feather-dark" style={{ transform: `scaleX(${progress / 100})` }} />
                      </span>
                    )}
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-hare transition-transform group-hover:translate-x-0.5 group-hover:text-eel" />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex flex-col items-start gap-3 rounded-xl bg-polar p-4 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm text-wolf">Crea una carpeta para mantener juntas las hojas de un mismo trámite.</p>
          <Link to="/escanear" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-bold text-white hover:bg-brand-hover">
            <Camera className="size-4" /> Escanear
          </Link>
        </div>
      )}
    </Panel>
  );
}

/** Loose scans (no folder): how much is left to organize, with direct access to each one. */
function UnorganizedPanel({ total, count, scans }: { total: number; count: number; scans: Scan[] }) {
  const organized = total ? Math.round(((total - count) / total) * 100) : 100;
  return (
    <Panel title="Sin organizar" subtitle="Hojas que no están en ninguna carpeta.">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-3xl font-bold tabular-nums text-eel">{formatNumber(count)}</span>
        <span className="text-sm text-wolf">
          <span className="font-bold text-eel">{organized}%</span> organizado
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-swan" role="progressbar" aria-label="Archivo organizado" aria-valuenow={organized} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full origin-left rounded-full bg-feather-dark" style={{ transform: `scaleX(${organized / 100})` }} />
      </div>
      {count ? (
        <>
          <ul className="mt-3 divide-y divide-swan">
            {scans.map((scan) => (
              <li key={scan.id}>
                <Link to={`/escaneo/${scan.id}`} className="group flex items-center gap-2 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-eel">{scan.title || 'Sin título'}</span>
                  <span className="shrink-0 text-xs text-hare">{timeAgo(scan.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            to="/archivo?vista=individuales"
            className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-bold text-white transition-[transform,background-color] duration-200 hover:bg-brand-hover active:scale-[0.98]"
          >
            Organizar ahora <ArrowRight className="size-4" />
          </Link>
        </>
      ) : (
        <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-feather-dark">
          <CheckCircle2 className="size-4" /> Todo tu archivo está en carpetas.
        </p>
      )}
    </Panel>
  );
}
