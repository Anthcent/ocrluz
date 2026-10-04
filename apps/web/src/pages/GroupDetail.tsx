import clsx from 'clsx';
import { ArrowLeft, BookOpen, BookOpenText, BrainCircuit, ChevronLeft, ChevronRight, Clock, Copy, Download, FileText, LayoutGrid, Pencil, Plus, Trash2, Type } from 'lucide-react';
import { useEffect, useState } from 'react';
import type React from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { BookViewer } from '../components/BookViewer';
import { AnalysisPanel } from '../components/AnalysisPanel';
import { errorMessage, useFeedback } from '../components/feedback';
import { Reader } from '../components/Reader';
import { Button, EmptyState, PageLoader, Segmented } from '../components/ui';
import { api } from '../lib/api';
import { categoryEmoji, GROUP_STYLES } from '../lib/constants';
import { copyText, downloadText, formatDate, formatNumber } from '../lib/format';
import type { Group, Scan } from '../lib/types';
import { GroupFormModal } from './Catalog';

type Tab = 'paginas' | 'leer' | 'analisis';

export function GroupDetailPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const [group, setGroup] = useState<Group | null>(null);
  const [scans, setScans] = useState<Scan[]>([]);
  const [tab, setTab] = useState<Tab>('paginas');
  const [editing, setEditing] = useState(false);
  const [notFound, setNotFound] = useState(false);
  // «?libro=1» abre directamente el modo libro (desde el catálogo).
  const [params, setParams] = useSearchParams();
  const bookOpen = params.get('libro') === '1';
  const setBookOpen = (open: boolean) => setParams(open ? { libro: '1' } : {}, { replace: true });

  useEffect(() => {
    api.groups
      .get(id)
      .then((r) => {
        setGroup(r.group);
        setScans(r.scans);
      })
      .catch(() => setNotFound(true));
  }, [id]);

  if (notFound) {
    return (
      <EmptyState icon={<BookOpen className="size-10" />} title="Grupo no encontrado" action={<Link to="/catalogo"><Button>Volver al catálogo</Button></Link>} />
    );
  }
  if (!group) return <PageLoader />;

  const style = GROUP_STYLES[group.color];
  const fullText = scans.map((s) => s.text).join('\n\n');
  const words = scans.reduce((sum, s) => sum + s.wordCount, 0);
  const minutes = Math.max(1, Math.round(words / 200));
  const addPages = () => navigate(`/escanear?grupo=${group.id}`);

  const move = async (index: number, delta: number) => {
    const next = [...scans];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    setScans(next);
    try {
      await api.groups.reorder(group.id, next.map((s) => s.id));
    } catch (err) {
      toast(errorMessage(err), 'error');
      setScans(scans);
    }
  };

  const removeScan = async (scan: Scan) => {
    const ok = await confirm({ title: '¿Borrar esta página?', message: `Se borrará «${scan.title}» y su texto.`, confirmLabel: 'Borrar', danger: true });
    if (!ok) return;
    try {
      await api.scans.remove(scan.id);
      setScans((s) => s.filter((x) => x.id !== scan.id));
      toast('Página borrada');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const removeGroup = async () => {
    const ok = await confirm({
      title: '¿Borrar el grupo?',
      message: `Se borrarán «${group.title}» y sus ${scans.length} páginas. Esta acción no se puede deshacer.`,
      confirmLabel: 'Borrar todo',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.groups.remove(group.id);
      toast('Grupo borrado');
      navigate('/catalogo', { replace: true });
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const copyAll = async () => {
    try {
      await copyText(fullText);
      toast('Texto copiado');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const openAnalysis = () => {
    setTab('analisis');
    document.getElementById('group-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const exportTxt = () => downloadText(`${group.title}.txt`, fullText);
  const progress = group.totalPages ? Math.min(100, (scans.length / group.totalPages) * 100) : null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Link to="/catalogo" className="inline-flex min-h-10 items-center gap-2 rounded-full px-2 text-sm font-bold text-wolf transition-colors hover:text-eel">
        <ArrowLeft className="size-4" /> Catálogo
      </Link>

      <section className="overflow-hidden rounded-3xl bg-white p-5 shadow-[0_1px_2px_rgba(41,36,68,0.06)] sm:p-8">
        <div className="grid gap-7 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center lg:grid-cols-[190px_minmax(0,1fr)]">
          <div className={clsx('mx-auto flex aspect-[4/5] w-36 flex-col rounded-2xl p-5 sm:mx-0 sm:w-40 lg:w-48', style.soft)} aria-hidden="true">
            <BookOpen className={clsx('size-8', style.text)} />
            <span className="mt-auto line-clamp-4 text-xl font-bold leading-tight text-eel">{group.title}</span>
            {group.author && <span className="mt-2 line-clamp-2 text-sm font-semibold text-wolf">{group.author}</span>}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2">
              {group.category && (
                <span className={clsx('rounded-full px-3 py-1.5 text-xs font-bold', style.soft, style.text)}>
                  {categoryEmoji(group.category)} {group.category}
                </span>
              )}
              <span className="rounded-full bg-polar px-3 py-1.5 text-xs font-bold text-wolf">Creado el {formatDate(group.createdAt)}</span>
            </div>
            <h1 className="mt-4 text-3xl font-bold leading-[1.1] text-eel sm:text-4xl">{group.title}</h1>
            {group.author && <p className="mt-1 text-lg font-semibold text-wolf">de {group.author}</p>}
            {group.description && <p className="mt-3 max-w-[70ch] text-wolf">{group.description}</p>}

            <div className="mt-6 grid grid-cols-3 divide-x divide-swan sm:max-w-lg">
              <Stat icon={<FileText />} tone="text-macaw bg-macaw-light" value={scans.length} label={scans.length === 1 ? 'página' : 'páginas'} />
              <Stat icon={<Type />} tone="text-bee-dark bg-bee-light" value={formatNumber(words)} label="palabras" />
              <Stat icon={<Clock />} tone="text-feather-dark bg-feather-light" value={minutes} label="min lectura" />
            </div>

            {progress !== null && (
              <div className="mt-5 rounded-2xl bg-feather-light p-4 sm:max-w-lg">
                <div className="mb-2 flex items-center justify-between gap-4 text-sm font-bold">
                  <span>{progress >= 100 ? '🎉 ¡Libro completo!' : 'Avance del libro'}</span>
                  <span className="text-wolf">
                    {scans.length} / {group.totalPages}
                  </span>
                </div>
                <QuietProgress value={progress} />
              </div>
            )}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              {scans.length > 0 && (
                <Button size="lg" icon={<BookOpenText className="size-6" />} onClick={() => setBookOpen(true)}>
                  Abrir en modo libro
                </Button>
              )}
              <Button size="lg" variant="secondary" icon={<Plus className="size-6" />} onClick={addPages}>
                Añadir páginas
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:hidden">
        <QuickAction icon={<Download />} label="Exportar .txt" disabled={!scans.length} onClick={exportTxt} />
        <QuickAction icon={<Copy />} label="Copiar" disabled={!scans.length} onClick={copyAll} tone="violet" />
        <QuickAction icon={<Pencil />} label="Editar grupo" onClick={() => setEditing(true)} />
        <QuickAction icon={<Trash2 />} label="Borrar grupo" onClick={removeGroup} tone="danger" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div className="min-w-0 space-y-4" id="group-tabs">
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: 'paginas', label: 'Páginas', icon: <LayoutGrid className="size-5" /> },
              { value: 'leer', label: 'Leer', icon: <BookOpenText className="size-5" /> },
              { value: 'analisis', label: 'Análisis', icon: <BrainCircuit className="size-5" /> },
            ]}
          />

          {tab === 'paginas' &&
            (scans.length === 0 ? (
              <EmptyState
                icon={<FileText className="size-10" />}
                title="Este grupo está vacío"
                action={
                  <Button icon={<Plus className="size-5" />} onClick={addPages}>
                    Añadir páginas
                  </Button>
                }
              >
                Escanea las hojas de tu libro y aparecerán aquí en orden.
              </EmptyState>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))]">
                {scans.map((s, i) => (
                  <div
                    key={s.id}
                    className="group flex flex-col overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(41,36,68,0.06)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_12px_rgba(41,36,68,0.08)]"
                  >
                    <Link to={`/escaneo/${s.id}`} className="flex flex-1 flex-col p-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-macaw/35">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className={clsx('flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold', style.soft, style.text)}>{i + 1}</span>
                        {s.pageLabel ? (
                          <span className="rounded-full bg-feather-light px-2.5 py-1 text-xs font-bold text-feather-dark">pág. {s.pageLabel}</span>
                        ) : (
                          <span className="text-xs font-semibold text-wolf">{formatNumber(s.wordCount)} pal.</span>
                        )}
                      </div>
                      <div className="truncate text-sm font-bold text-eel group-hover:text-macaw-dark">{s.title}</div>
                      <p className="mt-2 line-clamp-5 rounded-xl bg-polar p-3 font-serif text-xs leading-relaxed text-wolf">{s.text || 'Sin texto'}</p>
                    </Link>
                    <div className="flex items-center justify-between border-t border-swan px-2 py-1.5">
                      <button
                        type="button"
                        aria-label="Mover antes"
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                        className="flex size-10 items-center justify-center rounded-xl text-wolf transition-colors hover:bg-polar hover:text-eel disabled:opacity-30"
                      >
                        <ChevronLeft className="size-5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Borrar página"
                        onClick={() => removeScan(s)}
                        className="flex size-10 items-center justify-center rounded-xl text-hare transition-colors hover:bg-cardinal-light hover:text-cardinal-dark"
                      >
                        <Trash2 className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Mover después"
                        disabled={i === scans.length - 1}
                        onClick={() => move(i, 1)}
                        className="flex size-10 items-center justify-center rounded-xl text-wolf transition-colors hover:bg-polar hover:text-eel disabled:opacity-30"
                      >
                        <ChevronRight className="size-5" />
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addPages}
                  className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-hare bg-white/45 text-wolf transition-colors hover:border-macaw hover:bg-macaw-light hover:text-macaw-dark"
                >
                  <span className="flex size-11 items-center justify-center rounded-full bg-eel text-white">
                    <Plus className="size-7" />
                  </span>
                  <span className="text-sm font-bold">Añadir páginas</span>
                </button>
              </div>
            ))}

          {tab === 'leer' && <Reader pages={scans} />}

          {tab === 'analisis' && <AnalysisPanel targetType="group" targetId={group.id} text={fullText} />}
        </div>

        {/* Columna lateral (escritorio): opciones y detalles */}
        <aside className="hidden space-y-4 lg:sticky lg:top-24 lg:block">
          <div className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(41,36,68,0.06)]">
            <div className="border-b border-swan px-4 py-3 text-sm font-bold text-wolf">Opciones</div>
            <OptionRow icon={<Download />} tone="bg-macaw-light text-macaw-dark" label="Exportar .txt" name="Exportar .txt" disabled={!scans.length} onClick={exportTxt} />
            <OptionRow icon={<Copy />} tone="bg-beetle-light text-beetle-dark" label="Copiar todo el texto" name="Copiar" disabled={!scans.length} onClick={copyAll} />
            <OptionRow icon={<BrainCircuit />} tone="bg-bee-light text-bee-dark" label="Analizar el libro" name="Analizar" disabled={!scans.length} onClick={openAnalysis} />
            <OptionRow icon={<Pencil />} tone="bg-fox-light text-fox-dark" label="Editar datos del libro" name="Editar grupo" onClick={() => setEditing(true)} />
            <OptionRow icon={<Trash2 />} tone="bg-cardinal-light text-cardinal-dark" label="Borrar grupo" name="Borrar grupo" danger onClick={removeGroup} />
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(41,36,68,0.06)]">
            <div className="mb-3 text-sm font-bold text-wolf">Detalles</div>
            <dl className="space-y-2.5 text-sm">
              <Detail label="Autor" value={group.author || '—'} />
              <Detail label="Categoría" value={group.category ? `${categoryEmoji(group.category)} ${group.category}` : '—'} />
              <Detail label="Páginas del libro" value={group.totalPages ? String(group.totalPages) : '—'} />
              <Detail label="Hojas escaneadas" value={String(scans.length)} />
              <Detail label="Palabras" value={formatNumber(words)} />
              <Detail label="Actualizado" value={formatDate(group.updatedAt)} />
            </dl>
          </div>
        </aside>
      </div>

      {bookOpen && scans.length > 0 && <BookViewer group={group} pages={scans} onClose={() => setBookOpen(false)} />}

      <GroupFormModal open={editing} onClose={() => setEditing(false)} group={group} onSaved={setGroup} />
    </div>
  );
}

function Stat({ icon, tone, value, label }: { icon: React.ReactNode; tone: string; value: React.ReactNode; label: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 px-2 py-1 text-center">
      <span className={clsx('flex size-8 items-center justify-center rounded-lg [&>svg]:size-4', tone)}>{icon}</span>
      <span className="mt-1 truncate text-lg font-bold leading-none tabular-nums">{value}</span>
      <span className="text-xs font-semibold text-wolf">{label}</span>
    </div>
  );
}

function OptionRow({
  icon,
  tone,
  label,
  name,
  onClick,
  disabled,
  danger,
}: {
  icon: React.ReactNode;
  tone: string;
  label: string;
  /** Nombre accesible corto (igual que en las fichas de móvil). */
  name?: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={name ?? label}
      className={clsx(
        'flex min-h-12 w-full items-center gap-3 border-b border-swan px-4 py-3 text-left text-sm font-bold transition-colors last:border-b-0 hover:bg-polar disabled:opacity-40',
        danger && 'text-cardinal-dark',
      )}
    >
      <span className={clsx('flex size-9 shrink-0 items-center justify-center rounded-xl [&>svg]:size-5', tone)}>{icon}</span>
      <span className="flex-1">{label}</span>
      <ChevronRight className="size-5 text-hare" />
    </button>
  );
}

function QuickAction({ icon, label, onClick, disabled, tone = 'neutral' }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; tone?: 'neutral' | 'violet' | 'danger' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={clsx(
        'flex min-h-12 items-center justify-center gap-2 rounded-full px-3 text-sm font-bold transition-[transform,background-color,color] duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40',
        tone === 'neutral' && 'bg-eel text-white hover:bg-[#303138]',
        tone === 'violet' && 'bg-macaw-light text-macaw-dark hover:bg-macaw hover:text-eel',
        tone === 'danger' && 'bg-cardinal-light text-cardinal-dark hover:bg-cardinal hover:text-white',
      )}
    >
      <span className="[&>svg]:size-4">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

function QuietProgress({ value }: { value: number }) {
  const percent = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-white" role="progressbar" aria-label="Avance del libro" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}>
      <div className="h-full rounded-full bg-feather-dark transition-[width] duration-300" style={{ width: `${percent}%` }} />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="font-bold text-hare">{label}</dt>
      <dd className="truncate font-extrabold">{value}</dd>
    </div>
  );
}
