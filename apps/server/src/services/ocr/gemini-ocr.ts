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
    '- Si es un formulario con pares de etiqueta y valor que NO forman una tabla, transcribe cada etiqueta junto a su valor, una por línea, en texto plano.',
    '- Si hay una tabla real (filas y columnas), represéntala con sintaxis de tabla Markdown: una fila de encabezado, una fila separadora de guiones y luego las filas de datos, cada valor en su columna correcta. Deja la tabla en el mismo lugar del texto donde aparece, sin moverla.',
    '- Fuera de las tablas, no uses ningún otro formato Markdown (sin encabezados, negritas ni listas): solo texto plano.',
    '- Ignora solo los números de página sueltos y las marcas de agua.',
    '- No agregues comentarios ni títulos. Devuelve solo el texto transcrito.',
    '- Si no hay texto legible, devuelve una cadena vacía.',
  ].join('\n');

  const text = await geminiGenerate({
    apiKey,
    model,
    parts: [{ inline_data: { mime_type: mimeType, data: image.toString('base64') } }, { text: prompt }],
  });
  return text.trim();
}
