import clsx from 'clsx';
import { Download, EllipsisVertical, FileDown, FileType, ImagePlus, LoaderCircle, Printer } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react';
import { ToolTabs, Tools, type ToolbarProps } from './Toolbar';

export type DockActions = { image: () => void; pdf: () => void; docx: () => void; txt: () => void; print: () => void };

const SWIPE = 36;

/**
 * Height of the on-screen keyboard (or anything else covering the bottom of the page). Fixed
 * elements are laid out against the full page, so without this the dock would hide behind the
 * keyboard exactly when it is needed: while typing.
 */
function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)));
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, []);
  return inset;
}

/**
 * Mobile toolbar: tabs on top and, under them, the active tab's tools in a row that scrolls
 * sideways. Swiping it up (or tapping the handle) shows all the tools of the tab at once; swiping
 * down collapses it. It rides above the keyboard while typing.
 */
export function MobileDock({ actions, exporting, ...tools }: ToolbarProps & { actions: DockActions; exporting: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const keyboard = useKeyboardInset();
  const typing = keyboard > 80;

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as globalThis.Node)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menuOpen]);

  const onTouchStart = (e: TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const onTouchEnd = (e: TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    // Only vertical swipes; horizontal ones scroll the tools.
    if (Math.abs(dy) < SWIPE || Math.abs(dy) < Math.abs(dx)) return;
    setExpanded(dy < 0);
  };

  const run = (action: () => void) => () => {
    setMenuOpen(false);
    action();
  };

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{ bottom: typing ? keyboard + 6 : undefined }}
      className="workspace-chrome workspace-dock fixed inset-x-2 z-40 rounded-2xl bg-white/95 px-1.5 pb-1.5 shadow-floating backdrop-blur lg:hidden"
    >
      <button
        type="button"
        aria-label={expanded ? 'Mostrar menos herramientas' : 'Mostrar todas las herramientas'}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className="flex h-4 w-full items-center justify-center"
      >
        <span aria-hidden className="h-1 w-10 rounded-full bg-hare/60" />
      </button>

      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <ToolTabs {...tools} />
        </div>
        <span aria-hidden className="h-7 w-px shrink-0 bg-swan" />
        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            aria-label="Más opciones"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className={clsx('flex size-11 items-center justify-center rounded-xl transition-colors', menuOpen ? 'bg-eel text-white' : 'text-eel hover:bg-polar')}
          >
            {exporting ? <LoaderCircle className="size-5 animate-spin" /> : <EllipsisVertical className="size-5" />}
          </button>
          {menuOpen && (
            <div role="menu" className="absolute bottom-full right-0 mb-2 w-56 overflow-hidden rounded-2xl bg-white p-1.5 shadow-floating">
              <MenuItem icon={<ImagePlus />} onClick={run(actions.image)}>Añadir imagen</MenuItem>
              <MenuItem icon={<FileDown />} onClick={run(actions.pdf)}>Exportar PDF</MenuItem>
              <MenuItem icon={<FileType />} onClick={run(actions.docx)}>Exportar a Word</MenuItem>
              <MenuItem icon={<Download />} onClick={run(actions.txt)}>Descargar .txt</MenuItem>
              <MenuItem icon={<Printer />} onClick={run(actions.print)}>Imprimir</MenuItem>
            </div>
          )}
        </div>
      </div>

      <div
        role="toolbar"
        aria-label="Formato"
        className={clsx(
          'no-scrollbar mt-1 flex items-center gap-1 border-t border-swan/70 pt-1',
          expanded && !typing ? 'max-h-[40vh] flex-wrap overflow-y-auto overscroll-contain' : 'overflow-x-auto overscroll-x-contain',
        )}
      >
        <Tools {...tools} />
      </div>
    </div>
  );
}

function MenuItem({ icon, onClick, children }: { icon: ReactNode; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-bold text-eel hover:bg-polar [&>svg]:size-4 [&>svg]:text-wolf">
      {icon}
      {children}
    </button>
  );
}
