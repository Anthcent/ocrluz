import { AREA_COUNT, COURSE_YEARS, defaultAreas, emptyStudent, emptySummary, KNOWN_AREA_CODES, MAX_STUDENTS, type FinalSummary, type FinalSummaryStudent } from './model.js';

/** A word as returned by OCR.space with `isOverlayRequired`, in image pixels. */
export interface OverlayWord {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ParsedPage {
  summary: FinalSummary;
  warnings: string[];
}

/*
 * The official form is a fixed grid. Column widths (in Excel units, hidden columns = 0) are copied from the
 * template so the parser knows where each field sits relative to the others; anchors found in the photo
 * (area codes and column headers) fix the scale and offset, so any zoom or crop of the photo works.
 */
const COLUMN_WIDTHS = [
  2.855, 4.285, 1.426, 1.0, 1.855, 0.426, 0.285, 0, 0, 0.141, 0.855, 0, 1.426, 1.426, 1.285, 0.57, 1.141, 1.285, 1.711, 3.711, 1.141, 1.0,
  2.285, 1.855, 1.426, 1.855, 1.57, 1.426, 1.855, 1.855, 1.57, 1.57, 3.426, 0, 9.141, 0, 3.0, 2.57, 3.0, 0, 2.711, 1.0, 1.141, 3.711,
  1.141, 3.0, 0.711, 3.141, 1.711, 1.711, 1.285, 2.285, 1.57, 2.141, 2.0, 0.855, 1.0, 2.285, 5.57, 5.711, 5.0,
];

const colIndex = (col: string) => [...col].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
const COLUMN_START = COLUMN_WIDTHS.reduce<number[]>((acc, _w, i) => [...acc, i === 0 ? 0 : acc[i - 1] + COLUMN_WIDTHS[i - 1]], []);
const span = (from: string, to = from) => {
  const start = COLUMN_START[colIndex(from)];
  return { start, end: COLUMN_START[colIndex(to)] + COLUMN_WIDTHS[colIndex(to)] };
};

type StudentField = Exclude<keyof FinalSummaryStudent, 'grades'>;
type Field = 'number' | StudentField | `g${number}`;

const GRADE_SPANS = [span('AS', 'AT'), span('AU', 'AV'), span('AW', 'AX'), span('AY', 'AZ'), span('BA', 'BB'), span('BC', 'BD'), span('BE', 'BF'), span('BG'), span('BH'), span('BI')];

const FIELDS: { field: Field; start: number; end: number }[] = [
  { field: 'number', ...span('A') },
  { field: 'id', ...span('B', 'J') },
  { field: 'lastNames', ...span('K', 'W') },
  { field: 'firstNames', ...span('X', 'AH') },
  { field: 'birthPlace', ...span('AI', 'AJ') },
  { field: 'state', ...span('AK') },
  { field: 'sex', ...span('AL') },
  { field: 'birthDay', ...span('AM', 'AN') },
  { field: 'birthMonth', ...span('AO', 'AP') },
  { field: 'birthYear', ...span('AQ', 'AR') },
  ...GRADE_SPANS.map((s, i) => ({ field: `g${i}` as Field, ...s })),
];

const center = (s: { start: number; end: number }) => (s.start + s.end) / 2;

/** Header words that appear once, with the template column they are centred on. */
const HEADER_ANCHORS: Record<string, number> = {
  APELLIDOS: center(span('K', 'W')),
  NOMBRES: center(span('X', 'AH')),
  SEXO: center(span('AL')),
  DIA: center(span('AM', 'AN')),
  DÍA: center(span('AM', 'AN')),
  MES: center(span('AO', 'AP')),
};

interface Word extends OverlayWord {
  cx: number;
  cy: number;
}

const normalizeToken = (text: string) => text.normalize('NFC').trim().toUpperCase().replace(/[.,:;]+$/, '');

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function linearFit(points: [number, number][]) {
  const n = points.length;
  const mx = points.reduce((s, p) => s + p[0], 0) / n;
  const my = points.reduce((s, p) => s + p[1], 0) / n;
  const sxx = points.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
  const slope = sxx ? points.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / sxx : 0;
  return { slope, intercept: my - slope * mx };
}

/** The row of area codes (LL, ID, MA…): at least five known codes sharing a line. */
function findAreaHeader(words: Word[]) {
  const candidates = words.filter((w) => KNOWN_AREA_CODES.has(normalizeToken(w.text)));
  const height = median(words.map((w) => w.height)) || 10;
  let best: Word[] = [];
  for (const seed of candidates) {
    const row = candidates.filter((w) => Math.abs(w.cy - seed.cy) < height * 1.2);
    const unique = [...new Map(row.map((w) => [normalizeToken(w.text), w])).values()];
    if (unique.length > best.length) best = unique;
  }
  return best.length >= 5 ? best.sort((a, b) => a.cx - b.cx) : null;
}

/** Column of each area code on the form (BAT/BIO and OV/OC share a column depending on the year). */
const AREA_INDEX: Record<string, number> = { LL: 0, ID: 1, MA: 2, EF: 3, BAT: 4, BIO: 4, FI: 5, QU: 6, GHSN: 7, ITP: 8, OV: 9, OC: 9 };

/** Image x → template units, from area-code columns plus unique header words. */
function fitColumns(header: Word[], words: Word[], slope: number, pivot: number) {
  const points: [number, number][] = header.map((w) => [center(GRADE_SPANS[AREA_INDEX[normalizeToken(w.text)]]), w.cx]);
  const headerTop = Math.min(...header.map((w) => w.cy));
  for (const word of words) {
    const anchor = HEADER_ANCHORS[normalizeToken(word.text)];
    if (anchor === undefined) continue;
    const dy = word.cy - slope * (word.cx - pivot) - headerTop;
    if (dy < 0 && dy > -12 * word.height) points.push([anchor, word.cx]);
  }
  const fit = linearFit(points);
  return { toTemplate: (x: number) => (x - fit.intercept) / (fit.slope || 1), scale: fit.slope };
}

const GRADE_FIX: Record<string, string> = { O: '0', Q: '0', D: '0', I: '1', L: '1', '|': '1', '!': '1', Z: '2', S: '5', G: '6', B: '8', T: '7' };

function isGrade(value: string) {
  return value === '*' || /^[A-E]$/.test(value) || (/^\d{1,2}$/.test(value) && Number(value) >= 1 && Number(value) <= 20);
}

/** Normalises one grade cell; the last area may hold letters, the rest are numeric 1–20. */
function cleanGrade(raw: string, letterArea: boolean) {
  const value = raw.toUpperCase().replace(/\s+/g, '');
  if (!value) return '';
  if (/^[*xX]+$/.test(value)) return '*';
  if (letterArea && /^[A-E]$/.test(value)) return value;
  const digits = [...value].map((ch) => GRADE_FIX[ch] ?? ch).join('').replace(/\D/g, '');
  if (!digits) return letterArea ? value.slice(0, 1) : '';
  const n = Number(digits.slice(0, 2));
  return n >= 1 && n <= 20 ? String(n) : digits.slice(0, 2);
}

/** Splits text that OCR merged across several grade columns (e.g. «1520» → 15, 20). */
function splitGrades(text: string, parts: number): string[] | null {
  const value = text.replace(/\s+/g, '').toUpperCase();
  const memo = new Map<string, string[] | null>();
  const go = (rest: string, left: number): string[] | null => {
    const key = `${rest}|${left}`;
    if (memo.has(key)) return memo.get(key)!;
    let result: string[] | null = null;
    if (left === 0) result = rest ? null : [];
    else
      for (const size of [2, 1]) {
        const head = rest.slice(0, size);
        if (head.length !== size || !isGrade(head)) continue;
        const tail = go(rest.slice(size), left - 1);
        if (tail) {
          result = [head, ...tail];
          break;
        }
      }
    memo.set(key, result);
    return result;
  };
  return go(value, parts);
}

const cleanId = (raw: string) => {
  const value = raw.toUpperCase().replace(/[\s.-]/g, '');
  const match = /^([VE])?([\dOQIL|SBZ]{6,9})$/.exec(value);
  if (!match) return value;
  const digits = [...match[2]].map((ch) => GRADE_FIX[ch] ?? ch).join('');
  return `${match[1] ?? 'V'}${digits}`;
};

const cleanDigits = (raw: string, size: number) => {
  const digits = [...raw.toUpperCase()].map((ch) => GRADE_FIX[ch] ?? ch).join('').replace(/\D/g, '');
  return size === 2 && digits.length === 1 ? `0${digits}` : digits.slice(0, size);
};

const cleanName = (raw: string) => raw.toUpperCase().replace(/[^A-ZÁÉÍÓÚÜÑ' .-]/g, '').replace(/\s+/g, ' ').trim();

function buildStudent(cells: Partial<Record<Field, string>>, letterArea: boolean): FinalSummaryStudent | null {
  const s = emptyStudent();
  s.id = cleanId(cells.id ?? '');
  s.lastNames = cleanName(cells.lastNames ?? '');
  s.firstNames = cleanName(cells.firstNames ?? '');
  s.birthPlace = cleanName(cells.birthPlace ?? '');
  s.state = (cells.state ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  const sex = (cells.sex ?? '').toUpperCase().replace(/[^MF]/g, '');
  s.sex = sex.slice(0, 1);
  s.birthDay = cleanDigits(cells.birthDay ?? '', 2);
  s.birthMonth = cleanDigits(cells.birthMonth ?? '', 2);
  s.birthYear = cleanDigits(cells.birthYear ?? '', 4);
  s.grades = Array.from({ length: AREA_COUNT }, (_, i) => cleanGrade(cells[`g${i}`] ?? '', letterArea && i === AREA_COUNT - 1));
  const filler = [s.id, s.lastNames, s.firstNames].every((v) => !v || v === '*');
  return filler ? null : s;
}

const pick = (text: string, re: RegExp) => re.exec(text)?.[1]?.trim().replace(/\s+/g, ' ') ?? '';
const UPPER = 'A-ZÁÉÍÓÚÜÑ';

/** Header and footer fields come from the plain text, which OCR.space returns line by line. */
function parseHeader(text: string, summary: FinalSummary, areaCodes: string[] | null) {
  const flat = text.replace(/\r/g, '');
  summary.schoolYear = pick(flat, /A[ñn]o\s+Escolar:?\s*(\d{4}\s*-\s*\d{4})/i).replace(/\s/g, '');
  summary.evaluationType = /Tipo\s+de\s+Evaluaci[oó]n:?\s*REVISI/i.test(flat) ? 'REVISIÓN' : 'FINAL';
  summary.monthYear = pick(flat, new RegExp(`Mes\\s+y\\s+A[ñn]o:?\\s*([${UPPER}]+\\s+\\d{4})`, 'i')).toUpperCase();
  const inst = summary.institution;
  inst.code = pick(flat, /Instituci[oó]n\s+Educativa:?\s*([A-Z]{2}\d{6,10})/i).toUpperCase();
  inst.name = pick(flat, new RegExp(`Ep[oó]nimo:?\\s*([${UPPER}0-9 .,"'-]+)`, 'i'));
  inst.address = pick(flat, /Direcci[oó]n:?\s*(.+?)(?:\s+Tel[eé]fono|\n|$)/i);
  inst.phone = pick(flat, /Tel[eé]fono:?\s*([\d-]{7,15})/i);
  inst.municipality = pick(flat, new RegExp(`Municipio:?\\s*([${UPPER} ]+?)(?:\\s+Entidad|\\n|$)`, 'i'));
  inst.state = pick(flat, new RegExp(`Entidad\\s+Federal:?\\s*([${UPPER} ]+?)(?:\\s+CDCEE|\\n|$)`, 'i'));
  inst.cdcee = pick(flat, new RegExp(`CDCEE:?\\s*([${UPPER} ]+?)(?:\\n|$)`, 'i'));
  inst.director = pick(flat, new RegExp(`Director\\(?a?\\)?:?\\s*([${UPPER} .]+?)(?:\\s+C[eé]dula|\\n|$)`, 'i'));
  inst.directorId = pick(flat, /Director[\s\S]{0,80}?C[eé]dula\s+de\s+Identidad:?\s*([VE]\s*-?\s*\d{6,9})/i).replace(/[\s-]/g, '');
  summary.remissionDate = pick(flat, /Fecha\s+de\s+Remisi[oó]n:?\s*(\d{1,2}[-/]\d{1,2}[-/]\d{4})/i);

  const course = summary.course;
  course.year = COURSE_YEARS.find((y) => new RegExp(`\\b${y}\\b`).test(flat.toUpperCase())) ?? '';
  course.section = pick(flat, /["“”']\s*([A-Z])\s*["“”']/) || pick(flat, /SECCI[OÓ]N\s*\n?\s*([A-Z])\b/i);
  course.planCode = pick(flat, /C[OÓ]DIGO:?\s*\n?\s*(\d{4,6})/i);
  course.plan = pick(flat, new RegExp(`PLAN\\s+DE\\s+ESTUDIO:?\\s*\\n?\\s*([${UPPER} ]+?)(?:\\n|$)`, 'i'));

  const areas = defaultAreas(course.year || (areaCodes?.includes('BIO') ? 'TERCERO' : 'PRIMERO'));
  if (areaCodes?.length === AREA_COUNT) areaCodes.forEach((code, i) => (areas[i].code = code));
  for (const area of areas) {
    // «5 BAT Biología, Ambiente y Tecnología ARAUJO G. JOSE Y. V5780379»
    const line = flat.split('\n').find((l) => new RegExp(`(^|\\s)${area.code}\\s`, 'i').test(l) && /[VE]\s*-?\s*\d{6,9}/i.test(l));
    if (!line) continue;
    area.teacherId = pick(line, /([VE]\s*-?\s*\d{6,9})/i).replace(/[\s-]/g, '').toUpperCase();
    const afterName = line.slice(line.toUpperCase().indexOf(area.name.toUpperCase()) + area.name.length);
    const teacher = line.toUpperCase().includes(area.name.toUpperCase()) ? afterName : line.replace(new RegExp(`^.*?\\b${area.code}\\b`, 'i'), '');
    area.teacher = cleanName(teacher.replace(/[VE]\s*-?\s*\d{6,9}.*$/i, ''));
  }
  summary.areas = areas;
}

export function parseFinalSummaryPage(text: string, overlay: OverlayWord[]): ParsedPage {
  const warnings: string[] = [];
  const summary = emptySummary();
  const words: Word[] = overlay
    .filter((w) => w.text.trim())
    .map((w) => ({ ...w, cx: w.left + w.width / 2, cy: w.top + w.height / 2 }));

  const header = findAreaHeader(words);
  const codes = header?.map((w) => normalizeToken(w.text));
  parseHeader(text, summary, codes && new Set(codes.map((c) => AREA_INDEX[c])).size === AREA_COUNT ? codes : null);
  if (!header) {
    warnings.push('No se encontró la fila de áreas (LL, ID, MA…). Toma la foto de frente y con toda la tabla visible.');
    return { summary, warnings };
  }
  if (header.length < AREA_COUNT) warnings.push(`Solo se leyeron ${header.length} de los ${AREA_COUNT} códigos de área; revisa las columnas de notas.`);

  // Undo small rotations using the area-code row, which is a straight line on the paper.
  const pivot = header[0].cx;
  const { slope } = linearFit(header.map((w) => [w.cx, w.cy]));
  const straight = (w: Word) => w.cy - slope * (w.cx - pivot);
  const headerY = median(header.map(straight));
  const height = median(words.map((w) => w.height)) || 10;

  const { toTemplate } = fitColumns(header, words, slope, pivot);
  const totalsWord = words.find((w) => /^(INSCRITOS|TOTAL)$/i.test(normalizeToken(w.text)) && straight(w) > headerY);
  const bottom = totalsWord ? straight(totalsWord) - height * 0.6 : Infinity;

  const body = words.filter((w) => straight(w) > headerY + height * 0.8 && straight(w) < bottom).sort((a, b) => straight(a) - straight(b));

  // Group the body into visual rows: a new row starts when the vertical gap exceeds half a line.
  const rows: Word[][] = [];
  for (const word of body) {
    const last = rows.at(-1);
    if (last && straight(word) - median(last.map(straight)) < height * 0.6) last.push(word);
    else rows.push([word]);
  }

  const letterArea = /^(OV|OC)$/.test(summary.areas[AREA_COUNT - 1].code);
  const students: FinalSummaryStudent[] = [];
  for (const row of rows) {
    const cells: Partial<Record<Field, string[]>> = {};
    for (const word of row.sort((a, b) => a.cx - b.cx)) {
      const u0 = toTemplate(word.left);
      const u1 = toTemplate(word.left + word.width);
      const covered = GRADE_SPANS.map((s, i) => ({ i, overlap: Math.min(u1, s.end) - Math.max(u0, s.start), width: s.end - s.start })).filter(
        (c) => c.overlap > c.width * 0.3,
      );
      if (covered.length > 1) {
        const parts = splitGrades(word.text, covered.length);
        if (parts) {
          parts.forEach((part, k) => (cells[`g${covered[k].i}`] ??= []).push(part));
          continue;
        }
      }
      const u = toTemplate(word.cx);
      const field = FIELDS.find((f) => u >= f.start && u < f.end) ?? FIELDS.reduce((a, b) => (Math.abs(center(a) - u) < Math.abs(center(b) - u) ? a : b));
      (cells[field.field] ??= []).push(word.text);
    }
    const joined = Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, v!.join(' ')])) as Partial<Record<Field, string>>;
    // A merged pair that landed in one column («2018») spills into an empty neighbour.
    for (let i = 0; i < AREA_COUNT - 1; i++) {
      const value = (joined[`g${i}`] ?? '').replace(/\s+/g, '');
      if (value.length < 3 || joined[`g${i + 1}`]) continue;
      const parts = splitGrades(value, 2);
      if (parts) [joined[`g${i}`], joined[`g${i + 1}`]] = parts;
    }
    const student = buildStudent(joined, letterArea);
    if (student) students.push(student);
  }

  if (students.length > MAX_STUDENTS) {
    warnings.push(`Se detectaron ${students.length} filas; el formato admite ${MAX_STUDENTS}. Revisa si hay filas duplicadas.`);
  }
  summary.students = students.slice(0, MAX_STUDENTS);
  if (!summary.students.length) warnings.push('No se reconocieron estudiantes en la tabla.');

  const incomplete = summary.students.filter((s) => s.grades.some((g) => !g)).length;
  if (incomplete) warnings.push(`${incomplete} ${incomplete === 1 ? 'estudiante tiene' : 'estudiantes tienen'} notas sin leer: complétalas antes de exportar.`);
  return { summary, warnings };
}
