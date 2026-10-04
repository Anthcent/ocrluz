import clsx from 'clsx';
import { CheckSquare, CircleAlert, Eye, GripVertical, ImagePlus, RotateCw, ScanText, Square, Trash2, TriangleAlert, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { detectPageLabel } from '../lib/page-number';
import type { PendingPage } from '../lib/pages-store';
import { qualityCopy } from './quality';
import { ScanProgressBar } from './ScanProgressBar';
import type { ScanProgress } from './ScanSession';
import { STATUS } from './status';
import { useObjectUrl } from './useObjectUrl';

const LONG_PRESS_MS = 380;
const MOUSE_DRAG_SLOP = 6;
const TOUCH_CANCEL_SLOP = 8;
const STAGGER_MS = 45;
const MAX_STAGGER = 8;

interface Props {
  pages: PendingPage[];
  progress: Record<string, ScanProgress>;
  onOpen: (id: string) => void;
  onRead: (ids: string[]) => void;
  onRotate: (ids: string[]) => void;
  onRemove: (ids: string[]) => void;
  onReorder: (id: string, toIndex: number) => void;
  onAdd: () => void;
  /** Extra controls for the header row (e.g. mobile-only actions). */
  headerExtra?: ReactNode;
}

interface DragState {
  id: string;
  pointerId: number;
  el: HTMLElement;
  grabX: number;
  grabY: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
}

const busyStatus = (p: PendingPage) => p.status === 'scanning' || p.status === 'queued';

/**
 * Sheets of the batch in archive order. Reorder by dragging (mouse, or long-press on touch),
 * or with the arrow keys on each card's grip. A selection mode enables bulk actions.
 */
export function SheetGrid({ pages, progress, onOpen, onRead, onRotate, onRemove, onReorder, onAdd, headerExtra }: Props) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [order, setOrderState] = useState<string[] | null>(null);
  const orderRef = useRef<string[] | null>(null);
  const setOrder = (next: string[] | null) => {
    orderRef.current = next;
    setOrderState(next);
  };
  const [announcement, setAnnouncement] = useState('');
  const drag = useRef<DragState | null>(null);
  const suppressClick = useRef(false);
  const refocus = useRef<string | null>(null);

  // Staggered entrance only for sheets that appear after the first render of each batch of additions.
  const seen = useRef(new Map<string, number>());
  let fresh = 0;
  for (const p of pages) if (!seen.current.has(p.id)) seen.current.set(p.id, Math.min(fresh++, MAX_STAGGER));

  const byId = useMemo(() => new Map(pages.map((p) => [p.id, p])), [pages]);
  const ordered = order ? order.map((id) => byId.get(id)).filter((p): p is PendingPage => Boolean(p)) : pages;

  // Drop selections of sheets that no longer exist.
  useEffect(() => {
    setSelected((s) => {
      const next = new Set([...s].filter((id) => byId.has(id)));
      return next.size === s.size ? s : next;
    });
    if (pages.length === 0) setSelecting(false);
  }, [byId, pages.length]);

  const position = useCallback(() => {
    const d = drag.current;
    if (!d) return;
    const rect = d.el.getBoundingClientRect();
    const baseLeft = rect.left - d.tx;
    const baseTop = rect.top - d.ty;
    d.tx = d.x - d.grabX - baseLeft;
    d.ty = d.y - d.grabY - baseTop;
    d.el.style.transform = `translate(${d.tx}px, ${d.ty}px) scale(1.04)`;
  }, []);

  // After the preview order changes the card moved in the layout: keep it under the pointer.
  useLayoutEffect(() => {
    position();
  }, [order, position]);

  useLayoutEffect(() => {
    if (!refocus.current) return;
    document.querySelector<HTMLElement>(`[data-grip-id="${refocus.current}"]`)?.focus();
    refocus.current = null;
  });

  const startDrag = useCallback(
    (id: string, el: HTMLElement, pointerId: number, x: number, y: number) => {
      const rect = el.getBoundingClientRect();
      drag.current = { id, pointerId, el, grabX: x - rect.left, grabY: y - rect.top, x, y, tx: 0, ty: 0 };
      el.style.transition = 'none';
      el.style.zIndex = '20';
      el.style.pointerEvents = 'none';
      el.style.boxShadow = '0 12px 32px rgba(30,27,48,0.22)';
      setOrder(pages.map((p) => p.id));
      navigator.vibrate?.(12);

      const preventScroll = (e: TouchEvent) => e.preventDefault();
      const onMove = (e: PointerEvent) => {
        const d = drag.current;
        if (!d || e.pointerId !== d.pointerId) return;
        d.x = e.clientX;
        d.y = e.clientY;
        position();
        if (e.clientY < 90) window.scrollBy(0, -14);
        else if (e.clientY > window.innerHeight - 170) window.scrollBy(0, 14);
        const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-sheet-id]');
        const overId = over?.dataset.sheetId;
        if (!overId || overId === d.id) return;
        const current = orderRef.current;
        if (!current) return;
        const from = current.indexOf(d.id);
        const to = current.indexOf(overId);
        if (from < 0 || to < 0) return;
        const next = [...current];
        next.splice(from, 1);
        next.splice(to, 0, d.id);
        setOrder(next);
      };
      const onEnd = (e: PointerEvent) => {
        const d = drag.current;
        if (!d || e.pointerId !== d.pointerId) return;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        window.removeEventListener('pointercancel', onEnd);
        window.removeEventListener('touchmove', preventScroll);
        drag.current = null;
        suppressClick.current = true;
        setTimeout(() => (suppressClick.current = false), 0);
        const card = d.el;
        card.style.transition = 'transform 200ms var(--ease-out-strong), box-shadow 200ms ease-out';
        card.style.transform = '';
        card.style.boxShadow = '';
        card.style.pointerEvents = '';
        setTimeout(() => {
          card.style.transition = '';
          card.style.zIndex = '';
        }, 220);
        const to = orderRef.current?.indexOf(d.id) ?? -1;
        if (to >= 0) {
          onReorder(d.id, to);
          setAnnouncement(`Hoja colocada en la posición ${to + 1}`);
        }
        setOrder(null);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onEnd);
      window.addEventListener('pointercancel', onEnd);
      window.addEventListener('touchmove', preventScroll, { passive: false });
    },
    [pages, position, onReorder],
  );

  const moveByKey = (id: string, index: number, to: number) => {
    const target = Math.max(0, Math.min(pages.length - 1, to));
    if (target === index) return;
    refocus.current = id;
    onReorder(id, target);
    setAnnouncement(`Hoja ${index + 1} movida a la posición ${target + 1} de ${pages.length}`);
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exitSelection = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const selectedPages = pages.filter((p) => selected.has(p.id));
  const readable = selectedPages.filter((p) => p.status === 'pending' || p.status === 'error' || p.status === 'done').map((p) => p.id);
  const idle = selectedPages.filter((p) => !busyStatus(p)).map((p) => p.id);
  const removable = selectedPages.filter((p) => p.status !== 'scanning').map((p) => p.id);
  const allSelected = selected.size === pages.length && pages.length > 0;

  return (
    <section aria-labelledby="sheet-grid-title">
      <div className="mb-3 flex min-h-11 flex-wrap items-center justify-between gap-2">
        <h2 id="sheet-grid-title" className="flex items-center gap-2 text-lg font-bold">
          Hojas del lote
          <span className="rounded-full bg-white px-2.5 py-0.5 text-sm font-semibold tabular-nums text-eel">{pages.length}</span>
        </h2>
        <div className="flex flex-wrap items-center gap-1">
          {headerExtra}
          <button
            type="button"
            onClick={() => (selecting ? exitSelection() : setSelecting(true))}
            aria-pressed={selecting}
            className={clsx(
              'inline-flex h-11 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97]',
              selecting ? 'bg-eel text-white' : 'text-eel hover:bg-white',
            )}
          >
            <CheckSquare className="size-4" /> {selecting ? 'Terminar selección' : 'Elegir varias'}
          </button>
        </div>
      </div>

      {selecting && (
        <div
          role="toolbar"
          aria-label="Acciones para las hojas elegidas"
          className="sticky top-[4.5rem] z-20 mb-3 flex animate-swap-in flex-wrap items-center gap-1 rounded-2xl bg-eel p-1.5 text-white shadow-[0_12px_32px_rgba(30,27,48,0.16)] lg:top-[5.5rem]"
        >
          <span className="px-2.5 text-sm font-bold tabular-nums" aria-live="polite">
            {selected.size} {selected.size === 1 ? 'elegida' : 'elegidas'}
          </span>
          <BulkButton onClick={() => setSelected(allSelected ? new Set() : new Set(pages.map((p) => p.id)))}>
            {allSelected ? <Square className="size-4" /> : <CheckSquare className="size-4" />}
            {allSelected ? 'Ninguna' : 'Todas'}
          </BulkButton>
          <span className="ml-auto flex flex-wrap gap-1">
            <BulkButton disabled={readable.length === 0} onClick={() => onRead(readable)}>
              <ScanText className="size-4" /> Leer
            </BulkButton>
            <BulkButton disabled={idle.length === 0} onClick={() => onRotate(idle)}>
              <RotateCw className="size-4" /> Girar
            </BulkButton>
            <BulkButton danger disabled={removable.length === 0} onClick={() => onRemove(removable)}>
              <Trash2 className="size-4" /> Descartar
            </BulkButton>
            <button
              type="button"
              aria-label="Salir de la selección"
              onClick={exitSelection}
              className="flex size-11 items-center justify-center rounded-xl text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="size-5" />
            </button>
          </span>
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(176px,1fr))] sm:gap-4" aria-label="Hojas en orden de archivo">
        {ordered.map((page, i) => (
          <SheetCard
            key={page.id}
            page={page}
            progress={progress[page.id]}
            index={i}
            total={ordered.length}
            delay={(seen.current.get(page.id) ?? 0) * STAGGER_MS}
            selecting={selecting}
            selected={selected.has(page.id)}
            dragging={order !== null && drag.current?.id === page.id}
            onToggle={() => toggle(page.id)}
            onOpen={() => {
              if (!suppressClick.current) onOpen(page.id);
            }}
            onRead={() => onRead([page.id])}
            onRemove={() => onRemove([page.id])}
            onKeyMove={(to) => moveByKey(page.id, i, to)}
            onStartDrag={(el, pointerId, x, y) => startDrag(page.id, el, pointerId, x, y)}
          />
        ))}
        <li>
          <button
            type="button"
            onClick={onAdd}
            className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 rounded-2xl text-wolf shadow-[inset_0_0_0_1.5px_var(--color-swan)] transition-[transform,background-color,color,box-shadow] duration-150 ease-out hover:bg-white hover:text-macaw-dark hover:shadow-[inset_0_0_0_1.5px_var(--color-macaw)] active:scale-[0.98]"
          >
            <ImagePlus className="size-8" />
            <span className="text-sm font-bold">Sumar hojas</span>
          </button>
        </li>
      </ul>
    </section>
  );
}

