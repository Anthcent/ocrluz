import clsx from 'clsx';
import { Check, FileSearch, FolderPlus, Search, SearchX, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FolderCard } from '../components/FolderCard';
import { Snippet } from '../components/Snippet';
import { Modal, Segmented, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { categoryEmoji, GROUP_COLORS, GROUP_STYLES } from '../lib/constants';
import { timeAgo } from '../lib/format';
import type { Group, GroupColor } from '../lib/types';

type Sort = 'recientes' | 'nombre' | 'hojas';

const norm = (s: string) =>
  s
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const COLOR_NAME: Record<GroupColor, string> = { green: 'verde', blue: 'azul', purple: 'morado', orange: 'naranja', red: 'rojo', yellow: 'amarillo' };

interface TextHits {
  count: number;
  snippet: string;
}

/**
 * Buscador de carpetas para el escáner. Pensado para cuando no recuerdas el nombre:
 * busca por título, responsable, categoría o descripción, e incluso por una frase del texto
 * ya escaneado; además filtra por categoría y color, y ordena.
 */
export function GroupPicker({
  open,
  onClose,
  groups,
  selectedId,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  groups: Group[];
  selectedId: string;
  onSelect: (id: string | 'new') => void;
}) {
  const [query, setQuery] = useState('');
  const [inText, setInText] = useState(true);
  const [category, setCategory] = useState<string | null>(null);
  const [color, setColor] = useState<GroupColor | null>(null);
  const [sort, setSort] = useState<Sort>('recientes');
  const [textHits, setTextHits] = useState<Map<number, TextHits>>(new Map());
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setCategory(null);
    setColor(null);
  }, [open]);

  // Búsqueda dentro del texto de las páginas ya guardadas (en el servidor, con FTS).
  const q = query.trim();
  useEffect(() => {
    if (!open || !inText || q.length < 2) {
      setTextHits(new Map());
      setSearching(false);
      return;
    }
    let alive = true;
    setSearching(true);
    const t = setTimeout(() => {
      api
        .search(q, { type: 'group', limit: 200 })
        .then(({ results }) => {
          if (!alive) return;
          const hits = new Map<number, TextHits>();
          for (const r of results) {
            if (r.groupId === null) continue;
            const prev = hits.get(r.groupId);
            hits.set(r.groupId, { count: (prev?.count ?? 0) + 1, snippet: prev?.snippet ?? r.snippet });
          }
          setTextHits(hits);
        })
        .catch(() => alive && setTextHits(new Map()))
        .finally(() => alive && setSearching(false));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, inText, open]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of groups) if (g.category) counts.set(g.category, (counts.get(g.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [groups]);
  const colors = GROUP_COLORS.filter((c) => groups.some((g) => g.color === c));

  const results = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    const list = groups
      .filter((g) => (!category || g.category === category) && (!color || g.color === color))
      .map((g) => {
        const where: string[] = [];
        if (words.length) {
          const fields: [string, string][] = [
            ['Título', g.title],
            ['Responsable', g.author],
            ['Categoría', g.category],
            ['Descripción', g.description],
          ];
          const all = norm(fields.map((f) => f[1]).join(' '));
          if (words.every((w) => all.includes(w))) {
            for (const [label, value] of fields) if (words.some((w) => norm(value).includes(w))) where.push(label);
          }
        }
        const hits = textHits.get(g.id);
        return { group: g, where, hits, matches: !words.length || where.length > 0 || !!hits };
      })
      .filter((r) => r.matches);

    const byName = (a: Group, b: Group) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' });
    list.sort((a, b) => {
      // Primero lo que coincide en los datos de la carpeta, luego lo encontrado solo en el texto.
      if (words.length && !!a.where.length !== !!b.where.length) return a.where.length ? -1 : 1;
      if (sort === 'nombre') return byName(a.group, b.group);
      if (sort === 'hojas') return (b.group.scanCount ?? 0) - (a.group.scanCount ?? 0);
      return b.group.updatedAt.localeCompare(a.group.updatedAt);
    });
    return list;
  }, [groups, q, category, color, sort, textHits]);

  const pick = (id: string | 'new') => {
    onSelect(id);
    onClose();
  };

  const filtersActive = !!(q || category || color);

  // Rendered in a portal: the picker can live inside transformed panels (the mobile settings sheet).
  return createPortal(
    <Modal open={open} onClose={onClose} title="Elegir carpeta de destino" wide>
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-hare" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nombre, responsable, categoría o una frase del contenido"
            aria-label="Buscar carpeta por nombre o contenido"
            autoFocus
            className="w-full rounded-xl border border-transparent bg-polar py-3 pl-12 pr-11 text-base font-semibold outline-none transition-[background-color,box-shadow] placeholder:text-wolf focus:bg-white focus:shadow-[0_0_0_3px_rgba(163,142,249,0.35)]"
          />
          {searching ? (
            <Spinner className="absolute right-3 top-1/2 size-5 -translate-y-1/2" />
          ) : (
            query && (
              <button type="button" aria-label="Borrar lo escrito" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-hare hover:text-eel">
                <X className="size-5" />
              </button>
            )
          )}
        </div>

        <button
          type="button"
          aria-pressed={inText}
          onClick={() => setInText(!inText)}
          className={clsx(
            'flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition-[transform,background-color,color] duration-150 ease-out active:scale-[0.99]',
            inText ? 'bg-macaw-light text-macaw-dark' : 'bg-polar text-wolf hover:text-eel',
          )}
        >
          <FileSearch className="size-5 shrink-0" />
          <span className="flex-1">Incluir el contenido de las hojas archivadas</span>
          <span className={clsx('flex size-6 items-center justify-center rounded-lg', inText ? 'bg-eel text-white' : 'bg-white shadow-[inset_0_0_0_1px_var(--color-hare)]')}>
            {inText && <Check className="size-4" strokeWidth={3} />}
          </span>
        </button>

        {(categories.length > 0 || colors.length > 1) && (
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filtrar por categoría o color">
            {categories.map(([c, n]) => (
              <FilterChip key={c} selected={category === c} onClick={() => setCategory(category === c ? null : c)}>
                <span aria-hidden>{categoryEmoji(c)}</span> {c} <span className="text-xs opacity-70">{n}</span>
              </FilterChip>
            ))}
            {colors.length > 1 &&
              colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Solo color ${COLOR_NAME[c]}`}
                  aria-pressed={color === c}
                  onClick={() => setColor(color === c ? null : c)}
                  className={clsx('size-11 shrink-0 rounded-full ring-2 ring-offset-2 transition-transform active:scale-95', GROUP_STYLES[c].bg, color === c ? 'ring-eel' : 'ring-transparent')}
                />
              ))}
          </div>
        )}

        <Segmented<Sort>
          value={sort}
          onChange={setSort}
          options={[
            { value: 'recientes', label: 'Última actividad' },
            { value: 'nombre', label: 'Alfabético' },
            { value: 'hojas', label: 'Con más hojas' },
          ]}
        />

        <div className="flex items-center justify-between text-sm font-semibold text-wolf">
          <span data-testid="group-picker-count">
            Mostrando {results.length} de {groups.length}
          </span>
          {filtersActive && (
            <button
              type="button"
              className="min-h-11 font-bold text-macaw-dark underline decoration-macaw/40 underline-offset-2"
              onClick={() => {
                setQuery('');
                setCategory(null);
                setColor(null);
              }}
            >
              Limpiar búsqueda
            </button>
          )}
        </div>

        <ul className="space-y-2" aria-label="Resultados">
          {results.map(({ group: g, where, hits }) => {
            const selected = selectedId === String(g.id);
            const style = GROUP_STYLES[g.color];
            return (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => pick(String(g.id))}
                  aria-label={`Usar ${g.title}`}
                  className={clsx(
                    'flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-[transform,background-color,box-shadow] duration-150 ease-out active:scale-[0.99]',
                    selected ? 'bg-macaw-light shadow-[inset_0_0_0_2px_var(--color-macaw)]' : 'bg-polar hover:bg-polar-hover',
                  )}
                >
                  <FolderCard group={g} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{g.title}</div>
                    <div className="flex flex-wrap items-center gap-x-2 text-xs font-semibold text-wolf">
                      {g.author && <span className={clsx('font-bold', style.text)}>{g.author} (responsable)</span>}
                      {g.category && (
                        <span>
                          {categoryEmoji(g.category)} {g.category}
                        </span>
                      )}
                      <span>
                        {g.scanCount ?? 0}
                        {g.totalPages ? `/${g.totalPages}` : ''} {g.scanCount === 1 && !g.totalPages ? 'hoja' : 'hojas'}
                      </span>
                      <span>· {timeAgo(g.updatedAt)}</span>
                    </div>
                    {(where.length > 0 || hits) && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {where.map((w) => (
                          <span key={w} className="rounded-full bg-feather-light px-2 py-0.5 text-[11px] font-semibold text-feather-dark">
                            {w}
                          </span>
                        ))}
                        {hits && (
                          <span className="rounded-full bg-macaw-light px-2 py-0.5 text-[11px] font-semibold text-macaw-dark">
                            Aparece {hits.count} {hits.count === 1 ? 'vez' : 'veces'} en el contenido
                          </span>
                        )}
                      </div>
                    )}
                    {hits && (
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-wolf">
                        <Snippet value={hits.snippet} />
                      </p>
                    )}
                  </div>
                  {selected && <Check className="size-6 shrink-0 text-macaw-dark" strokeWidth={3} aria-label="Elegida" />}
                </button>
              </li>
            );
          })}
        </ul>

        {results.length === 0 && (
          <div className="rounded-2xl bg-polar p-5 text-center">
            <SearchX className="mx-auto size-8 text-wolf" aria-hidden />
            <div className="mt-2 font-bold">Sin resultados</div>
            <p className="text-sm font-semibold text-wolf">
              {inText ? 'Cambia las palabras o limpia los filtros.' : 'Activa «Incluir el contenido» y escribe una frase que recuerdes de las hojas.'}
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={() => pick('new')}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-eel py-3 font-bold text-white transition-[transform,background-color] duration-150 ease-out hover:bg-eel-hover active:scale-[0.99]"
        >
          <FolderPlus className="size-5" /> Empezar carpeta nueva
        </button>
      </div>
    </Modal>,
    document.body,
  );
}

function FilterChip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={clsx(
        'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-[transform,background-color,color] active:scale-[0.98]',
        selected ? 'bg-eel text-white' : 'bg-polar text-wolf hover:text-eel',
      )}
    >
      {children}
    </button>
  );
}
