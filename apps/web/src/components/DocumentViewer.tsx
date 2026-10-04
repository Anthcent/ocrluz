import clsx from 'clsx';
import { ArrowLeft, ArrowRight, FileText, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type React from 'react';
import { GROUP_STYLES } from '../lib/constants';
import { formatNumber } from '../lib/format';
import { stripPageLabel } from '../lib/page-number';
import type { Group } from '../lib/types';
import { LabeledProgress } from './ActionTile';
import { Button } from './ui';

interface ViewerPage {
  id: number;
  text: string;
  pageLabel?: string;
  wordCount?: number;
}

/** Distance (px) a horizontal swipe must travel to change the sheet. */
const SWIPE_PX = 60;

/**
 * Visor de documentos: una hoja por vista, con transición suave (sin animación si el sistema
 * pide reducir el movimiento), teclado, gesto de deslizar y control deslizante para saltar.
 */
export function DocumentViewer({ group, pages, onClose }: { group: Group; pages: ViewerPage[]; onClose: () => void }) {
  const total = pages.length;
  const [index, setIndex] = useState(0);
  // Dirección del último cambio, para que la hoja entre desde el lado correcto.
  const [direction, setDirection] = useState<1 | -1>(1);
  const swipe = useRef<{ x: number; y: number } | null>(null);

  const current = Math.min(index, Math.max(0, total - 1));
  const go = useCallback(
    (dir: 1 | -1) => {
      const next = current + dir;
      if (next < 0 || next >= total) return;
      setDirection(dir);
      setIndex(next);
    },
    [current, total],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  // Bloquea el scroll de la página de fondo mientras el visor está abierto.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, a, input')) return;
    swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    // Solo cuentan los gestos claramente horizontales: el desplazamiento vertical lee el texto.
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    go(dx < 0 ? 1 : -1);
  };

  const style = GROUP_STYLES[group.color];
  const page = pages[current];
  const empty = total === 0;
  const sheetLabel = empty ? 'Sin hojas' : `Hoja ${current + 1} de ${total}`;
  const progress = ((current + 1) / Math.max(1, total)) * 100;

  return (
    <div role="dialog" aria-modal="true" aria-label={`Visor: ${group.title}`} className="fixed inset-0 z-50 flex flex-col bg-polar">
      <div className="flex items-center gap-3 border-b border-swan bg-white px-3 py-3 text-eel sm:px-5">
        <button
          onClick={onClose}
          aria-label="Cerrar visor"
          className="rounded-full bg-polar p-2.5 text-wolf transition-[transform,background-color,color] duration-200 hover:text-eel active:scale-95 motion-reduce:transition-none"
        >
          <X className="size-6" />
        </button>
        <span className={clsx('flex size-10 shrink-0 items-center justify-center rounded-xl', style.soft, style.text)}>
          <FileText className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-bold">{group.title}</div>
          <div className="truncate text-sm font-medium text-wolf">{sheetLabel}</div>
        </div>
        {!empty && (
          <div className="hidden w-72 sm:block">
            <LabeledProgress value={progress} label={`${current + 1}/${total}`} />
          </div>
        )}
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center gap-3 overflow-hidden px-2 py-2 sm:px-6 sm:py-4">
        <RoundArrow label="Hoja anterior" disabled={current === 0} onClick={() => go(-1)}>
          <ArrowLeft className="size-6" />
        </RoundArrow>
        <div
          data-testid="viewer-stage"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (swipe.current = null)}
          className="relative h-full max-h-[880px] w-full max-w-[760px] touch-pan-y"
        >
          {empty && (
            <div className="flex size-full flex-col items-center justify-center gap-3 rounded-2xl bg-white p-8 text-center text-wolf">
              <FileText className="size-10 text-hare" />
              <p className="font-semibold text-eel">Esta carpeta aún no tiene hojas.</p>
              <p className="text-sm">Escanea documentos para verlos aquí.</p>
            </div>
          )}
          {page && (
            <Sheet
              key={page.id}
              page={page}
              n={current + 1}
              direction={direction}
            />
          )}
        </div>
        <RoundArrow label="Hoja siguiente" disabled={empty || current >= total - 1} onClick={() => go(1)}>
          <ArrowRight className="size-6" />
        </RoundArrow>
      </div>

      <div className="pb-safe space-y-3 border-t border-swan bg-white px-3 pb-4 pt-3 sm:px-8">
        {!empty && (
          <div className="sm:hidden">
            <LabeledProgress value={progress} label={`${current + 1}/${total}`} />
          </div>
        )}
        {total > 1 && (
          <input
            type="range"
            min={0}
            max={total - 1}
            value={current}
            onChange={(e) => {
              const next = Number(e.target.value);
              setDirection(next >= current ? 1 : -1);
              setIndex(next);
            }}
            aria-label="Ir a la hoja"
            className="mx-auto block w-full max-w-[760px] accent-[#5f49c8]"
          />
        )}
        <div className="mx-auto grid max-w-[760px] grid-cols-2 gap-3 sm:hidden">
          <Button variant="plain" size="lg" icon={<ArrowLeft className="size-5" />} disabled={current === 0} onClick={() => go(-1)}>
            Anterior
          </Button>
          <Button size="lg" disabled={current >= total - 1} onClick={() => go(1)}>
            Siguiente <ArrowRight className="size-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function RoundArrow({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="hidden size-12 shrink-0 items-center justify-center rounded-full bg-eel text-white shadow-[0_1px_2px_rgba(41,36,68,0.12)] transition-[transform,background-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[#303138] active:scale-95 disabled:bg-swan disabled:text-hare disabled:shadow-none motion-reduce:transition-none sm:flex"
    >
      {children}
    </button>
  );
}

/** Una hoja escaneada: texto con su número impreso (si se detectó) al pie. */
function Sheet({ page, n, direction }: { page: ViewerPage; n: number; direction: 1 | -1 }) {
  // Entra con un leve desplazamiento y fundido; `motion-reduce` la muestra sin animación.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const printed = page.pageLabel || String(n);
  return (
    <article
      aria-label={`Hoja ${n}`}
      className={clsx(
        'flex size-full flex-col rounded-2xl bg-white shadow-[0_1px_2px_rgba(41,36,68,0.08)] ring-1 ring-black/[0.04]',
        'transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transform-none motion-reduce:transition-none',
        shown ? 'translate-x-0 opacity-100' : clsx('opacity-0', direction === 1 ? 'translate-x-3' : '-translate-x-3'),
      )}
    >
      <div className="flex items-center justify-between gap-2 px-6 pt-4 text-xs font-semibold text-wolf sm:px-10 sm:pt-6">
        <span>Hoja {n}</span>
        {page.wordCount !== undefined && <span className="shrink-0">{formatNumber(page.wordCount)} pal.</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 sm:px-10">
        <p className="whitespace-pre-line text-base leading-relaxed text-eel">
          {stripPageLabel(page.text, page.pageLabel ?? '') || <span className="text-hare">Hoja sin texto.</span>}
        </p>
      </div>
      <div className="px-6 pb-4 text-center text-sm tabular-nums text-wolf sm:px-10 sm:pb-6">pág. {printed}</div>
    </article>
  );
}
