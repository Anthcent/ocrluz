import type { Node as PMNode, NodeType } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { Node, NodeViewWrapper, ReactNodeViewRenderer, type Editor, type ReactNodeViewProps } from '@tiptap/react';
import clsx from 'clsx';
import { AlignCenter, AlignLeft, AlignRight, Layers, PanelsTopLeft, Trash2, WrapText } from 'lucide-react';
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { scaleOf } from './page';

/**
 * How an image sits relative to the text, mirroring Word's layout options:
 * - `front`: floats over the text; it is anchored to the block it sits next to, so it travels with the text.
 * - `square`: floats to one side and the text wraps around it.
 * - `topBottom`: own line; nothing beside it, text only above and below.
 */
export type ImageWrap = 'front' | 'square' | 'topBottom';
export type ImageAlign = 'left' | 'center' | 'right';

export interface WorkspaceImageAttrs {
  src: string;
  /** Width as a percentage of the box the image lives in (the page's text area or a table cell). */
  width: number;
  wrap: ImageWrap;
  align: ImageAlign;
  /** Horizontal position for `front`, as a percentage of that box's width. */
  x: number;
  /** Vertical position for `front`, in px: from its anchor when `anchored`, else from the top of the text area. */
  y: number;
  /** False only in documents saved before images were anchored to the text. */
  anchored: boolean;
}

const MIN_WIDTH = 8;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const numberAttr = (name: string, fallback: number) => ({
  default: fallback,
  parseHTML: (el: HTMLElement) => {
    const value = Number(el.getAttribute(`data-${name}`));
    return Number.isFinite(value) ? value : fallback;
  },
  renderHTML: (attrs: Record<string, unknown>) => ({ [`data-${name}`]: String(attrs[name]) }),
});

const stringAttr = (name: string, fallback: string) => ({
  default: fallback,
  parseHTML: (el: HTMLElement) => el.getAttribute(`data-${name}`) || fallback,
  renderHTML: (attrs: Record<string, unknown>) => ({ [`data-${name}`]: String(attrs[name]) }),
});

export const WorkspaceImage = Node.create({
  name: 'workspaceImage',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      src: {
        default: '',
        parseHTML: (el: HTMLElement) => el.querySelector('img')?.getAttribute('src') ?? '',
        renderHTML: () => ({}),
      },
      width: numberAttr('width', 40),
      wrap: stringAttr('wrap', 'front'),
      align: stringAttr('align', 'left'),
      x: numberAttr('x', 0),
      y: numberAttr('y', 0),
      anchored: {
        default: true,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-anchored') === 'true',
        renderHTML: (attrs: Record<string, unknown>) => ({ 'data-anchored': String(attrs.anchored) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'figure[data-workspace-image]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['figure', { ...HTMLAttributes, 'data-workspace-image': '' }, ['img', { src: node.attrs.src, alt: '' }]];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageView, {
      // The view handles its own pointer gestures (select, move, resize).
      stopEvent: ({ event }) => /^(pointer|mouse|touch|click|drag)/.test(event.type),
    });
  },
});

/**
 * Adds a picked image at the cursor. Inside a table it goes in the current cell, on its own line;
 * elsewhere it starts over the text, anchored right below the block being edited.
 */
export function insertImage(editor: Editor, src: string) {
  const { state } = editor;
  const { $from } = state.selection;
  if (editor.isActive('table') && $from.depth > 0) {
    const pos = $from.after($from.depth);
    return editor.chain().focus().insertContentAt(pos, { type: 'workspaceImage', attrs: { src, width: 100, wrap: 'topBottom', align: 'center' } }).setNodeSelection(pos).run();
  }
  // After the current block so the text is not split.
  const pos = $from.depth > 0 ? $from.after(1) : state.selection.to;
  const width = 40;
  return editor
    .chain()
    .focus()
    .insertContentAt(pos, { type: 'workspaceImage', attrs: { src, width, wrap: 'front', align: 'left', x: (100 - width) / 2, y: 8, anchored: true } })
    .setNodeSelection(pos)
    .run();
}

