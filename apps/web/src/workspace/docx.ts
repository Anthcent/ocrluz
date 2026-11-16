import type { JSONContent } from '@tiptap/react';
import type { IParagraphOptions, IRunOptions, ImageRun, Paragraph, ParagraphChild, Table } from 'docx';
import { PAPERS, pageBox, type PageSetup } from './page';
import type { WorkspaceImageAttrs } from './WorkspaceImage';

type Docx = typeof import('docx');
type Block = Paragraph | Table;

/** Word measures pages and indents in twips (1/20 pt) and drawing offsets in EMUs. */
const TWIPS_PER_PX = 15;
const EMU_PER_PX = 9525;
const INK = '18191D';
const LINE = 'DDE0E4';

interface Context {
  d: Docx;
  /** Height / width of every embedded image, by its data URL. */
  ratios: Map<string, number>;
  /** One numbering definition per ordered list, so each one starts counting on its own. */
  lists: { reference: string; start: number }[];
  /** Floating images waiting for the next paragraph, which they are anchored to. */
  pending: ImageRun[];
}

interface Scope {
  /** Width in px of the box the blocks are laid out in (the page's text area or a table cell). */
  width: number;
  /** Left indent in twips inherited from lists and quotes. */
  indent: number;
  inCell?: boolean;
  quote?: boolean;
  bold?: boolean;
}

/** Builds a real, editable .docx from the editor document: text formatting, lists, tables, images and page setup. */
export async function exportDocx(doc: JSONContent, title: string, setup: PageSetup): Promise<Blob> {
  const d = await import('docx');
  const box = pageBox(setup);
  const ctx: Context = { d, ratios: await imageRatios(doc), lists: [], pending: [] };

  const children: Block[] = [];
  if (title.trim()) children.push(new d.Paragraph({ heading: d.HeadingLevel.TITLE, children: [new d.TextRun(title.trim())] }));
  children.push(...blocks(doc.content, ctx, { width: box.contentWidth, indent: 0 }));
  flushPending(ctx, children);
  if (!children.length) children.push(new d.Paragraph({}));

  const paper = PAPERS[setup.paper];
  const margin = box.margin * TWIPS_PER_PX;
  const heading = (size: number) => ({ run: { size, bold: true, font: 'Georgia', color: INK }, paragraph: { spacing: { before: 120, after: 180 } } });

  const file = new d.Document({
    title: title.trim() || undefined,
    styles: {
      default: {
        // Same base as the editor: Georgia 12 pt with relaxed line spacing.
        document: { run: { font: 'Georgia', size: 24, color: INK }, paragraph: { spacing: { line: 390, after: 180 } } },
        title: { run: { size: 45, bold: true, font: 'Georgia', color: INK }, paragraph: { spacing: { after: 360 } } },
        heading1: heading(45),
        heading2: heading(36),
        heading3: heading(30),
      },
    },
    numbering: {
      config: ctx.lists.map(({ reference, start }) => ({
        reference,
        levels: Array.from({ length: 9 }, (_, level) => ({
          level,
          format: d.LevelFormat.DECIMAL,
          text: `%${level + 1}.`,
          alignment: d.AlignmentType.START,
          start: level === 0 ? start : 1,
          style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
        })),
      })),
    },
    sections: [
      {
        properties: {
          page: {
            // The library swaps width and height itself when the orientation is landscape.
            size: {
              width: paper.width * TWIPS_PER_PX,
              height: paper.height * TWIPS_PER_PX,
              orientation: setup.landscape ? d.PageOrientation.LANDSCAPE : d.PageOrientation.PORTRAIT,
            },
            margin: { top: margin, right: margin, bottom: margin, left: margin },
          },
        },
        children,
      },
    ],
  });
  return d.Packer.toBlob(file);
}

