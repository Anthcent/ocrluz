import clsx from 'clsx';
import { Plus, X } from 'lucide-react';
import type { InputHTMLAttributes, KeyboardEvent, ReactNode } from 'react';
import type { FinalSummary, FinalSummaryStudent } from '../lib/types';
import { AREA_COUNT, computeTotals, COURSE_YEARS, emptyStudent, gradeOutcome, MAX_STUDENTS } from './model';
import { FIELD_LABELS, gradeRule, RULES, STUDENT_RULES, type FieldRule } from './validation';

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

type StudentKey = Exclude<keyof FinalSummaryStudent, 'grades'>;
const STUDENT_COLUMNS: { key: StudentKey; label: string; width: string; center?: boolean }[] = [
  { key: 'id', label: 'Cédula', width: 'w-[6.5rem]' },
  { key: 'lastNames', label: 'Apellidos', width: 'w-[9.5rem]' },
  { key: 'firstNames', label: 'Nombres', width: 'w-[9.5rem]' },
  { key: 'birthPlace', label: 'Lugar de nac.', width: 'w-[6.5rem]' },
  { key: 'state', label: 'EF', width: 'w-9', center: true },
  { key: 'sex', label: 'Sexo', width: 'w-9', center: true },
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

type CellProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  value: string;
  onValue: (value: string) => void;
  rule: FieldRule;
  field: string;
  error?: string;
};

/** Grid input that only accepts what its rule allows and shows the rule's message when the value is wrong. */
function Cell({ value, onValue, rule, field, error, className, ...props }: CellProps) {
  return (
    <input
      {...props}
      value={value}
      onChange={(e) => onValue(rule.sanitize(e.target.value).slice(0, rule.maxLength))}
      maxLength={rule.maxLength}
      inputMode={rule.inputMode}
      data-field={field}
      aria-invalid={error ? true : undefined}
      title={error}
      spellCheck={false}
      autoComplete="off"
      className={clsx(
        'h-7 w-full min-w-0 bg-transparent px-1 text-[12px] font-semibold text-eel outline-none transition-colors placeholder:text-hare/60 focus:bg-macaw-light',
        error && 'ring-1 ring-inset ring-cardinal',
        className,
      )}
    />
  );
}