/**
 * Document position where the image can be dropped for a screen point: before or after the closest
 * block that accepts it (a paragraph of the page or of a table cell; the whole table when the point
 * falls on its borders).
 */
function dropTarget(view: EditorView, type: NodeType, left: number, top: number): number | null {
  const hit = view.posAtCoords({ left, top });
  if (!hit) return null;
  const $pos = view.state.doc.resolve(hit.pos);
  if ($pos.depth === 0) {
    const index = $pos.index(0);
    return $pos.parent.canReplaceWith(index, index, type) ? hit.pos : null;
  }
  for (let depth = $pos.depth; depth >= 1; depth--) {
    const parent = $pos.node(depth - 1);
    const index = $pos.index(depth - 1);
    const before = parent.canReplaceWith(index, index, type);
    const after = parent.canReplaceWith(index + 1, index + 1, type);
    if (!before && !after) continue;
    const dom = view.nodeDOM($pos.before(depth));
    const rect = dom instanceof HTMLElement ? dom.getBoundingClientRect() : null;
    const preferAfter = rect ? top > rect.top + rect.height / 2 : false;
    return (preferAfter && after) || !before ? $pos.after(depth) : $pos.before(depth);
  }
  return null;
}

/** Screen box an image inserted at `pos` would be laid out in: its container's content area, starting right after the previous block. */
function frameAt(view: EditorView, pos: number) {
  const scale = scaleOf(view.dom as HTMLElement);
  const found = view.domAtPos(pos).node;
  const parent = (found instanceof HTMLElement ? found : found.parentElement) ?? (view.dom as HTMLElement);
  const rect = parent.getBoundingClientRect();
  const css = getComputedStyle(parent);
  const px = (value: string) => (parseFloat(value) || 0) * scale;
  const left = rect.left + px(css.borderLeftWidth) + px(css.paddingLeft);
  const width = Math.max(1, parent.clientWidth * scale - px(css.paddingLeft) - px(css.paddingRight));
  let top = rect.top + px(css.borderTopWidth) + px(css.paddingTop);
  const before = view.state.doc.resolve(pos).nodeBefore;
  if (before) {
    const dom = view.nodeDOM(pos - before.nodeSize);
    if (dom instanceof HTMLElement) top = dom.getBoundingClientRect().bottom;
  }
  return { left, top, width, scale };
}

/** Moves the image node to `target`, keeping its old container valid when it was the only content there. */
function moveImage(editor: Editor, from: number, node: PMNode, target: number, attrs: WorkspaceImageAttrs) {
  const { state } = editor;
  try {
    const tr = state.tr;
    if (state.doc.resolve(from).parent.childCount === 1) tr.replaceWith(from, from + node.nodeSize, state.schema.nodes.paragraph.create());
    else tr.delete(from, from + node.nodeSize);
    const insertAt = tr.mapping.map(target);
    tr.insert(insertAt, node.type.create(attrs));
    tr.setSelection(NodeSelection.create(tr.doc, insertAt));
    editor.view.dispatch(tr);
    return true;
  } catch {
    // The drop point does not accept an image: leave it where it was.
    return false;
  }
}

type Gesture = {
  kind: 'move' | 'resize';
  startX: number;
  startY: number;
  attrs: WorkspaceImageAttrs;
  /** Width (unscaled px) of the box the image is laid out in: the page, or a table cell. */
  area: number;
  /** Page zoom, to turn pointer distances into document px. */
  scale: number;
  direction: 1 | -1;
  moved: boolean;
};

const DRAG_THRESHOLD = 4;

