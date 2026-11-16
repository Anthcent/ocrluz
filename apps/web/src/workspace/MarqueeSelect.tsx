import type { Editor } from '@tiptap/react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { scaleOf } from './page';

type Box = { left: number; top: number; width: number; height: number };

/**
 * "Selection" tool: while active, dragging anywhere over the page draws a rectangle and selects
 * the content inside it (from its top-left corner to its bottom-right one), ready to be formatted
 * with the toolbar. The selection follows the rectangle while it is being drawn.
 */
/** `bleed` extends the drawing area past the text, over the sheet's margins, so a drag can start there. */
export function MarqueeSelect({ editor, active, bleed = 0 }: { editor: Editor; active: boolean; bleed?: number }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const [box, setBox] = useState<Box | null>(null);

  // Keep the on-screen keyboard closed on touch devices while selecting by area.
  useEffect(() => {
    const dom = editor.view.dom;
    if (active) dom.setAttribute('inputmode', 'none');
    return () => dom.removeAttribute('inputmode');
  }, [active, editor]);

  if (!active) return null;

  /** Pointer position inside the layer, in the sheet's own (unzoomed) px. */
  const local = (e: ReactPointerEvent) => {
    const layer = layerRef.current!;
    const rect = layer.getBoundingClientRect();
    const scale = scaleOf(layer);
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
  };

  const select = (area: Box) => {
    const layer = layerRef.current!;
    const rect = layer.getBoundingClientRect();
    const scale = scaleOf(layer);
    // The layer covers the text: it steps aside while the text under each corner is looked up.
    layer.style.pointerEvents = 'none';
    const from = positionAt(editor, rect.left + area.left * scale, rect.top + area.top * scale, 'start');
    const to = positionAt(editor, rect.left + (area.left + area.width) * scale, rect.top + (area.top + area.height) * scale, 'end');
    layer.style.pointerEvents = '';
    if (from === to) return;
    editor.chain().focus().setTextSelection({ from: Math.min(from, to), to: Math.max(from, to) }).run();
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    origin.current = local(e);
    setBox({ left: origin.current.x, top: origin.current.y, width: 0, height: 0 });
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const o = origin.current;
    if (!o) return;
    const p = local(e);
    const next = { left: Math.min(o.x, p.x), top: Math.min(o.y, p.y), width: Math.abs(p.x - o.x), height: Math.abs(p.y - o.y) };
    setBox(next);
    if (next.width + next.height >= 6) select(next);
  };

  const onPointerUp = () => {
    origin.current = null;
    setBox(null);
  };

  return (
    <div
      ref={layerRef}
      data-export-ignore
      aria-hidden
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ inset: -bleed }}
      className="absolute z-[8] cursor-crosshair touch-none"
    >
      {box && <div className="pointer-events-none absolute rounded-sm border-2 border-dashed border-macaw-dark bg-macaw/10" style={box} />}
    </div>
  );
}

/**
 * Document position at a screen point. Points outside the text snap to it: above it to the start
 * of the document, below it to the end.
 */
function positionAt(editor: Editor, x: number, y: number, edge: 'start' | 'end'): number {
  const rect = editor.view.dom.getBoundingClientRect();
  const end = editor.state.doc.content.size;
  if (y < rect.top) return edge === 'start' ? 0 : positionAt(editor, x, rect.top + 2, edge);
  if (y > rect.bottom) return edge === 'end' ? end : positionAt(editor, x, rect.bottom - 2, edge);
  const hit = editor.view.posAtCoords({ left: Math.min(Math.max(x, rect.left + 1), rect.right - 1), top: y });
  return hit ? hit.pos : edge === 'start' ? 0 : end;
}
