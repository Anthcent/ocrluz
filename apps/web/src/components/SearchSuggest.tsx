import clsx from 'clsx';
import { ArrowRight, Clock3, FileText, FolderOpen, LoaderCircle, Search, Tag } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../lib/api';
import type { SearchResult } from '../lib/types';
import { Snippet } from './Snippet';

// Shared with the search page so both show the same history.
const RECENT_KEY = 'ocryon:recent-searches';
const MIN_CHARS = 2;
const DEBOUNCE_MS = 220;

function loadRecent(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((v): v is string => typeof v === 'string').slice(0, 5) : [];
  } catch {
    return [];
  }
}

function saveRecent(term: string) {
  try {
    const list = [term, ...loadRecent().filter((r) => r.toLowerCase() !== term.toLowerCase())].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // History is a convenience; ignore blocked storage.
  }
}

const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

type Option = { kind: 'term'; term: string; recent: boolean } | { kind: 'scan'; result: SearchResult } | { kind: 'all'; term: string };

export function SearchSuggest({ terms, className }: { terms: string[]; className?: string }) {
  const navigate = useNavigate();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const requestId = useRef(0);

  const trimmed = query.trim();
  const searching = trimmed.length >= MIN_CHARS;

  useEffect(() => {
    if (!searching) {
      setResults([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .search(trimmed, { limit: 5 })
        .then((r) => {
          if (id !== requestId.current) return;
          setResults(r.results);
          setTotal(r.total);
        })
        .catch(() => {
          if (id === requestId.current) setResults([]);
        })
        .finally(() => {
          if (id === requestId.current) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed, searching]);

  const termMatches = trimmed
    ? terms.filter((t) => normalize(t).startsWith(normalize(trimmed)) && normalize(t) !== normalize(trimmed)).slice(0, 3)
    : [];

  const options: Option[] = searching
    ? [
        ...termMatches.map((term) => ({ kind: 'term' as const, term, recent: false })),
        ...results.map((result) => ({ kind: 'scan' as const, result })),
        { kind: 'all', term: trimmed },
      ]
    : trimmed
      ? termMatches.map((term) => ({ kind: 'term' as const, term, recent: false }))
      : recent.map((term) => ({ kind: 'term' as const, term, recent: true }));

  const showPanel = open && (options.length > 0 || searching);

  const goToSearch = (term: string) => {
    const value = term.trim();
    if (!value) return;
    saveRecent(value);
    setOpen(false);
    navigate(`/buscar?q=${encodeURIComponent(value)}`);
  };

  const choose = (option: Option) => {
    if (option.kind === 'scan') {
      saveRecent(trimmed);
      setOpen(false);
      navigate(`/escaneo/${option.result.id}`);
    } else {
      goToSearch(option.term);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (showPanel && active >= 0 && options[active]) choose(options[active]);
    else goToSearch(query);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (options.length ? (i + 1) % options.length : -1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (options.length ? (i <= 0 ? options.length - 1 : i - 1) : -1));
    } else if (event.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  };

  const optionId = (index: number) => `${listId}-option-${index}`;
  const firstScan = options.findIndex((o) => o.kind === 'scan');

  return (
    <div className={clsx('relative', className)}>
      <form
        onSubmit={submit}
        role="search"
        className="flex items-center gap-3 rounded-2xl bg-white p-2 pl-4 shadow-floating ring-2 ring-macaw/15 transition-shadow focus-within:ring-macaw sm:p-2.5 sm:pl-5"
      >
        <Search className="size-6 shrink-0 text-macaw-dark" />
        <label htmlFor={`${listId}-input`} className="sr-only">
          Buscar en todo tu archivo
        </label>
        <input
          id={`${listId}-input`}
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showPanel && active >= 0 ? optionId(active) : undefined}
          autoComplete="off"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => {
            setRecent(loadRecent());
            setOpen(true);
          }}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          placeholder="Busca un nombre, una cédula o cualquier frase"
          className="min-h-11 min-w-0 flex-1 bg-transparent text-base font-semibold text-eel outline-none placeholder:font-medium placeholder:text-wolf sm:text-lg"
        />
        {loading && <LoaderCircle aria-hidden="true" className="size-5 shrink-0 animate-spin text-wolf" />}
        <button
          type="submit"
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-bold text-on-accent transition-colors hover:bg-accent-hover sm:min-h-12 sm:px-6"
        >
          <span className="hidden sm:inline">Buscar</span> <ArrowRight className="size-5" />
        </button>
      </form>

      {showPanel && (
        <div className="animate-fade-in absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl bg-white shadow-floating ring-1 ring-swan">
          <ul id={listId} role="listbox" aria-label="Sugerencias de búsqueda" className="max-h-[min(26rem,60vh)] overflow-y-auto py-2">
            {!searching && recent.length > 0 && <GroupLabel>Búsquedas recientes</GroupLabel>}
            {options.map((option, index) => (
              <li
                key={option.kind === 'scan' ? `scan-${option.result.id}` : `${option.kind}-${option.term}`}
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
                onMouseEnter={() => setActive(index)}
                className={clsx('mx-2 cursor-pointer rounded-xl', index === active && 'bg-polar', option.kind === 'all' && 'mt-1')}
              >
                {index === firstScan && <span className="sr-only">Hojas encontradas:</span>}
                {option.kind === 'term' && (
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    {option.recent ? <Clock3 className="size-4 shrink-0 text-wolf" /> : <Tag className="size-4 shrink-0 text-macaw-dark" />}
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-eel">{option.term}</span>
                    <span className="shrink-0 text-xs text-hare">{option.recent ? 'Reciente' : 'Tipo de documento'}</span>
                  </div>
                )}
                {option.kind === 'scan' && (
                  <div className="flex items-start gap-3 px-3 py-2.5">
                    <span
                      className={clsx(
                        'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg',
                        option.result.groupId ? 'bg-macaw-light text-macaw-dark' : 'bg-cardinal-light text-cardinal-dark',
                      )}
                    >
                      {option.result.groupId ? <FolderOpen className="size-4" /> : <FileText className="size-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-bold text-eel">{option.result.title || 'Sin título'}</span>
                        <span className="shrink-0 text-xs text-hare">{option.result.groupTitle ?? 'Suelto'}</span>
                      </span>
                      <span className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-wolf">
                        <Snippet value={option.result.snippet} />
                      </span>
                    </span>
                  </div>
                )}
                {option.kind === 'all' && (
                  <div className="flex items-center gap-3 border-t border-swan px-3 py-2.5 text-sm font-bold text-macaw-dark">
                    <Search className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">
                      {total > results.length ? `Ver los ${total} resultados` : 'Ver todos los resultados'} para «{option.term}»
                    </span>
                    <ArrowRight className="size-4 shrink-0" />
                  </div>
                )}
              </li>
            ))}
          </ul>
          {searching && !loading && results.length === 0 && (
            <p className="border-t border-swan px-5 py-3 text-sm text-wolf" role="status">
              Ninguna hoja contiene «{trimmed}» todavía.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function GroupLabel({ children }: { children: string }) {
  return (
    <li role="presentation" className="px-5 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wide text-hare">
      {children}
    </li>
  );
}
