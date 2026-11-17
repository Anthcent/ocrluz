import { HttpError } from '../../lib/http-error.js';
import { geminiGenerate } from '../gemini.js';
import { AREA_COUNT, COURSE_YEARS, defaultAreas, emptySummary, KNOWN_AREA_CODES, MAX_STUDENTS, type FinalSummary } from './model.js';
import { AREA_INDEX, buildStudent, snapPlaces, type Field, type ParsedPage } from './parse.js';

/*
 * Reads a photographed «Resumen Final del Rendimiento Estudiantil» with Gemini (vision). Instead of word
 * boxes placed by geometry, the model returns the form already structured; the result then goes through
 * the same cleaning as the OCR path (ids, grades, names, places), so both engines give the same format.
 */

const STRING = { type: 'STRING' } as const;
const strings = (...keys: string[]) => Object.fromEntries(keys.map((k) => [k, STRING]));

const schema = {
  type: 'OBJECT',
  properties: {
    evaluationType: { type: 'STRING', enum: ['FINAL', 'REVISIÓN'] },
    schoolYear: { type: 'STRING', description: 'Año escolar, p. ej. 2025-2026' },
    monthYear: { type: 'STRING', description: 'Mes y año en letras, p. ej. JULIO 2026' },
    institution: {
      type: 'OBJECT',
      properties: strings('code', 'name', 'address', 'phone', 'municipality', 'state', 'cdcee', 'director', 'directorId'),
    },
    course: { type: 'OBJECT', properties: strings('plan', 'planCode', 'year', 'section') },
    areas: {
      type: 'ARRAY',
      description: 'Las 10 áreas en el orden de las columnas de notas',
      items: { type: 'OBJECT', properties: strings('code', 'teacher', 'teacherId') },
    },
    students: {
      type: 'ARRAY',
      description: 'Una entrada por fila de estudiante con datos, en el orden de la hoja',
      items: {
        type: 'OBJECT',
        properties: {
          ...strings('number', 'id', 'lastNames', 'firstNames', 'birthPlace', 'state', 'sex', 'birthDay', 'birthMonth', 'birthYear'),
          grades: { type: 'ARRAY', description: 'Exactamente 10 notas, una por columna de área, en orden', items: STRING },
        },
        required: ['id', 'lastNames', 'firstNames', 'grades'],
      },
    },
    remissionDate: { type: 'STRING', description: 'Fecha de remisión DD-MM-AAAA' },
  },
  required: ['students', 'areas'],
};

const PROMPT = [
  'Eres un sistema de digitalización de formularios escolares venezolanos. La imagen es una página del formato oficial',
  '«Resumen Final del Rendimiento Estudiantil» (o de Revisión). Extrae sus datos con exactitud absoluta en el JSON indicado.',
  '',
  'Tabla de estudiantes (lo más importante):',
  '- Cada fila numerada (01, 02…) con datos es un estudiante. Ignora las filas vacías o rellenas solo con asteriscos.',
  '- id: la cédula tal como aparece, con su prefijo V o E (p. ej. V34256276). Las cédulas escolares pueden tener hasta 11 dígitos.',
  '- lastNames y firstNames en MAYÚSCULAS, con tildes y Ñ como en la hoja.',
  '- birthPlace: lugar de nacimiento; state: la abreviatura de la entidad federal (2 o 3 letras, p. ej. TR).',
  '- sex: M o F. birthDay y birthMonth con 2 dígitos; birthYear con 4 dígitos.',
  '- grades: exactamente 10 valores, uno por columna de área y en el orden de izquierda a derecha.',
  '  Las 9 primeras áreas son notas numéricas de 01 a 20; la última (OV u OC) es un literal de A a E.',
  '  Copia «*» si la celda tiene un asterisco (no cursa el área), «I» o «IN» si dice inasistente, «NC» si dice no cursó,',
  '  y una cadena vacía si la celda está en blanco o es ilegible. Nunca inventes ni deduzcas una nota.',
  '- Lee cada dígito con cuidado: distingue 1/7, 3/8, 5/6, 0/8 y 11/17. Respeta la columna exacta de cada nota.',
  '',
  'Encabezado y pie:',
  '- areas: las 10 columnas de notas en orden, con su código (LL, ID, MA, EF, BAT o BIO, FI, QU, GHSN, ITP, OV u OC),',
  '  y el profesor y su cédula según el cuadro de docentes de la hoja, si aparece.',
  '- course.year: PRIMERO, SEGUNDO, TERCERO, CUARTO o QUINTO. course.section: una letra.',
  '- Copia los demás campos (institución, director, fechas) tal como están; deja vacío lo que no se vea.',
  '- No agregues filas de totales (inscritos, aprobados, aplazados) como estudiantes.',
].join('\n');

const clean = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

interface RawStudent {
  number?: string;
  id?: string;
  lastNames?: string;
  firstNames?: string;
  birthPlace?: string;
  state?: string;
  sex?: string;
  birthDay?: string;
  birthMonth?: string;
  birthYear?: string;
  grades?: unknown[];
}

