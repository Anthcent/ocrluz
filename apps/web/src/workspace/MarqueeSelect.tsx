import type { Editor } from '@tiptap/react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

type Box = { left: number; top: number; width: number; height: number };

/**
 * "Selection" tool: while active, dragging anywhere over the page draws a rectangle and
 * selects all the content inside it, ready to be formatted with the toolbar.
 */
export function MarqueeSelect({ editor, active }: { editor: Editor; active: boolean }) {
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

  const local = (e: ReactPointerEvent) => {
    const rect = layerRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    origin.current = local(e);
    setBox({ left: origin.current.x, top: origin.current.y, width: 0, height: 0 });
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!origin.current) return;
    const p = local(e);
    const o = origin.current;
    setBox({ left: Math.min(o.x, p.x), top: Math.min(o.y, p.y), width: Math.abs(p.x - o.x), height: Math.abs(p.y - o.y) });
  };

  const onPointerUp = () => {
    const current = box;
    origin.current = null;
    setBox(null);
    if (!current || current.width + current.height < 6) return;
    const layer = layerRef.current!.getBoundingClientRect();
    const from = positionAt(editor, layer.left + current.left, layer.top + current.top);
    const to = positionAt(editor, layer.left + current.left + current.width, layer.top + current.top + current.height);
    editor.chain().focus().setTextSelection({ from: Math.min(from, to), to: Math.max(from, to) }).run();
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
      className="absolute inset-0 z-[6] cursor-crosshair touch-none"
    >
      {box && <div className="pointer-events-none absolute rounded-sm border-2 border-dashed border-macaw bg-macaw/10" style={box} />}
    </div>
  );
}

/** Document position at a screen point, clamped to the editor so drags past its edges still work. */
function positionAt(editor: Editor, x: number, y: number) {
  const rect = editor.view.dom.getBoundingClientRect();
  const end = editor.state.doc.content.size;
  if (y < rect.top) return 1;
  if (y > rect.bottom) return end;
  const hit = editor.view.posAtCoords({ left: Math.min(Math.max(x, rect.left + 1), rect.right - 1), top: y });
  return hit ? hit.pos : end;
}
