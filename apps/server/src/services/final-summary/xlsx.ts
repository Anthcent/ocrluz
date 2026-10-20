import { readFileSync } from 'node:fs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { AREA_COUNT, computeTotals, MAX_STUDENTS, type FinalSummary } from './model.js';

/*
 * Fills the official «Resumen Final» workbook by writing cell values straight into the sheet XML.
 * Every other part of the package (styles, merged cells, letterhead image, print setup) is left untouched,
 * so the result prints exactly like the hand-made files.
 */

const TEMPLATE_URL = new URL('../../../assets/resumen-final-plantilla.xlsx', import.meta.url);
const SHEET = 'xl/worksheets/sheet1.xml';

const FIRST_STUDENT_ROW = 17;
const GRADE_COLUMNS = ['AS', 'AU', 'AW', 'AY', 'BA', 'BC', 'BE', 'BG', 'BH', 'BI'];
const STUDENT_COLUMNS = {
  id: 'B',
  lastNames: 'K',
  firstNames: 'X',
  birthPlace: 'AI',
  state: 'AK',
  sex: 'AL',
  birthDay: 'AM',
  birthMonth: 'AO',
  birthYear: 'AQ',
} as const;
const TOTAL_ROWS = { enrolled: 52, absent: 53, approved: 54, failed: 55, notTaken: 56 } as const;
const FIRST_AREA_ROW = 59;

let template: Uint8Array | null = null;
const loadTemplate = () => (template ??= new Uint8Array(readFileSync(TEMPLATE_URL)));

const columnNumber = (col: string) => [...col].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

function escapeXml(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cellXml(ref: string, attrs: string, value: string | number) {
  const base = attrs.replace(/\s+t="[^"]*"/, '');
  if (typeof value === 'number') return `<c r="${ref}"${base}><v>${value}</v></c>`;
  if (value === '') return `<c r="${ref}"${base}/>`;
  return `<c r="${ref}"${base} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

class SheetWriter {
  constructor(private xml: string) {}

  set(ref: string, value: string | number) {
    const existing = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`).exec(this.xml);
    if (existing) {
      this.xml = this.xml.slice(0, existing.index) + cellXml(ref, existing[1], value) + this.xml.slice(existing.index + existing[0].length);
      return;
    }
    this.insert(ref, value);
  }

  /** Cells the template never styled are inserted in column order, as the spec requires. */
  private insert(ref: string, value: string | number) {
    const [, col, row] = /^([A-Z]+)(\d+)$/.exec(ref)!;
    const rowMatch = new RegExp(`<row r="${row}"([^>]*?)(/>|>([\\s\\S]*?)</row>)`).exec(this.xml);
    if (!rowMatch) throw new Error(`Template row ${row} not found`);
    const cell = cellXml(ref, '', value);
    let body = rowMatch[3] ?? '';
    const target = columnNumber(col);
    const next = [...body.matchAll(/<c r="([A-Z]+)\d+"/g)].find((m) => columnNumber(m[1]) > target);
    body = next ? body.slice(0, next.index) + cell + body.slice(next.index) : body + cell;
    const rebuilt = `<row r="${row}"${rowMatch[1]}>${body}</row>`;
    this.xml = this.xml.slice(0, rowMatch.index) + rebuilt + this.xml.slice(rowMatch.index + rowMatch[0].length);
  }

  toString() {
    return this.xml;
  }
}

/** Grades and the plan code are numbers in the official files; everything else stays text. */
const asNumberIfDigits = (value: string) => (/^\d{1,6}$/.test(value) ? Number(value) : value);

function formatId(id: string) {
  const match = /^([VE])\s*-?\s*(\d+)$/i.exec(id.trim());
  return match ? `${match[1].toUpperCase()} ${match[2]}` : id;
}

export function buildFinalSummaryXlsx(summary: FinalSummary): Uint8Array {
  if (summary.students.length > MAX_STUDENTS) throw new Error(`At most ${MAX_STUDENTS} students fit on one page`);
  const files = unzipSync(loadTemplate());
  const sheet = new SheetWriter(strFromU8(files[SHEET]));
  const { institution: inst, course } = summary;

  sheet.set('AW4', summary.schoolYear);
  sheet.set('AO5', `Tipo de Evaluación:  ${summary.evaluationType}`);
  sheet.set('BG5', `Mes y Año: ${summary.monthYear}`);
  sheet.set('A7', `Código de la Institución Educativa: ${inst.code}`);
  sheet.set('AD7', `Epónimo: ${inst.name}`);
  sheet.set('A8', `Dirección:  ${inst.address}`);
  sheet.set('AP8', inst.phone);
  sheet.set('A9', `Municipio:  ${inst.municipality}`);
  sheet.set('AE9', inst.state);
  sheet.set('AR9', inst.cdcee);
  sheet.set('A10', `Director(a):   ${inst.director}`);
  sheet.set('AK10', `Cédula de Identidad:  ${inst.directorId}`);

  summary.areas.forEach((area, i) => {
    sheet.set(`${GRADE_COLUMNS[i]}16`, area.code);
    const row = FIRST_AREA_ROW + i;
    sheet.set(`B${row}`, area.code);
    sheet.set(`C${row}`, area.name);
    sheet.set(`U${row}`, area.teacher);
    // The last two rows of the template merge the id cell one column further right.
    sheet.set(`${row >= 67 ? 'AK' : 'AJ'}${row}`, area.teacherId);
  });

  for (let i = 0; i < MAX_STUDENTS; i++) {
    const row = FIRST_STUDENT_ROW + i;
    const student = summary.students[i];
    for (const [key, col] of Object.entries(STUDENT_COLUMNS)) {
      sheet.set(`${col}${row}`, student ? student[key as keyof typeof STUDENT_COLUMNS] : '*');
    }
    for (let a = 0; a < AREA_COUNT; a++) {
      sheet.set(`${GRADE_COLUMNS[a]}${row}`, student ? asNumberIfDigits(student.grades[a] ?? '') : '*');
    }
  }

  computeTotals(summary.students).forEach((totals, a) => {
    for (const [key, row] of Object.entries(TOTAL_ROWS)) sheet.set(`${GRADE_COLUMNS[a]}${row}`, totals[key as keyof typeof TOTAL_ROWS]);
  });

  sheet.set('BC59', course.plan);
  sheet.set('BC61', asNumberIfDigits(course.planCode));
  sheet.set('BC63', course.year);
  sheet.set('BC65', course.section ? `"${course.section}"` : '');
  sheet.set('BC68', summary.students.length);
  sheet.set('BH68', summary.students.length);
  sheet.set('A70', summary.observations);
  sheet.set('A71', `VIII. Fecha de Remisión: ${summary.remissionDate}`);
  sheet.set('A74', inst.director);
  sheet.set('A76', formatId(inst.directorId));

  files[SHEET] = strToU8(sheet.toString());
  return zipSync(files, { level: 6 });
}

export function finalSummaryFileName(summary: FinalSummary) {
  const kind = summary.evaluationType === 'REVISIÓN' ? 'REVISION' : 'REGULAR';
  const course = [summary.course.year, summary.course.section].filter(Boolean).join('_') || 'SIN_CURSO';
  return `RESUMEN_FINAL_${kind}_${course}.xlsx`.replace(/[^A-Za-z0-9_.-]+/g, '_');
}
