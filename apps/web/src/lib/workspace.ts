import type { JSONContent } from '@tiptap/react';
import { parseSegments } from '../components/TextWithTables';

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Converts the plain OCR text (with Markdown-style tables) into the editor's initial HTML. */
export function textToHtml(text: string): string {
  return parseSegments(text)
    .map((segment) => {
      if (segment.type === 'table') {
        const header = segment.header.map((cell) => `<th><p>${escapeHtml(cell)}</p></th>`).join('');
        const rows = segment.rows.map((row) => `<tr>${row.map((cell) => `<td><p>${escapeHtml(cell)}</p></td>`).join('')}</tr>`).join('');
        return `<table><tbody><tr>${header}</tr>${rows}</tbody></table>`;
      }
      return segment.content
        .split('\n')
        .map((line) => `<p>${escapeHtml(line)}</p>`)
        .join('');
    })
    .join('');
}

function inlineText(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  return (node.content ?? []).map(inlineText).join('');
}

const cellText = (cell: JSONContent) =>
  (cell.content ?? []).map(inlineText).join(' ').replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|');

function tableToText(table: JSONContent): string {
  const rows = (table.content ?? []).map((row) => (row.content ?? []).map(cellText));
  if (!rows.length) return '';
  const width = Math.max(...rows.map((r) => r.length));
  const line = (cells: string[]) => `| ${Array.from({ length: width }, (_, i) => cells[i] ?? '').join(' | ')} |`;
  const [header, ...body] = rows;
  return [line(header), `| ${Array.from({ length: width }, () => '---').join(' | ')} |`, ...body.map(line)].join('\n');
}

function blockToLines(node: JSONContent, prefix = ''): string[] {
  switch (node.type) {
    case 'paragraph':
    case 'heading':
      return [prefix + inlineText(node)];
    case 'bulletList':
      return (node.content ?? []).flatMap((item) => listItemLines(item, `${prefix}- `));
    case 'orderedList': {
      const start = (node.attrs?.start as number | undefined) ?? 1;
      return (node.content ?? []).flatMap((item, i) => listItemLines(item, `${prefix}${start + i}. `));
    }
    case 'taskList':
      return (node.content ?? []).flatMap((item) => listItemLines(item, `${prefix}[${item.attrs?.checked ? 'x' : ' '}] `));
    case 'blockquote':
      return (node.content ?? []).flatMap((child) => blockToLines(child, `${prefix}> `));
    case 'codeBlock':
      return inlineText(node).split('\n').map((l) => prefix + l);
    case 'horizontalRule':
      return [`${prefix}---`];
    case 'table':
      return ['', tableToText(node), ''];
    default:
      return (node.content ?? []).flatMap((child) => blockToLines(child, prefix));
  }
}

function listItemLines(item: JSONContent, marker: string): string[] {
  const indent = ' '.repeat(marker.length);
  return (item.content ?? []).flatMap((child, i) => blockToLines(child).map((l, j) => (i === 0 && j === 0 ? marker : indent) + l));
}

/**
 * Flattens the editor document back to plain text so search, analysis and
 * exports keep working; tables become Markdown rows that TextWithTables renders.
 */
export function docToText(doc: JSONContent): string {
  return (doc.content ?? [])
    .flatMap((node) => blockToLines(node))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
