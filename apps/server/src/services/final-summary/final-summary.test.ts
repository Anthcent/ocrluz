import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { computeTotals, emptySummary, gradeOutcome, type FinalSummary } from './model.js';
import { parseFinalSummaryPage, type OverlayWord } from './parse.js';
import { buildFinalSummaryXlsx } from './xlsx.js';

// Same geometry the parser uses, so the synthetic «photo» lines up with the real form.
const WIDTHS = [
  2.855, 4.285, 1.426, 1.0, 1.855, 0.426, 0.285, 0, 0, 0.141, 0.855, 0, 1.426, 1.426, 1.285, 0.57, 1.141, 1.285, 1.711, 3.711, 1.141, 1.0,
  2.285, 1.855, 1.426, 1.855, 1.57, 1.426, 1.855, 1.855, 1.57, 1.57, 3.426, 0, 9.141, 0, 3.0, 2.57, 3.0, 0, 2.711, 1.0, 1.141, 3.711,
  1.141, 3.0, 0.711, 3.141, 1.711, 1.711, 1.285, 2.285, 1.57, 2.141, 2.0, 0.855, 1.0, 2.285, 5.57, 5.711, 5.0,
];
const col = (c: string) => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
const start = (c: string) => WIDTHS.slice(0, col(c)).reduce((a, b) => a + b, 0);
const end = (c: string) => start(c) + WIDTHS[col(c)];
const mid = (a: string, b = a) => (start(a) + end(b)) / 2;

const GRADE_COLS: [string, string][] = [
  ['AS', 'AT'], ['AU', 'AV'], ['AW', 'AX'], ['AY', 'AZ'], ['BA', 'BB'], ['BC', 'BD'], ['BE', 'BF'], ['BG', 'BG'], ['BH', 'BH'], ['BI', 'BI'],
];

const STUDENTS = [
  { id: 'V30000001', lastNames: 'GOMEZ PEREZ', firstNames: 'ANA SOFIA', birthPlace: 'TRUJILLO', state: 'TR', sex: 'F', birthDay: '17', birthMonth: '07', birthYear: '2012', grades: ['16', '20', '18', '19', '18', '18', '18', '20', '18', 'A'] },
  { id: 'V30000002', lastNames: 'DIAZ ROJAS', firstNames: 'LUIS ALBERTO', birthPlace: 'VALERA', state: 'TR', sex: 'M', birthDay: '03', birthMonth: '11', birthYear: '2013', grades: ['8', '12', '9', '14', '15', '10', '11', '13', '12', 'A'] },
  { id: 'V30000003', lastNames: 'LINARES', firstNames: 'MARIA', birthPlace: 'TRUJILLO', state: 'TR', sex: 'F', birthDay: '25', birthMonth: '04', birthYear: '2013', grades: ['15', '20', '16', '17', '17', '15', '14', '17', '17', 'D'] },
];

const HEADER_TEXT = [
  'RESUMEN FINAL DEL RENDIMIENTO ESTUDIANTIL',
  'I. Año Escolar: 2025-2026',
  'Tipo de Evaluación: FINAL Mes y Año: JULIO 2026',
  'Código de la Institución Educativa: OD00000001 Epónimo: LICEO DE PRUEBA',
  'Dirección: CALLE PRINCIPAL SECTOR CENTRO Teléfono: 02720000000',
  'Municipio: TRUJILLO Entidad Federal: TRUJILLO CDCEE: TRUJILLO',
  'Director(a): PEREZ GOMEZ ANA Cédula de Identidad: V12345678',
  '1 LL Lengua y Literatura RAMIREZ L. JOSE V5000001',
  '3 MA Matemática TORRES P. ANA V5000003',
  'PLAN DE ESTUDIO:',
  'CIENCIA Y TECNOLOGÍA',
  'CÓDIGO:',
  '31060',
  'AÑO CURSADO',
  'PRIMERO',
  'SECCIÓN',
  '"D"',
  'VIII. Fecha de Remisión: 31-07-2026',
].join('\n');

interface Transform {
  scale: number;
  dx: number;
  dy: number;
  angle: number;
}

