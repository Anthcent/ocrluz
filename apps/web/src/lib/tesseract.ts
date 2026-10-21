import type { Worker } from 'tesseract.js';

// Tesseract usa códigos ISO 639-2/T; OCR.space usa algunos distintos.
const TESS_LANG: Record<string, string> = { fre: 'fra', ger: 'deu' };

// Archivos servidos por nuestra propia app (ver scripts/copy-tesseract.mjs): sin CDN externo.
const BASE = `${location.origin}/tesseract`;

let current: { lang: string; worker: Promise<Worker> } | null = null;

type ProgressFn = (value: number, label: string) => void;
// Solo se reconoce una página a la vez, así que basta con un receptor de progreso activo.
let onProgress: ProgressFn | null = null;

function logger(m: { status: string; progress: number }) {
  if (!onProgress) return;
  if (m.status === 'recognizing text') onProgress(0.15 + 0.85 * m.progress, 'Leyendo texto…');
  else onProgress(0.02 + 0.13 * m.progress, 'Preparando el OCR local…');
}

async function getWorker(lang: string) {
  const code = TESS_LANG[lang] ?? lang;
  if (current?.lang !== code) {
    const previous = current;
    const { createWorker, OEM } = await import('tesseract.js');
    const entry = {
      lang: code,
      worker: createWorker(code, OEM.LSTM_ONLY, {
        workerPath: `${BASE}/worker.min.js`,
        corePath: `${BASE}/core`,
        langPath: `${BASE}/lang`,
        workerBlobURL: false,
        logger,
      }),
    };
    current = entry;
    // Si falla la carga, se reintenta la próxima vez en lugar de quedar con un worker roto.
    entry.worker.catch(() => {
      if (current === entry) current = null;
    });
    previous?.worker.then((w) => w.terminate()).catch(() => {});
  }
  return current.worker;
}

export interface LayoutWord {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

/** On-device OCR that also returns every word with its box, for forms parsed by position. */
export async function tesseractRecognizeLayout(image: Blob, language: string, progress?: ProgressFn): Promise<{ text: string; words: LayoutWord[] }> {
  onProgress = progress ?? null;
  try {
    const worker = await getWorker(language);
    const { data } = await worker.recognize(image, {}, { blocks: true, text: true });
    const words = (data.blocks ?? []).flatMap((block) =>
      block.paragraphs.flatMap((paragraph) =>
        paragraph.lines.flatMap((line) =>
          line.words.map((w) => ({ text: w.text, left: w.bbox.x0, top: w.bbox.y0, width: w.bbox.x1 - w.bbox.x0, height: w.bbox.y1 - w.bbox.y0 })),
        ),
      ),
    );
    return { text: data.text, words: words.filter((w) => w.text.trim()) };
  } finally {
    onProgress = null;
  }
}

/** OCR en el propio dispositivo: la imagen nunca sale del navegador. */
export async function tesseractRecognize(image: Blob, language: string, progress?: ProgressFn): Promise<string> {
  onProgress = progress ?? null;
  try {
    const worker = await getWorker(language);
    const { data } = await worker.recognize(image);
    return data.text.trim();
  } finally {
    onProgress = null;
  }
}
