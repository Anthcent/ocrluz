import clsx from 'clsx';
import { Plus, X } from 'lucide-react';
import type { InputHTMLAttributes, KeyboardEvent, ReactNode } from 'react';
import type { FinalSummary, FinalSummaryStudent } from '../lib/types';
import { AREA_COUNT, computeTotals, COURSE_YEARS, emptyStudent, gradeOutcome, isInvalidGrade, MAX_STUDENTS } from './model';

const LOWER_AREAS: [string, string][] = [
  ['BAT', 'Biología, Ambiente y Tecnología'],
  ['OV', 'Orientación Vocacional'],
];
const UPPER_AREAS: [string, string][] = [
  ['BIO', 'Biología'],
  ['OC', 'Orientación y Convivencia'],
];

/** Third year on, the form swaps BAT/OV for BIO/OC; teachers already entered are kept. */
function areasForYear(summary: FinalSummary, year: string) {
  const [science, guidance] = year === 'PRIMERO' || year === 'SEGUNDO' ? LOWER_AREAS : UPPER_AREAS;
  return summary.areas.map((area, i) =>
    i === 4 && ['BAT', 'BIO'].includes(area.code) ? { ...area, code: science[0], name: science[1] } : i === 9 && ['OV', 'OC'].includes(area.code) ? { ...area, code: guidance[0], name: guidance[1] } : area,
  );
}

const STUDENT_COLUMNS: { key: Exclude<keyof FinalSummaryStudent, 'grades'>; label: string; width: string; upper?: boolean; center?: boolean }[] = [
  { key: 'id', label: 'Cédula', width: 'w-[6.5rem]', upper: true },
  { key: 'lastNames', label: 'Apellidos', width: 'w-[9.5rem]', upper: true },
  { key: 'firstNames', label: 'Nombres', width: 'w-[9.5rem]', upper: true },
  { key: 'birthPlace', label: 'Lugar de nac.', width: 'w-[6.5rem]', upper: true },
  { key: 'state', label: 'EF', width: 'w-9', upper: true, center: true },
  { key: 'sex', label: 'Sexo', width: 'w-9', upper: true, center: true },
  { key: 'birthDay', label: 'Día', width: 'w-9', center: true },
  { key: 'birthMonth', label: 'Mes', width: 'w-9', center: true },
  { key: 'birthYear', label: 'Año', width: 'w-12', center: true },
];

const TOTAL_LABELS: [keyof ReturnType<typeof computeTotals>[number], string][] = [
  ['enrolled', 'Inscritos'],
  ['absent', 'Inasistentes'],
  ['approved', 'Aprobados'],
  ['failed', 'No aprobados'],
  ['notTaken', 'No cursantes'],
];

function Cell({ className, upper, ...props }: InputHTMLAttributes<HTMLInputElement> & { upper?: boolean }) {
  return (
    <input
      {...props}
      onChange={(e) => {
        if (upper) e.target.value = e.target.value.toUpperCase();
        props.onChange?.(e);
      }}
      spellCheck={false}
      autoComplete="off"
      className={clsx('h-7 w-full min-w-0 bg-transparent px-1 text-[12px] font-semibold text-eel outline-none transition-colors placeholder:text-hare/60 focus:bg-macaw-light', className)}
    />
  );
}

function Labeled({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={clsx('flex min-w-0 items-center gap-1.5 border-b border-eel/25 pb-0.5', className)}>
      <span className="shrink-0 text-[11px] font-bold text-wolf">{label}</span>
      {children}
    </label>
  );
}

/** Arrow keys and Enter move between grid cells like a spreadsheet. */
function moveFocus(event: KeyboardEvent<HTMLTableSectionElement>) {
  const input = event.target as HTMLInputElement;
  const row = Number(input.dataset.row);
  const col = Number(input.dataset.col);
  if (Number.isNaN(row) || Number.isNaN(col)) return;
  const delta = { ArrowDown: [1, 0], Enter: [1, 0], ArrowUp: [-1, 0] }[event.key] ?? (event.key === 'ArrowRight' && input.selectionStart === input.value.length ? [0, 1] : event.key === 'ArrowLeft' && input.selectionStart === 0 ? [0, -1] : null);
  if (!delta) return;
  const next = event.currentTarget.querySelector<HTMLInputElement>(`input[data-row="${row + delta[0]}"][data-col="${col + delta[1]}"]`);
  if (next) {
    event.preventDefault();
    next.focus();
    next.select();
  }
}

