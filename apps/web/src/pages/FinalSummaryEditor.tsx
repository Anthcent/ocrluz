import clsx from 'clsx';
import { AlertTriangle, Camera, CheckCircle2, ChevronDown, Download, FilePlus2, FileSpreadsheet, ImagePlus, PenLine, Save, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { errorMessage, useFeedback } from '../components/feedback';
import { BackLink, PageHeader } from '../components/PageHeader';
import { Button, Modal, PageLoader, ProgressBar } from '../components/ui';
import { MAX_STUDENTS, summaryTitle } from '../final-summary/model';
import { SummarySheet } from '../final-summary/SummarySheet';
import { validateSummary, type Issue } from '../final-summary/validation';
import { api } from '../lib/api';
import { prepareFormImage } from '../final-summary/prepare';
import { prepareImage } from '../lib/image';
import type { FinalSummary } from '../lib/types';

interface Photo {
  url: string;
  name: string;
}

/** A second photographed page adds its students and fills whatever the first page left blank. */
function mergePage(current: FinalSummary, page: FinalSummary): FinalSummary {
  if (!current.students.length) return page;
  const known = new Set(current.students.map((s) => s.id).filter(Boolean));
  const students = [...current.students, ...page.students.filter((s) => !s.id || !known.has(s.id))].slice(0, MAX_STUDENTS);
  const fill = <T extends object>(a: T, b: T) =>
    Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v || (b as Record<string, string>)[k] || ''])) as T;
  return {
    ...current,
    schoolYear: current.schoolYear || page.schoolYear,
    monthYear: current.monthYear || page.monthYear,
    remissionDate: current.remissionDate || page.remissionDate,
    institution: fill(current.institution, page.institution),
    course: fill(current.course, page.course),
    areas: current.areas.map((a, i) => fill(a, page.areas[i])),
    students,
  };
}

