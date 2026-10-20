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

const text = (max: number) => z.string().trim().max(max).default('');

const studentSchema = z.object({
  id: text(20),
  lastNames: text(80),
  firstNames: text(80),
  birthPlace: text(60),
  state: text(6),
  sex: text(2),
  birthDay: text(2),
  birthMonth: text(2),
  birthYear: text(4),
  grades: z.array(text(4)).length(AREA_COUNT),
});

const areaSchema = z.object({ code: text(8), name: text(80), teacher: text(80), teacherId: text(20) });

export const finalSummarySchema = z.object({
  evaluationType: z.enum(['FINAL', 'REVISIÓN']).default('FINAL'),
  schoolYear: text(20),
  monthYear: text(30),
  institution: z
    .object({
      code: text(30),
      name: text(120),
      address: text(200),
      phone: text(30),
      municipality: text(60),
      state: text(60),
      cdcee: text(60),
      director: text(120),
      directorId: text(20),
    })
    .default({ code: '', name: '', address: '', phone: '', municipality: '', state: '', cdcee: '', director: '', directorId: '' }),
  course: z
    .object({ plan: text(80), planCode: text(20), year: text(20), section: text(4) })
    .default({ plan: '', planCode: '', year: '', section: '' }),
  areas: z.array(areaSchema).length(AREA_COUNT),
  students: z.array(studentSchema).max(MAX_STUDENTS, `El formato admite hasta ${MAX_STUDENTS} estudiantes por página`),
  observations: text(1000),
  remissionDate: text(20),
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
  if (/^\d{1,2}$/.test(value)) return Number(value) >= 10 ? 'approved' : 'failed';
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