async function imageRatios(doc: JSONContent) {
  const sources = new Set<string>();
  const walk = (node: JSONContent) => {
    if (node.type === 'workspaceImage' && typeof node.attrs?.src === 'string') sources.add(node.attrs.src);
    node.content?.forEach(walk);
  };
  walk(doc);
  const ratios = new Map<string, number>();
  await Promise.all(
    [...sources].map(async (src) => {
      const img = new Image();
      img.src = src;
      try {
        await img.decode();
        if (img.naturalWidth) ratios.set(src, img.naturalHeight / img.naturalWidth);
      } catch {
        // Unreadable image: it is left out of the file.
      }
    }),
  );
  return ratios;
}

/** `#abc`, `#aabbcc` or `rgb(…)` to the `AABBCC` form Word expects. */
function hex(color: unknown): string | undefined {
  if (typeof color !== 'string') return undefined;
  const short = color.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (short) return short.slice(1).map((c) => c + c).join('').toUpperCase();
  const long = color.match(/^#([0-9a-f]{6})/i);
  if (long) return long[1].toUpperCase();
  const rgb = color.startsWith('rgb') ? color.match(/\d+/g) : null;
  if (rgb && rgb.length >= 3) return rgb.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase();
  return undefined;
}

function runs(ctx: Context, content: JSONContent[] | undefined, scope: Scope): ParagraphChild[] {
  const { d } = ctx;
  return (content ?? []).flatMap((node): ParagraphChild[] => {
    if (node.type === 'hardBreak') return [new d.TextRun({ break: 1 })];
    if (node.type !== 'text' || !node.text) return [];

    const options: Record<string, unknown> = { text: node.text };
    if (scope.bold) options.bold = true;
    if (scope.quote) {
      options.italics = true;
      options.color = '666B74';
    }
    let href: string | undefined;
    for (const mark of node.marks ?? []) {
      const attrs = mark.attrs ?? {};
      if (mark.type === 'bold') options.bold = true;
      else if (mark.type === 'italic') options.italics = true;
      else if (mark.type === 'underline') options.underline = {};
      else if (mark.type === 'strike') options.strike = true;
      else if (mark.type === 'superscript') options.superScript = true;
      else if (mark.type === 'subscript') options.subScript = true;
      else if (mark.type === 'code') options.font = 'Courier New';
      else if (mark.type === 'highlight') options.shading = { type: d.ShadingType.CLEAR, fill: hex(attrs.color) ?? 'FFD89D', color: 'auto' };
      else if (mark.type === 'link' && typeof attrs.href === 'string') href = attrs.href;
      else if (mark.type === 'textStyle') {
        const color = hex(attrs.color);
        if (color) options.color = color;
        if (typeof attrs.fontFamily === 'string') options.font = attrs.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
        const size = parseFloat(String(attrs.fontSize ?? ''));
        if (size) options.size = Math.round(size * 2);
      }
    }
    if (href) return [new d.ExternalHyperlink({ link: href, children: [new d.TextRun({ ...options, style: 'Hyperlink' } as IRunOptions)] })];
    return [new d.TextRun(options as IRunOptions)];
  });
}

/** Creates a paragraph; floating images waiting for an anchor are attached to it. */
function paragraph(ctx: Context, options: IParagraphOptions): Paragraph {
  const children = [...ctx.pending, ...(options.children ?? [])];
  ctx.pending = [];
  return new ctx.d.Paragraph({ ...options, children });
}

function flushPending(ctx: Context, out: Block[]) {
  if (ctx.pending.length) out.push(paragraph(ctx, {}));
}

function textBlockOptions(ctx: Context, node: JSONContent, scope: Scope): IParagraphOptions {
  const { d } = ctx;
  const attrs = node.attrs ?? {};
  const align = { left: d.AlignmentType.LEFT, center: d.AlignmentType.CENTER, right: d.AlignmentType.RIGHT, justify: d.AlignmentType.JUSTIFIED }[String(attrs.textAlign)];
  const lineHeight = parseFloat(String(attrs.lineHeight ?? ''));
  const indent = scope.indent + (Number(attrs.indent) || 0) * 480;
  const spacing = { ...(lineHeight ? { line: Math.round(lineHeight * 240) } : {}), ...(scope.inCell ? { after: 0 } : {}) };
  return {
    ...(align ? { alignment: align } : {}),
    ...(indent ? { indent: { left: indent } } : {}),
    ...(Object.keys(spacing).length ? { spacing } : {}),
    ...(scope.quote ? { border: { left: { style: d.BorderStyle.SINGLE, size: 18, color: LINE, space: 12 } } } : {}),
  };
}

function blocks(nodes: JSONContent[] | undefined, ctx: Context, scope: Scope): Block[] {
  return (nodes ?? []).flatMap((node) => block(node, ctx, scope));
}

function block(node: JSONContent, ctx: Context, scope: Scope): Block[] {
  const { d } = ctx;
  switch (node.type) {
    case 'paragraph':
      return [paragraph(ctx, { ...textBlockOptions(ctx, node, scope), children: runs(ctx, node.content, scope) })];
    case 'heading': {
      const level = [d.HeadingLevel.HEADING_1, d.HeadingLevel.HEADING_2, d.HeadingLevel.HEADING_3][Number(node.attrs?.level ?? 1) - 1] ?? d.HeadingLevel.HEADING_3;
      return [paragraph(ctx, { ...textBlockOptions(ctx, node, scope), heading: level, children: runs(ctx, node.content, scope) })];
    }
    case 'bulletList':
    case 'orderedList':
    case 'taskList':
      return list(node, ctx, scope, 0);
    case 'blockquote':
      return blocks(node.content, ctx, { ...scope, indent: scope.indent + 480, quote: true });
    case 'codeBlock': {
      const lines = (node.content ?? []).map((c) => c.text ?? '').join('').split('\n');
      const children = lines.map((text, i) => new d.TextRun({ text, font: 'Courier New', ...(i ? { break: 1 } : {}) }));
      return [paragraph(ctx, { ...(scope.indent ? { indent: { left: scope.indent } } : {}), children })];
    }
    case 'horizontalRule':
      return [paragraph(ctx, { border: { bottom: { style: d.BorderStyle.SINGLE, size: 6, color: LINE, space: 1 } } })];
    case 'pageBreak':
      return [paragraph(ctx, { children: [new d.PageBreak()] })];
    case 'workspaceImage':
      return image(node, ctx, scope);
    case 'table':
      return table(node, ctx, scope);
    default:
      return blocks(node.content, ctx, scope);
  }
}

function list(node: JSONContent, ctx: Context, scope: Scope, level: number): Block[] {
  const { d } = ctx;
  let reference = '';
  if (node.type === 'orderedList') {
    reference = `ordered-${ctx.lists.length + 1}`;
    ctx.lists.push({ reference, start: Number(node.attrs?.start) || 1 });
  }
  const indent = scope.indent + 720 * (level + 1);

  return (node.content ?? []).flatMap((item) => {
    let first = true;
    return (item.content ?? []).flatMap((child): Block[] => {
      if (child.type === 'bulletList' || child.type === 'orderedList' || child.type === 'taskList') return list(child, ctx, scope, level + 1);
      if (child.type !== 'paragraph' || !first) return block(child, ctx, { ...scope, indent });
      first = false;
      const base = textBlockOptions(ctx, child, scope);
      const content = runs(ctx, child.content, scope);
      if (node.type === 'taskList') {
        const box = new d.TextRun({ text: item.attrs?.checked ? '☑ ' : '☐ ' });
        return [paragraph(ctx, { ...base, indent: { left: indent, hanging: 360 }, children: [box, ...content] })];
      }
      const marker = node.type === 'orderedList' ? { numbering: { reference, level } } : { bullet: { level } };
      return [paragraph(ctx, { ...base, ...marker, children: content })];
    });
  });
}

function image(node: JSONContent, ctx: Context, scope: Scope): Block[] {
  const { d } = ctx;
  const attrs = node.attrs as WorkspaceImageAttrs;
  const format = /^data:image\/(png|jpe?g|gif|bmp);base64,/.exec(attrs.src)?.[1];
  const ratio = ctx.ratios.get(attrs.src);
  if (!format || !ratio) return [];
  const type = format === 'png' || format === 'gif' || format === 'bmp' ? format : 'jpg';
  const width = Math.max(8, Math.round((scope.width * attrs.width) / 100));
  const transformation = { width, height: Math.round(width * ratio) };

  if (attrs.wrap === 'topBottom') {
    const alignment = attrs.align === 'left' ? d.AlignmentType.LEFT : attrs.align === 'right' ? d.AlignmentType.RIGHT : d.AlignmentType.CENTER;
    return [paragraph(ctx, { alignment, children: [new d.ImageRun({ type, data: attrs.src, transformation })] })];
  }

  // Floating images hang from the paragraph that follows them, as they do in the editor.
  const floating =
    attrs.wrap === 'square'
      ? {
          horizontalPosition: {
            relative: d.HorizontalPositionRelativeFrom.COLUMN,
            align: attrs.align === 'right' ? d.HorizontalPositionAlign.RIGHT : d.HorizontalPositionAlign.LEFT,
          },
          verticalPosition: { relative: d.VerticalPositionRelativeFrom.PARAGRAPH, offset: 4 * EMU_PER_PX },
          wrap: { type: d.TextWrappingType.SQUARE, side: d.TextWrappingSide.BOTH_SIDES },
          margins: { top: 0, bottom: 8 * EMU_PER_PX, left: 18 * EMU_PER_PX, right: 18 * EMU_PER_PX },
          layoutInCell: true,
        }
      : {
          horizontalPosition: { relative: d.HorizontalPositionRelativeFrom.COLUMN, offset: Math.round(((scope.width * attrs.x) / 100) * EMU_PER_PX) },
          verticalPosition: {
            relative: attrs.anchored ? d.VerticalPositionRelativeFrom.PARAGRAPH : d.VerticalPositionRelativeFrom.MARGIN,
            offset: Math.round(attrs.y * EMU_PER_PX),
          },
          wrap: { type: d.TextWrappingType.NONE },
          allowOverlap: true,
          layoutInCell: true,
        };
  ctx.pending.push(new d.ImageRun({ type, data: attrs.src, transformation, floating }));
  return [];
}

function table(node: JSONContent, ctx: Context, scope: Scope): Block[] {
  const { d } = ctx;
  const out: Block[] = [];
  flushPending(ctx, out);

  const span = (cell: JSONContent, key: 'colspan' | 'rowspan') => Math.max(1, Number(cell.attrs?.[key]) || 1);
  const columns = Math.max(1, ...(node.content ?? []).map((row) => (row.content ?? []).reduce((sum, cell) => sum + span(cell, 'colspan'), 0)));

  const rows = (node.content ?? []).map((row) => {
    const cells = (row.content ?? []).map((cell) => {
      const header = cell.type === 'tableHeader';
      const width = Math.max(40, (scope.width * span(cell, 'colspan')) / columns - 18);
      const children = blocks(cell.content, ctx, { width, indent: 0, inCell: true, bold: header });
      flushPending(ctx, children);
      // Word needs every cell to end with a paragraph.
      if (!children.length || !(children[children.length - 1] instanceof d.Paragraph)) children.push(new d.Paragraph({}));
      return new d.TableCell({
        children,
        ...(span(cell, 'colspan') > 1 ? { columnSpan: span(cell, 'colspan') } : {}),
        ...(span(cell, 'rowspan') > 1 ? { rowSpan: span(cell, 'rowspan') } : {}),
        ...(header ? { shading: { type: d.ShadingType.CLEAR, fill: 'ECEEF0', color: 'auto' } } : {}),
        margins: { top: 60, bottom: 60, left: 120, right: 120 },
      });
    });
    return new d.TableRow({ children: cells });
  });

  if (rows.length) out.push(new d.Table({ rows, width: { size: 100, type: d.WidthType.PERCENTAGE } }));
  return out;
}
