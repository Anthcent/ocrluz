import { Extension, Node, type Editor } from '@tiptap/react';

const BLOCKS = ['paragraph', 'heading'];
const MAX_INDENT = 8;

/** Word-style paragraph formatting: left indent (in steps of 2em) and line spacing. */
export const ParagraphFormat = Extension.create({
  name: 'paragraphFormat',

  addGlobalAttributes() {
    return [
      {
        types: BLOCKS,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (el: HTMLElement) => Number(el.getAttribute('data-indent')) || 0,
            renderHTML: (attrs: Record<string, unknown>) =>
              attrs.indent ? { 'data-indent': String(attrs.indent), style: `margin-left: ${Number(attrs.indent) * 2}em` } : {},
          },
          lineHeight: {
            default: null,
            parseHTML: (el: HTMLElement) => el.style.lineHeight || null,
            renderHTML: (attrs: Record<string, unknown>) => (attrs.lineHeight ? { style: `line-height: ${attrs.lineHeight}` } : {}),
          },
        },
      },
    ];
  },
});

const LIST_ITEMS = ['listItem', 'taskItem'];

/** Indents a list item one level, or a paragraph one step when not in a list. */
export function indent(editor: Editor, direction: 1 | -1) {
  const listItem = LIST_ITEMS.find((name) => editor.isActive(name));
  if (listItem) {
    return direction > 0 ? editor.chain().focus().sinkListItem(listItem).run() : editor.chain().focus().liftListItem(listItem).run();
  }
  const { $from } = editor.state.selection;
  const current = Number($from.parent.attrs.indent) || 0;
  const next = Math.min(MAX_INDENT, Math.max(0, current + direction));
  return editor.chain().focus().updateAttributes('paragraph', { indent: next }).updateAttributes('heading', { indent: next }).run();
}

export function setLineHeight(editor: Editor, value: string | null) {
  return editor.chain().focus().updateAttributes('paragraph', { lineHeight: value }).updateAttributes('heading', { lineHeight: value }).run();
}

/** Starts a new page from here on (in the page guides, the PDF, Word and print). Not allowed inside tables. */
export function insertPageBreak(editor: Editor) {
  if (editor.isActive('table')) return false;
  return editor.chain().focus().insertContent([{ type: 'pageBreak' }, { type: 'paragraph' }]).run();
}

/** Manual page break, shown in the editor as a labeled dashed line. */
export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'div[data-page-break]' }];
  },

  renderHTML() {
    return ['div', { 'data-page-break': '', class: 'page-break' }];
  },

  addKeyboardShortcuts() {
    return { 'Mod-Enter': () => insertPageBreak(this.editor as Editor) };
  },
});
