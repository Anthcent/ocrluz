import { Node, NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import clsx from 'clsx';
import { AlignCenter, AlignLeft, AlignRight, Layers, PanelsTopLeft, Trash2, WrapText } from 'lucide-react';
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

/**
 * How an image sits relative to the text, mirroring Word's layout options:
 * - `front`: floats over the text at a free position (x/y), text is not displaced.
 * - `square`: floats to one side and the text wraps around it.
 * - `topBottom`: own line; nothing beside it, text only above and below.
 */
export type ImageWrap = 'front' | 'square' | 'topBottom';
export type ImageAlign = 'left' | 'center' | 'right';

export interface WorkspaceImageAttrs {
  src: string;
  /** Width as a percentage of the page's text area, so the layout scales across screens and the PDF. */
  width: number;
  wrap: ImageWrap;
  align: ImageAlign;
  /** Horizontal position for `front`, as a percentage of the text area width. */
  x: number;
  /** Vertical position for `front`, in px from the top of the text area. */
  y: number;
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

type Gesture = { kind: 'move' | 'resize'; startX: number; startY: number; attrs: WorkspaceImageAttrs; area: number; direction: 1 | -1 };

function ImageView({ node, selected, updateAttributes, deleteNode, editor, getPos }: ReactNodeViewProps) {
  const attrs = node.attrs as WorkspaceImageAttrs;
  const [draft, setDraft] = useState<Partial<WorkspaceImageAttrs> | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const view = { ...attrs, ...draft };

  const select = () => {
    const pos = getPos();
    if (typeof pos === 'number') editor.chain().setNodeSelection(pos).run();
  };

  const areaWidth = () => (editor.view.dom as HTMLElement).clientWidth || 1;

  const start = (kind: Gesture['kind'], e: ReactPointerEvent, direction: 1 | -1 = 1) => {
    if (!editor.isEditable) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { kind, startX: e.clientX, startY: e.clientY, attrs, area: areaWidth(), direction };
  };

  const onImagePointerDown = (e: ReactPointerEvent) => {
    // First tap only selects, so touch users can still scroll past images.
    if (!selected) return select();
    if (attrs.wrap === 'front') start('move', e);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dx = ((e.clientX - g.startX) / g.area) * 100;
    if (g.kind === 'move') {
      setDraft({ x: clamp(g.attrs.x + dx, 0, 100 - g.attrs.width), y: Math.max(0, g.attrs.y + e.clientY - g.startY) });
    } else {
      const grow = g.attrs.wrap !== 'front' && g.attrs.align === 'center' ? dx * 2 : dx * g.direction;
      const maxWidth = g.attrs.wrap === 'front' ? 100 - g.attrs.x : 100;
      setDraft({ width: clamp(g.attrs.width + grow, MIN_WIDTH, maxWidth) });
    }
  };

  const onPointerUp = () => {
    if (!gesture.current) return;
    gesture.current = null;
    if (draft) updateAttributes(draft);
    setDraft(null);
  };

  const setWrap = (wrap: ImageWrap) => {
    if (wrap === 'front') {
      // Keep the image roughly where it was shown when it becomes free-floating.
      const el = editor.view.nodeDOM(getPos() ?? 0) as HTMLElement | null;
      const root = editor.view.dom.getBoundingClientRect();
      const box = el?.querySelector('img')?.getBoundingClientRect();
      const x = box ? clamp(((box.left - root.left) / root.width) * 100, 0, 100 - attrs.width) : 0;
      updateAttributes({ wrap, x, y: box ? Math.max(0, box.top - root.top) : attrs.y });
    } else {
      updateAttributes({ wrap, align: wrap === 'square' && attrs.align === 'center' ? 'left' : attrs.align });
    }
  };

  const style: CSSProperties =
    view.wrap === 'front'
      ? { position: 'absolute', left: `${view.x}%`, top: view.y, width: `${view.width}%`, zIndex: 5 }
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

  const resizeFromLeft = view.wrap !== 'front' && view.align === 'right';

  return (
    <NodeViewWrapper className="workspace-image" style={style} data-wrap={view.wrap}>
      <div className="relative" onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <img
          src={attrs.src}
          alt=""
          draggable={false}
          onPointerDown={onImagePointerDown}
          className={clsx(
            'block w-full select-none rounded-sm',
            selected && 'outline outline-2 outline-offset-2 outline-macaw',
            selected && view.wrap === 'front' && 'cursor-move touch-none',
          )}
        />
        {selected && editor.isEditable && (
          <>
            <span
              data-export-ignore
              role="presentation"
              onPointerDown={(e) => start('resize', e, resizeFromLeft ? -1 : 1)}
              className={clsx(
                'absolute -bottom-2.5 size-5 touch-none rounded-full border-2 border-white bg-macaw shadow',
                resizeFromLeft ? '-left-2.5 cursor-nesw-resize' : '-right-2.5 cursor-nwse-resize',
              )}
            />
            <ImageMenu
              wrap={view.wrap}
              align={view.align}
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

function ImageMenu({
  wrap,
  align,
  onWrap,
  onAlign,
  onDelete,
}: {
  wrap: ImageWrap;
  align: ImageAlign;
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
      className="absolute left-1.5 top-1.5 z-20 flex items-center gap-0.5 whitespace-nowrap rounded-xl bg-eel/90 p-1 text-white shadow-floating backdrop-blur"
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
      className={clsx('flex size-8 items-center justify-center rounded-lg transition-colors [&>svg]:size-4', active ? 'bg-white text-eel' : 'text-white/80 hover:bg-white/15')}
    >
      {children}
    </button>
  );
}
