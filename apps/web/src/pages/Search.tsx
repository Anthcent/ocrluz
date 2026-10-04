import clsx from 'clsx';
import { ChevronRight, Clock, FileText, Folder, Layers, Search as SearchIcon, Tag, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PageHeader } from '../components/PageHeader';
import { Snippet } from '../components/Snippet';
import { Spinner } from '../components/ui';
import { api } from '../lib/api';
import { GROUP_STYLES } from '../lib/constants';
import { DocTypeIcon } from '../components/DocTypeIcon';
import type { Group, SearchResult } from '../lib/types';

type TypeFilter = 'all' | 'group' | 'individual';
const RECENT_KEY = 'ocryon:recent-searches';

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // sin almacenamiento local: no pasa nada
  }
}

interface FolderHits {
  groupId: number;
  title: string;
  author: string;
  category: string;
  color: NonNullable<SearchResult['groupColor']>;
  hits: SearchResult[];
}

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [type, setType] = useState<TypeFilter>((params.get('tipo') as TypeFilter) || 'all');
  const [category, setCategory] = useState(params.get('categoria') ?? '');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const [groups, setGroups] = useState<Group[]>([]);

  useEffect(() => {
    api.groups.list().then((r) => setGroups(r.groups)).catch(() => {});
  }, []);

  const categories = useMemo(() => [...new Set(groups.map((g) => g.category).filter(Boolean))], [groups]);

  useEffect(() => {
    const q = query.trim();
    const next: Record<string, string> = {};
    if (q) next.q = q;
    if (type !== 'all') next.tipo = type;
    if (category) next.categoria = category;
    setParams(next, { replace: true });
    if (!q) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .search(q, { type, category: category || undefined })
        .then((r) => {
          setResults(r.results);
          setTotal(r.total);
          if (r.total > 0 && q.length >= 3) {
            setRecent((prev) => {
              const list = [q, ...prev.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 8);
              saveRecent(list);
              return list;
            });
          }
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, type, category, setParams]);

  // Resultados agrupados por carpeta, en el orden de relevancia del primer resultado.
  const { folders, singles } = useMemo(() => {
    const byFolder = new Map<number, FolderHits>();
    const singles: SearchResult[] = [];
    for (const r of results ?? []) {
      if (r.groupId === null) {
        singles.push(r);
        continue;
      }
      if (!byFolder.has(r.groupId)) {
        byFolder.set(r.groupId, {
          groupId: r.groupId,
          title: r.groupTitle ?? '',
          author: r.groupAuthor ?? '',
          category: r.groupCategory ?? '',
          color: r.groupColor ?? 'green',
          hits: [],
        });
      }
      byFolder.get(r.groupId)!.hits.push(r);
    }
    return { folders: [...byFolder.values()], singles };
  }, [results]);

  const clearRecent = () => {
    setRecent([]);
    saveRecent([]);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<SearchIcon />}
        title="¿Qué quieres encontrar?"
        subtitle="Busca cualquier palabra, nombre o número en todas tus carpetas y documentos."
      >
        <div className="relative">
          <SearchIcon className="absolute left-4 top-1/2 size-6 -translate-y-1/2 text-macaw-dark" />
          <input
            type="text"
            inputMode="search"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Escribe una palabra o frase…"
            autoFocus
            aria-label="Buscar"
            className="w-full rounded-xl border border-transparent bg-polar py-4 pl-14 pr-12 text-lg font-semibold text-eel placeholder:text-wolf outline-none transition-[background-color,box-shadow] focus:bg-white focus:shadow-[0_0_0_3px_rgba(163,142,249,0.35)]"
          />
          {loading ? (
            <Spinner className="absolute right-4 top-1/2 size-6 -translate-y-1/2" />
          ) : (
            query && (
              <button
                type="button"
                aria-label="Borrar búsqueda"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full text-wolf hover:bg-polar hover:text-eel"
              >
                <X className="size-5" />
              </button>
            )
          )}
        </div>
      </PageHeader>

      {/* Filtros */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <FilterChip selected={type === 'all'} onClick={() => setType('all')} icon={<Layers className="size-4" />} tone="blue">
          Todo
        </FilterChip>
        <FilterChip selected={type === 'group'} onClick={() => setType('group')} icon={<Folder className="size-4" />} tone="green">
          Carpetas
        </FilterChip>
        <FilterChip selected={type === 'individual'} onClick={() => setType('individual')} icon={<FileText className="size-4" />} tone="purple">
          Sueltos
        </FilterChip>
        {categories.length > 0 && <span className="mx-1 w-0.5 shrink-0 rounded bg-swan" />}
        {categories.map((c) => (
          <FilterChip key={c} selected={category === c} onClick={() => setCategory(category === c ? '' : c)} icon={<DocTypeIcon type={c} variant="inline" fallback={Tag} />} tone="orange">
            {c}
          </FilterChip>
        ))}
      </div>

      {results === null ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(41,36,68,0.06)]">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-bold">
                <Clock className="size-5 text-bee-dark" /> Búsquedas recientes
              </h2>
              {recent.length > 0 && (
                <button onClick={clearRecent} className="text-xs font-bold text-hare hover:text-eel">
                  Borrar
                </button>
              )}
            </div>
            {recent.length === 0 ? (
              <p className="text-sm text-wolf">Aquí aparecerán tus últimas búsquedas. La búsqueda ignora mayúsculas y acentos y encuentra palabras incompletas.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {recent.map((r) => (
                  <button
                    key={r}
                    onClick={() => setQuery(r)}
                    className="rounded-full bg-bee-light px-3 py-2 text-sm font-semibold text-bee-dark transition hover:bg-bee active:scale-[0.98]"
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </section>
          <section className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(41,36,68,0.06)]">
            <h2 className="mb-3 flex items-center gap-2 font-bold">
              <Folder className="size-5 text-feather-dark" /> Tus carpetas
            </h2>
            {groups.length === 0 ? (
              <p className="text-sm text-wolf">Cuando crees carpetas aparecerán aquí.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {groups.slice(0, 6).map((g) => (
                  <Link
                    key={g.id}
                    to={`/archivo/carpeta/${g.id}`}
                    className="truncate rounded-xl bg-polar px-3 py-2.5 text-sm font-semibold text-eel transition hover:bg-macaw-light hover:text-macaw-dark"
                  >
                    {g.title}
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : results.length === 0 && !loading ? (
        <div className="flex flex-col items-center rounded-2xl bg-white px-6 py-12 text-center shadow-[0_1px_2px_rgba(41,36,68,0.06)]">
          <span className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-macaw-light text-macaw-dark"><SearchIcon className="size-8" /></span>
          <h3 className="text-xl font-bold">Sin resultados</h3>
          <p className="mt-2 max-w-sm text-wolf">
            No encontramos «{query}»{type !== 'all' || category ? ' con esos filtros' : ''}. Prueba con otra palabra o quita los filtros.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <p className="font-semibold text-wolf">
            <span className="text-eel">{total}</span> {total === 1 ? 'resultado' : 'resultados'}
            {folders.length > 0 && (
              <>
                {' '}en <span className="text-eel">{folders.length}</span> {folders.length === 1 ? 'carpeta' : 'carpetas'}
              </>
            )}
            {singles.length > 0 && (
              <>
                {folders.length > 0 ? ' y ' : ' en '}
                <span className="text-eel">{singles.length}</span> {singles.length === 1 ? 'documento suelto' : 'documentos sueltos'}
              </>
            )}
            {total > (results?.length ?? 0) && <span className="text-hare"> (mostrando {results?.length})</span>}
          </p>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {folders.map((b) => (
              <FolderResults key={b.groupId} folder={b} />
            ))}
          </div>

          {singles.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
                <span className="flex size-8 items-center justify-center rounded-xl bg-beetle-light text-beetle-dark">
                  <FileText className="size-5" />
                </span>
                Documentos sueltos
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {singles.map((r) => (
                  <Link
                    key={r.id}
                    to={`/escaneo/${r.id}`}
                    className="block min-w-0 rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(41,36,68,0.06)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(41,36,68,0.10)] active:translate-y-0"
                  >
                    <div className="mb-1 truncate font-bold text-eel">{r.title}</div>
                    <p className="line-clamp-3 text-sm leading-relaxed text-wolf">
                      <Snippet value={r.snippet} />
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function FolderResults({ folder }: { folder: FolderHits }) {
  const style = GROUP_STYLES[folder.color];
  return (
    <section className="min-w-0 overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(41,36,68,0.06)]">
      <Link to={`/archivo/carpeta/${folder.groupId}`} className="flex items-center gap-3 bg-macaw-light p-4 text-eel transition hover:bg-[#e6e0fd]">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white text-macaw-dark">
          <Folder className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-bold leading-tight">{folder.title}</span>
          <span className="block truncate text-sm font-semibold text-wolf">
            {[folder.author && `Responsable: ${folder.author}`, folder.category].filter(Boolean).join(' · ') || 'Carpeta'}
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-sm font-bold text-macaw-dark">
          {folder.hits.length} {folder.hits.length === 1 ? 'coincidencia' : 'coincidencias'}
        </span>
      </Link>
      <ul className="divide-y divide-swan">
        {folder.hits.map((r) => (
          <li key={r.id}>
            <Link to={`/escaneo/${r.id}`} className="flex gap-3 p-4 transition hover:bg-polar">
              <span className={clsx('flex h-12 w-11 shrink-0 flex-col items-center justify-center rounded-xl leading-none', style.soft, style.text)}>
                <span className="text-[10px] font-semibold">pág.</span>
                <span className="text-base font-bold">{r.pageLabel || r.position + 1}</span>
              </span>
              <p className="min-w-0 flex-1 text-sm leading-relaxed text-wolf">
                <Snippet value={r.snippet} />
              </p>
              <ChevronRight className="mt-3 size-5 shrink-0 text-hare" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

const CHIP_TONES = {
  blue: 'bg-eel text-white',
  green: 'bg-macaw-light text-macaw-dark',
  purple: 'bg-macaw-light text-macaw-dark',
  orange: 'bg-bee-light text-bee-dark',
};

function FilterChip({
  selected,
  onClick,
  icon,
  tone,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  tone: keyof typeof CHIP_TONES;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={clsx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition-[transform,background-color,color] duration-200 active:scale-[0.98]',
        selected ? CHIP_TONES[tone] : 'bg-white text-wolf hover:bg-polar hover:text-eel',
      )}
    >
      {icon}
      {children}
    </button>
  );
}
