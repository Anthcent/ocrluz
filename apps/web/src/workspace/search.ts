import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { Extension, type Editor } from '@tiptap/react';

export type Match = { from: number; to: number };

const fold = (value: string) => value.toLocaleLowerCase('es').normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Finds every occurrence of `query` inside text blocks, ignoring case and accents. */
export function findMatches(doc: PMNode, query: string): Match[] {
  const needle = fold(query);
  if (!needle) return [];
  const matches: Match[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    // Map every character of the block back to its document position.
    let text = '';
    const positions: number[] = [];
    node.forEach((child, offset) => {
      if (child.isText) {
        for (let i = 0; i < child.text!.length; i++) positions.push(pos + 1 + offset + i);
        text += child.text;
      } else {
        positions.push(pos + 1 + offset);
        text += '￼';
      }
    });
    // Fold char by char so indexes keep matching `positions`.
    const haystack = text.split('').map((c) => fold(c) || c).join('');
    for (let i = haystack.indexOf(needle); i >= 0; i = haystack.indexOf(needle, i + needle.length)) {
      matches.push({ from: positions[i], to: positions[i + needle.length - 1] + 1 });
    }
    return false;
  });
  return matches;
}

type SearchState = { query: string; decorations: DecorationSet };

const searchKey = new PluginKey<SearchState>('workspaceSearch');

/** Highlights every match of the active search; the one that is selected stands out. */
export const SearchHighlight = Extension.create({
  name: 'searchHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin<SearchState>({
        key: searchKey,
        state: {
          init: () => ({ query: '', decorations: DecorationSet.empty }),
          apply(tr, prev, _old, state) {
            const meta = tr.getMeta(searchKey) as string | undefined;
            const query = meta ?? prev.query;
            if (meta === undefined && !tr.docChanged && !tr.selectionSet) return prev;
            if (!query) return { query, decorations: DecorationSet.empty };
            const { from, to } = state.selection;
            const decorations = findMatches(state.doc, query).map((m) =>
              Decoration.inline(m.from, m.to, { class: m.from === from && m.to === to ? 'search-hit search-hit-current' : 'search-hit' }),
            );
            return { query, decorations: DecorationSet.create(state.doc, decorations) };
          },
        },
        props: {
          decorations: (state) => searchKey.getState(state)?.decorations,
        },
      }),
    ];
  },
});

/** Sets (or clears, with an empty string) the text highlighted in the document. */
export function setSearchQuery(editor: Editor, query: string) {
  if (editor.isDestroyed) return;
  editor.view.dispatch(editor.state.tr.setMeta(searchKey, query));
}
