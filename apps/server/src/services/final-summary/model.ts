import { z } from 'zod';

/** Rows available for students on one page of the official form. */
export const MAX_STUDENTS = 35;
export const AREA_COUNT = 10;

export const COURSE_YEARS = ['PRIMERO', 'SEGUNDO', 'TERCERO', 'CUARTO', 'QUINTO'] as const;

const LOWER_AREAS = [
  { code: 'LL', name: 'Lengua y Literatura' },
  { code: 'ID', name: 'Idiomas' },
  { code: 'MA', name: 'Matemática' },
  { code: 'EF', name: 'Educación Física' },
  { code: 'BAT', name: 'Biología, Ambiente y Tecnología' },
  { code: 'FI', name: 'Física' },
  { code: 'QU', name: 'Química' },
  { code: 'GHSN', name: 'Geografía, Historia y Soberanía Nacional' },
  { code: 'ITP', name: 'Innovación Tecnológica y Productiva' },
  { code: 'OV', name: 'Orientación Vocacional' },
];

const UPPER_AREAS = LOWER_AREAS.map((area) =>
  area.code === 'BAT' ? { code: 'BIO', name: 'Biología' } : area.code === 'OV' ? { code: 'OC', name: 'Orientación y Convivencia' } : area,
);

/** First and second year use BAT/OV; from third year on the form uses BIO/OC. */
export function defaultAreas(courseYear: string) {
  return (courseYear === 'PRIMERO' || courseYear === 'SEGUNDO' ? LOWER_AREAS : UPPER_AREAS).map((a) => ({ ...a, teacher: '', teacherId: '' }));
}

export const KNOWN_AREA_CODES = new Set([...LOWER_AREAS, ...UPPER_AREAS].map((a) => a.code));

/*
 * Every field keeps only the characters its kind of data can hold and is cut to its length,
 * so OCR noise never reaches the database or the Excel file. Format checks that need the whole
 * value (real dates, grade ranges) are reported to the user by the editor instead of rejected here.
 */
const field = (allowed: RegExp, max: number, upper = true) =>
  z
    .string()
    .max(2000)
    .default('')
    .transform((value) => (upper ? value.toUpperCase() : value).replace(allowed, '').replace(/\s+/g, ' ').trim().slice(0, max));

const LETTERS = /[^A-ZÁÉÍÓÚÜÑ .'-]/g;
const DIGITS = /\D/g;
const ID = /[^VE0-9]/g;
const TEXT = /[^A-ZÁÉÍÓÚÜÑ0-9 .,#º°/-]/g;

const studentSchema = z.object({
  id: field(ID, 12),
  lastNames: field(LETTERS, 60),
  firstNames: field(LETTERS, 60),
  birthPlace: field(LETTERS, 40),
  state: field(/[^A-Z]/g, 3),
  sex: field(/[^MF]/g, 1),
  birthDay: field(DIGITS, 2),
  birthMonth: field(DIGITS, 2),
  birthYear: field(DIGITS, 4),
  grades: z.array(field(/[^0-9A-Z*]/g, 2)).length(AREA_COUNT),
});

const areaSchema = z.object({
  code: field(/[^A-Z]/g, 4),
  name: field(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ ,.]/g, 80, false),
  teacher: field(LETTERS, 80),
  teacherId: field(ID, 10),
});

const emptyInstitution = { code: '', name: '', address: '', phone: '', municipality: '', state: '', cdcee: '', director: '', directorId: '' };

export const finalSummarySchema = z.object({
  evaluationType: z.enum(['FINAL', 'REVISIÓN']).default('FINAL'),
  schoolYear: field(/[^\d-]/g, 9),
  monthYear: field(/[^A-Z0-9 ]/g, 15),
  institution: z
    .object({
      code: field(/[^A-Z0-9]/g, 12),
      name: field(TEXT, 120),
      address: field(TEXT, 200),
      phone: field(DIGITS, 11),
      municipality: field(LETTERS, 60),
      state: field(LETTERS, 60),
      cdcee: field(LETTERS, 60),
      director: field(LETTERS, 120),
      directorId: field(ID, 10),
    })
    .default(emptyInstitution),
  course: z
    .object({ plan: field(TEXT, 80), planCode: field(DIGITS, 6), year: field(/[^A-Z]/g, 10), section: field(/[^A-Z]/g, 1) })
    .default({ plan: '', planCode: '', year: '', section: '' }),
  areas: z.array(areaSchema).length(AREA_COUNT),
  students: z.array(studentSchema).max(MAX_STUDENTS, `El formato admite hasta ${MAX_STUDENTS} estudiantes por página`),
  observations: z
    .string()
    .max(1000)
    .default('')
    .transform((v) => v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim()),
  remissionDate: field(/[^\d-]/g, 10),
});

export type FinalSummary = z.infer<typeof finalSummarySchema>;
export type FinalSummaryStudent = FinalSummary['students'][number];

export function emptyStudent(): FinalSummaryStudent {
  return { id: '', lastNames: '', firstNames: '', birthPlace: '', state: '', sex: '', birthDay: '', birthMonth: '', birthYear: '', grades: Array(AREA_COUNT).fill('') };
}

export function emptySummary(courseYear = 'PRIMERO'): FinalSummary {
  return finalSummarySchema.parse({ course: { year: courseYear }, areas: defaultAreas(courseYear), students: [] });
}

export type GradeOutcome = 'approved' | 'failed' | 'absent' | 'notTaken' | 'none';

/** Grades are 1–20 (pass at 10) or a letter A–E for the last area; «*» marks an area the student does not take. */
export function gradeOutcome(raw: string): GradeOutcome {
  const value = raw.trim().toUpperCase();
  if (!value || value === '*') return 'none';
  if (value === 'I' || value === 'IN') return 'absent';
  if (value === 'NC') return 'notTaken';
  // Out-of-range numbers are typos the editor flags; they must not count in the totals.
  if (/^\d{1,2}$/.test(value)) return Number(value) < 1 || Number(value) > 20 ? 'none' : Number(value) >= 10 ? 'approved' : 'failed';
  if (/^[ABC]$/.test(value)) return 'approved';
  if (/^[DE]$/.test(value)) return 'failed';
  return 'none';
}

export interface AreaTotals {
  enrolled: number;
  absent: number;
  approved: number;
  failed: number;
  notTaken: number;
}

export function computeTotals(students: FinalSummaryStudent[]): AreaTotals[] {
  return Array.from({ length: AREA_COUNT }, (_, area) => {
    const totals: AreaTotals = { enrolled: 0, absent: 0, approved: 0, failed: 0, notTaken: 0 };
    for (const student of students) {
      const outcome = gradeOutcome(student.grades[area] ?? '');
      if (outcome === 'none') continue;
      totals.enrolled++;
      totals[outcome]++;
    }
    return totals;
  });
}

export function summaryTitle(s: FinalSummary) {
  const course = [s.course.year, s.course.section && `«${s.course.section}»`].filter(Boolean).join(' ');
  return `Resumen ${s.evaluationType === 'REVISIÓN' ? 'de revisión' : 'final'}${course ? ` · ${course}` : ''}${s.schoolYear ? ` · ${s.schoolYear}` : ''}`;
}
