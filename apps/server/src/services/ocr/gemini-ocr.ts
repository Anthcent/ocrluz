import { geminiGenerate } from '../gemini.js';
import { LANGUAGES } from '../languages.js';

export async function geminiRecognize(image: Buffer, mimeType: string, apiKey: string, model: string, language: string) {
  const languageName = LANGUAGES[language] ?? 'el idioma del documento';
  const prompt = [
    'Eres un motor de OCR. Transcribe con exactitud todo el texto visible en esta imagen de una página de un documento.',
    `El texto está principalmente en ${languageName}.`,
    'Reglas:',
    '- Respeta los párrafos y saltos de línea significativos; une las palabras cortadas con guion al final de línea.',
    '- Si hay varias columnas, transcribe cada columna completa en orden de lectura.',
    '- Conserva encabezados, membretes, nombres de instituciones y títulos de formularios.',
    '- Si es un formulario o una tabla, transcribe cada etiqueta junto a su valor y cada fila en su propia línea.',
    '- Ignora solo los números de página sueltos y las marcas de agua.',
    '- No agregues comentarios, títulos ni formato Markdown. Devuelve solo el texto.',
    '- Si no hay texto legible, devuelve una cadena vacía.',
  ].join('\n');

  const text = await geminiGenerate({
    apiKey,
    model,
    parts: [{ inline_data: { mime_type: mimeType, data: image.toString('base64') } }, { text: prompt }],
  });
  return text.trim();
}
