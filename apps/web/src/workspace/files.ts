import { exportFooter, loadWatermark, SCHOOL_LOGO_RATIO } from '../lib/branding';
import { layoutPages, pageBox, type PageSetup } from './page';

/** CSS px (96 dpi) to PDF points (72 dpi). */
const PT = 0.75;

/**
 * Renders the document node to a real PDF file and downloads it, with the chosen paper, margins
 * and orientation. The page is laid out at the paper's real width, so mobile and desktop exports
 * match, and pages split where the editor's page guides show: never through a line, row or image.
 * Every page carries the school crest as a faint watermark behind the text and the export footer.
 */
export async function exportPdf(content: HTMLElement, fileName: string, setup: PageSetup) {
  const [{ default: html2canvas }, { jsPDF }, watermark] = await Promise.all([import('html2canvas-pro'), import('jspdf'), loadWatermark()]);
  const box = pageBox(setup);
  let layout = { breaks: [] as number[], total: 0 };
  // Pages are laid out again on the copy: the on-screen page gaps do not exist there.

  const canvas = await html2canvas(content, {
    scale: 2,
    backgroundColor: '#ffffff',
    windowWidth: Math.max(1280, box.width + 240),
    ignoreElements: (el) => el.hasAttribute('data-export-ignore'),
    onclone: (doc, el) => {
      // Undo the on-screen zoom and lay the text out at the paper's text width.
      doc.querySelectorAll<HTMLElement>('[data-zoom-layer]').forEach((layer) => (layer.style.transform = 'none'));
      el.classList.add('workspace-exporting');
      el.style.width = `${box.contentWidth}px`;
      el.style.maxWidth = 'none';
      el.style.minHeight = '0';
      const pages = layoutPages(el, box.contentHeight);
      layout = { breaks: pages.starts.slice(1), total: pages.total };
    },
  });

  const pdf = new jsPDF({ unit: 'pt', format: [box.width * PT, box.height * PT], orientation: setup.landscape ? 'landscape' : 'portrait', compress: true });
  const pxPerCss = canvas.width / box.contentWidth;
  const end = Math.min(canvas.height, Math.ceil((layout.total + 2) * pxPerCss)) || canvas.height;
  const edges = [0, ...layout.breaks.map((b) => Math.round(b * pxPerCss)).filter((b) => b > 0 && b < end), end];

  const pageHeight = Math.round(box.contentHeight * pxPerCss);
  const footer = exportFooter();
  let first = true;
  for (let page = 0; page < edges.length - 1; page++) {
    const height = edges[page + 1] - edges[page];
    if (height <= 0) continue;
    // The slice spans the whole text area so the watermark sits in the middle of the sheet.
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = Math.max(height, pageHeight);
    const g = slice.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, slice.width, slice.height);
    if (watermark) drawWatermark(g, watermark, slice.width, Math.min(slice.height, pageHeight));
    // Multiply keeps the page content on top: white lets the watermark through, ink stays as dark as it was.
    g.globalCompositeOperation = 'multiply';
    g.drawImage(canvas, 0, edges[page], canvas.width, height, 0, 0, canvas.width, height);
    if (!first) pdf.addPage();
    first = false;
    pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', box.margin * PT, box.margin * PT, box.contentWidth * PT, (slice.height / pxPerCss) * PT);
    drawFooter(pdf, footer, box.width * PT, box.height * PT, box.margin * PT);
  }

  pdf.save(fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`);
}

/** Centers the crest in the text area at 60 % of its width (capped so it fits the height). */
function drawWatermark(g: CanvasRenderingContext2D, img: HTMLImageElement, width: number, height: number) {
  const w = Math.min(width * 0.6, (height * 0.8) / SCHOOL_LOGO_RATIO);
  const h = w * SCHOOL_LOGO_RATIO;
  g.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
}

type Pdf = InstanceType<typeof import('jspdf').jsPDF>;

/** Small grey line centered in the bottom margin, clear of the text area. */
function drawFooter(pdf: Pdf, text: string, pageWidth: number, pageHeight: number, margin: number) {
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(102, 107, 116);
  pdf.text(text, pageWidth / 2, pageHeight - margin / 2, { align: 'center', baseline: 'middle' });
}

export function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.replace(/[\\/:*?"<>|]+/g, '-');
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
