import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { Extension, type Editor } from '@tiptap/react';
import { layoutPages, type LayoutBox } from './page';

/**
 * Page view: the document is one editable flow, and what makes it look like separate sheets are
 * spacers that push the first thing of every page past the bottom margin, the gap between sheets
 * and the top margin of the next one.
 *
 * - `push`: padding on top of a block or table row that starts a page.
 * - `widget`: an empty box before an image or rule, or in the middle of a paragraph that continues
 *   on the next page.
 */
type Spacer = { kind: 'push'; from: number; to: number; height: number } | { kind: 'widget'; pos: number; height: number; inline: boolean };

const key = new PluginKey<DecorationSet>('workspacePagination');

function toDecoration(spacer: Spacer) {
  if (spacer.kind === 'push') {
    return Decoration.node(spacer.from, spacer.to, { class: 'page-push', style: `--page-push: ${spacer.height}px` }, { spacer });
  }
  return Decoration.widget(
    spacer.pos,
    () => {
      const el = document.createElement(spacer.inline ? 'span' : 'div');
      el.className = 'page-spacer';
      el.style.height = `${spacer.height}px`;
      el.contentEditable = 'false';
      return el;
    },
    { side: -1, key: `page-spacer-${spacer.inline}-${spacer.height}`, ignoreSelection: true, spacer },
  );
}

export const Pagination = Extension.create({
  name: 'pagination',

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const spacers = tr.getMeta(key) as Spacer[] | undefined;
            return spacers ? DecorationSet.create(tr.doc, spacers.map(toDecoration)) : set.map(tr.mapping, tr.doc);
          },
        },
        props: { decorations: (state) => key.getState(state) },
      }),
    ];
  },
});

const signature = (spacers: Spacer[]) => spacers.map((s) => (s.kind === 'push' ? `p${s.from}-${s.to}:${s.height}` : `w${s.pos}:${s.height}:${s.inline}`)).join('|');

function setSpacers(editor: Editor, spacers: Spacer[]) {
  const current = (key.getState(editor.state)?.find() ?? []).map((d) => (d.spec as { spacer: Spacer }).spacer);
  if (signature(current) === signature(spacers)) return;
  editor.view.dispatch(editor.state.tr.setMeta(key, spacers).setMeta('addToHistory', false));
}

/** Removes the page gaps (for the view that adapts to the screen). */
export function clearPagination(editor: Editor) {
  if (!editor.isDestroyed) setSpacers(editor, []);
}

/**
 * Lays the document out in pages: measures it without spacers, decides what starts each page and
 * places the spacers. Returns how many pages there are.
 *
 * `pageHeight` is the height of a page's text area and `dead` what separates two of them (bottom
 * margin + gap + top margin).
 */
export function paginate(editor: Editor, content: HTMLElement, pageHeight: number, dead: number): number {
  if (editor.isDestroyed) return 1;
  const { view } = editor;

  // Spacers collapse while measuring, so the result does not depend on the previous layout.
  content.classList.add('page-measuring');
  let pages = 1;
  const spacers: Spacer[] = [];
  try {
    const layout = layoutPages(content, pageHeight);
    pages = layout.starts.length;
    let pushed = 0;
    layout.firsts.forEach((first, i) => {
      if (!first) return;
      // After the spacer, this box must sit at the top of page i + 1.
      const height = Math.round((i + 1) * (pageHeight + dead) - layout.starts[i + 1] - pushed);
      const spacer = height > 0 ? spacerFor(view, first, height) : null;
      if (spacer) {
        spacers.push(spacer);
        pushed += height;
      }
    });
  } catch {
    // A node that cannot be located just stays unpaged until the next change.
  } finally {
    content.classList.remove('page-measuring');
  }
  setSpacers(editor, spacers);
  return pages;
}

function spacerFor(view: EditorView, box: LayoutBox, height: number): Spacer | null {
  const { doc } = view.state;

  if (!box.line) {
    if (box.el.tagName === 'TR') {
      const $pos = doc.resolve(view.posAtDOM(box.el, 0));
      for (let depth = $pos.depth; depth > 0; depth--) {
        if ($pos.node(depth).type.name === 'tableRow') return { kind: 'push', from: $pos.before(depth), to: $pos.after(depth), height };
      }
      return null;
    }
    // Image or rule: an empty box right before it.
    const dom = box.el.closest<HTMLElement>('.react-renderer') ?? box.el;
    const inside = view.posAtDOM(dom, 0);
    const pos = [inside, inside - 1].find((p) => p >= 0 && doc.nodeAt(p)?.isLeaf);
    return pos === undefined ? null : { kind: 'widget', pos, height, inline: false };
  }

  if (!box.line.first) {
    // The paragraph continues on the next page: the spacer goes where that line starts.
    const pos = lineStart(view, box.el, box.line.clientTop);
    return pos === null ? null : { kind: 'widget', pos, height, inline: true };
  }

  // First line of a block: push the outermost block that starts with it (the list item or quote, not just its paragraph).
  const $pos = doc.resolve(view.posAtDOM(box.el, 0));
  let depth = $pos.depth;
  while (depth > 1 && $pos.index(depth - 1) === 0) depth--;
  if (depth < 1) return null;
  return { kind: 'push', from: $pos.before(depth), to: $pos.after(depth), height };
}

/** Document position of the first character of the visual line that starts at `top` (screen px) inside `block`. */
function lineStart(view: EditorView, block: HTMLElement, top: number): number | null {
  const range = document.createRange();
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);

  /** Whether the character at `offset` (or the next visible one) is on that line or a later one. */
  const reached = (node: Text, offset: number): boolean | null => {
    for (let o = offset; o < node.length; o++) {
      range.setStart(node, o);
      range.setEnd(node, o + 1);
      const rect = range.getClientRects()[0];
      if (rect && rect.height > 0) return (rect.top + rect.bottom) / 2 >= top;
    }
    return null;
  };

  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (!node.length) continue;
    // Does the line start inside this text node?
    let last: boolean | null = null;
    for (let o = node.length - 1; o >= 0 && last === null; o--) last = reached(node, o);
    if (!last) continue;
    let low = 0;
    let high = node.length - 1;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (reached(node, mid) !== false) high = mid;
      else low = mid + 1;
    }
    return view.posAtDOM(node, low);
  }
  return null;
}
