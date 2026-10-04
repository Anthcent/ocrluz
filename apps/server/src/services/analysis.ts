import { HttpError } from '../lib/http-error.js';
import { geminiGenerate } from './gemini.js';

const MAX_CHARS = 400_000;

const schema = {
  type: 'OBJECT',
  properties: {
    resumen: { type: 'STRING' },
    tipoDocumento: { type: 'STRING' },
    datosClave: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { dato: { type: 'STRING' }, valor: { type: 'STRING' } },
        required: ['dato', 'valor'],
      },
    },
    entidades: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { nombre: { type: 'STRING' }, tipo: { type: 'STRING' } },
        required: ['nombre', 'tipo'],
      },
    },
    observaciones: { type: 'ARRAY', items: { type: 'STRING' } },
    calidadOcr: { type: 'STRING' },
  },
  required: ['resumen', 'tipoDocumento', 'datosClave', 'entidades', 'observaciones', 'calidadOcr'],
};

export interface OnlineAnalysis {
  resumen: string;
  tipoDocumento: string;
  datosClave: { dato: string; valor: string }[];
  entidades: { nombre: string; tipo: string }[];
  observaciones: string[];
  calidadOcr: string;
}

export async function analyzeWithGemini(text: string, title: string, apiKey: string, model: string) {
  const truncated = text.length > MAX_CHARS;
  const body = truncated ? text.slice(0, MAX_CHARS) : text;
  const prompt = [
    `Analiza el siguiente texto obtenido por OCR del documento "${title}". Responde siempre en español.`,
    '- resumen: 1 a 3 párrafos claros sobre qué es el documento y qué contiene.',
    '- tipoDocumento: el tipo de documento detectado (p. ej. acta, cédula, partida de nacimiento, informe médico, sábana de notas, ficha de inscripción, nómina, resumen final, revisión, materia vista u otro).',
    '- datosClave: los datos más importantes del documento como pares dato/valor (números de documento, fechas, montos, grados, secciones, totales…), sin inventar valores.',
    '- entidades: personas, números de cédula, fechas, instituciones y lugares mencionados, con su tipo.',
    '- observaciones: de 0 a 5 observaciones útiles (datos faltantes, firmas o sellos mencionados, inconsistencias).',
    '- calidadOcr: una valoración breve de la calidad del OCR y errores evidentes detectados.',
    '',
    '--- TEXTO ---',
    body,
  ].join('\n');

  const raw = await geminiGenerate({ apiKey, model, parts: [{ text: prompt }], temperature: 0.3, responseSchema: schema });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError(502, 'Gemini devolvió una respuesta incompleta, inténtalo de nuevo', 'provider_error');
  }
  return { ...normalizeAnalysis(parsed), truncated };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const strList = (v: unknown) => (Array.isArray(v) ? v.filter((i): i is string => typeof i === 'string') : []);

/** Pairs whose two keys are strings; anything else in the array is dropped. */
function pairList<A extends string, B extends string>(v: unknown, a: A, b: B) {
  if (!Array.isArray(v)) return [];
  return v
    .filter((i): i is Record<A | B, string> => isRecord(i) && typeof i[a] === 'string' && typeof i[b] === 'string')
    .map((i) => ({ [a]: i[a], [b]: i[b] }) as Record<A | B, string>);
}

/**
 * Brings Gemini's JSON to the expected shape even when the model omits fields or returns
 * null/malformed items, so the stored analysis is always safe to render.
 */
export function normalizeAnalysis(value: unknown): OnlineAnalysis {
  const v = isRecord(value) ? value : {};
  return {
    resumen: str(v.resumen),
    tipoDocumento: str(v.tipoDocumento),
    datosClave: pairList(v.datosClave, 'dato', 'valor'),
    entidades: pairList(v.entidades, 'nombre', 'tipo'),
    observaciones: strList(v.observaciones),
    calidadOcr: str(v.calidadOcr),
  };
}
