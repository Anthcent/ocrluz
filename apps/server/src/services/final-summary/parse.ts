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
 * template so the parser knows where each field sits relative to the others. Photos are zoomed, tilted and
 * seen in perspective, so the image→template mapping is fitted per student row from values every row has
 * (the id on the left, birth year, sex, the letter grade on the right), falling back to the area-code header.
 */
const COLUMN_WIDTHS = [
  2.855, 4.285, 1.426, 1.0, 1.855, 0.426, 0.285, 0, 0, 0.141, 0.855, 0, 1.426, 1.426, 1.285, 0.57, 1.141, 1.285, 1.711, 3.711, 1.141, 1.0,
  2.285, 1.855, 1.426, 1.855, 1.57, 1.426, 1.855, 1.855, 1.57, 1.57, 3.426, 0, 9.141, 0, 3.0, 2.57, 3.0, 0, 2.711, 1.0, 1.141, 3.711,
  1.141, 3.0, 0.711, 3.141, 1.711, 1.711, 1.285, 2.285, 1.57, 2.141, 2.0, 0.855, 1.0, 2.285, 5.57, 5.711, 5.0,
];

const colIndex = (col: string) => [...col].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
const COLUMN_START = COLUMN_WIDTHS.reduce<number[]>((acc, _w, i) => [...acc, i === 0 ? 0 : acc[i - 1] + COLUMN_WIDTHS[i - 1]], []);
const span = (from: string, to = from) => ({ start: COLUMN_START[colIndex(from)], end: COLUMN_START[colIndex(to)] + COLUMN_WIDTHS[colIndex(to)] });
const center = (s: { start: number; end: number }) => (s.start + s.end) / 2;

type StudentField = Exclude<keyof FinalSummaryStudent, 'grades'>;
type Field = 'number' | StudentField | `g${number}`;

const GRADE_SPANS = [span('AS', 'AT'), span('AU', 'AV'), span('AW', 'AX'), span('AY', 'AZ'), span('BA', 'BB'), span('BC', 'BD'), span('BE', 'BF'), span('BG'), span('BH'), span('BI')];
const SPANS = {
  number: span('A'),
  id: span('B', 'J'),
  lastNames: span('K', 'W'),
  firstNames: span('X', 'AH'),
  birthPlace: span('AI', 'AJ'),
  state: span('AK'),
  sex: span('AL'),
  birthDay: span('AM', 'AN'),
  birthMonth: span('AO', 'AP'),
  birthYear: span('AQ', 'AR'),
};
const FIELDS: { field: Field; start: number; end: number }[] = [
  ...Object.entries(SPANS).map(([field, s]) => ({ field: field as Field, ...s })),
  ...GRADE_SPANS.map((s, i) => ({ field: `g${i}` as Field, ...s })),
];
const TABLE_WIDTH = GRADE_SPANS[AREA_COUNT - 1].end;

/** Column of each area code on the form (BAT/BIO and OV/OC share a column depending on the year). */
const AREA_INDEX: Record<string, number> = { LL: 0, ID: 1, MA: 2, EF: 3, BAT: 4, BIO: 4, FI: 5, QU: 6, GHSN: 7, ITP: 8, OV: 9, OC: 9 };

/** Header words that appear once, with the template column they are centred on. */
const HEADER_ANCHORS: Record<string, number> = {
  APELLIDOS: center(SPANS.lastNames),
  NOMBRES: center(SPANS.firstNames),
  SEXO: center(SPANS.sex),
  DIA: center(SPANS.birthDay),
  MES: center(SPANS.birthMonth),
};

interface Word extends OverlayWord {
  cx: number;
  cy: number;
}

interface Fit {
  scale: number;
  offset: number;
}
const toTemplate = (fit: Fit, x: number) => (x - fit.offset) / fit.scale;

const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

function linearFit(points: [number, number][]) {
  const n = points.length;
  const mx = points.reduce((s, p) => s + p[0], 0) / n;
  const my = points.reduce((s, p) => s + p[1], 0) / n;
  const sxx = points.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
  const slope = sxx ? points.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / sxx : 0;
  return { slope, intercept: my - slope * mx };
}

const deaccent = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '');
const lettersOnly = (text: string) => deaccent(text).toUpperCase().replace(/[^A-Z]/g, '');

