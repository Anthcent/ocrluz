import clsx from 'clsx';
import { BrainCircuit, Gauge, History, Sparkles, Trash2, WifiOff } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { formatNumber, timeAgo } from '../lib/format';
import { analyzeOffline, type OfflineAnalysis } from '../lib/offline-analysis';
import type { Analysis, OnlineAnalysisContent } from '../lib/types';
import { useSettings } from '../settings/SettingsContext';
import { errorMessage, useFeedback } from './feedback';
import { Badge, Button, Card, IconButton } from './ui';

interface Props {
  targetType: 'group' | 'scan';
  targetId: number;
  /** Texto completo, necesario para el análisis sin conexión. */
  text: string;
}

export function AnalysisPanel({ targetType, targetId, text }: Props) {
  const { settings } = useSettings();
  const { toast, confirm } = useFeedback();
  const [history, setHistory] = useState<Analysis[]>([]);
  const [selected, setSelected] = useState<Analysis | null>(null);
  const [running, setRunning] = useState<'online' | 'offline' | null>(null);

  useEffect(() => {
    api.analyses
      .list(targetType, targetId)
      .then((r) => {
        setHistory(r.analyses);
        setSelected(r.analyses[0] ?? null);
      })
      .catch(() => {});
  }, [targetType, targetId]);

  const runOffline = async () => {
    setRunning('offline');
    const content = analyzeOffline(text);
    const local: Analysis = { id: -Date.now(), targetType, targetId, mode: 'offline', content, createdAt: new Date().toISOString() };
    try {
      const { analysis } = await api.analyses.saveOffline(targetType, targetId, content);
      setHistory((h) => [analysis, ...h]);
      setSelected(analysis);
    } catch {
      // Sin conexión: se muestra igualmente, aunque no quede guardado.
      setSelected(local);
      toast('Análisis listo (no se guardó porque no hay conexión)', 'info');
    } finally {
      setRunning(null);
    }
  };

  const runOnline = async () => {
    setRunning('online');
    try {
      const { analysis } = await api.analyses.online(targetType, targetId);
      setHistory((h) => [analysis, ...h]);
      setSelected(analysis);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setRunning(null);
    }
  };

  const remove = async (a: Analysis) => {
    if (!(await confirm({ title: '¿Borrar análisis?', message: 'Esta acción no se puede deshacer.', confirmLabel: 'Borrar', danger: true }))) return;
    await api.analyses.remove(a.id).catch(() => {});
    const rest = history.filter((h) => h.id !== a.id);
    setHistory(rest);
    setSelected(rest[0] ?? null);
  };

  const tooShort = text.trim().length < 20;

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-beetle-light text-beetle-dark">
          <BrainCircuit className="size-6" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-eel">Análisis del texto</h2>
          <p className="text-sm leading-relaxed text-wolf">Resumen, datos clave y estadísticas del documento.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Button variant="plain" icon={<Gauge className="size-5" />} loading={running === 'offline'} disabled={tooShort || running !== null} onClick={runOffline}>
          Rápido (sin conexión)
        </Button>
        <Button
          variant="secondary"
          icon={<Sparkles className="size-5" />}
          loading={running === 'online'}
          disabled={tooShort || running !== null || !settings.keys.gemini.configured}
          onClick={runOnline}
          title={!settings.keys.gemini.configured ? 'Configura tu API key de Gemini en Ajustes' : undefined}
        >
          Con IA (Gemini)
        </Button>
      </div>
      {tooShort && <p className="mt-3 text-sm text-wolf">Se necesita más texto para analizar.</p>}

      {history.length > 1 && (
        <div className="mt-5 flex items-center gap-2 overflow-x-auto rounded-xl bg-polar p-1.5">
          <History className="size-4 shrink-0 text-hare" />
          {history.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelected(a)}
              className={clsx(
                'shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-200 motion-reduce:transition-none',
                selected?.id === a.id ? 'bg-white text-macaw-dark shadow-sm' : 'text-wolf hover:text-eel',
              )}
            >
              {a.mode === 'online' ? 'IA' : 'Rápido'} · {timeAgo(a.createdAt)}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="mt-6 border-t border-swan pt-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {selected.mode === 'online' ? <Badge tone="purple">Gemini</Badge> : <Badge tone="gray"><WifiOff className="size-3" /> Sin conexión</Badge>}
              <span className="text-xs font-bold text-hare">{timeAgo(selected.createdAt)}</span>
            </div>
            {selected.id > 0 && (
              <IconButton label="Borrar análisis" onClick={() => remove(selected)} className="hover:text-cardinal">
                <Trash2 className="size-4" />
              </IconButton>
            )}
          </div>
          {selected.mode === 'online' ? (
            <OnlineView a={selected.content as OnlineAnalysisContent} />
          ) : (
            <OfflineView a={selected.content as OfflineAnalysis} />
          )}
        </div>
      )}
    </Card>
  );
}

