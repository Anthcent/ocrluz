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

/** Reads a picked image, downsizing it so documents stay light, and returns it as a data URL. */
export async function readImageFile(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d')!;
    // PNG keeps transparency (logos, signatures); everything else goes to JPEG on white to save space.
    const png = file.type === 'image/png';
    if (!png) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return png ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    bitmap.close();
  }
}