function ImageView({ node, selected, updateAttributes, deleteNode, editor, getPos }: ReactNodeViewProps) {
  const attrs = node.attrs as WorkspaceImageAttrs;
  const [draft, setDraft] = useState<Partial<WorkspaceImageAttrs> | null>(null);
  /** Visual offset while dragging an image that sits in the text flow. */
  const [shift, setShift] = useState<{ x: number; y: number } | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const view = { ...attrs, ...draft };
  const front = view.wrap === 'front';

  const select = () => {
    const pos = getPos();
    if (typeof pos === 'number') editor.chain().setNodeSelection(pos).run();
  };

  const wrapper = () => boxRef.current?.parentElement ?? null;

  /** Unscaled width of the box the image's percentages refer to. */
  const areaWidth = () => {
    const el = wrapper();
    if (!el) return 1;
    if (attrs.wrap !== 'front') return el.parentElement?.clientWidth || 1;
    return (attrs.anchored ? el.offsetWidth : (el.offsetParent as HTMLElement | null)?.clientWidth) || 1;
  };

  const start = (kind: Gesture['kind'], e: ReactPointerEvent, direction: 1 | -1 = 1) => {
    if (!editor.isEditable) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { kind, startX: e.clientX, startY: e.clientY, attrs, area: areaWidth(), scale: scaleOf(editor.view.dom as HTMLElement), direction, moved: false };
  };

  const onImagePointerDown = (e: ReactPointerEvent) => {
    // First tap only selects, so touch users can still scroll past images.
    if (!selected) return select();
    start('move', e);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const px = (e.clientX - g.startX) / g.scale;
    const py = (e.clientY - g.startY) / g.scale;
    if (!g.moved && Math.hypot(px, py) < DRAG_THRESHOLD) return;
    g.moved = true;
    const dx = (px / g.area) * 100;
    if (g.kind === 'resize') {
      if (g.attrs.wrap === 'front' && g.direction < 0) {
        // Left handle: the right edge stays put.
        const delta = clamp(dx, -g.attrs.x, g.attrs.width - MIN_WIDTH);
        setDraft({ x: g.attrs.x + delta, width: g.attrs.width - delta });
      } else if (g.attrs.wrap === 'front') {
        setDraft({ width: clamp(g.attrs.width + dx, MIN_WIDTH, 100 - g.attrs.x) });
      } else {
        const grow = g.attrs.align === 'center' ? dx * 2 : dx * g.direction;
        setDraft({ width: clamp(g.attrs.width + grow, MIN_WIDTH, 100) });
      }
    } else if (g.attrs.wrap === 'front') {
      const y = g.attrs.y + py;
      setDraft({ x: clamp(g.attrs.x + dx, 0, 100 - g.attrs.width), y: g.attrs.anchored ? y : Math.max(0, y) });
    } else {
      setShift({ x: px, y: py });
    }
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    if (g.moved && g.kind === 'move') {
      if (g.attrs.wrap === 'front') placeFront();
      else relocate(e.clientX, e.clientY);
    } else if (draft) {
      updateAttributes(draft);
    }
    setDraft(null);
    setShift(null);
  };

  /** Drop point resolved with the image itself out of the way, so what is under it gets hit. */
  const targetAt = (left: number, top: number) => {
    const box = boxRef.current!;
    box.style.pointerEvents = 'none';
    const target = dropTarget(editor.view, node.type, left, top);
    box.style.pointerEvents = '';
    return target;
  };

  /**
   * Ends the drag of a floating image: it is re-anchored to the block under its top edge (inside a
   * table cell if dropped there) while staying exactly where it was dropped. From then on it moves
   * together with that block when the text above changes.
   */
  const placeFront = () => {
    const from = getPos();
    const box = boxRef.current;
    if (typeof from !== 'number' || !box) return;
    const rect = box.getBoundingClientRect();
    let target = targetAt(rect.left + rect.width / 2, rect.top + 2);
    if (target === from + node.nodeSize) target = from;
    if (target === null || (target === from && attrs.anchored)) {
      if (draft) updateAttributes(draft);
      return;
    }
    const frame = frameAt(editor.view, target);
    const width = clamp((rect.width / frame.width) * 100, MIN_WIDTH, 100);
    const next: WorkspaceImageAttrs = {
      ...attrs,
      anchored: true,
      width,
      x: clamp(((rect.left - frame.left) / frame.width) * 100, 0, 100 - width),
      y: (rect.top - frame.top) / frame.scale,
    };
    if (target === from || !moveImage(editor, from, node, target, next)) updateAttributes(target === from ? next : (draft ?? {}));
  };

  /**
   * Moves an in-flow image to where it was dropped: next to the block under the pointer (inside a
   * table cell if dropped there). The side of the drop picks its alignment, so the text wraps around
   * it on the other side. Its on-screen size is kept when it changes container.
   */
  const relocate = (clientX: number, clientY: number) => {
    const from = getPos();
    const box = boxRef.current;
    if (typeof from !== 'number' || !box) return;
    let target = targetAt(clientX, clientY);
    if (target === null) return;
    if (target === from + node.nodeSize) target = from;
    const frame = frameAt(editor.view, target);
    const ratio = (clientX - frame.left) / frame.width;
    const align: ImageAlign = attrs.wrap === 'square' ? (ratio < 0.5 ? 'left' : 'right') : ratio < 1 / 3 ? 'left' : ratio > 2 / 3 ? 'right' : 'center';
    if (target === from) return updateAttributes({ align });
    const width = clamp((box.getBoundingClientRect().width / frame.width) * 100, MIN_WIDTH, 100);
    moveImage(editor, from, node, target, { ...attrs, align, width });
  };

  const setWrap = (wrap: ImageWrap) => {
    if (wrap === attrs.wrap) return;
    if (wrap === 'front') {
      // Becomes free-floating right where it is shown, anchored at its own place in the text.
      const area = wrapper()?.parentElement?.getBoundingClientRect();
      const box = boxRef.current?.getBoundingClientRect();
      const x = area && box ? clamp(((box.left - area.left) / area.width) * 100, 0, 100 - attrs.width) : 0;
      updateAttributes({ wrap, anchored: true, x, y: 0 });
    } else {
      updateAttributes({ wrap, align: wrap === 'square' && attrs.align === 'center' ? 'left' : attrs.align });
    }
  };

  const placed: CSSProperties = { left: `${view.x}%`, top: view.y, width: `${view.width}%` };
  const wrapperStyle: CSSProperties = front
    ? view.anchored
      ? { position: 'relative', height: 0, zIndex: 5 }
      : { position: 'absolute', zIndex: 5, ...placed }
    : view.wrap === 'square'
      ? { float: view.align === 'right' ? 'right' : 'left', width: `${view.width}%`, margin: view.align === 'right' ? '4px 0 8px 18px' : '4px 18px 8px 0' }
      : {
          clear: 'both',
          width: `${view.width}%`,
          marginLeft: view.align === 'left' ? 0 : 'auto',
          marginRight: view.align === 'right' ? 0 : 'auto',
          marginTop: 8,
          marginBottom: 8,
        };
  const boxStyle: CSSProperties | undefined =
    front && view.anchored ? { position: 'absolute', ...placed } : shift ? { transform: `translate(${shift.x}px, ${shift.y}px)` } : undefined;

  const resizeFromLeft = !front && view.align === 'right';
  const menuOnRight = front ? view.x + view.width / 2 > 50 : view.align === 'right';

  return (
    <NodeViewWrapper className="workspace-image" style={wrapperStyle} data-wrap={view.wrap}>
      <div
        ref={boxRef}
        className={clsx('workspace-image-box', !(front && view.anchored) && 'relative', shift && 'z-30 opacity-70')}
        style={boxStyle}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          src={attrs.src}
          alt=""
          draggable={false}
          onPointerDown={onImagePointerDown}
          className={clsx('block w-full select-none rounded-sm', selected && 'cursor-move touch-none outline outline-2 outline-offset-2 outline-macaw')}
        />
        {selected && editor.isEditable && (
          <>
            {(front || !resizeFromLeft) && <Handle side="right" onPointerDown={(e) => start('resize', e, 1)} />}
            {(front || resizeFromLeft) && <Handle side="left" onPointerDown={(e) => start('resize', e, -1)} />}
            <ImageMenu
              wrap={view.wrap}
              align={view.align}
              onRight={menuOnRight}
              onWrap={setWrap}
              onAlign={(align) => updateAttributes({ align })}
              onDelete={deleteNode}
            />
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}

/** Round resize grip on a bottom corner, with a touch area larger than the dot. */
function Handle({ side, onPointerDown }: { side: 'left' | 'right'; onPointerDown: (e: ReactPointerEvent) => void }) {
  return (
    <span
      data-export-ignore
      role="presentation"
      onPointerDown={onPointerDown}
      className={clsx(
        'absolute -bottom-2.5 z-10 size-5 touch-none rounded-full border-2 border-white bg-macaw shadow after:absolute after:-inset-3 after:content-[""]',
        side === 'left' ? '-left-2.5 cursor-nesw-resize' : '-right-2.5 cursor-nwse-resize',
      )}
    />
  );
}

function ImageMenu({
  wrap,
  align,
  onRight,
  onWrap,
  onAlign,
  onDelete,
}: {
  wrap: ImageWrap;
  align: ImageAlign;
  onRight: boolean;
  onWrap: (wrap: ImageWrap) => void;
  onAlign: (align: ImageAlign) => void;
  onDelete: () => void;
}) {
  const aligns: ImageAlign[] = wrap === 'square' ? ['left', 'right'] : wrap === 'topBottom' ? ['left', 'center', 'right'] : [];
  const alignIcon = { left: <AlignLeft />, center: <AlignCenter />, right: <AlignRight /> };
  const alignLabel = { left: 'A la izquierda', center: 'Centrada', right: 'A la derecha' };

  return (
    <div
      data-export-ignore
      role="toolbar"
      aria-label="Ajuste de imagen"
      onPointerDown={(e) => e.stopPropagation()}
      className={clsx(
        // Above the image, so the picture stays visible while its layout is changed.
        'absolute bottom-full z-20 mb-2 flex items-center gap-0.5 whitespace-nowrap rounded-xl bg-eel/90 p-1 text-white shadow-floating backdrop-blur',
        onRight ? 'right-0' : 'left-0',
      )}
    >
      <MenuButton label="Delante del texto" active={wrap === 'front'} onClick={() => onWrap('front')}><Layers /></MenuButton>
      <MenuButton label="Cuadrado (el texto la rodea)" active={wrap === 'square'} onClick={() => onWrap('square')}><WrapText /></MenuButton>
      <MenuButton label="Arriba y abajo" active={wrap === 'topBottom'} onClick={() => onWrap('topBottom')}><PanelsTopLeft /></MenuButton>
      {aligns.length > 0 && <span aria-hidden className="mx-0.5 h-5 w-px bg-white/25" />}
      {aligns.map((a) => (
        <MenuButton key={a} label={alignLabel[a]} active={align === a} onClick={() => onAlign(a)}>{alignIcon[a]}</MenuButton>
      ))}
      <span aria-hidden className="mx-0.5 h-5 w-px bg-white/25" />
      <MenuButton label="Borrar imagen" onClick={onDelete}><Trash2 /></MenuButton>
    </div>
  );
}

function MenuButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={clsx('flex size-9 items-center justify-center rounded-lg transition-colors [&>svg]:size-4', active ? 'bg-white text-eel' : 'text-white/80 hover:bg-white/15')}
    >
      {children}
    </button>
  );
}