function Section({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  return (
    <section className={clsx('space-y-2', wide && 'md:col-span-2')}>
      <h3 className="text-sm font-bold text-eel">{title}</h3>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl bg-polar p-3">
      <div className="text-xl font-bold tabular-nums text-eel">{value}</div>
      <div className="mt-0.5 text-xs font-semibold text-wolf">{label}</div>
    </div>
  );
}


function Chips({ items, tone = 'polar' }: { items: { key: string; main: ReactNode; sub?: ReactNode }[]; tone?: 'polar' | 'bee' }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((i) => (
        <span key={i.key} className={clsx('rounded-lg px-3 py-1.5 text-sm font-semibold', tone === 'bee' ? 'bg-bee-light text-bee-dark' : 'bg-polar')}>
          {i.main} {i.sub && <span className="font-semibold text-hare">{i.sub}</span>}
        </span>
      ))}
    </div>
  );
}

function OfflineView({ a }: { a: OfflineAnalysis }) {
  const datos = a.datos;
  const detected: { title: string; items: string[] }[] = datos
    ? [
        { title: 'Fechas', items: datos.fechas },
        { title: 'Cédulas', items: datos.cedulas },
        { title: 'Correos', items: datos.correos },
        { title: 'Teléfonos', items: datos.telefonos },
      ].filter((d) => d.items.length > 0)
    : [];
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:col-span-2">
        <Stat label="Palabras" value={formatNumber(a.palabras)} />
        <Stat label="Oraciones" value={formatNumber(a.oraciones)} />
        <Stat label="Párrafos" value={formatNumber(a.parrafos)} />
        <Stat label="Diversidad léxica" value={`${a.diversidadLexica}%`} />
      </div>
      {detected.length > 0 && (
        <Section title="Datos detectados" wide>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {detected.map((d) => (
              <div key={d.title} className="space-y-1.5">
                <dt className="text-xs font-bold text-wolf">{d.title}</dt>
                <dd>
                  <Chips items={d.items.map((v) => ({ key: v, main: v }))} />
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      )}
      <Section title="Legibilidad">
        <div className="flex items-center gap-3">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-swan/80">
            <div className="h-full rounded-full bg-feather" style={{ width: `${a.legibilidad.puntaje}%` }} />
          </div>
          <span className="text-sm font-semibold tabular-nums">
            {a.legibilidad.nivel} ({a.legibilidad.puntaje})
          </span>
        </div>
        <p className="text-xs text-wolf">Índice Fernández Huerta · {a.promedioPalabrasPorOracion} palabras por oración en promedio.</p>
      </Section>
      {a.palabrasClave?.length > 0 && (
        <Section title="Palabras clave">
          <Chips tone="bee" items={a.palabrasClave.map((k) => ({ key: k.palabra, main: k.palabra, sub: `×${k.veces}` }))} />
        </Section>
      )}
      {a.resumen?.length > 0 && (
        <Section title="Frases principales" wide>
          <ul className="space-y-2">
            {a.resumen.map((s, i) => (
              <li key={i} className="rounded-xl bg-polar p-3 text-sm leading-relaxed text-eel">
                {s}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2 leading-relaxed">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-macaw" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

function OnlineView({ a }: { a: OnlineAnalysisContent }) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {a.truncated && (
        <div className="md:col-span-2">
          <Badge tone="yellow">El texto era muy largo: se analizó la primera parte</Badge>
        </div>
      )}
      {a.tipoDocumento && (
        <Section title="Tipo de documento" wide>
          <Badge tone="blue" className="normal-case">
            {a.tipoDocumento}
          </Badge>
        </Section>
      )}
      {a.resumen && (
        <Section title="Resumen" wide>
          <p className="whitespace-pre-line leading-relaxed">{a.resumen}</p>
        </Section>
      )}
      {!!a.datosClave?.length && (
        <Section title="Datos clave" wide>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {a.datosClave.map((d, i) => (
              <div key={`${d.dato}-${i}`} className="rounded-xl bg-polar p-3">
                <dt className="text-xs font-bold text-wolf">{d.dato}</dt>
                <dd className="font-semibold text-eel">{d.valor}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}
      {!!a.entidades?.length && (
        <Section title="Personas, instituciones y fechas">
          <Chips items={a.entidades.map((e, i) => ({ key: `${e.nombre}-${e.tipo}-${i}`, main: e.nombre, sub: `· ${e.tipo}` }))} />
        </Section>
      )}
      {!!a.observaciones?.length && (
        <Section title="Observaciones">
          <List items={a.observaciones} />
        </Section>
      )}
      {/* Campos de análisis guardados con el formato anterior */}
      {!!a.temas?.length && (
        <Section title="Temas">
          <Chips items={a.temas.map((t) => ({ key: t, main: t }))} />
        </Section>
      )}
      {!!a.ideasClave?.length && (
        <Section title="Puntos clave">
          <List items={a.ideasClave} />
        </Section>
      )}
      {!!a.vocabulario?.length && (
        <Section title="Términos" wide>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {a.vocabulario.map((v) => (
              <div key={v.termino} className="rounded-xl bg-polar p-3">
                <dt className="font-bold text-eel">{v.termino}</dt>
                <dd className="text-sm text-wolf">{v.definicion}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}
      {!!a.preguntas?.length && (
        <Section title="Preguntas">
          <List items={a.preguntas} />
        </Section>
      )}
      {a.tono && (
        <Section title="Tono">
          <p>{a.tono}</p>
        </Section>
      )}
      {a.calidadOcr && (
        <Section title="Calidad del OCR">
          <p className="text-sm text-wolf">{a.calidadOcr}</p>
        </Section>
      )}
    </div>
  );
}