interface RawSummary {
  evaluationType?: string;
  schoolYear?: string;
  monthYear?: string;
  institution?: Record<string, unknown>;
  course?: Record<string, unknown>;
  areas?: { code?: string; teacher?: string; teacherId?: string }[];
  students?: RawStudent[];
  remissionDate?: string;
}

/** Turns the model's JSON into a clean form, with the same rules and warnings as the OCR path. */
export function summaryFromGemini(raw: RawSummary): ParsedPage {
  const warnings: string[] = [];
  const summary: FinalSummary = emptySummary();

  summary.evaluationType = /REVISI/i.test(clean(raw.evaluationType)) ? 'REVISIÓN' : 'FINAL';
  summary.schoolYear = clean(raw.schoolYear).replace(/\s/g, '');
  summary.monthYear = clean(raw.monthYear).toUpperCase();
  summary.remissionDate = clean(raw.remissionDate).replace(/\//g, '-');
  for (const key of Object.keys(summary.institution) as (keyof FinalSummary['institution'])[]) {
    summary.institution[key] = clean(raw.institution?.[key]);
  }
  summary.institution.directorId = summary.institution.directorId.toUpperCase().replace(/[\s.-]/g, '');

  const year = clean(raw.course?.year).toUpperCase();
  summary.course = {
    plan: clean(raw.course?.plan),
    planCode: clean(raw.course?.planCode).replace(/\D/g, ''),
    year: (COURSE_YEARS as readonly string[]).includes(year) ? year : '',
    section: clean(raw.course?.section).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1),
  };

  // The year sets the default codes (BAT/OV or BIO/OC); codes the model read override them in place.
  const codes = (raw.areas ?? []).map((a) => clean(a.code).toUpperCase().replace(/[^A-Z]/g, ''));
  const upper = codes.includes('BIO') || codes.includes('OC');
  summary.areas = defaultAreas(summary.course.year || (upper ? 'TERCERO' : 'PRIMERO'));
  (raw.areas ?? []).forEach((area, i) => {
    const code = codes[i];
    const index = KNOWN_AREA_CODES.has(code) ? AREA_INDEX[code] : i;
    const target = summary.areas[index];
    if (!target) return;
    if (KNOWN_AREA_CODES.has(code)) target.code = code;
    target.teacher = clean(area.teacher).toUpperCase();
    target.teacherId = clean(area.teacherId).toUpperCase().replace(/[\s.-]/g, '');
  });

  const letterArea = /^(OV|OC)$/.test(summary.areas[AREA_COUNT - 1].code);
  const students = (raw.students ?? []).flatMap((s) => {
    const grades = Array.isArray(s.grades) ? s.grades.map(clean) : [];
    if (grades.length !== AREA_COUNT && grades.length) {
      warnings.push(`La fila ${clean(s.number) || '?'} trajo ${grades.length} notas en vez de ${AREA_COUNT}; revisa sus columnas.`);
    }
    const cells: Partial<Record<Field, string>> = {
      id: clean(s.id),
      lastNames: clean(s.lastNames),
      firstNames: clean(s.firstNames),
      birthPlace: clean(s.birthPlace),
      state: clean(s.state),
      sex: clean(s.sex),
      birthDay: clean(s.birthDay),
      birthMonth: clean(s.birthMonth),
      birthYear: clean(s.birthYear),
    };
    grades.slice(0, AREA_COUNT).forEach((grade, i) => (cells[`g${i}`] = grade));
    const student = buildStudent(cells, letterArea);
    if (!student) return [];
    // Codes the official form uses besides grades (inasistente, no cursó) are kept as written.
    grades.slice(0, AREA_COUNT).forEach((grade, i) => {
      const value = grade.toUpperCase();
      if (/^(I|IN|NC)$/.test(value)) student.grades[i] = value;
    });
    return [student];
  });

  snapPlaces(students, [summary.institution.municipality, summary.institution.state]);
  if (students.length > MAX_STUDENTS) warnings.push(`Se detectaron ${students.length} filas; el formato admite ${MAX_STUDENTS}. Revisa si hay filas duplicadas.`);
  summary.students = students.slice(0, MAX_STUDENTS);
  if (!summary.students.length) warnings.push('La IA no reconoció estudiantes en la foto. Toma la foto de frente, con buena luz y con toda la tabla visible.');
  const incomplete = summary.students.filter((s) => s.grades.some((g) => !g)).length;
  if (incomplete) warnings.push(`${incomplete} ${incomplete === 1 ? 'estudiante tiene' : 'estudiantes tienen'} notas sin leer: complétalas antes de exportar.`);
  return { summary, warnings };
}

export async function geminiReadFinalSummary(image: Buffer, mimeType: string, apiKey: string, model: string): Promise<ParsedPage> {
  const text = await geminiGenerate({
    apiKey,
    model,
    parts: [{ inline_data: { mime_type: mimeType, data: image.toString('base64') } }, { text: PROMPT }],
    temperature: 0,
    responseSchema: schema,
    // A dense 35-row table takes the model a while.
    timeoutMs: 180_000,
  });
  let raw: RawSummary;
  try {
    raw = JSON.parse(text) as RawSummary;
  } catch {
    throw new HttpError(502, 'La IA devolvió una respuesta incompleta, inténtalo de nuevo', 'provider_error');
  }
  return summaryFromGemini(raw);
}
