import type { FinalSummary, FinalSummaryStudent } from '../lib/types';
import { AREA_COUNT } from './model';

/** How a field filters keystrokes and checks its finished value. */
export interface FieldRule {
  /** Applied on every keystroke: drops characters the field can never hold. */
  sanitize: (value: string) => string;
  /** Returns a message when the finished value is not valid; empty values are checked separately. */
  check?: (value: string) => string | null;
  maxLength: number;
  inputMode?: 'numeric' | 'text';
}

const LETTERS = /[^A-ZÁÉÍÓÚÜÑ .'-]/g;
const upperLetters = (v: string) => v.toUpperCase().replace(LETTERS, '').replace(/\s{2,}/g, ' ').replace(/^\s+/, '');
const digits = (v: string) => v.replace(/\D/g, '');

/** «V12345678»: one optional V/E prefix followed by digits only. */
const idChars = (v: string) => {
  const upper = v.toUpperCase().replace(/[^VE0-9]/g, '');
  const prefix = /^[VE]/.test(upper) ? upper[0] : '';
  return prefix + digits(upper.slice(prefix.length));
};

const CURRENT_YEAR = new Date().getFullYear();
export const MONTHS = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

const between = (value: string, min: number, max: number) => Number(value) >= min && Number(value) <= max;

export const RULES = {
  studentId: {
    sanitize: idChars,
    maxLength: 12,
    check: (v) => (/^[VE]\d{6,11}$/.test(v) ? null : 'Cédula: V o E seguida de 6 a 11 dígitos (cédula escolar incluida)'),
  },
  personId: {
    sanitize: idChars,
    maxLength: 10,
    check: (v) => (/^[VE]\d{6,9}$/.test(v) ? null : 'Cédula: V o E seguida de 6 a 9 dígitos'),
  },
  names: {
    sanitize: upperLetters,
    maxLength: 40,
    check: (v) => (v.replace(/[^A-ZÁÉÍÓÚÜÑ]/g, '').length >= 2 ? null : 'Debe tener al menos 2 letras'),
  },
  place: { sanitize: upperLetters, maxLength: 30, check: (v) => (v.trim().length >= 3 ? null : 'Escribe el lugar completo') },
  stateCode: { sanitize: (v) => v.toUpperCase().replace(/[^A-Z]/g, ''), maxLength: 3, check: (v) => (/^[A-Z]{2,3}$/.test(v) ? null : 'Usa la abreviatura de 2 o 3 letras (p. ej. TR)') },
  sex: { sanitize: (v) => v.toUpperCase().replace(/[^MF]/g, ''), maxLength: 1, check: (v) => (/^[MF]$/.test(v) ? null : 'Solo M o F') },
  day: { sanitize: digits, maxLength: 2, inputMode: 'numeric', check: (v) => (between(v, 1, 31) ? null : 'Día entre 01 y 31') },
  month: { sanitize: digits, maxLength: 2, inputMode: 'numeric', check: (v) => (between(v, 1, 12) ? null : 'Mes entre 01 y 12') },
  birthYear: {
    sanitize: digits,
    maxLength: 4,
    inputMode: 'numeric',
    check: (v) => (/^\d{4}$/.test(v) && between(v, 1990, CURRENT_YEAR) ? null : `Año de 4 dígitos entre 1990 y ${CURRENT_YEAR}`),
  },
  numericGrade: {
    sanitize: (v) => v.toUpperCase().replace(/[^0-9*INC]/g, ''),
    maxLength: 2,
    inputMode: 'text',
    check: (v) => (/^(\*|I|IN|NC)$/.test(v) || (/^\d{1,2}$/.test(v) && between(v, 1, 20)) ? null : 'Nota de 1 a 20, * si no la cursa, I inasistente o NC'),
  },
  letterGrade: {
    sanitize: (v) => v.toUpperCase().replace(/[^A-EINC*]/g, ''),
    maxLength: 2,
    check: (v) => (/^([A-E]|\*|I|IN|NC)$/.test(v) ? null : 'Literal de A a E, * si no la cursa, I inasistente o NC'),
  },
  schoolYear: {
    sanitize: (v) => v.replace(/[^\d-]/g, '').slice(0, 9),
    maxLength: 9,
    check: (v) => {
      const m = /^(\d{4})-(\d{4})$/.exec(v);
      return m && Number(m[2]) === Number(m[1]) + 1 ? null : 'Formato AAAA-AAAA con años seguidos (p. ej. 2025-2026)';
    },
  },
  monthYear: {
    sanitize: (v) => v.toUpperCase().replace(/[^A-Z0-9 ]/g, ''),
    maxLength: 15,
    check: (v) => (new RegExp(`^(${MONTHS.join('|')}) \\d{4}$`).test(v) ? null : 'Mes en letras y año (p. ej. JULIO 2026)'),
  },
  date: {
    sanitize: (v) => v.replace(/[^\d-]/g, ''),
    maxLength: 10,
    check: (v) => {
      const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(v);
      return m && isRealDate(m[1], m[2], m[3]) ? null : 'Fecha DD-MM-AAAA válida (p. ej. 31-07-2026)';
    },
  },
  institutionCode: {
    sanitize: (v) => v.toUpperCase().replace(/[^A-Z0-9]/g, ''),
    maxLength: 12,
    check: (v) => (/^[A-Z0-9]{6,12}$/.test(v) && /\d/.test(v) ? null : 'Código de 6 a 12 letras y números (p. ej. OD11842118)'),
  },
  phone: { sanitize: digits, maxLength: 11, inputMode: 'numeric', check: (v) => (/^\d{10,11}$/.test(v) ? null : 'Teléfono de 10 u 11 dígitos, sin espacios') },
  text: { sanitize: (v) => v.toUpperCase().replace(/[^A-ZÁÉÍÓÚÜÑ0-9 .,#º°/-]/g, ''), maxLength: 120 },
  planCode: { sanitize: digits, maxLength: 6, inputMode: 'numeric', check: (v) => (/^\d{4,6}$/.test(v) ? null : 'Código de 4 a 6 dígitos') },
  section: { sanitize: (v) => v.toUpperCase().replace(/[^A-Z]/g, ''), maxLength: 1, check: (v) => (/^[A-Z]$/.test(v) ? null : 'Una sola letra') },
  areaCode: { sanitize: (v) => v.toUpperCase().replace(/[^A-Z]/g, ''), maxLength: 4, check: (v) => (/^[A-Z]{2,4}$/.test(v) ? null : 'De 2 a 4 letras') },
  areaName: { sanitize: (v) => v.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ ,.]/g, ''), maxLength: 60 },
} satisfies Record<string, FieldRule>;

export function isRealDate(day: string, month: string, year: string) {
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/** Rule per student column, in display order. */
export const STUDENT_RULES: Record<Exclude<keyof FinalSummaryStudent, 'grades'>, FieldRule> = {
  id: RULES.studentId,
  lastNames: RULES.names,
  firstNames: RULES.names,
  birthPlace: RULES.place,
  state: RULES.stateCode,
  sex: RULES.sex,
  birthDay: RULES.day,
  birthMonth: RULES.month,
  birthYear: RULES.birthYear,
};

/** The last area (OV/OC) is graded with letters; the rest with numbers. */
export const gradeRule = (area: number) => (area === AREA_COUNT - 1 ? RULES.letterGrade : RULES.numericGrade);

export interface Issue {
  /** Matches the `data-field` of the input, so the issue list can focus it. */
  field: string;
  label: string;
  message: string;
}

const pad = (i: number) => String(i + 1).padStart(2, '0');

function checkField(issues: Issue[], field: string, label: string, value: string, rule: FieldRule, required: boolean) {
  if (!value.trim()) {
    if (required) issues.push({ field, label, message: 'Falta este dato' });
    return;
  }
  const message = rule.check?.(value.trim());
  if (message) issues.push({ field, label, message });
}

/** Every problem in the form, in reading order. */
export function validateSummary(summary: FinalSummary): Issue[] {
  const issues: Issue[] = [];
  const inst = summary.institution;
  checkField(issues, 'schoolYear', 'Año escolar', summary.schoolYear, RULES.schoolYear, true);
  checkField(issues, 'monthYear', 'Mes y año', summary.monthYear, RULES.monthYear, true);
  checkField(issues, 'institution.code', 'Código de la institución', inst.code, RULES.institutionCode, true);
  checkField(issues, 'institution.name', 'Epónimo', inst.name, RULES.text, true);
  checkField(issues, 'institution.phone', 'Teléfono', inst.phone, RULES.phone, false);
  checkField(issues, 'institution.director', 'Director(a)', inst.director, RULES.names, true);
  checkField(issues, 'institution.directorId', 'Cédula del director(a)', inst.directorId, RULES.personId, true);

  const seen = new Map<string, number>();
  summary.students.forEach((student, i) => {
    const row = `Estudiante ${pad(i)}`;
    (Object.keys(STUDENT_RULES) as (keyof typeof STUDENT_RULES)[]).forEach((key) => {
      const required = key !== 'birthPlace' && key !== 'state';
      checkField(issues, `students.${i}.${key}`, `${row} · ${FIELD_LABELS[key]}`, student[key], STUDENT_RULES[key], required);
    });
    const { birthDay: d, birthMonth: m, birthYear: y } = student;
    if (RULES.day.check(d) === null && RULES.month.check(m) === null && RULES.birthYear.check(y) === null && !isRealDate(d, m, y)) {
      issues.push({ field: `students.${i}.birthDay`, label: `${row} · Fecha de nacimiento`, message: `${d}/${m}/${y} no existe en el calendario` });
    }
    student.grades.forEach((grade, a) => {
      checkField(issues, `students.${i}.grades.${a}`, `${row} · ${summary.areas[a]?.code || `Área ${a + 1}`}`, grade, gradeRule(a), true);
    });
    if (student.id) {
      const first = seen.get(student.id);
      if (first !== undefined) issues.push({ field: `students.${i}.id`, label: `${row} · Cédula`, message: `Repetida: ya la tiene el estudiante ${pad(first)}` });
      else seen.set(student.id, i);
    }
  });

  summary.areas.forEach((area, i) => {
    checkField(issues, `areas.${i}.code`, `Área ${i + 1} · Código`, area.code, RULES.areaCode, true);
    checkField(issues, `areas.${i}.teacher`, `${area.code || `Área ${i + 1}`} · Profesor`, area.teacher, RULES.names, false);
    checkField(issues, `areas.${i}.teacherId`, `${area.code || `Área ${i + 1}`} · Cédula del profesor`, area.teacherId, RULES.personId, Boolean(area.teacher));
  });
  checkField(issues, 'course.planCode', 'Código del plan', summary.course.planCode, RULES.planCode, true);
  checkField(issues, 'course.year', 'Año cursado', summary.course.year, { sanitize: (v) => v, maxLength: 10 }, true);
  checkField(issues, 'course.section', 'Sección', summary.course.section, RULES.section, true);
  checkField(issues, 'remissionDate', 'Fecha de remisión', summary.remissionDate, RULES.date, true);
  return issues;
}

export const FIELD_LABELS: Record<keyof typeof STUDENT_RULES, string> = {
  id: 'Cédula',
  lastNames: 'Apellidos',
  firstNames: 'Nombres',
  birthPlace: 'Lugar de nacimiento',
  state: 'EF',
  sex: 'Sexo',
  birthDay: 'Día',
  birthMonth: 'Mes',
  birthYear: 'Año',
};
