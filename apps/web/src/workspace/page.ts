/** Page setup of a workspace document: paper, margins and orientation. Sizes are CSS px at 96 dpi. */
export type Paper = 'letter' | 'legal' | 'a4';
export type Margin = 'narrow' | 'moderate' | 'normal' | 'wide';

export interface PageSetup {
  paper: Paper;
  margin: Margin;
  landscape: boolean;
}

export const PAPERS: Record<Paper, { label: string; width: number; height: number }> = {
  letter: { label: 'Carta', width: 816, height: 1056 },
  legal: { label: 'Oficio', width: 816, height: 1248 },
  a4: { label: 'A4', width: 794, height: 1123 },
};

export const MARGINS: Record<Margin, { label: string; size: number }> = {
  narrow: { label: 'Estrechos (1,27 cm)', size: 48 },
  moderate: { label: 'Moderados (1,9 cm)', size: 72 },
  normal: { label: 'Normales (2,54 cm)', size: 96 },
  wide: { label: 'Anchos (3,81 cm)', size: 144 },
};

export const DEFAULT_PAGE: PageSetup = { paper: 'letter', margin: 'moderate', landscape: false };

/** `page` shows the real sheet (zoomable); `flow` adapts the text to the screen width. */
export type ViewMode = 'page' | 'flow';
export type Zoom = 'fit' | number;
export const ZOOMS = [50, 75, 100, 125, 150, 200];

export function pageBox(setup: PageSetup) {
  const paper = PAPERS[setup.paper];
  const width = setup.landscape ? paper.height : paper.width;
  const height = setup.landscape ? paper.width : paper.height;
  const margin = MARGINS[setup.margin].size;
  return { width, height, margin, contentWidth: width - margin * 2, contentHeight: height - margin * 2 };
}

const PAGE_COMMENT = /^<!--ocryon-page:(.*?)-->/;

/** The page setup travels with the document as a leading HTML comment, which the editor ignores. */
export function withPageSetup(html: string, setup: PageSetup) {
  return `<!--ocryon-page:${JSON.stringify(setup)}-->${html}`;
}

export function readPageSetup(html: string): { setup: PageSetup; html: string } {
  const match = html.match(PAGE_COMMENT);
  if (!match) return { setup: DEFAULT_PAGE, html };
  let setup = DEFAULT_PAGE;
  try {
    const raw = JSON.parse(match[1]) as Partial<PageSetup>;
    setup = {
      paper: raw.paper && raw.paper in PAPERS ? raw.paper : DEFAULT_PAGE.paper,
      margin: raw.margin && raw.margin in MARGINS ? raw.margin : DEFAULT_PAGE.margin,
      landscape: raw.landscape === true,
    };
  } catch {
    // Unreadable setup: keep the defaults.
  }
  return { setup, html: html.slice(match[0].length) };
}

/** Visual scale applied to an element by a CSS transform on it or an ancestor (the page zoom). */
export function scaleOf(el: HTMLElement) {
  return el.offsetWidth ? el.getBoundingClientRect().width / el.offsetWidth || 1 : 1;
}

/**
 * Where the document splits into pages, as offsets (unscaled px) from the top of `root`, plus the
 * height the content really uses. A break never slices a text line, a table row or an image: it
 * moves up to the top of whatever it would cut. Manual page breaks always start a new page.
 */
export function computePageBreaks(root: HTMLElement, pageHeight: number): { breaks: number[]; total: number } {
  const scale = scaleOf(root);
  const origin = root.getBoundingClientRect().top;
  const y = (value: number) => (value - origin) / scale;

  const boxes: { top: number; bottom: number }[] = [];
  const add = (rect: DOMRect) => {
    if (rect.height > 0) boxes.push({ top: y(rect.top), bottom: y(rect.bottom) });
  };
  root.querySelectorAll<HTMLElement>('img, hr, tr, input').forEach((el) => add(el.getBoundingClientRect()));
  const range = document.createRange();
  root.querySelectorAll<HTMLElement>('p, h1, h2, h3, pre').forEach((el) => {
    range.selectNodeContents(el);
    for (const rect of range.getClientRects()) add(rect);
  });

  const forced = [...root.querySelectorAll<HTMLElement>('[data-page-break]')].map((el) => y(el.getBoundingClientRect().bottom)).sort((a, b) => a - b);
  const total = Math.max(0, ...boxes.map((b) => b.bottom));

  const breaks: number[] = [];
  let start = 0;
  while (breaks.length < 500) {
    const limit = start + pageHeight;
    const manual = forced.find((f) => f > start + 1 && f <= limit);
    if (manual !== undefined) {
      if (manual >= total - 1) break;
      breaks.push(manual);
      start = manual;
      continue;
    }
    if (limit >= total) break;
    let cut = limit;
    for (let moved = true; moved; ) {
      moved = false;
      for (const box of boxes) {
        // Something taller than a page that starts at the top of it has to be cut anyway.
        if (box.top < cut && box.bottom > cut && box.top > start + 1) {
          cut = box.top;
          moved = true;
        }
      }
    }
    breaks.push(cut);
    start = cut;
  }
  return { breaks, total };
}