function Labeled({ label, children, className, error }: { label: string; children: ReactNode; className?: string; error?: string }) {
  return (
    <label className={clsx('flex min-w-0 items-center gap-1.5 border-b pb-0.5', error ? 'border-cardinal' : 'border-eel/25', className)}>
      <span className={clsx('shrink-0 text-[11px] font-bold', error ? 'text-cardinal-dark' : 'text-wolf')}>{label}</span>
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
  const delta =
    { ArrowDown: [1, 0], Enter: [1, 0], ArrowUp: [-1, 0] }[event.key] ??
    (event.key === 'ArrowRight' && input.selectionStart === input.value.length ? [0, 1] : event.key === 'ArrowLeft' && input.selectionStart === 0 ? [0, -1] : null);
  if (!delta) return;
  const next = event.currentTarget.querySelector<HTMLInputElement>(`input[data-row="${row + delta[0]}"][data-col="${col + delta[1]}"]`);
  if (next) {
    event.preventDefault();
    next.focus();
    next.select();
  }
}

export function SummarySheet({ summary, onChange, errors }: { summary: FinalSummary; onChange: (next: FinalSummary) => void; errors: Record<string, string> }) {
  const set = (patch: Partial<FinalSummary>) => onChange({ ...summary, ...patch });
  const setInstitution = (key: keyof FinalSummary['institution'], value: string) => set({ institution: { ...summary.institution, [key]: value } });
  const setCourse = (key: keyof FinalSummary['course'], value: string) =>
    set({ course: { ...summary.course, [key]: value }, ...(key === 'year' ? { areas: areasForYear(summary, value) } : {}) });
  const setStudent = (index: number, patch: Partial<FinalSummaryStudent>) =>
    set({ students: summary.students.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
  const setGrade = (index: number, area: number, value: string) => setStudent(index, { grades: summary.students[index].grades.map((g, a) => (a === area ? value : g)) });
  const setArea = (index: number, key: keyof FinalSummary['areas'][number], value: string) =>
    set({ areas: summary.areas.map((a, i) => (i === index ? { ...a, [key]: value } : a)) });

  const totals = computeTotals(summary.students);
  const inst = summary.institution;

  const header = (label: string, field: string, value: string, onValue: (v: string) => void, rule: FieldRule, className?: string, placeholder?: string) => (
    <Labeled label={label} className={className} error={errors[field]}>
      <Cell field={field} value={value} onValue={onValue} rule={rule} error={errors[field]} placeholder={placeholder} aria-label={label.replace(/:$/, '')} />
    </Labeled>
  );

  return (
    <div className="overflow-x-auto rounded-2xl bg-white shadow-surface ring-1 ring-swan">
      <div className="min-w-[68rem] p-5 text-eel sm:p-7">
        <div className="text-center">
          <p className="text-sm font-bold tracking-wide">RESUMEN FINAL DEL RENDIMIENTO ESTUDIANTIL</p>
          <p className="text-[11px] font-semibold text-wolf">Código del Formato: EMGCT</p>
        </div>

        <div className="mt-4 grid grid-cols-[1fr_1.2fr_1fr] gap-x-6 gap-y-2">
          {header('I. Año Escolar:', 'schoolYear', summary.schoolYear, (v) => set({ schoolYear: v }), RULES.schoolYear, undefined, '2025-2026')}
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
          {header('Mes y Año:', 'monthYear', summary.monthYear, (v) => set({ monthYear: v }), RULES.monthYear, undefined, 'JULIO 2026')}
        </div>

        <p className="mt-5 text-[12px] font-bold">II. Datos de la Institución Educativa:</p>
        <div className="mt-1.5 grid grid-cols-6 gap-x-4 gap-y-2">
          {header('Código:', 'institution.code', inst.code, (v) => setInstitution('code', v), RULES.institutionCode, 'col-span-2')}
          {header('Epónimo:', 'institution.name', inst.name, (v) => setInstitution('name', v), RULES.text, 'col-span-4')}
          {header('Dirección:', 'institution.address', inst.address, (v) => setInstitution('address', v), RULES.text, 'col-span-4')}
          {header('Teléfono:', 'institution.phone', inst.phone, (v) => setInstitution('phone', v), RULES.phone, 'col-span-2')}
          {header('Municipio:', 'institution.municipality', inst.municipality, (v) => setInstitution('municipality', v), RULES.place, 'col-span-2')}
          {header('Entidad Federal:', 'institution.state', inst.state, (v) => setInstitution('state', v), RULES.place, 'col-span-2')}
          {header('CDCEE:', 'institution.cdcee', inst.cdcee, (v) => setInstitution('cdcee', v), RULES.place, 'col-span-2')}
          {header('Director(a):', 'institution.director', inst.director, (v) => setInstitution('director', v), RULES.names, 'col-span-4')}
          {header('Cédula:', 'institution.directorId', inst.directorId, (v) => setInstitution('directorId', v), RULES.personId, 'col-span-2')}
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
                {STUDENT_COLUMNS.map((c, col) => {
                  const field = `students.${index}.${c.key}`;
                  return (
                    <td key={c.key} className={clsx('border border-eel/40 p-0', errors[field] && 'bg-cardinal-light/60')}>
                      <Cell
                        field={field}
                        rule={STUDENT_RULES[c.key]}
                        error={errors[field]}
                        data-row={index}
                        data-col={col}
                        aria-label={`${FIELD_LABELS[c.key]} del estudiante ${index + 1}`}
                        value={student[c.key]}
                        onValue={(v) => setStudent(index, { [c.key]: v })}
                        className={c.center ? 'text-center' : undefined}
                      />
                    </td>
                  );
                })}
                {student.grades.map((grade, area) => {
                  const field = `students.${index}.grades.${area}`;
                  const error = errors[field];
                  const failed = !error && gradeOutcome(grade) === 'failed';
                  return (
                    <td key={area} className={clsx('border border-eel/40 p-0', !grade ? 'bg-bee-light' : error ? 'bg-cardinal-light/60' : failed && 'bg-cardinal-light')}>
                      <Cell
                        field={field}
                        rule={gradeRule(area)}
                        error={error}
                        data-row={index}
                        data-col={STUDENT_COLUMNS.length + area}
                        aria-label={`${summary.areas[area].code} del estudiante ${index + 1}`}
                        value={grade}
                        onValue={(v) => setGrade(index, area, v)}
                        className={clsx('text-center tabular-nums', failed && 'text-cardinal-dark', grade === '*' && 'text-hare')}
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
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <button
            type="button"
            disabled={summary.students.length >= MAX_STUDENTS}
            onClick={() => set({ students: [...summary.students, emptyStudent()] })}
            className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-bold text-macaw-dark transition-colors hover:bg-macaw-light disabled:text-hare"
          >
            <Plus className="size-4" /> Agregar estudiante ({summary.students.length}/{MAX_STUDENTS})
          </button>
          <p className="text-[11px] text-wolf">
            Notas: 1 a 20 · {summary.areas[AREA_COUNT - 1]?.code || 'última área'} con literal A–E · <b>*</b> no la cursa · <b>I</b> inasistente · <b>NC</b> no cursante
          </p>
        </div>

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
                    {(
                      [
                        ['code', RULES.areaCode, `Código del área ${i + 1}`, 'text-center'],
                        ['name', RULES.areaName, `Nombre del área ${i + 1}`, undefined],
                        ['teacher', RULES.names, `Profesor de ${area.code}`, undefined],
                        ['teacherId', RULES.personId, `Cédula del profesor de ${area.code}`, undefined],
                      ] as const
                    ).map(([key, rule, label, className]) => {
                      const field = `areas.${i}.${key}`;
                      return (
                        <td key={key} className={clsx('border border-eel/40 p-0', errors[field] && 'bg-cardinal-light/60')}>
                          <Cell field={field} rule={rule} error={errors[field]} value={area[key]} onValue={(v) => setArea(i, key, v)} className={className} aria-label={label} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <p className="text-[12px] font-bold">VI. Identificación del Curso:</p>
            <div className="mt-1.5 space-y-2.5 rounded-lg border border-eel/40 p-3">
              {header('Plan de estudio:', 'course.plan', summary.course.plan, (v) => setCourse('plan', v), RULES.text)}
              {header('Código:', 'course.planCode', summary.course.planCode, (v) => setCourse('planCode', v), RULES.planCode)}
              <Labeled label="Año cursado:" error={errors['course.year']}>
                <select
                  value={summary.course.year}
                  onChange={(e) => setCourse('year', e.target.value)}
                  data-field="course.year"
                  aria-label="Año cursado"
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
              {header('Sección:', 'course.section', summary.course.section, (v) => setCourse('section', v), RULES.section)}
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
            onChange={(e) => set({ observations: e.target.value.slice(0, 1000) })}
            maxLength={1000}
            rows={2}
            className="mt-1.5 w-full resize-y rounded-lg border border-eel/40 bg-transparent p-2 text-[12px] font-semibold outline-none focus:bg-macaw-light"
          />
        </label>

        <div className="mt-4 grid grid-cols-2 gap-6">
          <div className="space-y-2">
            {header('VIII. Fecha de Remisión:', 'remissionDate', summary.remissionDate, (v) => set({ remissionDate: v }), RULES.date, undefined, '31-07-2026')}
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
