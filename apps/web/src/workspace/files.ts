/** Letter page in PDF points, with 0.75in margins. */
const PAGE = { width: 612, height: 792, margin: 54 };
/** Text area width in CSS px matching the PDF page (Letter minus margins at 96 dpi). */
const EXPORT_WIDTH = ((PAGE.width - PAGE.margin * 2) / 72) * 96;

/**
 * Renders the document node to a real PDF file and downloads it.
 * The page is laid out at a fixed Letter width so mobile and desktop exports match.
 */
export async function exportPdf(content: HTMLElement, fileName: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')]);

  const canvas = await html2canvas(content, {
    scale: 2,
    backgroundColor: '#ffffff',
    windowWidth: 1280,
    ignoreElements: (el) => el.hasAttribute('data-export-ignore'),
    onclone: (_doc, el) => {
      el.style.width = `${EXPORT_WIDTH}px`;
      el.style.maxWidth = 'none';
    },
  });

  const pdf = new jsPDF({ unit: 'pt', format: 'letter', compress: true });
  const contentWidth = PAGE.width - PAGE.margin * 2;
  const contentHeight = PAGE.height - PAGE.margin * 2;
  const ptPerPx = contentWidth / canvas.width;
  const sliceHeight = Math.floor(contentHeight / ptPerPx);

  for (let offset = 0, page = 0; offset < canvas.height; offset += sliceHeight, page++) {
    const height = Math.min(sliceHeight, canvas.height - offset);
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = height;
    slice.getContext('2d')!.drawImage(canvas, 0, offset, canvas.width, height, 0, 0, canvas.width, height);
    if (page > 0) pdf.addPage();
    pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', PAGE.margin, PAGE.margin, contentWidth, height * ptPerPx);
  }

  pdf.save(fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`);
}

const MAX_IMAGE_SIDE = 1600;

/** Formats every browser can decode; on iPhone this also makes the picker convert HEIC photos to JPEG. */
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

export class UnreadableImageError extends Error {
  constructor() {
    super('No se pudo leer la imagen. Usa una foto JPG o PNG (las fotos HEIC no son compatibles con este navegador).');
  }
}

/** Decodes with createImageBitmap, falling back to an <img> element, which some browsers decode more broadly. */
async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  } catch {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      URL.revokeObjectURL(url);
      throw new UnreadableImageError();
    }
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
  }
}

/** Reads a picked image, downsizing it so documents stay light, and returns it as a data URL. */
export async function readImageFile(file: File): Promise<string> {
  const image = await decode(file);
  try {
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const ctx = canvas.getContext('2d')!;
    // PNG keeps transparency (logos, signatures); everything else goes to JPEG on white to save space.
    const png = file.type === 'image/png';
    if (!png) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(image.source, 0, 0, canvas.width, canvas.height);
    return png ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    image.release();
  }
}
