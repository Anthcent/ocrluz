import { HttpError } from '../../lib/http-error.js';

// Configurable solo para pruebas automáticas con un simulador local.
const ENDPOINT = process.env.OCRSPACE_ENDPOINT ?? 'https://api.ocr.space/parse/image';

async function callOcrSpace(image: Buffer, mimeType: string, apiKey: string, options: Record<string, string>): Promise<any[]> {
  const extension = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(image)], { type: mimeType }), `page.${extension}`);
  for (const [key, value] of Object.entries(options)) form.append(key, value);

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { apikey: apiKey },
      body: form,
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    throw new HttpError(502, 'No se pudo conectar con OCR.space', 'provider_unreachable');
  }

  const body = (await res.json().catch(() => null)) as any;
  if (res.status === 403 || res.status === 401) {
    throw new HttpError(400, 'La API key de OCR.space no es válida', 'invalid_api_key');
  }
  if (!res.ok || !body) {
    const detail = typeof body === 'string' ? body : body?.ErrorMessage;
    throw new HttpError(502, `OCR.space respondió con un error${detail ? `: ${detail}` : ''}`, 'provider_error');
  }
  if (body.IsErroredOnProcessing) {
    const detail = [body.ErrorMessage].flat().filter(Boolean).join(' ');
    throw new HttpError(422, `OCR.space no pudo procesar la imagen${detail ? `: ${detail}` : ''}`, 'provider_error');
  }
  return body.ParsedResults ?? [];
}

const joinText = (results: any[]) => results.map((r) => r.ParsedText ?? '').join('\n').replace(/\r\n/g, '\n').trim();

export async function ocrSpaceRecognize(image: Buffer, mimeType: string, apiKey: string, language: string) {
  const results = await callOcrSpace(image, mimeType, apiKey, {
    language,
    OCREngine: '2',
    scale: 'true',
    detectOrientation: 'true',
    isOverlayRequired: 'false',
    // isTable hace que OCR.space devuelva las líneas tabuladas según las columnas detectadas,
    // pero fuerza OCREngine=1 internamente (ignora el '2' de arriba): es el trade-off de la API.
    isTable: 'true',
  });
  return formatTableLines(joinText(results));
}

export interface OcrSpaceWord {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Plain text plus every word with its position in the image, for layouts parsed by geometry. */
export async function ocrSpaceWithLayout(image: Buffer, mimeType: string, apiKey: string, language: string) {
  const results = await callOcrSpace(image, mimeType, apiKey, {
    language,
    OCREngine: '2',
    scale: 'true',
    detectOrientation: 'true',
    isOverlayRequired: 'true',
  });
  const words: OcrSpaceWord[] = results.flatMap((r) =>
    (r.TextOverlay?.Lines ?? []).flatMap((line: any) =>
      (line.Words ?? []).map((w: any) => ({ text: String(w.WordText ?? ''), left: Number(w.Left), top: Number(w.Top), width: Number(w.Width), height: Number(w.Height) })),
    ),
  );
  return { text: joinText(results), words: words.filter((w) => w.text && [w.left, w.top, w.width, w.height].every(Number.isFinite)) };
}

/** Convierte un bloque de líneas tabuladas (misma fila de columnas) en una tabla Markdown. */
function linesToMarkdownTable(lines: string[]): string {
  const rows = lines.map((l) => l.split('\t').map((c) => c.trim()));
  const cols = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => {
    while (r.length < cols) r.push('');
    return r;
  };
  const toRow = (r: string[]) => `| ${pad(r).map((c) => c.replace(/\|/g, '\\|')).join(' | ')} |`;
  const header = toRow(rows[0]);
  const sep = `| ${Array(cols).fill('---').join(' | ')} |`;
  const body = rows.slice(1).map(toRow);
  return [header, sep, ...body].join('\n');
}

/**
 * OCR.space (con isTable) separa con tabs las líneas donde detectó varias columnas.
 * Agrupamos esas líneas consecutivas y las convertimos en una tabla Markdown; el resto
 * del texto queda igual.
 */
function formatTableLines(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let block: string[] = [];
  const flush = () => {
    if (block.length >= 2) out.push(linesToMarkdownTable(block));
    else if (block.length === 1) out.push(block[0].replace(/\t+/g, '   '));
    block = [];
  };
  for (const line of lines) {
    if (line.includes('\t')) block.push(line);
    else {
      flush();
      out.push(line);
    }
  }
  flush();
  return out.join('\n');
}
