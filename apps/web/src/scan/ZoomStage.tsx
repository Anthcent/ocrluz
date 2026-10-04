import clsx from 'clsx';
import { Maximize, Minus, Plus } from 'lucide-react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

const MAX_SCALE = 5;
const DOUBLE_TAP_MS = 280;
const SWIPE_DISTANCE = 70;
const SWIPE_VELOCITY = 0.45;

export interface ZoomStageHandle {
  zoomBy: (factor: number) => void;
  reset: () => void;
}

interface View {
  s: number;
  x: number;
  y: number;
}

/**
 * Image stage with zoom and pan: pinch and double-tap on touch, wheel, double-click and
 * buttons on desktop. At normal size a horizontal swipe asks for the previous/next sheet.
 */
export const ZoomStage = forwardRef<ZoomStageHandle, { src?: string; alt: string; onSwipe: (dir: -1 | 1) => void; canPrev: boolean; canNext: boolean }>(
  function ZoomStage({ src, alt, onSwipe, canPrev, canNext }, ref) {
    const stage = useRef<HTMLDivElement>(null);
    const [view, setView] = useState<View>({ s: 1, x: 0, y: 0 });
    const [swipe, setSwipe] = useState(0);
    const [gesturing, setGesturing] = useState(false);
    const viewRef = useRef(view);
    viewRef.current = view;
    const pointers = useRef(new Map<number, { x: number; y: number }>());
    const gesture = useRef<{ kind: 'pan' | 'pinch' | 'swipe'; startX: number; startY: number; t0: number; view: View; dist: number; mid: { x: number; y: number } } | null>(null);
    const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
    const lastPointerType = useRef('mouse');

    const clampView = useCallback((v: View): View => {
      const el = stage.current;
      if (!el || v.s <= 1) return { s: 1, x: 0, y: 0 };
      const { width, height } = el.getBoundingClientRect();
      const maxX = ((v.s - 1) * width) / 2;
      const maxY = ((v.s - 1) * height) / 2;
      return { s: v.s, x: Math.max(-maxX, Math.min(maxX, v.x)), y: Math.max(-maxY, Math.min(maxY, v.y)) };
    }, []);

    /** Zooms keeping the stage point (relative to its center) fixed on screen. */
    const zoomAt = useCallback(
      (target: number, px = 0, py = 0, from: View = viewRef.current) => {
        const s = Math.max(1, Math.min(MAX_SCALE, target));
        const k = s / from.s;
        setView(clampView({ s, x: px - (px - from.x) * k, y: py - (py - from.y) * k }));
      },
      [clampView],
    );

    useImperativeHandle(ref, () => ({
      zoomBy: (factor) => zoomAt(viewRef.current.s * factor),
      reset: () => setView({ s: 1, x: 0, y: 0 }),
    }));

    const local = (x: number, y: number) => {
      const r = stage.current!.getBoundingClientRect();
      return { x: x - r.left - r.width / 2, y: y - r.top - r.height / 2 };
    };

    useEffect(() => {
      const el = stage.current;
      if (!el) return;
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const p = local(e.clientX, e.clientY);
        zoomAt(viewRef.current.s * Math.exp(-e.deltaY * 0.0015), p.x, p.y);
      };
      el.addEventListener('wheel', onWheel, { passive: false });
      return () => el.removeEventListener('wheel', onWheel);
    }, [zoomAt]);

    const onPointerDown = (e: React.PointerEvent) => {
      lastPointerType.current = e.pointerType;
      stage.current?.setPointerCapture(e.pointerId);
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pts = [...pointers.current.values()];
      setGesturing(true);
      if (pts.length === 2) {
        const mid = local((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
        gesture.current = { kind: 'pinch', startX: 0, startY: 0, t0: e.timeStamp, view: viewRef.current, dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), mid };
        setSwipe(0);
      } else if (pts.length === 1) {
        gesture.current = { kind: viewRef.current.s > 1 ? 'pan' : 'swipe', startX: e.clientX, startY: e.clientY, t0: e.timeStamp, view: viewRef.current, dist: 0, mid: { x: 0, y: 0 } };
      }
    };

    const onPointerMove = (e: React.PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = gesture.current;
      if (!g) return;
      if (g.kind === 'pinch') {
        const pts = [...pointers.current.values()];
        if (pts.length < 2) return;
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        zoomAt(g.view.s * (dist / g.dist), g.mid.x, g.mid.y, g.view);
      } else if (g.kind === 'pan') {
        setView(clampView({ s: g.view.s, x: g.view.x + e.clientX - g.startX, y: g.view.y + e.clientY - g.startY }));
      } else {
        const dx = e.clientX - g.startX;
        // Resist when there is no sheet in that direction.
        const blocked = (dx > 0 && !canPrev) || (dx < 0 && !canNext);
        setSwipe(blocked ? dx * 0.25 : dx);
      }
    };

    const onPointerUp = (e: React.PointerEvent) => {
      const g = gesture.current;
      pointers.current.delete(e.pointerId);
      if (pointers.current.size > 0) {
        // Pinch ended with one finger still down: continue as a pan.
        const [p] = [...pointers.current.values()];
        gesture.current = { kind: 'pan', startX: p.x, startY: p.y, t0: e.timeStamp, view: viewRef.current, dist: 0, mid: { x: 0, y: 0 } };
        return;
      }
      gesture.current = null;
      setGesturing(false);
      if (g?.kind === 'swipe') {
        const dx = e.clientX - g.startX;
        const moved = Math.hypot(dx, e.clientY - g.startY);
        const velocity = Math.abs(dx) / Math.max(1, e.timeStamp - g.t0);
        setSwipe(0);
        if (Math.abs(dx) > SWIPE_DISTANCE || (velocity > SWIPE_VELOCITY && Math.abs(dx) > 20)) {
          const dir = dx < 0 ? 1 : -1;
          if ((dir === 1 && canNext) || (dir === -1 && canPrev)) onSwipe(dir);
          return;
        }
        // A short tap: handle double-tap zoom on touch.
        if (moved < 10 && e.pointerType !== 'mouse') {
          const prev = lastTap.current;
          if (prev && e.timeStamp - prev.t < DOUBLE_TAP_MS && Math.hypot(prev.x - e.clientX, prev.y - e.clientY) < 24) {
            lastTap.current = null;
            toggleZoom(e.clientX, e.clientY);
          } else lastTap.current = { t: e.timeStamp, x: e.clientX, y: e.clientY };
        }
      }
    };

    const toggleZoom = (cx: number, cy: number) => {
      if (viewRef.current.s > 1) setView({ s: 1, x: 0, y: 0 });
      else {
        const p = local(cx, cy);
        zoomAt(2.5, p.x, p.y);
      }
    };

    return (
      <div
        ref={stage}
        className="relative size-full touch-none select-none overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(e) => lastPointerType.current === 'mouse' && toggleZoom(e.clientX, e.clientY)}
        style={{ cursor: view.s > 1 ? (gesturing ? 'grabbing' : 'grab') : 'zoom-in' }}
      >
        {src && (
          <img
            src={src}
            alt={alt}
            draggable={false}
            className={clsx('no-callout absolute inset-0 size-full object-contain p-2', !gesturing && 'transition-transform duration-200 ease-out-strong')}
            style={{ transform: `translate(${view.x + swipe}px, ${view.y}px) scale(${view.s})` }}
          />
        )}
        <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-eel/80 p-1 text-white shadow-[0_4px_12px_rgba(0,0,0,0.2)]" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          <ZoomButton label="Alejar" onClick={() => zoomAt(view.s / 1.5)} disabled={view.s <= 1}>
            <Minus className="size-4" />
          </ZoomButton>
          <span className="min-w-11 text-center text-xs font-bold tabular-nums" aria-live="polite">
            {Math.round(view.s * 100)}%
          </span>
          <ZoomButton label="Acercar" onClick={() => zoomAt(view.s * 1.5)} disabled={view.s >= MAX_SCALE}>
            <Plus className="size-4" />
          </ZoomButton>
          <ZoomButton label="Ajustar a la pantalla" onClick={() => setView({ s: 1, x: 0, y: 0 })} disabled={view.s === 1}>
            <Maximize className="size-4" />
          </ZoomButton>
        </div>
      </div>
    );
  },
);

function ZoomButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-11 items-center justify-center rounded-full transition-[background-color,transform] duration-150 ease-out hover:bg-white/15 active:scale-95 disabled:opacity-35"
    >
      {children}
    </button>
  );
}