function BulkButton({ children, onClick, disabled, danger }: { children: ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-bold transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40',
        danger ? 'text-cardinal-light hover:bg-cardinal hover:text-white' : 'hover:bg-white/10',
      )}
    >
      {children}
    </button>
  );
}

function SheetCard({
  page,
  progress,
  index,
  total,
  delay,
  selecting,
  selected,
  dragging,
  onToggle,
  onOpen,
  onRead,
  onRemove,
  onKeyMove,
  onStartDrag,
}: {
  page: PendingPage;
  progress?: ScanProgress;
  index: number;
  total: number;
  delay: number;
  selecting: boolean;
  selected: boolean;
  dragging: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onRead: () => void;
  onRemove: () => void;
  onKeyMove: (to: number) => void;
  onStartDrag: (el: HTMLElement, pointerId: number, x: number, y: number) => void;
}) {
  const url = useObjectUrl(page.image);
  const card = useRef<HTMLLIElement>(null);
  const press = useRef<{ x: number; y: number; pointerId: number; timer?: ReturnType<typeof setTimeout> } | null>(null);
  const status = STATUS[page.status];
  const StatusIcon = status.icon;
  const n = index + 1;
  const pageLabel = page.status === 'done' ? detectPageLabel(page.text) : '';
  const quality = qualityCopy(page.quality);

  useEffect(() => () => clearTimeout(press.current?.timer), []);

  const begin = (e: ReactPointerEvent, immediate: boolean) => {
    if (selecting || e.button !== 0 || !card.current) return;
    if (immediate) {
      e.preventDefault();
      onStartDrag(card.current, e.pointerId, e.clientX, e.clientY);
      return;
    }
    press.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    if (e.pointerType !== 'mouse') {
      press.current.timer = setTimeout(() => {
        const p = press.current;
        press.current = null;
        if (p && card.current) onStartDrag(card.current, p.pointerId, p.x, p.y);
      }, LONG_PRESS_MS);
    }
  };

  const track = (e: ReactPointerEvent) => {
    const p = press.current;
    if (!p || e.pointerId !== p.pointerId) return;
    const moved = Math.hypot(e.clientX - p.x, e.clientY - p.y);
    if (e.pointerType === 'mouse') {
      if (moved > MOUSE_DRAG_SLOP && card.current) {
        press.current = null;
        onStartDrag(card.current, e.pointerId, e.clientX, e.clientY);
      }
    } else if (moved > TOUCH_CANCEL_SLOP) {
      clearTimeout(p.timer);
      press.current = null;
    }
  };

  const release = () => {
    clearTimeout(press.current?.timer);
    press.current = null;
  };

  return (
    <li
      ref={card}
      data-sheet-id={page.id}
      data-testid="page-card"
      style={{ animationDelay: `${delay}ms` } as CSSProperties}
      className={clsx(
        'relative flex animate-card-in flex-col rounded-2xl bg-white shadow-[0_1px_2px_rgba(41,36,68,0.08)] transition-[box-shadow,opacity] duration-200 ease-out',
        selected && 'shadow-[0_0_0_3px_var(--color-macaw)]',
        dragging && 'opacity-95',
      )}
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-t-2xl bg-polar">
        <button
          type="button"
          onClick={selecting ? onToggle : onOpen}
          onPointerDown={(e) => begin(e, false)}
          onPointerMove={track}
          onPointerUp={release}
          onPointerCancel={release}
          onContextMenu={(e) => e.preventDefault()}
          aria-label={selecting ? `${selected ? 'Quitar de la selección' : 'Añadir a la selección'} la hoja ${n}` : `Abrir hoja ${n}`}
          aria-pressed={selecting ? selected : undefined}
          className="no-callout absolute inset-0 transition-opacity duration-150 hover:opacity-90"
        >
          {url && <img src={url} alt={`Hoja ${n}`} draggable={false} className="size-full object-cover" />}
        </button>

        <span className="pointer-events-none absolute left-2 top-2 flex size-8 items-center justify-center rounded-lg bg-white text-sm font-bold tabular-nums shadow-sm">
          {n}
        </span>

        {selecting ? (
          <span
            className={clsx(
              'pointer-events-none absolute right-2 top-2 flex size-8 items-center justify-center rounded-lg transition-colors duration-150',
              selected ? 'bg-eel text-white' : 'bg-white/90 text-wolf',
            )}
            aria-hidden
          >
            {selected ? <CheckSquare className="size-5" /> : <Square className="size-5" />}
          </span>
        ) : (
          <button
            type="button"
            data-grip-id={page.id}
            aria-label={`Reordenar hoja ${n} de ${total}. Usa las flechas para moverla`}
            title="Arrastra para cambiar el orden"
            onPointerDown={(e) => begin(e, true)}
            onKeyDown={(e) => {
              const to =
                e.key === 'ArrowLeft' || e.key === 'ArrowUp'
                  ? index - 1
                  : e.key === 'ArrowRight' || e.key === 'ArrowDown'
                    ? index + 1
                    : e.key === 'Home'
                      ? 0
                      : e.key === 'End'
                        ? total - 1
                        : null;
              if (to === null) return;
              e.preventDefault();
              onKeyMove(to);
            }}
            className="absolute right-1 top-1 flex size-11 cursor-grab touch-none items-center justify-center rounded-full text-eel active:cursor-grabbing"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-white/90 shadow-sm">
              <GripVertical className="size-4" />
            </span>
          </button>
        )}

        {page.status === 'scanning' ? (
          <div className="pointer-events-none absolute inset-x-2 bottom-2 rounded-xl bg-white/95 p-2 shadow-sm">
            <ScanProgressBar progress={progress} />
          </div>
        ) : (
          <span
            key={page.status}
            className={clsx('pointer-events-none absolute bottom-2 left-2 inline-flex animate-swap-in items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm', status.pill)}
          >
            <StatusIcon className="size-3.5" aria-hidden />
            {status.label}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-2">
        {quality && (
          <button
            type="button"
            onClick={onOpen}
            title={quality.hint}
            aria-label={`${quality.label}: ${quality.hint} Abrir la hoja para repetir la foto`}
            className="inline-flex min-h-8 items-center gap-1 self-start rounded-full bg-bee-light px-2.5 text-xs font-semibold text-bee-dark transition-colors hover:bg-bee"
          >
            <TriangleAlert className="size-3.5" aria-hidden /> {quality.label}
          </button>
        )}
        {page.text && page.status === 'done' && <p className="line-clamp-2 px-1 text-xs text-wolf">{page.text}</p>}
        {pageLabel && <span className="self-start px-1 text-[11px] font-semibold text-feather-dark">Numerada {pageLabel}</span>}
        {page.error && (
          <p className="flex gap-1 px-1 text-xs font-bold text-cardinal-dark">
            <CircleAlert className="size-4 shrink-0" aria-hidden />
            {page.error}
          </p>
        )}

        <div className="mt-auto flex items-center gap-1 pt-1">
          {page.status === 'pending' || page.status === 'error' ? (
            <button
              type="button"
              onClick={onRead}
              disabled={selecting}
              aria-label={`Leer la hoja ${n}`}
              className="inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full bg-macaw px-2 text-sm font-bold text-eel transition-[transform,background-color] duration-150 ease-out hover:bg-macaw-hover active:scale-[0.97] disabled:opacity-50"
            >
              <ScanText className="size-4 shrink-0" />
              <span className="truncate">{page.status === 'error' ? 'Reintentar' : 'Leer'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpen}
              disabled={page.status !== 'done' || selecting}
              className="inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-2 text-sm font-bold text-macaw-dark transition-colors duration-150 hover:bg-macaw-light disabled:text-wolf"
            >
              {page.status === 'done' && <Eye className="size-4 shrink-0" />}
              <span className="truncate">{page.status === 'done' ? 'Revisar' : 'En proceso'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            disabled={page.status === 'scanning' || selecting}
            aria-label={`Descartar hoja ${n}`}
            title="Descartar"
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-wolf transition-colors duration-150 hover:bg-cardinal-light hover:text-cardinal-dark disabled:opacity-40"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
    </li>
  );
}