function levenshtein(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

/**
 * Reads an area code through OCR noise: «EF|», «BAT)», «QUÍ», «Ma». A word one letter off several codes
 * («IP»: ID or ITP) returns them all; the left-to-right order of the header picks the right one.
 */
function areaCodes(raw: string): string[] {
  const text = lettersOnly(raw);
  if (text.length < 2 || text.length > 5) return [];
  if (KNOWN_AREA_CODES.has(text)) return [text];
  return [...KNOWN_AREA_CODES].filter((code) => levenshtein(text, code) === 1);
}

// Table rules read as characters: «|TR]F», «[17]», «2012)».
const BORDER = /[|[\]{}()_=~—–«»<>¦]+/;

/** Removes rule characters and splits a word where they sat, giving each part its share of the box. */
function splitBorders(word: OverlayWord): OverlayWord[] {
  const text = word.text.trim();
  if (!BORDER.test(text)) return text ? [word] : [];
  const parts: OverlayWord[] = [];
  const perChar = word.width / Math.max(text.length, 1);
  let index = 0;
  for (const piece of text.split(new RegExp(`(${BORDER.source})`))) {
    if (piece && !BORDER.test(piece)) parts.push({ ...word, text: piece, left: word.left + index * perChar, width: piece.length * perChar });
    index += piece.length;
  }
  return parts;
}

const DIGIT_FIX: Record<string, string> = { O: '0', Q: '0', D: '0', U: '0', I: '1', L: '1', '|': '1', '!': '1', Z: '2', S: '5', G: '6', B: '8', T: '7' };
const fixDigits = (text: string) => [...text.toUpperCase()].map((ch) => DIGIT_FIX[ch] ?? ch).join('');

/** «V34256276», also from «34256276», «YV34941335» or «134571389» (V read as 1). */
function cleanId(raw: string) {
  const value = raw.toUpperCase().replace(/[\s.,'´`-]/g, '');
  const withPrefix = /([VE])([\dOQILSBZ]{6,11})$/.exec(value);
  if (withPrefix) return withPrefix[1] + fixDigits(withPrefix[2]);
  const digits = fixDigits(value).replace(/\D/g, '');
  // Ordinary ids have at most 8 digits; a 9th leading 1 or 7 is the V misread.
  if (digits.length === 9 && /^[17]/.test(digits)) return `V${digits.slice(1)}`;
  if (digits.length >= 6 && digits.length <= 11) return `V${digits}`;
  return value.replace(/[^VE0-9]/g, '');
}

const looksLikeId = (raw: string) => /^V\d{7,11}$/.test(cleanId(raw)) && /\d{5}/.test(fixDigits(raw).replace(/\s/g, ''));

function isGrade(value: string) {
  return value === '*' || /^[A-E]$/.test(value) || (/^\d{1,2}$/.test(value) && Number(value) >= 1 && Number(value) <= 20);
}

/** Normalises one grade cell; the last area holds letters, the rest numbers 1–20. */
function cleanGrade(raw: string, letterArea: boolean) {
  const value = raw.toUpperCase().replace(/[\s.,'`]/g, '');
  if (!value) return '';
  if (/^[*xX]+$/.test(value)) return '*';
  if (letterArea) {
    const letter = /[A-E]/.exec(deaccent(value).replace(/4/g, 'A').replace(/8/g, 'B'));
    return letter ? letter[0] : value.slice(0, 2);
  }
  const digits = fixDigits(value).replace(/\D/g, '');
  if (!digits) return '';
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

const cleanDigits = (raw: string, size: number) => {
  const digits = fixDigits(raw).replace(/\D/g, '');
  return size === 2 && digits.length === 1 ? `0${digits}` : digits.slice(0, size);
};

const cleanName = (raw: string) => raw.toUpperCase().replace(/[^A-ZÁÉÍÓÚÜÑ' .-]/g, '').replace(/\s+/g, ' ').trim();

/** Common surnames whose Ñ OCR tends to drop. */
const ENYE: Record<string, string> = {
  BRICENO: 'BRICEÑO', NUNEZ: 'NUÑEZ', PENA: 'PEÑA', MONTANA: 'MONTAÑA', MUNOZ: 'MUÑOZ', IBANEZ: 'IBAÑEZ', YANEZ: 'YAÑEZ',
  ACUNA: 'ACUÑA', ORDONEZ: 'ORDOÑEZ', CASTANEDA: 'CASTAÑEDA', PATINO: 'PATIÑO', OCANA: 'OCAÑA', CANIZALEZ: 'CAÑIZALEZ', VILLASENOR: 'VILLASEÑOR',
};
const restoreEnye = (name: string) => name.split(' ').map((part) => ENYE[part] ?? part).join(' ');

/** Venezuelan states and common birth places, to fix OCR slips like «TRWILLO». */
const PLACES = [
  'AMAZONAS', 'ANZOATEGUI', 'APURE', 'ARAGUA', 'BARINAS', 'BOLIVAR', 'CARABOBO', 'COJEDES', 'DELTA AMACURO', 'FALCON', 'GUARICO', 'LARA', 'MERIDA',
  'MIRANDA', 'MONAGAS', 'NUEVA ESPARTA', 'PORTUGUESA', 'SUCRE', 'TACHIRA', 'TRUJILLO', 'YARACUY', 'ZULIA', 'LA GUAIRA', 'CARACAS', 'DISTRITO CAPITAL',
  'VALERA', 'BOCONO', 'CARVAJAL', 'ESCUQUE', 'BETIJOQUE', 'MOTATAN', 'PAMPAN', 'MONAY', 'SABANA DE MENDOZA', 'MARACAIBO', 'BARQUISIMETO', 'VALENCIA',
  'MARACAY', 'SAN CRISTOBAL', 'CARORA', 'EL VIGIA', 'CABIMAS', 'PUERTO ORDAZ', 'CIUDAD BOLIVAR', 'BARCELONA', 'PUERTO LA CRUZ', 'MATURIN', 'COLOMBIA',
];

/** Snaps a place to a close known spelling: the same page's majority spelling first, then the list. */
function snapPlaces(students: FinalSummaryStudent[], extra: string[]) {
  const counts = new Map<string, number>();
  for (const s of students) if (s.birthPlace) counts.set(s.birthPlace, (counts.get(s.birthPlace) ?? 0) + 1);
  const known = new Set([...PLACES, ...extra.map((p) => deaccent(p).toUpperCase()).filter(Boolean)]);
  const candidates = [...new Set([...known, ...counts.keys()])];
  for (const s of students) {
    const value = deaccent(s.birthPlace);
    if (!value || known.has(value)) continue;
    let best: { name: string; score: number } | null = null;
    for (const name of candidates) {
      if (name === s.birthPlace) continue;
      const distance = levenshtein(value, deaccent(name));
      if (distance > Math.max(1, Math.floor(name.length * 0.3))) continue;
      const score = distance - (known.has(name) ? 0.5 : 0) - Math.min(counts.get(name) ?? 0, 5) * 0.1;
      if (!best || score < best.score) best = { name, score };
    }
    if (best) s.birthPlace = best.name;
  }
}

function buildStudent(cells: Partial<Record<Field, string>>, letterArea: boolean): FinalSummaryStudent | null {
  const s = emptyStudent();
  s.id = cleanId(cells.id ?? '');
  s.lastNames = restoreEnye(cleanName(cells.lastNames ?? ''));
  s.firstNames = restoreEnye(cleanName(cells.firstNames ?? ''));
  s.birthPlace = cleanName(cells.birthPlace ?? '');
  s.state = (cells.state ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  s.sex = (cells.sex ?? '').toUpperCase().replace(/[^MF]/g, '').slice(0, 1);
  s.birthDay = cleanDigits(cells.birthDay ?? '', 2);
  s.birthMonth = cleanDigits(cells.birthMonth ?? '', 2);
  s.birthYear = cleanDigits(cells.birthYear ?? '', 4);
  s.grades = Array.from({ length: AREA_COUNT }, (_, i) => cleanGrade(cells[`g${i}`] ?? '', letterArea && i === AREA_COUNT - 1));
  const filler = [s.id, s.lastNames, s.firstNames].every((v) => !v || v === '*');
  return filler ? null : s;
}

const pick = (text: string, re: RegExp) => re.exec(text)?.[1]?.trim().replace(/\s+/g, ' ') ?? '';
const UPPER = 'A-ZÁÉÍÓÚÜÑ';

/** Header and footer fields come from the plain text, which OCR returns line by line. */
function parseHeader(text: string, summary: FinalSummary, areaCodes: string[] | null) {
  const flat = text.replace(/\r/g, '');
  summary.schoolYear = pick(flat, /A[ñn]o\s+Escolar:?\s*(\d{4}\s*-\s*\d{4})/i).replace(/\s/g, '');
  summary.evaluationType = /Tipo\s+de\s+Evaluaci[oó]n:?\s*REVISI/i.test(flat) ? 'REVISIÓN' : 'FINAL';
  summary.monthYear = pick(flat, new RegExp(`Mes\\s+y\\s+A[ñn]o:?\\s*([${UPPER}]+\\s+\\d{4})`, 'i')).toUpperCase();
  const inst = summary.institution;
  inst.code = pick(flat, /Instituci[oó]n\s+Educativa:?\s*([A-Z]{2}\d{6,10})/i).toUpperCase();
  inst.name = pick(flat, new RegExp(`Ep[oó]nimo:?\\s*([${UPPER}0-9 .,"'-]+)`, 'i'));
  inst.address = pick(flat, /Direcci[oó]n:?\s*(.+?)(?:\s+Tel[eé]fono|\n|$)/i);
  inst.phone = pick(flat, /Tel[eé]fono:?\s*([\d-]{7,15})/i) || pick(flat, /\b(0\d{10})\b/);
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

  const areas = defaultAreas(course.year || (areaCodes?.includes('BIO') || areaCodes?.includes('OC') ? 'TERCERO' : 'PRIMERO'));
  areaCodes?.forEach((code) => (areas[AREA_INDEX[code]].code = code));
  for (const area of areas) {
    // «5 BAT Biología, Ambiente y Tecnología ARAUJO G. JOSE Y. V5780379»
    const line = flat.split('\n').find((l) => new RegExp(`(^|\\s)${area.code}\\s`, 'i').test(l) && /[VE]\s*-?\s*\d{6,9}/i.test(l));
    if (!line) continue;
    area.teacherId = pick(line, /([VE]\s*-?\s*\d{6,9})/i).replace(/[\s-]/g, '').toUpperCase();
    const upperLine = line.toUpperCase();
    const named = upperLine.includes(area.name.toUpperCase());
    const rest = named ? line.slice(upperLine.indexOf(area.name.toUpperCase()) + area.name.length) : line.replace(new RegExp(`^.*?\\b${area.code}\\b`, 'i'), '');
    area.teacher = cleanName(rest.replace(/[VE]\s*-?\s*\d{6,9}.*$/i, ''));
  }
  summary.areas = areas;
}

/**
 * Row direction of the page: the slope that makes word centres pile up into the sharpest horizontal bands
 * (projection-profile deskew). Works without the header and is not fooled by perspective.
 */
function rowSlope(words: Word[], height: number, pivotX: number) {
  const sample = words.filter((w) => w.height < height * 2.5);
  const bin = Math.max(2, height / 3);
  let best = { slope: 0, score: -1 };
  for (let s = -0.12; s <= 0.1201; s += 0.002) {
    const bins = new Map<number, number>();
    for (const w of sample) {
      const key = Math.round((w.cy - s * (w.cx - pivotX)) / bin);
      bins.set(key, (bins.get(key) ?? 0) + 1);
    }
    let score = 0;
    for (const n of bins.values()) score += n * n;
    if (score > best.score) best = { slope: s, score };
  }
  return best.slope;
}

/** The row of area codes (LL, ID, MA…): the line holding the most distinct codes, at least four. */
function findAreaHeader(words: Word[], straight: (w: Word) => number, height: number) {
  const coded = words.flatMap((w) => areaCodes(w.text).map((code) => ({ w, code })));
  let best: { w: Word; code: string }[] = [];
  for (const seed of coded) {
    const line = coded.filter((c) => Math.abs(straight(c.w) - straight(seed.w)) < height * 0.8).sort((a, b) => a.w.cx - b.w.cx);
    // Codes run left to right in form order: keep the longest such run, so a stray look-alike («mr» → MA) is dropped.
    const chain: { w: Word; code: string }[][] = line.map((c) => [c]);
    line.forEach((c, i) => {
      for (let j = 0; j < i; j++) {
        const usesWord = chain[j].some((link) => link.w === c.w);
        if (!usesWord && AREA_INDEX[line[j].code] < AREA_INDEX[c.code] && chain[j].length + 1 > chain[i].length) chain[i] = [...chain[j], c];
      }
    });
    const longest = chain.reduce((a, b) => (b.length > a.length ? b : a), [] as { w: Word; code: string }[]);
    if (longest.length > best.length) best = longest;
  }
  return best.length >= 4 ? best : null;
}

export function parseFinalSummaryPage(text: string, overlay: OverlayWord[]): ParsedPage {
  const warnings: string[] = [];
  const summary = emptySummary();
  const words: Word[] = overlay
    .flatMap(splitBorders)
    .filter((w) => w.text.trim() && w.width > 0 && w.height > 0)
    .map((w) => ({ ...w, cx: w.left + w.width / 2, cy: w.top + w.height / 2 }));
  const height = median(words.map((w) => w.height)) || 10;

  const pivotX = median(words.map((w) => w.cx));
  const slope = rowSlope(words, height, pivotX);
  const straight = (w: Word) => w.cy - slope * (w.cx - pivotX);

  const header = findAreaHeader(words, straight, height);
  const codes = header?.map((h) => h.code) ?? null;
  parseHeader(text, summary, codes);
  if (header && header.length < AREA_COUNT) warnings.push(`Solo se leyeron ${header.length} de los ${AREA_COUNT} códigos de área; se completaron con los del año.`);

  // Candidate student ids, kept only if they line up in one column (drops the director's and teachers' ids).
  const idWords = words.filter((w) => looksLikeId(w.text));
  const idColumnX = median(idWords.map((w) => w.cx));
  const ids = idWords.filter((w) => Math.abs(w.cx - idColumnX) < height * 6);

  const headerBottom = header ? median(header.map((h) => straight(h.w))) + height * 0.8 : -Infinity;
  const totals = words.find((w) => /^(INSCRITOS|TOTAL)$/.test(lettersOnly(w.text)) && straight(w) > headerBottom);
  const tableBottom = totals ? straight(totals) - height * 0.5 : Infinity;
  const inTable = (w: Word) => straight(w) > headerBottom && straight(w) < tableBottom;

  // Rows are seeded by the ids and by the row numbers (01, 02…) left of them, then gaps are filled at the usual pitch.
  const numberWords = words.filter((w) => /^[0-3]?\d$/.test(fixDigits(w.text)) && w.cx < idColumnX - height * 2 && w.cx > idColumnX - height * 14);
  const seedYs = [...ids, ...numberWords].filter(inTable).map(straight).sort((a, b) => a - b);
  const rowsY: number[] = [];
  for (const y of seedYs) if (!rowsY.length || y - rowsY[rowsY.length - 1] > height * 0.7) rowsY.push(y);
  const pitch = median(rowsY.slice(1).map((y, i) => y - rowsY[i])) || height * 1.6;
  for (let i = rowsY.length - 1; i > 0; i--) {
    const missing = Math.round((rowsY[i] - rowsY[i - 1]) / pitch) - 1;
    for (let k = missing; k >= 1 && missing <= 5; k--) rowsY.splice(i, 0, rowsY[i - 1] + k * pitch);
  }
  if (!rowsY.length) {
    warnings.push(
      header
        ? 'No se reconocieron filas de estudiantes. Revisa que la foto tenga buena luz y esté enfocada.'
        : 'No se encontró la tabla de estudiantes. Toma la foto de frente, con buena luz y con toda la tabla visible.',
    );
    return { summary, warnings };
  }

  // Each word goes to the closest row line.
  const rows: Word[][] = rowsY.map(() => []);
  for (const word of words) {
    if (!inTable(word)) continue;
    const y = straight(word);
    let best = -1;
    let bestDistance = pitch * 0.5;
    rowsY.forEach((ry, i) => {
      const d = Math.abs(y - ry);
      if (d < bestDistance) [best, bestDistance] = [i, d];
    });
    if (best >= 0) rows[best].push(word);
  }

  // Header fit: the area codes plus unique column titles just above them.
  let headerFit: Fit | null = null;
  if (header) {
    const points: [number, number][] = header.map((h) => [center(GRADE_SPANS[AREA_INDEX[h.code]]), h.w.cx]);
    for (const word of words) {
      const anchor = HEADER_ANCHORS[lettersOnly(word.text)];
      const dy = straight(word) - headerBottom;
      if (anchor !== undefined && dy < 0 && dy > -14 * height) points.push([anchor, word.cx]);
    }
    const f = linearFit(points);
    if (f.slope > 0) headerFit = { scale: f.slope, offset: f.intercept };
  }

  // Row fit: values every row has, at known template columns. Handles perspective (scale changes down the page).
  const rowFits: (Fit | null)[] = rows.map((row) => {
    const points: [number, number][] = [];
    const id = row.find((w) => looksLikeId(w.text) && Math.abs(w.cx - idColumnX) < height * 6);
    if (id) points.push([center(SPANS.id), id.cx]);
    const year = row.find((w) => /^(19|20)\d\d$/.test(fixDigits(w.text)) && w.cx > idColumnX);
    if (year) points.push([center(SPANS.birthYear), year.cx]);
    const last = [...row].sort((a, b) => b.cx - a.cx)[0];
    if (last && /^[A-E]$/.test(last.text.trim().toUpperCase()) && (!year || last.cx > year.cx)) points.push([center(GRADE_SPANS[AREA_COUNT - 1]), last.cx]);
    if (points.length < 2) return null;
    const f = linearFit(points);
    const spread = Math.max(...points.map((p) => p[0])) - Math.min(...points.map((p) => p[0]));
    return f.slope > 0 && spread > TABLE_WIDTH * 0.3 ? { scale: f.slope, offset: f.intercept } : null;
  });

  /** For rows without their own fit: neighbours' fits interpolated by position, else the header fit. */
  const fitFor = (index: number): Fit | null => {
    if (rowFits[index]) return rowFits[index];
    const known = rowFits.map((f, i) => (f ? { f, y: rowsY[i] } : null)).filter((v): v is { f: Fit; y: number } => v !== null);
    if (known.length >= 2) {
      const scale = linearFit(known.map((k) => [k.y, k.f.scale]));
      const offset = linearFit(known.map((k) => [k.y, k.f.offset]));
      return { scale: scale.intercept + scale.slope * rowsY[index], offset: offset.intercept + offset.slope * rowsY[index] };
    }
    return known[0]?.f ?? headerFit;
  };

  const letterArea = /^(OV|OC)$/.test(summary.areas[AREA_COUNT - 1].code);
  const students: FinalSummaryStudent[] = [];
  rows.forEach((row, index) => {
    const fit = fitFor(index);
    if (!fit || !row.length) return;
    const cells: Partial<Record<Field, string[]>> = {};
    for (const word of row.sort((a, b) => a.cx - b.cx)) {
      const u0 = toTemplate(fit, word.left);
      const u1 = toTemplate(fit, word.left + word.width);
      const covered = GRADE_SPANS.map((s, i) => ({ i, overlap: Math.min(u1, s.end) - Math.max(u0, s.start), width: s.end - s.start })).filter((c) => c.overlap > c.width * 0.3);
      if (covered.length > 1) {
        const parts = splitGrades(word.text, covered.length);
        if (parts) {
          parts.forEach((part, k) => (cells[`g${covered[k].i}`] ??= []).push(part));
          continue;
        }
      }
      const u = toTemplate(fit, word.cx);
      if (u < -2 || u > TABLE_WIDTH + 4) continue;
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
  });

  snapPlaces(students, [summary.institution.municipality, summary.institution.state]);
  if (!header) warnings.push('No se leyó la fila de áreas (LL, ID, MA…); las columnas se ubicaron con los datos de cada fila. Revisa las notas.');
  if (students.length > MAX_STUDENTS) warnings.push(`Se detectaron ${students.length} filas; el formato admite ${MAX_STUDENTS}. Revisa si hay filas duplicadas.`);
  summary.students = students.slice(0, MAX_STUDENTS);
  if (!summary.students.length) warnings.push('No se reconocieron estudiantes en la tabla.');

  const incomplete = summary.students.filter((s) => s.grades.some((g) => !g)).length;
  if (incomplete) warnings.push(`${incomplete} ${incomplete === 1 ? 'estudiante tiene' : 'estudiantes tienen'} notas sin leer: complétalas antes de exportar.`);
  return { summary, warnings };
}