export function FinalSummaryEditorPage() {
  const params = useParams();
  const [search] = useSearchParams();
  const revision = search.get('tipo') === 'revision';
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const existingId = params.id ? Number(params.id) : null;

  const [id, setId] = useState<number | null>(existingId);
  const [summary, setSummary] = useState<FinalSummary | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scan, setScan] = useState<{ progress: number; label: string } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [viewing, setViewing] = useState<Photo | null>(null);
  const [started, setStarted] = useState(existingId !== null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const issues = useMemo(() => (summary ? validateSummary(summary) : []), [summary]);
  // First message wins when a field has several problems.
  const errors = useMemo(() => Object.fromEntries([...issues].reverse().map((i) => [i.field, i.message])), [issues]);

  useEffect(() => {
    const request = existingId ? api.finalSummaries.get(existingId).then((r) => r.summary) : api.finalSummaries.blank('PRIMERO').then((r) => ({ ...r.summary, evaluationType: revision ? ('REVISIÓN' as const) : r.summary.evaluationType }));
    request.then(setSummary).catch((err) => {
      toast(errorMessage(err), 'error');
      navigate('/resumenes');
    });
  }, [existingId, navigate, toast, revision]);

  const photoUrls = useRef<string[]>([]);
  useEffect(() => () => photoUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const update = (next: FinalSummary) => {
    setSummary(next);
    setDirty(true);
  };

  const scanFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !summary) return;
    setScan({ progress: 0.03, label: 'Preparando la foto…' });
    let timer: ReturnType<typeof setInterval> | undefined;
    try {
      const preview = await prepareImage(file);
      setScan({ progress: 0.05, label: 'Limpiando las líneas de la tabla…' });
      // Let the label paint before the pixel work blocks the thread for a moment.
      await new Promise((resolve) => setTimeout(resolve, 30));
      const image = await prepareFormImage(file);
      let current = 0.08;
      const result = await api.finalSummaries.scan(image, (fraction) => {
        current = 0.08 + fraction * 0.32;
        setScan({ progress: current, label: 'Subiendo la foto…' });
        if (fraction >= 1 && !timer) {
          timer = setInterval(() => {
            current += (0.95 - current) * 0.05;
            setScan({ progress: current, label: 'OCR.space está leyendo la tabla…' });
          }, 200);
        }
      });
      const url = URL.createObjectURL(preview);
      photoUrls.current.push(url);
      setPhotos((list) => [...list, { url, name: `Página ${list.length + 1}` }]);
      const merged = mergePage(summary, result.summary);
      update(merged);
      setWarnings(result.warnings);
      setStarted(true);
      const added = merged.students.length - summary.students.length;
      toast(added > 0 ? `Se leyeron ${added} ${added === 1 ? 'estudiante' : 'estudiantes'}. Revisa los datos.` : 'No se encontraron estudiantes nuevos en la foto', added > 0 ? 'success' : 'error');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      clearInterval(timer);
      setScan(null);
    }
  };

  const save = async () => {
    if (!summary) return null;
    setSaving(true);
    try {
      const saved = id ? await api.finalSummaries.update(id, summary) : await api.finalSummaries.create(summary);
      setDirty(false);
      if (!id) {
        setId(saved.id);
        navigate(`/resumenes/${saved.id}`, { replace: true });
      }
      toast('Resumen guardado');
      return saved.id;
    } catch (err) {
      toast(errorMessage(err), 'error');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const download = async () => {
    if (
      issues.length &&
      !(await confirm({
        title: 'Hay datos por revisar',
        message: `${issues.length} ${issues.length === 1 ? 'dato no cumple' : 'datos no cumplen'} el formato. Se exportará tal como está; ¿descargar igual?`,
        confirmLabel: 'Descargar igual',
      }))
    )
      return;
    const target = dirty || !id ? await save() : id;
    if (!target) return;
    const link = document.createElement('a');
    link.href = api.finalSummaries.xlsxUrl(target);
    link.download = '';
    link.click();
  };

  const remove = async () => {
    if (!id || !(await confirm({ title: 'Eliminar resumen', message: 'Se borrará este resumen final. Esta acción no se puede deshacer.', confirmLabel: 'Eliminar', danger: true }))) return;
    try {
      await api.finalSummaries.remove(id);
      setDirty(false);
      toast('Resumen eliminado');
      navigate('/resumenes');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  if (!summary) return <PageLoader />;

  const pickers = (
    <>
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={scanFile} />
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={scanFile} />
    </>
  );

  if (!started) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader
          back={<BackLink to="/resumenes">Resúmenes finales</BackLink>}
          icon={<FileSpreadsheet />}
          title={revision ? "Nuevo resumen de revisión" : "Nuevo resumen final"}
          subtitle="Toma una foto del formato y la app llenará la tabla con OCR.space."
        />
        {pickers}
        {scan ? (
          <div className="rounded-2xl bg-white p-6 shadow-surface ring-1 ring-swan" role="status">
            <p className="font-bold text-eel">{scan.label}</p>
            <ProgressBar value={scan.progress} className="mt-3" />
            <p className="mt-3 text-sm text-wolf">Una tabla completa puede tardar entre 10 y 30 segundos.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => cameraInput.current?.click()}
                className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-2xl bg-brand p-5 text-white transition-colors hover:bg-brand-hover"
              >
                <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-on-accent">
                  <Camera className="size-6" />
                </span>
                <span className="font-bold">Tomar foto</span>
              </button>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-2xl bg-white p-5 text-eel shadow-surface ring-1 ring-swan transition-colors hover:bg-snow"
              >
                <span className="flex size-12 items-center justify-center rounded-xl bg-macaw-light text-macaw-dark">
                  <Upload className="size-6" />
                </span>
                <span className="font-bold">Subir imagen</span>
              </button>
            </div>
            <div className="rounded-2xl bg-white p-5 shadow-surface ring-1 ring-swan">
              <p className="font-bold text-eel">Para que se lea bien</p>
              <ul className="mt-2 space-y-1.5 text-sm text-wolf">
                <li>• La hoja completa y derecha, de frente, sin cortar la fila de áreas (LL, ID, MA…).</li>
                <li>• Buena luz y sin sombras ni reflejos sobre la tabla.</li>
                <li>• Si el resumen ocupa dos hojas, escanea una y luego agrega la otra.</li>
              </ul>
            </div>
            <button type="button" onClick={() => setStarted(true)} className="inline-flex items-center gap-2 text-sm font-bold text-macaw-dark hover:text-eel">
              <PenLine className="size-4" /> Prefiero llenarlo a mano
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="pb-24">
      <PageHeader
        back={<BackLink to="/resumenes">Resúmenes finales</BackLink>}
        icon={<FileSpreadsheet />}
        title={summaryTitle(summary)}
        subtitle={id ? 'Revisa y corrige las celdas: los totales se recalculan solos.' : 'Revisa lo leído antes de guardar. Las celdas en amarillo están vacías o no son una nota válida.'}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" icon={<ImagePlus className="size-5" />} onClick={() => cameraInput.current?.click()} disabled={!!scan}>
              Agregar página
            </Button>
            {id && <Button variant="plain" icon={<Trash2 className="size-5" />} onClick={remove} aria-label="Eliminar resumen" />}
          </div>
        }
      />
      {pickers}

      {scan && (
        <div className="mb-4 rounded-2xl bg-white p-4 shadow-surface ring-1 ring-swan" role="status">
          <p className="text-sm font-bold text-eel">{scan.label}</p>
          <ProgressBar value={scan.progress} className="mt-2" />
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl bg-bee-light p-4 text-bee-dark ring-1 ring-bee" role="alert">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <ul className="min-w-0 flex-1 space-y-1 text-sm font-semibold">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <button type="button" onClick={() => setWarnings([])} aria-label="Cerrar avisos" className="rounded-full p-1 hover:bg-bee/40">
            <X className="size-4" />
          </button>
        </div>
      )}

      {photos.length > 0 && (
        <div className="mb-4 flex items-center gap-2 overflow-x-auto">
          <span className="shrink-0 text-xs font-semibold text-wolf">Compara con la foto:</span>
          {photos.map((p) => (
            <button key={p.url} type="button" onClick={() => setViewing(p)} className="shrink-0 overflow-hidden rounded-lg ring-1 ring-swan hover:ring-macaw">
              <img src={p.url} alt={p.name} className="h-14 w-20 object-cover" />
            </button>
          ))}
        </div>
      )}

      <p className="mb-2 text-xs font-semibold text-wolf lg:hidden">Desliza la hoja hacia los lados para ver todas las columnas.</p>
      <IssuesPanel issues={issues} />
      <SummarySheet summary={summary} onChange={update} errors={errors} />

      <div className="fixed inset-x-3 bottom-24 z-30 mx-auto flex max-w-xl items-center gap-2 rounded-full bg-white/95 p-1.5 shadow-floating ring-1 ring-swan backdrop-blur lg:bottom-6 lg:left-[19rem]">
        <span className={clsx('min-w-0 flex-1 truncate pl-3 text-sm font-semibold', dirty ? 'text-bee-dark' : 'text-wolf')}>
          {dirty ? 'Cambios sin guardar' : id ? 'Todo guardado' : 'Sin guardar'}
        </span>
        <Button variant="ghost" icon={<Download className="size-5" />} onClick={download} disabled={saving || !summary.students.length}>
          <span className="hidden sm:inline">Excel</span>
        </Button>
        <Button icon={id ? <Save className="size-5" /> : <FilePlus2 className="size-5" />} loading={saving} onClick={save} disabled={!dirty && !!id}>
          Guardar
        </Button>
      </div>

      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing?.name ?? ''} wide>
        {viewing && <img src={viewing.url} alt={viewing.name} className="max-h-[75vh] w-full rounded-xl object-contain" />}
      </Modal>
    </div>
  );
}

/** Lists every field that breaks the form rules; choosing one jumps to that cell. */
function IssuesPanel({ issues }: { issues: Issue[] }) {
  const [open, setOpen] = useState(false);
  if (!issues.length) {
    return (
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-feather-dark">
        <CheckCircle2 className="size-4" /> Todos los datos cumplen el formato.
      </p>
    );
  }
  const focus = (field: string) => {
    const input = document.querySelector<HTMLElement>(`[data-field="${field}"]`);
    input?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    input?.focus({ preventScroll: true });
  };
  return (
    <div className="mb-3 overflow-hidden rounded-2xl bg-white shadow-surface ring-1 ring-cardinal/40">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <AlertTriangle className="size-5 shrink-0 text-cardinal-dark" />
        <span className="min-w-0 flex-1 text-sm font-bold text-eel">
          {issues.length} {issues.length === 1 ? 'dato por revisar' : 'datos por revisar'}
          <span className="ml-2 font-semibold text-wolf">Las celdas con borde rojo no cumplen el formato.</span>
        </span>
        <ChevronDown className={clsx('size-5 shrink-0 text-wolf transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul className="max-h-64 divide-y divide-swan overflow-y-auto border-t border-swan">
          {issues.map((issue, i) => (
            <li key={`${issue.field}-${i}`}>
              <button type="button" onClick={() => focus(issue.field)} className="flex w-full flex-col items-start px-4 py-2 text-left hover:bg-snow sm:flex-row sm:items-center sm:gap-3">
                <span className="shrink-0 text-sm font-bold text-eel sm:w-64 sm:truncate">{issue.label}</span>
                <span className="text-sm text-cardinal-dark">{issue.message}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