/** Lays words out on the form grid, then zooms, shifts and rotates them like a real photo would. */
function photo(entries: { text: string; u: number; row: number }[], t: Transform): OverlayWord[] {
  const rowHeight = 2.2; // template units per form row
  const charWidth = 0.55;
  return entries.flatMap(({ text, u, row }) => {
    const words = text.split(' ');
    const total = words.join(' ').length * charWidth;
    let x = u - total / 2;
    return words.map((word) => {
      const width = word.length * charWidth;
      const cx = x + width / 2;
      x += width + charWidth;
      const cy = row * rowHeight;
      const rx = cx * Math.cos(t.angle) - cy * Math.sin(t.angle);
      const ry = cx * Math.sin(t.angle) + cy * Math.cos(t.angle);
      const h = 1.4 * t.scale;
      const w = width * t.scale;
      return { text: word, left: rx * t.scale + t.dx - w / 2, top: ry * t.scale + t.dy - h / 2, width: w, height: h };
    });
  });
}

function formEntries(students: typeof STUDENTS, codes = ['LL', 'ID', 'MA', 'EF', 'BAT', 'FI', 'QU', 'GHSN', 'ITP', 'OV']) {
  const entries: { text: string; u: number; row: number }[] = [
    { text: 'Apellidos', u: mid('K', 'W'), row: 13 },
    { text: 'Nombres', u: mid('X', 'AH'), row: 13 },
    { text: 'SEXO', u: mid('AL'), row: 13 },
    { text: 'DIA', u: mid('AM', 'AN'), row: 15 },
    { text: 'MES', u: mid('AO', 'AP'), row: 15 },
    ...codes.map((code, i) => ({ text: code, u: mid(...GRADE_COLS[i]), row: 16 })),
  ];
  students.forEach((s, i) => {
    const row = 17 + i;
    entries.push(
      { text: String(i + 1).padStart(2, '0'), u: mid('A'), row },
      { text: s.id, u: mid('B', 'J'), row },
      { text: s.lastNames, u: mid('K', 'W'), row },
      { text: s.firstNames, u: mid('X', 'AH'), row },
      { text: s.birthPlace, u: mid('AI', 'AJ'), row },
      { text: s.state, u: mid('AK'), row },
      { text: s.sex, u: mid('AL'), row },
      { text: s.birthDay, u: mid('AM', 'AN'), row },
      { text: s.birthMonth, u: mid('AO', 'AP'), row },
      { text: s.birthYear, u: mid('AQ', 'AR'), row },
      ...s.grades.map((g, a) => ({ text: g, u: mid(...GRADE_COLS[a]), row })),
    );
  });
  for (let r = students.length; r < students.length + 2; r++) {
    entries.push({ text: '*', u: mid('B', 'J'), row: 17 + r }, { text: '*', u: mid('K', 'W'), row: 17 + r });
  }
  entries.push({ text: 'Inscritos', u: mid('X', 'AH'), row: 52 });
  return entries;
}

describe('parseFinalSummaryPage', () => {
  it('rebuilds students, grades and header from a zoomed, shifted and slightly rotated photo', () => {
    const overlay = photo(formEntries(STUDENTS), { scale: 23, dx: 140, dy: -180, angle: 0.012 });
    const { summary, warnings } = parseFinalSummaryPage(HEADER_TEXT, overlay);

    expect(warnings).toEqual([]);
    expect(summary.students).toHaveLength(3);
    expect(summary.students).toEqual(STUDENTS);
    expect(summary.areas.map((a) => a.code)).toEqual(['LL', 'ID', 'MA', 'EF', 'BAT', 'FI', 'QU', 'GHSN', 'ITP', 'OV']);
    expect(summary).toMatchObject({
      schoolYear: '2025-2026',
      evaluationType: 'FINAL',
      monthYear: 'JULIO 2026',
      remissionDate: '31-07-2026',
      institution: { code: 'OD00000001', name: 'LICEO DE PRUEBA', phone: '02720000000', municipality: 'TRUJILLO', director: 'PEREZ GOMEZ ANA', directorId: 'V12345678' },
      course: { plan: 'CIENCIA Y TECNOLOGÍA', planCode: '31060', year: 'PRIMERO', section: 'D' },
    });
    expect(summary.areas[0]).toMatchObject({ teacher: 'RAMIREZ L. JOSE', teacherId: 'V5000001' });
    expect(summary.areas[2]).toMatchObject({ teacher: 'TORRES P. ANA', teacherId: 'V5000003' });
  });

  it('fixes common OCR confusions and splits grades merged across columns', () => {
    const entries = formEntries([STUDENTS[0]]);
    const g = (text: string) => entries.find((e) => e.row === 17 && e.text === text && e.u > start('AS'))!;
    g('16').text = 'l6';
    entries.find((e) => e.row === 17 && e.text === 'V30000001')!.text = 'V3OOOOOO1';
    // «20» and «18» in the second and third area come back as one word spanning both columns.
    const second = entries.findIndex((e) => e.row === 17 && e.u === mid('AU', 'AV'));
    entries.splice(second, 2, { text: '2018', u: (mid('AU', 'AV') + mid('AW', 'AX')) / 2, row: 17 });
    const { summary } = parseFinalSummaryPage(HEADER_TEXT, photo(entries, { scale: 15, dx: 0, dy: 0, angle: 0 }));
    expect(summary.students[0].id).toBe('V30000001');
    expect(summary.students[0].grades.slice(0, 4)).toEqual(['16', '20', '18', '19']);
  });

  it('detects third-year areas and keeps going when one code is unreadable', () => {
    const codes = ['LL', 'ID', 'MA', 'EF', 'BIO', 'FI', 'QU', 'GHSN', 'ITP', 'OC'];
    const entries = formEntries([STUDENTS[0]], codes).filter((e) => e.text !== 'QU');
    const text = HEADER_TEXT.replace('PRIMERO', 'TERCERO');
    const { summary, warnings } = parseFinalSummaryPage(text, photo(entries, { scale: 18, dx: 30, dy: 10, angle: -0.008 }));
    expect(summary.areas.map((a) => a.code)).toEqual(codes);
    expect(summary.students[0].grades).toEqual(STUDENTS[0].grades);
    expect(warnings.join(' ')).toContain('9 de los 10');
  });

  it('explains what went wrong when the area header is missing', () => {
    const { summary, warnings } = parseFinalSummaryPage('texto suelto', photo([{ text: 'hola', u: 10, row: 20 }], { scale: 10, dx: 0, dy: 0, angle: 0 }));
    expect(summary.students).toEqual([]);
    expect(warnings[0]).toContain('fila de áreas');
  });
});