export function SummarySheet({ summary, onChange }: { summary: FinalSummary; onChange: (next: FinalSummary) => void }) {
  const set = (patch: Partial<FinalSummary>) => onChange({ ...summary, ...patch });
  const setInstitution = (key: keyof FinalSummary['institution'], value: string) => set({ institution: { ...summary.institution, [key]: value } });
  const setCourse = (key: keyof FinalSummary['course'], value: string) =>
    set({ course: { ...summary.course, [key]: value }, ...(key === 'year' ? { areas: areasForYear(summary, value) } : {}) });
  const setStudent = (index: number, patch: Partial<FinalSummaryStudent>) =>
    set({ students: summary.students.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
  const setGrade = (index: number, area: number, value: string) =>
    setStudent(index, { grades: summary.students[index].grades.map((g, a) => (a === area ? value.toUpperCase().trim() : g)) });
  const setArea = (index: number, key: keyof FinalSummary['areas'][number], value: string) =>
    set({ areas: summary.areas.map((a, i) => (i === index ? { ...a, [key]: value } : a)) });

  const totals = computeTotals(summary.students);
  const inst = summary.institution;

  return (
    <div className="overflow-x-auto rounded-2xl bg-white shadow-surface ring-1 ring-swan">
      <div className="min-w-[68rem] p-5 text-eel sm:p-7">
        <div className="text-center">
          <p className="text-sm font-bold tracking-wide">RESUMEN FINAL DEL RENDIMIENTO ESTUDIANTIL</p>
          <p className="text-[11px] font-semibold text-wolf">Código del Formato: EMGCT</p>
        </div>

        <div className="mt-4 grid grid-cols-[1fr_1.2fr_1fr] gap-x-6 gap-y-2">
          <Labeled label="I. Año Escolar:">
            <Cell value={summary.schoolYear} onChange={(e) => set({ schoolYear: e.target.value })} placeholder="2025-2026" />
          </Labeled>
          <Labeled label="Tipo de Evaluación:">
            <select
              value={summary.evaluationType}
              onChange={(e) => set({ evaluationType: e.target.value as FinalSummary['evaluationType'] })}
              className="h-7 w-full bg-transparent px-1 text-[12px] font-bold outline-none focus:bg-macaw-light"
            >
              <option value="FINAL">FINAL</option>
              <option value="REVISIÓN">REVISIÓN</option>
            </select>
          </Labeled>
          <Labeled label="Mes y Año:">
            <Cell upper value={summary.monthYear} onChange={(e) => set({ monthYear: e.target.value })} placeholder="JULIO 2026" />
          </Labeled>
        </div>

        <p className="mt-5 text-[12px] font-bold">II. Datos de la Institución Educativa:</p>
        <div className="mt-1.5 grid grid-cols-6 gap-x-4 gap-y-2">
          <Labeled label="Código:" className="col-span-2">
            <Cell upper value={inst.code} onChange={(e) => setInstitution('code', e.target.value)} />
          </Labeled>
          <Labeled label="Epónimo:" className="col-span-4">
            <Cell upper value={inst.name} onChange={(e) => setInstitution('name', e.target.value)} />
          </Labeled>
          <Labeled label="Dirección:" className="col-span-4">
            <Cell upper value={inst.address} onChange={(e) => setInstitution('address', e.target.value)} />
          </Labeled>
          <Labeled label="Teléfono:" className="col-span-2">
            <Cell value={inst.phone} onChange={(e) => setInstitution('phone', e.target.value)} />
          </Labeled>
          <Labeled label="Municipio:" className="col-span-2">
            <Cell upper value={inst.municipality} onChange={(e) => setInstitution('municipality', e.target.value)} />
          </Labeled>
          <Labeled label="Entidad Federal:" className="col-span-2">
            <Cell upper value={inst.state} onChange={(e) => setInstitution('state', e.target.value)} />
          </Labeled>
          <Labeled label="CDCEE:" className="col-span-2">
            <Cell upper value={inst.cdcee} onChange={(e) => setInstitution('cdcee', e.target.value)} />
          </Labeled>
          <Labeled label="Director(a):" className="col-span-4">
            <Cell upper value={inst.director} onChange={(e) => setInstitution('director', e.target.value)} />
          </Labeled>
          <Labeled label="Cédula:" className="col-span-2">
            <Cell upper value={inst.directorId} onChange={(e) => setInstitution('directorId', e.target.value)} />
          </Labeled>
        </div>

        <div className="mt-5 flex items-end justify-between text-[12px] font-bold">
          <span>III. Identificación del Estudiante:</span>
          <span>IV. Resumen Final del Rendimiento:</span>
        </div>
        <table className="mt-1.5 w-full table-fixed border-collapse text-[11px]">
          <thead className="bg-snow">
            <tr>
              <th rowSpan={2} className="w-8 border border-eel/40 font-bold">
                N°
              </th>
              {STUDENT_COLUMNS.map((c) => (
                <th key={c.key} rowSpan={2} className={clsx('border border-eel/40 px-1 font-bold leading-tight', c.width)}>
                  {c.label}
                </th>
              ))}
              <th colSpan={AREA_COUNT} className="border border-eel/40 py-1 font-bold">
                Áreas de formación
              </th>
              <th rowSpan={2} className="w-7 border-0" aria-label="Acciones" />
            </tr>
            <tr>
              {summary.areas.map((area, i) => (
                <th key={i} className="w-11 border border-eel/40 py-1 font-bold" title={area.name}>
                  {area.code || i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody onKeyDown={moveFocus}>
            {summary.students.map((student, index) => (
              <tr key={index} className="group">
                <td className="border border-eel/40 text-center font-semibold text-wolf">{String(index + 1).padStart(2, '0')}</td>
                {STUDENT_COLUMNS.map((c, col) => (
                  <td key={c.key} className="border border-eel/40 p-0">
                    <Cell
                      upper={c.upper}
                      data-row={index}
                      data-col={col}
                      aria-label={`${c.label} del estudiante ${index + 1}`}
                      value={student[c.key]}
                      onChange={(e) => setStudent(index, { [c.key]: e.target.value })}
                      className={c.center ? 'text-center' : undefined}
                    />
                  </td>
                ))}
                {student.grades.map((grade, area) => {
                  const outcome = gradeOutcome(grade);
                  const invalid = isInvalidGrade(grade);
                  return (
                    <td
                      key={area}
                      className={clsx(
                        'border border-eel/40 p-0',
                        outcome === 'failed' && 'bg-cardinal-light',
                        invalid && 'bg-bee-light',
                        !grade && 'bg-bee-light/60',
                      )}
                    >
                      <Cell
                        data-row={index}
                        data-col={STUDENT_COLUMNS.length + area}
                        aria-label={`${summary.areas[area].code} del estudiante ${index + 1}`}
                        aria-invalid={invalid || undefined}
                        value={grade}
                        onChange={(e) => setGrade(index, area, e.target.value)}
                        className={clsx('text-center tabular-nums', outcome === 'failed' && 'text-cardinal-dark', grade === '*' && 'text-hare')}
                      />
                    </td>
                  );
                })}
                <td className="pl-1">
                  <button
                    type="button"
                    onClick={() => set({ students: summary.students.filter((_, i) => i !== index) })}
                    aria-label={`Quitar estudiante ${index + 1}`}
                    className="flex size-6 items-center justify-center rounded-full text-hare opacity-0 transition hover:bg-cardinal-light hover:text-cardinal-dark focus:opacity-100 group-hover:opacity-100"
                  >
                    <X className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {TOTAL_LABELS.map(([key, label], r) => (
              <tr key={key} className="bg-snow">
                {r === 0 && (
                  <td colSpan={1 + STUDENT_COLUMNS.length - 3} rowSpan={TOTAL_LABELS.length} className="border border-eel/40 px-2 text-center font-bold">
                    Total de Áreas de Formación
                  </td>
                )}
                <td colSpan={3} className="border border-eel/40 px-2 font-bold">
                  {label}
                </td>
                {totals.map((t, area) => (
                  <td key={area} className={clsx('border border-eel/40 py-1 text-center font-bold tabular-nums', key === 'failed' && t.failed > 0 && 'text-cardinal-dark')}>
                    {t[key]}
                  </td>
                ))}
                <td />
              </tr>
            ))}
          </tfoot>
        </table>
        <button
          type="button"
          disabled={summary.students.length >= MAX_STUDENTS}
          onClick={() => set({ students: [...summary.students, emptyStudent()] })}
          className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-bold text-macaw-dark transition-colors hover:bg-macaw-light disabled:text-hare"
        >
          <Plus className="size-4" /> Agregar estudiante ({summary.students.length}/{MAX_STUDENTS})
        </button>

        <div className="mt-5 grid grid-cols-[minmax(0,1fr)_17rem] gap-6">
          <div>
            <p className="text-[12px] font-bold">V. Profesores por Áreas:</p>
            <table className="mt-1.5 w-full table-fixed border-collapse text-[11px]">
              <thead className="bg-snow">
                <tr>
                  <th className="w-8 border border-eel/40 py-1 font-bold">N°</th>
                  <th className="w-16 border border-eel/40 font-bold">Código</th>
                  <th className="border border-eel/40 font-bold">Área de formación</th>
                  <th className="border border-eel/40 font-bold">Apellidos y nombres del profesor</th>
                  <th className="w-28 border border-eel/40 font-bold">Cédula</th>
                </tr>
              </thead>
              <tbody>
                {summary.areas.map((area, i) => (
                  <tr key={i}>
                    <td className="border border-eel/40 text-center font-semibold text-wolf">{i + 1}</td>
                    <td className="border border-eel/40 p-0">
                      <Cell upper value={area.code} onChange={(e) => setArea(i, 'code', e.target.value)} className="text-center" aria-label={`Código del área ${i + 1}`} />
                    </td>
                    <td className="border border-eel/40 p-0">
                      <Cell value={area.name} onChange={(e) => setArea(i, 'name', e.target.value)} aria-label={`Nombre del área ${i + 1}`} />
                    </td>
                    <td className="border border-eel/40 p-0">
                      <Cell upper value={area.teacher} onChange={(e) => setArea(i, 'teacher', e.target.value)} aria-label={`Profesor de ${area.code}`} />
                    </td>
                    <td className="border border-eel/40 p-0">
                      <Cell upper value={area.teacherId} onChange={(e) => setArea(i, 'teacherId', e.target.value)} aria-label={`Cédula del profesor de ${area.code}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <p className="text-[12px] font-bold">VI. Identificación del Curso:</p>
            <div className="mt-1.5 space-y-2.5 rounded-lg border border-eel/40 p-3">
              <Labeled label="Plan de estudio:">
                <Cell upper value={summary.course.plan} onChange={(e) => setCourse('plan', e.target.value)} />
              </Labeled>
              <Labeled label="Código:">
                <Cell value={summary.course.planCode} onChange={(e) => setCourse('planCode', e.target.value)} />
              </Labeled>
              <Labeled label="Año cursado:">
                <select
                  value={summary.course.year}
                  onChange={(e) => setCourse('year', e.target.value)}
                  className="h-7 w-full bg-transparent px-1 text-[12px] font-bold outline-none focus:bg-macaw-light"
                >
                  <option value="">—</option>
                  {COURSE_YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </Labeled>
              <Labeled label="Sección:">
                <Cell upper maxLength={2} value={summary.course.section} onChange={(e) => setCourse('section', e.target.value)} />
              </Labeled>
              <div className="flex items-center justify-between pt-1 text-[11px] font-bold">
                <span className="text-wolf">N° de estudiantes</span>
                <span className="text-sm tabular-nums">{summary.students.length}</span>
              </div>
            </div>
          </div>
        </div>

        <label className="mt-5 block">
          <span className="text-[12px] font-bold">VII. Observaciones:</span>
          <textarea
            value={summary.observations}
            onChange={(e) => set({ observations: e.target.value })}
            rows={2}
            className="mt-1.5 w-full resize-y rounded-lg border border-eel/40 bg-transparent p-2 text-[12px] font-semibold outline-none focus:bg-macaw-light"
          />
        </label>

        <div className="mt-4 grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Labeled label="VIII. Fecha de Remisión:">
              <Cell value={summary.remissionDate} onChange={(e) => set({ remissionDate: e.target.value })} placeholder="31-07-2026" />
            </Labeled>
            <p className="pt-1 text-[11px] font-bold text-wolf">Director(a)</p>
            <p className="text-[12px] font-semibold">{inst.director || '—'}</p>
            <p className="text-[12px] font-semibold text-wolf">{inst.directorId || '—'}</p>
          </div>
          <div className="flex items-end justify-end text-right text-[11px] text-hare">Sellos y firmas se agregan al imprimir.</div>
        </div>
      </div>
    </div>
  );
}
