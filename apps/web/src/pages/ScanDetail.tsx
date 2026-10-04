import clsx from 'clsx';
import { ArrowLeft, BookOpen, BrainCircuit, ChevronLeft, ChevronRight, Copy, Download, FileText, FolderInput, Pencil, Save, Trash2, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AnalysisPanel } from '../components/AnalysisPanel';
import { errorMessage, useFeedback } from '../components/feedback';
import { Button, Card, EmptyState, Input, Modal, PageLoader, Segmented, Textarea } from '../components/ui';
import { api } from '../lib/api';
import { ENGINE_LABEL, GROUP_STYLES, LANGUAGES } from '../lib/constants';
import { copyText, downloadText, formatDate, formatNumber } from '../lib/format';
import type { Group, Scan } from '../lib/types';

type Tab = 'texto' | 'analisis';

export function ScanDetailPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const [scan, setScan] = useState<Scan | null>(null);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<Tab>('texto');
  const [moving, setMoving] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [siblings, setSiblings] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);

  /** Páginas del mismo grupo, para navegar a la anterior / siguiente. */
  const loadSiblings = (groupId: number | null) => {
    if (!groupId) return setSiblings([]);
    api.groups.get(groupId).then((r) => setSiblings(r.scans.map((s) => s.id))).catch(() => setSiblings([]));
  };

  useEffect(() => {
    setScan(null);
    setEditing(false);
    api.scans
      .get(id)
      .then(({ scan }) => {
        setScan(scan);
        setTitle(scan.title);
        setText(scan.text);
        loadSiblings(scan.groupId);
      })
      .catch(() => setNotFound(true));
    api.groups.list().then((r) => setGroups(r.groups)).catch(() => {});
  }, [id]);

  if (notFound) {
    return <EmptyState icon={<FileText className="size-10" />} title="Escaneo no encontrado" action={<Link to="/catalogo"><Button>Volver al catálogo</Button></Link>} />;
  }
  if (!scan) return <PageLoader />;

  const dirty = title !== scan.title || text !== scan.text;
  const index = siblings.indexOf(scan.id);
  const prev = index > 0 ? siblings[index - 1] : null;
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null;
  const group = groups.find((g) => g.id === scan.groupId);
  const language = LANGUAGES.find((l) => l.code === scan.language)?.label ?? scan.language;

  const save = async () => {
    setSaving(true);
    try {
      const { scan: updated } = await api.scans.update(scan.id, { title, text });
      setScan(updated);
      setEditing(false);
      toast('Cambios guardados');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setTitle(scan.title);
    setText(scan.text);
    setEditing(false);
  };

  const moveTo = async (groupId: number | null) => {
    setMoving(false);
    try {
      const { scan: updated } = await api.scans.update(scan.id, { groupId });
      setScan(updated);
      loadSiblings(updated.groupId);
      toast(updated.groupTitle ? `Movido a «${updated.groupTitle}»` : 'Ahora es un escaneo individual');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const remove = async () => {
    if (!(await confirm({ title: '¿Borrar escaneo?', message: 'Se borrará el texto y sus análisis.', confirmLabel: 'Borrar', danger: true }))) return;
    try {
      await api.scans.remove(scan.id);
      toast('Escaneo borrado');
      navigate(scan.groupId ? `/catalogo/grupo/${scan.groupId}` : '/catalogo?vista=individuales', { replace: true });
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const copy = async () => {
    try {
      await copyText(scan.text);
      toast('Texto copiado');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const startEdit = () => {
    setTab('texto');
    setEditing(true);
  };

  const actions = (compact: boolean) => (
    <>
      <PageAction icon={<Pencil />} label="Editar" onClick={startEdit} disabled={editing} compact={compact} />
      <PageAction icon={<Copy />} label="Copiar" onClick={copy} compact={compact} tone="violet" />
      <PageAction icon={<Download />} label="Descargar" shortLabel=".txt" onClick={() => downloadText(`${scan.title || 'escaneo'}.txt`, scan.text)} compact={compact} tone="mint" />
      <PageAction icon={<FolderInput />} label="Mover" onClick={() => setMoving(true)} compact={compact} tone="amber" />
      <PageAction icon={<Trash2 />} label="Borrar" onClick={remove} compact={compact} tone="danger" />
    </>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Navegación: volver y, si es parte de un grupo, avance por sus páginas */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to={scan.groupId ? `/catalogo/grupo/${scan.groupId}` : '/catalogo?vista=individuales'}
          className="inline-flex min-h-10 min-w-0 items-center gap-2 rounded-full px-2 text-sm font-bold text-wolf transition-colors hover:text-eel"
        >
          <ArrowLeft className="size-4 shrink-0" />
          <span className="max-w-48 truncate">{scan.groupTitle ?? 'Individuales'}</span>
        </Link>
        {siblings.length > 1 && (
          <div className="flex min-w-60 flex-1 items-center gap-2">
            <RoundNav label="Página anterior" disabled={!prev} onClick={() => prev && navigate(`/escaneo/${prev}`)}>
              <ChevronLeft className="size-5" />
            </RoundNav>
            <div className="flex-1">
              <PageProgress value={((index + 1) / siblings.length) * 100} label={`${index + 1} / ${siblings.length}`} />
            </div>
            <RoundNav label="Página siguiente" disabled={!next} onClick={() => next && navigate(`/escaneo/${next}`)}>
              <ChevronRight className="size-5" />
            </RoundNav>
          </div>
        )}
      </div>

      <header className="flex items-start gap-4 rounded-3xl bg-white p-5 shadow-[0_1px_2px_rgba(41,36,68,0.06)] sm:p-6">
        <div className={clsx('flex size-12 shrink-0 items-center justify-center rounded-xl sm:size-14', group ? `${GROUP_STYLES[group.color].soft} ${GROUP_STYLES[group.color].text}` : 'bg-beetle-light text-beetle-dark')}>
          {group ? <BookOpen className="size-7" /> : <FileText className="size-7" />}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold leading-tight text-eel sm:text-3xl">{scan.title}</h1>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
            <Chip>{ENGINE_LABEL[scan.engine]}</Chip>
            <Chip>{language}</Chip>
            <Chip>{formatNumber(scan.wordCount)} palabras</Chip>
            <Chip>{formatDate(scan.createdAt)}</Chip>
          </div>
        </div>
      </header>

      {/* Acciones en fila (móvil y tablet) */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:hidden">{actions(true)}</div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
        <div className="space-y-4">
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: 'texto', label: 'Texto', icon: <FileText className="size-5" /> },
              { value: 'analisis', label: 'Análisis', icon: <BrainCircuit className="size-5" /> },
            ]}
          />

          {tab === 'texto' &&
            (editing ? (
              <Card className="space-y-3 p-4 sm:p-6">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-lg font-black" aria-label="Título" maxLength={200} />
                <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={18} aria-label="Texto escaneado" className="font-serif text-base" autoFocus />
                <div className="grid grid-cols-2 gap-3 sm:flex sm:justify-end">
                  <Button variant="plain" icon={<X className="size-5" />} onClick={cancelEdit}>
                    Cancelar
                  </Button>
                  <Button icon={<Save className="size-5" />} disabled={!dirty} loading={saving} onClick={save}>
                    Guardar
                  </Button>
                </div>
              </Card>
            ) : (
              <Card className="relative min-h-[55vh] px-5 py-7 sm:px-10 sm:py-12">
                <article className="mx-auto max-w-2xl whitespace-pre-line font-serif text-lg leading-relaxed sm:text-xl" aria-label="Texto escaneado">
                  {scan.text || <span className="font-sans text-hare">Este escaneo no tiene texto.</span>}
                </article>
              </Card>
            ))}

          {tab === 'analisis' && <AnalysisPanel key={scan.id} targetType="scan" targetId={scan.id} text={scan.text} />}
        </div>

        {/* Columna lateral en escritorio */}
        <aside className="hidden space-y-4 lg:sticky lg:top-24 lg:block">
          <div className="space-y-2">{actions(false)}</div>
          <Card className="divide-y divide-swan px-4 text-sm">
            <Detail label="Grupo" value={scan.groupTitle ?? 'Individual'} />
            <Detail label="Motor" value={ENGINE_LABEL[scan.engine]} />
            <Detail label="Idioma" value={language} />
            <Detail label="Palabras" value={formatNumber(scan.wordCount)} />
            <Detail label="Creado" value={formatDate(scan.createdAt)} />
          </Card>
        </aside>
      </div>

      <Modal open={moving} onClose={() => setMoving(false)} title="Mover a…">
        <div className="space-y-2">
          <MoveOption selected={scan.groupId === null} onClick={() => moveTo(null)} icon={<FileText className="size-5" />} iconClass="bg-beetle-light text-beetle-dark">
            Ninguno (individual)
          </MoveOption>
          {groups.map((g) => (
            <MoveOption
              key={g.id}
              selected={scan.groupId === g.id}
              onClick={() => moveTo(g.id)}
              icon={<BookOpen className="size-5" />}
              iconClass={`${GROUP_STYLES[g.color].soft} ${GROUP_STYLES[g.color].text}`}
            >
              {g.title}
            </MoveOption>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-polar px-3 py-1.5 text-wolf">{children}</span>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <span className="font-semibold text-wolf">{label}</span>
      <span className="truncate font-bold text-eel">{value}</span>
    </div>
  );
}

function RoundNav({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-wolf shadow-[0_1px_2px_rgba(41,36,68,0.08)] transition-[transform,background-color,color] hover:bg-macaw-light hover:text-macaw-dark active:scale-95 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function MoveOption({
  selected,
  onClick,
  icon,
  iconClass,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  icon: ReactNode;
  iconClass: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={clsx(
        'flex min-h-12 w-full items-center gap-3 rounded-xl p-3 text-left font-bold transition-[transform,background-color,color,box-shadow] active:scale-[0.99]',
        selected ? 'bg-macaw-light text-macaw-dark shadow-[inset_0_0_0_1px_#a38ef9]' : 'bg-polar text-eel hover:bg-white hover:shadow-[inset_0_0_0_1px_#dde0e4]',
      )}
    >
      <span className={clsx('flex size-10 shrink-0 items-center justify-center rounded-xl', iconClass)}>{icon}</span>
      <span className="truncate">{children}</span>
    </button>
  );
}

function PageAction({ icon, label, shortLabel, onClick, disabled, compact, tone = 'ink' }: { icon: ReactNode; label: string; shortLabel?: string; onClick: () => void; disabled?: boolean; compact: boolean; tone?: 'ink' | 'violet' | 'mint' | 'amber' | 'danger' }) {
  const toneClass = {
    ink: 'bg-eel text-white hover:bg-[#303138]',
    violet: 'bg-macaw-light text-macaw-dark hover:bg-macaw hover:text-eel',
    mint: 'bg-feather-light text-feather-dark hover:bg-feather',
    amber: 'bg-bee-light text-bee-dark hover:bg-bee',
    danger: 'bg-cardinal-light text-cardinal-dark hover:bg-cardinal hover:text-white',
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={clsx(
        'flex min-w-0 items-center justify-center gap-2 rounded-full font-bold transition-[transform,background-color,color] duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40',
        compact ? 'min-h-12 px-3 text-sm' : 'min-h-11 w-full px-4 text-sm',
        toneClass,
      )}
    >
      <span className="shrink-0 [&>svg]:size-4">{icon}</span>
      <span className="truncate">{shortLabel && compact ? <><span className="sm:hidden">{shortLabel}</span><span className="hidden sm:inline">{label}</span></> : label}</span>
    </button>
  );
}

function PageProgress({ value, label }: { value: number; label: string }) {
  const percent = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-3">
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-swan" role="progressbar" aria-label="Progreso entre páginas" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}>
        <div className="h-full rounded-full bg-feather-dark transition-[width] duration-300" style={{ width: `${percent}%` }} />
      </div>
      <span className="shrink-0 text-sm font-bold tabular-nums text-wolf">{label}</span>
    </div>
  );
}
