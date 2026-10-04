import clsx from 'clsx';
import { BookOpen, ChevronRight, FileScan, FileText, BarChart3, ScanLine, Type, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, EmptyState, PageLoader } from '../components/ui';
import { api } from '../lib/api';
import { GROUP_STYLES } from '../lib/constants';
import { formatNumber, timeAgo } from '../lib/format';
import type { Stats } from '../lib/types';
import { useScanSession } from '../scan/ScanSession';
import { useSettings } from '../settings/SettingsContext';

const WEEKDAY = new Intl.DateTimeFormat('es', { weekday: 'narrow', timeZone: 'UTC' });

export function HomePage() {
  const { user } = useAuth();
  const { settings, loaded } = useSettings();
  const { pages } = useScanSession();
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);

  const load = () => {
    setFailed(false);
    api
      .stats()
      .then(setStats)
      .catch(() => setFailed(true));
  };
  useEffect(load, []);

  if (failed) {
    return (
      <EmptyState icon={<WifiOff className="size-10" />} title="No se pudo cargar el inicio" action={<Button onClick={load}>Reintentar</Button>}>
        Revisa tu conexión con el servidor.
      </EmptyState>
    );
  }
  if (!stats) return <PageLoader />;

  const noKeys = loaded && !settings.keys.ocrspace.configured && !settings.keys.gemini.configured;
  const maxDay = Math.max(1, ...stats.week.map((d) => d.count));
  const weekTotal = stats.week.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-5 rounded-[24px] bg-white p-5 shadow-[0_1px_2px_rgba(41,36,68,0.06)] sm:flex-row sm:items-end sm:justify-between sm:p-7">
        <div>
          <span className="mb-4 inline-flex rounded-full bg-feather-light px-3 py-1 text-sm font-semibold text-feather-dark">Espacio de lectura</span>
          <h1 className="text-3xl font-bold leading-tight text-eel sm:text-4xl">¡Hola, {user?.name.split(' ')[0]}!</h1>
          <p className="mt-2 font-medium text-wolf">{stats.totals.scans === 0 ? 'Escanea tu primera página para empezar.' : '¿Qué vamos a escanear hoy?'}</p>
        </div>
        <Link to="/escanear" className="inline-flex items-center gap-2 self-start rounded-full bg-eel px-5 py-3 text-sm font-bold text-white transition hover:bg-[#303138] active:scale-[0.98] sm:self-auto">
          <ScanLine className="size-5" /> Empezar a escanear
        </Link>
      </div>

      {pages.length > 0 && (
        <Link to="/escanear">
          <Card interactive className="flex items-center gap-4 bg-macaw-light p-4">
            <ScanLine className="size-8 text-macaw-dark" />
            <div className="flex-1">
              <div className="font-bold text-macaw-dark">Tienes {pages.length} {pages.length === 1 ? 'página' : 'páginas'} sin guardar</div>
              <div className="text-sm text-wolf">Continúa donde lo dejaste.</div>
            </div>
            <ChevronRight className="size-6 text-macaw-dark" />
          </Card>
        </Link>
      )}

      {noKeys && (
        <Card className="flex flex-col gap-3 bg-bee-light p-4 sm:flex-row sm:items-center">
          <p className="flex-1 font-semibold">
            Configura tu API key de OCR.space o Gemini para escanear con la mejor calidad. Mientras tanto puedes usar Tesseract.
          </p>
          <Link to="/ajustes">
            <Button variant="warning" size="sm">
              Ir a ajustes
            </Button>
          </Link>
        </Card>
      )}

      {/* Actividad de la semana: hojas escaneadas por día */}
      <Card className="p-5">
        <div className="flex items-center gap-4">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-macaw-light text-macaw-dark">
            <BarChart3 className="size-8" />
          </div>
          <div>
            <div className="text-2xl font-bold">
              {weekTotal} {weekTotal === 1 ? 'hoja escaneada' : 'hojas escaneadas'}
            </div>
            <div className="text-sm text-wolf">
              {weekTotal > 0 ? 'Tu actividad de los últimos 7 días.' : 'Esta semana aún no has escaneado nada.'}
            </div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-7 gap-2">
          {stats.week.map((d, i) => {
            const today = i === stats.week.length - 1;
            return (
              <div key={d.day} className="flex flex-col items-center gap-1.5">
                <span className="h-4 text-xs font-bold text-feather-dark">{d.count > 0 ? d.count : ''}</span>
                <div className="flex h-20 w-full items-end overflow-hidden rounded-xl bg-polar">
                  <div
                    className={clsx('h-full w-full origin-bottom rounded-xl transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]', d.count > 0 ? 'bg-feather' : 'bg-transparent')}
                    style={{ transform: `scaleY(${d.count / maxDay})` }}
                    title={`${d.count} hojas`}
                  />
                </div>
                <span className={clsx('text-xs font-semibold', today ? 'text-eel' : 'text-hare')}>
                  {today ? 'Hoy' : WEEKDAY.format(new Date(`${d.day}T12:00:00Z`))}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Totales */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={<ScanLine />} tone="text-feather" label="Escaneos" value={stats.totals.scans} />
        <StatTile icon={<BookOpen />} tone="text-macaw" label="Grupos" value={stats.totals.groups} />
        <StatTile icon={<FileText />} tone="text-beetle" label="Individuales" value={stats.totals.individual} />
        <StatTile icon={<Type />} tone="text-fox" label="Palabras" value={stats.totals.words} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link to="/escanear" className="block">
          <Button block size="lg" icon={<ScanLine className="size-6" />}>
            Empezar a escanear
          </Button>
        </Link>
        <Link to="/documentos/nuevo" className="block">
          <Button block size="lg" variant="secondary" icon={<FileScan className="size-6" />}>
            Escanear documento
          </Button>
        </Link>
      </div>

      {stats.recentGroups.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-bold">Tus grupos recientes</h2>
            <Link to="/catalogo" className="text-sm font-bold text-macaw-dark hover:text-eel">
              Ver todo
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {stats.recentGroups.map((g) => (
              <Link key={g.id} to={`/catalogo/grupo/${g.id}`}>
                <Card interactive className="flex items-center gap-4 p-4">
                  <div className={clsx('flex size-12 shrink-0 items-center justify-center rounded-2xl text-white', GROUP_STYLES[g.color].bg)}>
                    <BookOpen className="size-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{g.title}</div>
                    <div className="text-sm text-wolf">
                      {g.scanCount} {g.scanCount === 1 ? 'página' : 'páginas'} · {timeAgo(g.updatedAt)}
                    </div>
                  </div>
                  <ChevronRight className="size-5 text-hare" />
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const TILE_TONES: Record<string, string> = {
  'text-feather': 'bg-feather-light',
  'text-macaw': 'bg-macaw-light',
  'text-beetle': 'bg-white',
  'text-fox': 'bg-bee-light',
};

function StatTile({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return (
    <div className={clsx('rounded-2xl p-4 shadow-[0_1px_2px_rgba(41,36,68,0.06)]', TILE_TONES[tone])}>
      <div className={clsx('mb-3 flex size-10 items-center justify-center rounded-xl bg-white/75 [&>svg]:size-6', tone)}>{icon}</div>
      <div className="text-2xl font-bold tabular-nums">{formatNumber(value)}</div>
      <div className="text-sm font-semibold text-wolf">{label}</div>
    </div>
  );
}
