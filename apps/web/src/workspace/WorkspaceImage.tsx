import type { Node as PMNode, NodeType } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { Node, NodeViewWrapper, ReactNodeViewRenderer, type Editor, type ReactNodeViewProps } from '@tiptap/react';
import clsx from 'clsx';
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
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

const CELLS = ['tableCell', 'tableHeader'];
/** Tallest an image is shown when it is added to a table cell, so the row does not blow up. */
const CELL_IMAGE_HEIGHT = 240;

async function imageSize(src: string) {
  const img = new Image();
  img.src = src;
  await img.decode().catch(() => {});
  return { width: img.naturalWidth || 400, height: img.naturalHeight || 300 };
}

/**
 * Adds a picked image at the cursor. Inside a table it goes in the current cell, on its own line and
 * no bigger than the picture itself or a moderate height; elsewhere it starts over the text, anchored
 * right below the block being edited.
 */
export async function insertImage(editor: Editor, src: string) {
  const size = await imageSize(src);
  if (editor.isDestroyed) return false;
  const { state, view } = editor;
  const { $from } = state.selection;
  let cellDepth = 0;
  for (let depth = $from.depth; depth > 0; depth--) {
    if (CELLS.includes($from.node(depth).type.name)) {
      cellDepth = depth;
      break;
    }
  }
  if (cellDepth) {
    // After the block being edited, inside the same cell.
    const pos = $from.depth > cellDepth ? $from.after(cellDepth + 1) : $from.pos;
    const cell = frameAt(view, pos);
    const shown = Math.min(size.width, (CELL_IMAGE_HEIGHT * size.width) / size.height, cell.width / cell.scale);
    const width = clamp(Math.round(((shown * cell.scale) / cell.width) * 100), MIN_WIDTH, 100);
    return editor.chain().focus().insertContentAt(pos, { type: 'workspaceImage', attrs: { src, width, wrap: 'topBottom', align: 'center' } }).setNodeSelection(pos).run();
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

/** Changes the selected image (used by the "Imagen" tab of the toolbar). */
export function updateSelectedImage(editor: Editor, change: Partial<WorkspaceImageAttrs>) {
  const { selection } = editor.state;
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'workspaceImage') return false;
  const attrs = selection.node.attrs as WorkspaceImageAttrs;
  const next = { ...attrs, ...change };
  if (change.wrap && change.wrap !== attrs.wrap) {
    if (change.wrap === 'front') {
      // Becomes free-floating about where it was, anchored at its own place in the text.
      next.anchored = true;
      next.x = attrs.align === 'right' ? 100 - attrs.width : attrs.align === 'center' ? (100 - attrs.width) / 2 : 0;
      next.y = 0;
    } else if (change.wrap === 'square' && attrs.align === 'center') {
      next.align = 'left';
    }
  }
  if (next.wrap === 'front') next.x = clamp(next.x, 0, Math.max(0, 100 - next.width));
  const pos = selection.from;
  const tr = editor.state.tr.setNodeMarkup(pos, undefined, next);
  tr.setSelection(NodeSelection.create(tr.doc, pos));
  editor.view.dispatch(tr);
  return true;
}

export function deleteSelectedImage(editor: Editor) {
  return editor.chain().focus().deleteSelection().run();
}

/**
 * Document position where the image can be dropped for a screen point: before or after the closest
 * block that accepts it (a paragraph of the page or of a table cell; the whole table when the point
 * falls on its borders).
 */
function dropTarget(view: EditorView, type: NodeType, left: number, top: number, topLevel = false): number | null {
  const hit = view.posAtCoords({ left, top });
  if (!hit) return null;
  const $pos = view.state.doc.resolve(hit.pos);
  if (topLevel && $pos.depth > 0) {
    // Next to the top-level block under the point, whatever it holds (a table counts as one block).
    const dom = view.nodeDOM($pos.before(1));
    const rect = dom instanceof HTMLElement ? dom.getBoundingClientRect() : null;
    return rect && top > rect.top + rect.height / 2 ? $pos.after(1) : $pos.before(1);
  }
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

function ImageView({ node, selected, updateAttributes, editor, getPos }: ReactNodeViewProps) {
  const attrs = node.attrs as WorkspaceImageAttrs;
  const [draft, setDraft] = useState<Partial<WorkspaceImageAttrs> | null>(null);
  /** Visual offset while dragging an image that sits in the text flow. */
  const [shift, setShift] = useState<{ x: number; y: number } | null>(null);
  /** Where an in-flow image would land if dropped now (screen px). */
  const [drop, setDrop] = useState<{ left: number; top: number; width: number } | null>(null);
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
      const target = targetAt(e.clientX, e.clientY);
      const frame = target === null ? null : frameAt(editor.view, target);
      setDrop(frame && { left: frame.left, top: frame.top, width: frame.width });
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
    setDrop(null);
  };

  /** Drop point resolved with the image itself out of the way, so what is under it gets hit. */
  const targetAt = (left: number, top: number, topLevel = false) => {
    const box = boxRef.current!;
    box.style.pointerEvents = 'none';
    const target = dropTarget(editor.view, node.type, left, top, topLevel);
    box.style.pointerEvents = '';
    return target;
  };

  /**
   * Ends the drag of a floating image. On the page it is re-anchored to the block under its top
   * edge while staying exactly where it was dropped, so from then on it moves together with that
   * text; it floats freely over tables without being captured by their cells. An image that floats
   * inside a table cell stays in its cell.
   */
  const placeFront = () => {
    const from = getPos();
    const box = boxRef.current;
    if (typeof from !== 'number' || !box) return;
    const $from = editor.state.doc.resolve(from);
    let inCell = false;
    for (let depth = $from.depth; depth > 0; depth--) inCell ||= CELLS.includes($from.node(depth).type.name);
    const rect = box.getBoundingClientRect();
    let target = inCell ? null : targetAt(rect.left + rect.width / 2, rect.top + 2, true);
    if (target === from + node.nodeSize) target = from;
    if (target === null || (target === from && attrs.anchored)) {
      if (draft) updateAttributes(draft);
      return;
    }
    const frame = frameAt(editor.view, target);
    const next: WorkspaceImageAttrs = {
      ...attrs,
      anchored: true,
      x: clamp(((rect.left - frame.left) / frame.width) * 100, 0, 100 - attrs.width),
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
          </>
        )}
        {drop && createPortal(<div aria-hidden className="pointer-events-none fixed z-[70] h-1 -translate-y-1/2 rounded-full bg-macaw-dark" style={drop} />, document.body)}
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
