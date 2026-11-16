import type { Editor } from '@tiptap/react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { findMatches, setSearchQuery } from './search';

export function FindReplace({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [version, setVersion] = useState(0);
  const matches = useMemo(() => findMatches(editor.state.doc, query), [editor, query, version]); // eslint-disable-line react-hooks/exhaustive-deps

  // Every match stays highlighted in the document while the panel is open.
  useEffect(() => {
    setSearchQuery(editor, query);
  }, [editor, query]);
  useEffect(() => () => setSearchQuery(editor, ''), [editor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { from } = editor.state.selection;
  const current = matches.findIndex((m) => m.from === from && m.to === editor.state.selection.to);

  const go = (direction: 1 | -1) => {
    if (!matches.length) return;
    const next =
      direction > 0
        ? (matches.find((m) => m.from > from) ?? matches[0])
        : ([...matches].reverse().find((m) => m.from < from) ?? matches[matches.length - 1]);
    // The selection moves without taking the focus, so Enter keeps jumping to the next match.
    editor.chain().setTextSelection(next).scrollIntoView().run();
    setVersion((v) => v + 1);
  };

  const replaceOne = () => {
    const match = matches[current];
    if (!match) return go(1);
    editor.chain().insertContentAt(match, replacement).run();
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
      className="workspace-chrome fixed inset-x-2 top-2 z-50 space-y-2 rounded-2xl bg-white p-2.5 shadow-floating sm:inset-x-3 sm:top-3 sm:p-3 lg:left-auto lg:right-8 lg:top-24 lg:w-96"
    >
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && go(e.shiftKey ? -1 : 1)}
          placeholder="Buscar"
          aria-label="Buscar"
          enterKeyHint="search"
          className="h-11 min-w-0 flex-1 rounded-xl bg-polar px-3 text-base font-semibold text-eel outline-none focus-visible:ring-4 focus-visible:ring-macaw/35 lg:h-10 lg:text-sm"
        />
        <span aria-live="polite" className="w-12 shrink-0 text-center text-xs font-bold tabular-nums text-wolf">
          {query ? `${current >= 0 ? current + 1 : 0}/${matches.length}` : ''}
        </span>
        <PanelButton label="Anterior" onClick={() => go(-1)}><ChevronUp /></PanelButton>
        <PanelButton label="Siguiente" onClick={() => go(1)}><ChevronDown /></PanelButton>
        <PanelButton label="Cerrar búsqueda" onClick={onClose}><X /></PanelButton>
      </div>
      <div className="flex items-center gap-1.5">
        <input
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
          placeholder="Reemplazar con"
          aria-label="Reemplazar con"
          className="h-11 min-w-0 flex-1 rounded-xl bg-polar px-3 text-base font-semibold text-eel outline-none focus-visible:ring-4 focus-visible:ring-macaw/35 lg:h-10 lg:text-sm"
        />
        <button type="button" onClick={replaceOne} disabled={!matches.length} className="h-11 shrink-0 rounded-xl px-3 text-sm font-bold text-eel hover:bg-polar disabled:opacity-40 lg:h-10">
          Reemplazar
        </button>
        <button type="button" onClick={replaceAll} disabled={!matches.length} className="h-11 shrink-0 rounded-xl bg-eel px-3 text-sm font-bold text-white hover:bg-eel-hover disabled:opacity-40 lg:h-10">
          Todo
        </button>
      </div>
    </div>
  );
}

function PanelButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="flex size-10 shrink-0 items-center justify-center rounded-xl text-wolf hover:bg-polar hover:text-eel lg:size-9 [&>svg]:size-4">
      {children}
    </button>
  );
}
