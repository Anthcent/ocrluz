import clsx from 'clsx';
import {
  ArrowRight,
  Archive,
  Camera,
  CheckCircle2,
  Clock3,
  FilePlus2,
  Files,
  Gauge,
  FolderOpen,
  Search,
  Settings2,
  SlidersHorizontal,
  TextSearch,
  WifiOff,
} from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { Button, EmptyState, PageLoader } from '../components/ui';
import { api } from '../lib/api';
import { GROUP_STYLES } from '../lib/constants';
import { formatNumber, timeAgo } from '../lib/format';
import type { Engine, Stats } from '../lib/types';
import { useScanSession } from '../scan/ScanSession';
import { useSettings } from '../settings/SettingsContext';

const ENGINE_LABEL: Record<Engine, string> = { ocrspace: 'OCR.space', gemini: 'Gemini', tesseract: 'Tesseract local' };

export function HomePage() {
  const { user } = useAuth();
  const { settings, loaded } = useSettings();
  const { pages } = useScanSession();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');

  const load = () => {
    setFailed(false);
    api
      .stats()
      .then(setStats)
      .catch(() => setFailed(true));
  };
  useEffect(load, []);

  const search = (event: FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (value) navigate(`/buscar?q=${encodeURIComponent(value)}`);
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
  const averageWords = stats.totals.scans ? Math.round(stats.totals.words / stats.totals.scans) : 0;
  const groupedScans = Math.max(0, stats.totals.scans - stats.totals.individual);
  const organizedPercent = stats.totals.scans ? Math.round((groupedScans / stats.totals.scans) * 100) : 0;
  const individualPercent = stats.totals.scans ? 100 - organizedPercent : 0;
  const firstName = user?.name.split(' ')[0] ?? '';

  return (
    <div className="space-y-5 lg:space-y-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(19rem,0.65fr)]">
        <section className="overflow-hidden rounded-[24px] bg-macaw p-5 text-eel sm:p-7 lg:p-8">
          <div className="grid h-full gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)] lg:items-end">
            <div>
              <div className="mb-5 flex items-center gap-2 text-sm font-semibold text-macaw-dark">
                <span className="size-2 rounded-full bg-eel" />
                Centro de trabajo
              </div>
              <h1 className="max-w-xl text-3xl font-bold leading-[1.08] tracking-[-0.03em] sm:text-4xl">¡Hola, {firstName}!</h1>
              <p className="mt-3 max-w-lg text-base font-medium text-[#352d5f]">
                {weekTotal > 0
                  ? `${weekTotal} ${weekTotal === 1 ? 'hoja escaneada' : 'hojas escaneadas'} esta semana. Tu archivo ya tiene ${formatNumber(stats.totals.words)} palabras.`
                  : 'Tu espacio está listo para capturar, organizar y encontrar información.'}
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Link to="/escanear" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-eel px-5 text-sm font-bold text-white transition-[transform,background-color] duration-200 hover:bg-[#303138] active:scale-[0.98]">
                  <Camera className="size-5" /> Capturar páginas
                </Link>
                <Link to="/documentos/nuevo" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-eel transition-[transform,background-color] duration-200 hover:bg-polar active:scale-[0.98]">
                  <FilePlus2 className="size-5" /> Nuevo documento
                </Link>
              </div>
            </div>

            <form onSubmit={search} className="rounded-2xl bg-white p-3 shadow-[0_8px_18px_rgba(48,37,105,0.10)]">
              <label htmlFor="dashboard-search" className="mb-2 block px-1 text-sm font-bold text-eel">Buscar en todo tu archivo</label>
              <div className="flex items-center gap-2 rounded-xl bg-polar p-1.5 pl-3">
                <Search className="size-5 shrink-0 text-wolf" />
                <input
                  id="dashboard-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Título, nombre, cédula o frase"
                  className="min-w-0 flex-1 bg-transparent py-2 text-sm font-medium text-eel outline-none placeholder:text-wolf"
                />
                <button type="submit" aria-label="Buscar en el archivo" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-eel text-white transition active:scale-95">
                  <ArrowRight className="size-5" />
                </button>
              </div>
              <p className="mt-2 px-1 text-xs text-wolf">Busca dentro del texto reconocido, no solo por título.</p>
            </form>
          </div>
        </section>

        <aside className="rounded-[24px] bg-eel p-5 text-white sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Estado del espacio</h2>
              <p className="mt-1 text-sm text-white/65">Todo lo necesario para continuar.</p>
            </div>
            <Gauge className="size-6 text-macaw" />
          </div>
          <div className="mt-6 divide-y divide-white/10">
            <StatusRow
              icon={pages.length ? <Clock3 /> : <CheckCircle2 />}
              label="Cola de escaneo"
              value={pages.length ? `${pages.length} ${pages.length === 1 ? 'página pendiente' : 'páginas pendientes'}` : 'Sin pendientes'}
              tone={pages.length ? 'amber' : 'mint'}
            />
            <StatusRow icon={<SlidersHorizontal />} label="Motor predeterminado" value={ENGINE_LABEL[settings.defaultEngine]} tone="violet" />
            <StatusRow
              icon={noKeys ? <Settings2 /> : <CheckCircle2 />}
              label="OCR remoto"
              value={noKeys ? 'Requiere configuración' : 'Disponible'}
              tone={noKeys ? 'amber' : 'mint'}
            />
          </div>
          <Link to={pages.length ? '/escanear' : '/ajustes'} className="mt-5 flex items-center justify-between rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold transition hover:bg-white/15">
            {pages.length ? 'Continuar escaneo' : 'Revisar configuración'}
            <ArrowRight className="size-4" />
          </Link>
        </aside>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
        <section className="rounded-[24px] bg-white p-5 sm:p-6">
          <div>
            <h2 className="text-xl font-bold">Panorama del archivo</h2>
            <p className="mt-1 text-sm text-wolf">Tamaño y nivel de organización.</p>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-[minmax(10rem,0.72fr)_minmax(0,1.28fr)]">
            <div className="flex min-h-40 flex-col justify-between rounded-2xl bg-macaw-light p-4">
              <span className="flex size-10 items-center justify-center rounded-xl bg-white text-macaw-dark">
                <FolderOpen className="size-5" />
              </span>
              <div className="mt-6">
                <div className="text-3xl font-bold tabular-nums text-eel">{formatNumber(stats.totals.groups)}</div>
                <div className="mt-1 text-sm font-semibold text-[#493d77]">{stats.totals.groups === 1 ? 'carpeta en tu archivo' : 'carpetas en tu archivo'}</div>
              </div>
            </div>
            <div className="flex flex-col justify-center gap-5 rounded-2xl bg-polar p-4">
              <DistributionRow label="Hojas en carpetas" value={groupedScans} percent={organizedPercent} tone="mint" />
              <DistributionRow label="Documentos sueltos" value={stats.totals.individual} percent={individualPercent} tone="amber" />
              {!stats.totals.scans && (
                <p className="text-sm text-wolf">Cuando guardes páginas, aquí verás cómo está distribuido tu archivo.</p>
              )}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 divide-x divide-swan rounded-2xl bg-polar px-2 py-4">
            <Metric value={formatNumber(stats.totals.scans)} label="Hojas" />
            <Metric value={formatNumber(stats.totals.words)} label="Palabras" />
            <Metric value={formatNumber(averageWords)} label="Palabras por hoja" />
          </div>
        </section>

        <section className="rounded-[24px] bg-white p-5 sm:p-6">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">Acciones rápidas</h2>
              <p className="mt-1 text-sm text-wolf">Atajos para tareas frecuentes.</p>
            </div>
            <TextSearch className="size-6 text-macaw-dark" />
          </div>
          <div className="divide-y divide-swan">
            <QuickAction to="/buscar" icon={<Search />} title="Buscar contenido" detail="Texto, nombres y categorías" tone="violet" />
            <QuickAction to="/archivo" icon={<Archive />} title="Abrir archivo" detail={`${stats.totals.groups} carpetas y ${stats.totals.individual} sueltos`} tone="mint" />
            <QuickAction to="/documentos" icon={<Files />} title="Revisar documentos" detail="Formularios y exportaciones" tone="amber" />
            <QuickAction to="/ajustes" icon={<Settings2 />} title="Configurar OCR" detail={`${ENGINE_LABEL[settings.defaultEngine]} como predeterminado`} tone="gray" />
          </div>
        </section>
      </div>

      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">Carpetas recientes</h2>
            <p className="mt-1 text-sm text-wolf">Continúa desde la última carpeta actualizada.</p>
          </div>
          <Link to="/archivo" className="inline-flex min-h-10 items-center gap-1 text-sm font-bold text-eel hover:text-macaw-dark">
            Ver archivo <ArrowRight className="size-4" />
          </Link>
        </div>

        {stats.recentGroups.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {stats.recentGroups.map((group, index) => {
              const style = GROUP_STYLES[group.color];
              const progress = group.totalPages ? Math.min(100, (group.scanCount / group.totalPages) * 100) : null;
              return (
                <Link
                  key={group.id}
                  to={`/archivo/carpeta/${group.id}`}
                  className={clsx(
                    'group flex min-h-44 flex-col justify-between rounded-2xl p-4 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_18px_rgba(41,36,68,0.10)] active:translate-y-0',
                    index === 0 ? 'bg-eel text-white' : style.soft,
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className={clsx('flex size-10 items-center justify-center rounded-xl', index === 0 ? 'bg-white/10 text-macaw' : 'bg-white/75 text-eel')}>
                      <FolderOpen className="size-5" />
                    </span>
                    <ArrowRight className={clsx('size-4 transition-transform group-hover:translate-x-0.5', index === 0 ? 'text-white/55' : 'text-wolf')} />
                  </div>
                  <div className="mt-5 min-w-0">
                    <h3 className="truncate font-bold">{group.title}</h3>
                    <p className={clsx('mt-1 truncate text-sm', index === 0 ? 'text-white/55' : 'text-wolf')}>
                      {group.author ? `Responsable: ${group.author}` : group.category || 'Sin detalles'}
                    </p>
                    <div className="mt-4 flex items-center justify-between gap-2 text-xs font-semibold">
                      <span>{group.scanCount} {group.scanCount === 1 ? 'hoja' : 'hojas'}</span>
                      <span className={index === 0 ? 'text-white/45' : 'text-wolf'}>{timeAgo(group.updatedAt)}</span>
                    </div>
                    {progress !== null && (
                      <div className={clsx('mt-2 h-1.5 overflow-hidden rounded-full', index === 0 ? 'bg-white/15' : 'bg-white/70')}>
                        <div className="h-full origin-left rounded-full bg-feather" style={{ transform: `scaleX(${progress / 100})` }} />
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-start gap-4 rounded-[24px] bg-white p-6 sm:flex-row sm:items-center">
            <span className="flex size-12 items-center justify-center rounded-xl bg-feather-light text-feather-dark"><FolderOpen className="size-6" /></span>
            <div className="flex-1">
              <h3 className="font-bold">Tu archivo está vacío</h3>
              <p className="mt-1 text-sm text-wolf">Crea tu primera carpeta para mantener juntas las hojas de un mismo documento o trámite.</p>
            </div>
            <Link to="/escanear" className="inline-flex min-h-10 items-center gap-2 rounded-full bg-eel px-4 text-sm font-bold text-white"><Camera className="size-4" /> Escanear documentos</Link>
          </div>
        )}
      </section>
    </div>
  );
}

function StatusRow({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: 'mint' | 'violet' | 'amber' }) {
  const tones = {
    mint: 'bg-feather text-feather-dark',
    violet: 'bg-macaw text-eel',
    amber: 'bg-bee text-bee-dark',
  };
  return (
    <div className="flex items-center gap-3 py-4 first:pt-0">
      <span className={clsx('flex size-9 shrink-0 items-center justify-center rounded-xl [&>svg]:size-4', tones[tone])}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-white/60">{label}</div>
        <div className="truncate text-sm font-semibold text-white">{value}</div>
      </div>
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0 px-2 text-center">
      <div className="truncate text-lg font-bold tabular-nums text-eel sm:text-2xl">{value}</div>
      <div className="mt-0.5 text-xs font-semibold leading-tight text-wolf text-balance">{label}</div>
    </div>
  );
}

function DistributionRow({ label, value, percent, tone }: { label: string; value: number; percent: number; tone: 'mint' | 'amber' }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-eel">{label}</span>
        <span className="shrink-0 font-bold tabular-nums text-eel">{formatNumber(value)} <span className="font-medium text-wolf">({percent}%)</span></span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-swan">
        <div
          className={clsx('h-full origin-left rounded-full', tone === 'mint' ? 'bg-feather' : 'bg-bee')}
          style={{ transform: `scaleX(${percent / 100})` }}
        />
      </div>
    </div>
  );
}

function QuickAction({ to, icon, title, detail, tone }: { to: string; icon: ReactNode; title: string; detail: string; tone: 'violet' | 'mint' | 'amber' | 'gray' }) {
  const tones = {
    violet: 'bg-macaw-light text-macaw-dark',
    mint: 'bg-feather-light text-feather-dark',
    amber: 'bg-bee-light text-bee-dark',
    gray: 'bg-polar text-eel',
  };
  return (
    <Link to={to} className="group flex items-center gap-3 py-3.5">
      <span className={clsx('flex size-10 shrink-0 items-center justify-center rounded-xl [&>svg]:size-5', tones[tone])}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-eel">{title}</span>
        <span className="block truncate text-sm text-wolf">{detail}</span>
      </span>
      <ArrowRight className="size-4 text-hare transition-transform group-hover:translate-x-0.5 group-hover:text-eel" />
    </Link>
  );
}