describe('totals', () => {
  it('counts like the official files: «*» is not enrolled, letters A–C pass and D–E fail', () => {
    expect(['15', '9', 'A', 'D', '*', '', 'I', 'NC'].map(gradeOutcome)).toEqual(['approved', 'failed', 'approved', 'failed', 'none', 'none', 'absent', 'notTaken']);
    const totals = computeTotals(STUDENTS);
    expect(totals[0]).toEqual({ enrolled: 3, absent: 0, approved: 2, failed: 1, notTaken: 0 });
    expect(totals[9]).toEqual({ enrolled: 3, absent: 0, approved: 2, failed: 1, notTaken: 0 });
  });
});

describe('buildFinalSummaryXlsx', () => {
  const cell = (xml: string, ref: string) => {
    const m = new RegExp(`<c r="${ref}"[^>]*?(?:/>|>([\\s\\S]*?)</c>)`).exec(xml);
    if (!m?.[1]) return '';
    return /<t[^>]*>([\s\S]*?)<\/t>/.exec(m[1])?.[1] ?? /<v>([\s\S]*?)<\/v>/.exec(m[1])?.[1] ?? '';
  };

  it('writes data into the exact template cells and keeps the rest of the package', () => {
    const summary: FinalSummary = { ...emptySummary('PRIMERO'), schoolYear: '2025-2026', students: STUDENTS };
    summary.course = { plan: 'CIENCIA Y TECNOLOGÍA', planCode: '31060', year: 'PRIMERO', section: 'D' };
    summary.areas[9].teacherId = 'V9999999';
    const files = unzipSync(buildFinalSummaryXlsx(summary));
    const xml = strFromU8(files['xl/worksheets/sheet1.xml']);

    expect(cell(xml, 'AW4')).toBe('2025-2026');
    expect(cell(xml, 'B17')).toBe('V30000001');
    expect(cell(xml, 'AS17')).toBe('16');
    expect(cell(xml, 'BI19')).toBe('D');
    expect(cell(xml, 'B20')).toBe('*');
    expect(cell(xml, 'AS52')).toBe('3');
    expect(cell(xml, 'AS55')).toBe('1');
    expect(cell(xml, 'BA16')).toBe('BAT');
    expect(cell(xml, 'AK68')).toBe('V9999999');
    expect(cell(xml, 'BC65')).toBe('&quot;D&quot;');
    expect(cell(xml, 'BC68')).toBe('3');
    expect(xml.match(/<mergeCell /g)).toHaveLength(595);
    expect(files['xl/media/image1.png']).toBeDefined();
  });

  it('refuses more students than one page holds', () => {
    const summary = { ...emptySummary(), students: Array(36).fill(STUDENTS[0]) };
    expect(() => buildFinalSummaryXlsx(summary)).toThrow();
  });
});
