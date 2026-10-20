import type { FinalSummaryStudent } from '../lib/types';

export const MAX_STUDENTS = 35;
export const AREA_COUNT = 10;
export const COURSE_YEARS = ['PRIMERO', 'SEGUNDO', 'TERCERO', 'CUARTO', 'QUINTO'];

export type GradeOutcome = 'approved' | 'failed' | 'absent' | 'notTaken' | 'none';

/** Mirrors the server: 1–20 passes at 10, letters A–C pass and D–E fail, «*» is not enrolled. */
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


export function emptyStudent(): FinalSummaryStudent {
  return { id: '', lastNames: '', firstNames: '', birthPlace: '', state: '', sex: '', birthDay: '', birthMonth: '', birthYear: '', grades: Array(AREA_COUNT).fill('') };
}

export function summaryTitle(s: { evaluationType: string; course: { year: string; section: string }; schoolYear: string }) {
  const course = [s.course.year, s.course.section && `«${s.course.section}»`].filter(Boolean).join(' ');
  return `Resumen ${s.evaluationType === 'REVISIÓN' ? 'de revisión' : 'final'}${course ? ` · ${course}` : ''}${s.schoolYear ? ` · ${s.schoolYear}` : ''}`;
}
