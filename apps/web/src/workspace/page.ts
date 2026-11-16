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
export const ZOOMS = [50, 67, 75, 90, 100, 110, 125, 150, 175, 200];
/** Space between two sheets in the page view, in px. */
export const PAGE_GAP = 28;

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

/** Something a page break must not slice: a text line, a table row, an image or a rule. */
export interface LayoutBox {
  /** Offsets (unscaled px) from the top of the measured root. */
  top: number;
  bottom: number;
  /** The row, image or rule; for a text line, the paragraph or heading it belongs to. */
  el: HTMLElement;
  /** Set for text lines: whether it is the first line of its block. */
  line?: { first: boolean; clientTop: number };
}

export interface PageLayout {
  /** Offset where each page starts; the first one is always 0. */
  starts: number[];
  /** What each page after the first begins with; null when it starts in the middle of something taller than a page. */
  firsts: (LayoutBox | null)[];
  /** Height the content really uses. */
  total: number;
}

/**
 * Splits the content of `root` into pages of `pageHeight`. A page never ends in the middle of a
 * text line, a table row or an image: whatever would be cut starts the next page instead. Manual
 * page breaks always start a new page.
 */
export function layoutPages(root: HTMLElement, pageHeight: number): PageLayout {
  const scale = scaleOf(root);
  const origin = root.getBoundingClientRect().top;
  const y = (value: number) => (value - origin) / scale;

  const boxes: LayoutBox[] = [];
  root.querySelectorAll<HTMLElement>('img, hr, tr, input').forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.height > 0) boxes.push({ top: y(rect.top), bottom: y(rect.bottom), el });
  });
  const range = document.createRange();
  root.querySelectorAll<HTMLElement>('p, h1, h2, h3, pre').forEach((el) => {
    range.selectNodeContents(el);
    let firstTop = Infinity;
    for (const rect of range.getClientRects()) {
      if (rect.height <= 0) continue;
      firstTop = Math.min(firstTop, rect.top);
      boxes.push({ top: y(rect.top), bottom: y(rect.bottom), el, line: { first: rect.top < firstTop + 2, clientTop: rect.top } });
    }
  });
  // Rows and images win over the text inside them when they share a top edge.
  boxes.sort((a, b) => a.top - b.top || Number(!!a.line) - Number(!!b.line));

  const forced = [...root.querySelectorAll<HTMLElement>('[data-page-break]')].map((el) => y(el.getBoundingClientRect().bottom)).sort((a, b) => a - b);
  const total = Math.max(0, ...boxes.map((b) => b.bottom));

  const starts = [0];
  const firsts: (LayoutBox | null)[] = [];
  while (starts.length < 500) {
    const start = starts[starts.length - 1];
    const limit = start + pageHeight;
    let cut = forced.find((f) => f > start + 1 && f <= limit);
    if (cut === undefined) {
      if (limit >= total) break;
      cut = limit;
      for (let moved = true; moved; ) {
        moved = false;
        for (const box of boxes) {
          if (box.top < cut && box.bottom > cut && box.top > start + 1) {
            cut = box.top;
            moved = true;
          }
        }
      }
      // Still slicing something: it is taller than a page and has to be cut.
      if (boxes.some((box) => box.top < cut! - 0.5 && box.bottom > cut! + 0.5)) {
        starts.push(cut);
        firsts.push(null);
        continue;
      }
    }
    const first = boxes.find((box) => box.top >= cut! - 0.5);
    if (!first) break;
    starts.push(first.top);
    firsts.push(first);
  }
  return { starts, firsts, total };
}
