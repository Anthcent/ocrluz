import type { Node as PMNode } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';

type Match = { from: number; to: number };

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

export function FindReplace({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [version, setVersion] = useState(0);
  const matches = useMemo(() => findMatches(editor.state.doc, query), [editor, query, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const { from } = editor.state.selection;
  const current = matches.findIndex((m) => m.from === from && m.to === editor.state.selection.to);

  const go = (direction: 1 | -1) => {
    if (!matches.length) return;
    const next =
      direction > 0
        ? (matches.find((m) => m.from > from) ?? matches[0])
        : ([...matches].reverse().find((m) => m.from < from) ?? matches[matches.length - 1]);
    editor.chain().focus().setTextSelection(next).scrollIntoView().run();
    setVersion((v) => v + 1);
  };

  const replaceOne = () => {
    const match = matches[current];
    if (!match) return go(1);
    editor.chain().focus().insertContentAt(match, replacement).run();
    setVersion((v) => v + 1);
    go(1);
  };

  const replaceAll = () => {
    if (!matches.length) return;
    const tr = editor.state.tr;
    // Back to front so earlier positions stay valid.
    for (const m of [...matches].reverse()) {
      if (replacement) tr.insertText(replacement, m.from, m.to);
      else tr.delete(m.from, m.to);
    }
    editor.view.dispatch(tr);
    setVersion((v) => v + 1);
  };

  return (
    <div
      data-export-ignore
      role="dialog"
      aria-label="Buscar y reemplazar"
      className="workspace-chrome fixed inset-x-3 top-3 z-50 space-y-2 rounded-2xl bg-white p-3 shadow-floating lg:left-auto lg:right-8 lg:top-24 lg:w-96"
    >
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && go(e.shiftKey ? -1 : 1)}
          placeholder="Buscar"
          aria-label="Buscar"
          className="h-10 min-w-0 flex-1 rounded-xl bg-polar px-3 text-sm font-semibold text-eel outline-none focus-visible:ring-4 focus-visible:ring-macaw/35"
        />
        <span className="w-14 shrink-0 text-center text-xs font-bold tabular-nums text-wolf">
          {query ? `${current >= 0 ? current + 1 : 0}/${matches.length}` : ''}
        </span>
        <PanelButton label="Anterior" onClick={() => go(-1)}><ChevronUp /></PanelButton>
        <PanelButton label="Siguiente" onClick={() => go(1)}><ChevronDown /></PanelButton>
        <PanelButton label="Cerrar búsqueda" onClick={onClose}><X /></PanelButton>
      </div>
      <div className="flex items-center gap-2">
        <input
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
          placeholder="Reemplazar con"
          aria-label="Reemplazar con"
          className="h-10 min-w-0 flex-1 rounded-xl bg-polar px-3 text-sm font-semibold text-eel outline-none focus-visible:ring-4 focus-visible:ring-macaw/35"
        />
        <button type="button" onClick={replaceOne} disabled={!matches.length} className="h-10 shrink-0 rounded-xl px-3 text-sm font-bold text-eel hover:bg-polar disabled:opacity-40">
          Reemplazar
        </button>
        <button type="button" onClick={replaceAll} disabled={!matches.length} className="h-10 shrink-0 rounded-xl bg-eel px-3 text-sm font-bold text-white hover:bg-eel-hover disabled:opacity-40">
          Todo
        </button>
      </div>
    </div>
  );
}

function PanelButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="flex size-9 shrink-0 items-center justify-center rounded-xl text-wolf hover:bg-polar hover:text-eel [&>svg]:size-4">
      {children}
    </button>
  );
}
