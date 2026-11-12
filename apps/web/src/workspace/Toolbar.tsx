import { useEditorState, type Editor } from '@tiptap/react';
import clsx from 'clsx';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  Columns3,
  Highlighter,
  ImagePlus,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  RemoveFormatting,
  Rows3,
  Search,
  SquareDashedMousePointer,
  Strikethrough,
  Subscript,
  Superscript,
  Table as TableIcon,
  Trash2,
  Underline,
  Undo2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { indent, setLineHeight } from './extensions';
// Type-only imports register these extensions' commands on the editor's chain.
import type {} from '@tiptap/extension-subscript';
import type {} from '@tiptap/extension-superscript';
import type {} from '@tiptap/extension-text-style';

const FONTS = [
  { label: 'Georgia', value: '' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Calibri', value: 'Calibri, Carlito, sans-serif' },
  { label: 'Times New Roman', value: "'Times New Roman', Times, serif" },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Courier New', value: "'Courier New', Courier, monospace" },
];

/** Word-like point sizes; the document's base text is 12 pt. */
const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72];

const LINE_HEIGHTS = [
  { label: 'Interlineado', value: '' },
  { label: '1,0', value: '1' },
  { label: '1,15', value: '1.15' },
  { label: '1,5', value: '1.5' },
  { label: '2,0', value: '2' },
];

export interface ToolbarProps {
  editor: Editor;
  onImage: () => void;
  onFind: () => void;
  selecting: boolean;
  onToggleSelect: () => void;
}

/** Every formatting tool, shared by the desktop toolbar and the mobile dock. */
export function Tools({ editor, onImage, onFind, selecting, onToggleSelect }: ToolbarProps) {
  // Re-render on selection/transaction so active states stay in sync.
  const state = useEditorState({
    editor,
    selector: ({ editor }) => {
      const textStyle = editor.getAttributes('textStyle');
      return {
        block: editor.isActive('heading', { level: 1 }) ? 'h1' : editor.isActive('heading', { level: 2 }) ? 'h2' : editor.isActive('heading', { level: 3 }) ? 'h3' : 'p',
        font: (textStyle.fontFamily as string | undefined) ?? '',
        size: textStyle.fontSize ? String(parseFloat(textStyle.fontSize as string)) : '',
        color: (textStyle.color as string | undefined) ?? '#18191d',
        highlightColor: (editor.getAttributes('highlight').color as string | undefined) ?? '#ffe066',
        lineHeight: (editor.getAttributes('paragraph').lineHeight as string | undefined) ?? '',
        bold: editor.isActive('bold'),
        italic: editor.isActive('italic'),
        underline: editor.isActive('underline'),
        strike: editor.isActive('strike'),
        superscript: editor.isActive('superscript'),
        subscript: editor.isActive('subscript'),
        highlight: editor.isActive('highlight'),
        link: editor.isActive('link'),
        left: editor.isActive({ textAlign: 'left' }),
        center: editor.isActive({ textAlign: 'center' }),
        right: editor.isActive({ textAlign: 'right' }),
        justify: editor.isActive({ textAlign: 'justify' }),
        bullet: editor.isActive('bulletList'),
        ordered: editor.isActive('orderedList'),
        task: editor.isActive('taskList'),
        quote: editor.isActive('blockquote'),
        inTable: editor.isActive('table'),
        canUndo: editor.can().undo(),
        canRedo: editor.can().redo(),
      };
    },
  });

  const chain = () => editor.chain().focus();

  const setBlock = (value: string) => {
    if (value === 'p') chain().setParagraph().run();
    else chain().setHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 }).run();
  };

  const toggleLink = () => {
    if (state.link) return chain().extendMarkRange('link').unsetLink().run();
    const url = window.prompt('Dirección del enlace', 'https://');
    if (url && url !== 'https://') chain().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <>
      <Tool label="Selección por área" active={selecting} onClick={onToggleSelect}><SquareDashedMousePointer /></Tool>
      <Tool label="Buscar y reemplazar" onClick={onFind}><Search /></Tool>
      <Divider />
      <Tool label="Deshacer" onClick={() => chain().undo().run()} disabled={!state.canUndo}><Undo2 /></Tool>
      <Tool label="Rehacer" onClick={() => chain().redo().run()} disabled={!state.canRedo}><Redo2 /></Tool>
      <Divider />
      <Select label="Estilo de párrafo" value={state.block} onChange={setBlock} className="w-32">
        <option value="p">Texto normal</option>
        <option value="h1">Título 1</option>
        <option value="h2">Título 2</option>
        <option value="h3">Título 3</option>
      </Select>
      <Select
        label="Fuente"
        value={state.font}
        onChange={(v) => (v ? chain().setFontFamily(v).run() : chain().unsetFontFamily().run())}
        className="w-36"
      >
        {FONTS.map((f) => (
          <option key={f.label} value={f.value}>{f.label}</option>
        ))}
      </Select>
      <Select
        label="Tamaño de fuente"
        value={state.size}
        onChange={(v) => (v ? chain().setFontSize(`${v}pt`).run() : chain().unsetFontSize().run())}
        className="w-20"
      >
        <option value="">12</option>
        {SIZES.filter((s) => s !== 12).map((s) => (
          <option key={s} value={String(s)}>{s}</option>
        ))}
      </Select>
      <Divider />
      <Tool label="Negrita" active={state.bold} onClick={() => chain().toggleBold().run()}><Bold /></Tool>
      <Tool label="Cursiva" active={state.italic} onClick={() => chain().toggleItalic().run()}><Italic /></Tool>
      <Tool label="Subrayado" active={state.underline} onClick={() => chain().toggleUnderline().run()}><Underline /></Tool>
      <Tool label="Tachado" active={state.strike} onClick={() => chain().toggleStrike().run()}><Strikethrough /></Tool>
      <Tool label="Superíndice" active={state.superscript} onClick={() => chain().toggleSuperscript().run()}><Superscript /></Tool>
      <Tool label="Subíndice" active={state.subscript} onClick={() => chain().toggleSubscript().run()}><Subscript /></Tool>
      <ColorTool label="Color de texto" value={state.color} onChange={(c) => chain().setColor(c).run()} icon={<Baseline />} />
      <Tool label="Resaltar" active={state.highlight} onClick={() => chain().toggleHighlight({ color: state.highlightColor }).run()}><Highlighter /></Tool>
      <ColorTool label="Color de resaltado" value={state.highlightColor} onChange={(c) => chain().setHighlight({ color: c }).run()} icon={<Highlighter />} />
      <Tool label="Enlace" active={state.link} onClick={toggleLink}><Link2 /></Tool>
      <Divider />
      <Tool label="Alinear a la izquierda" active={state.left} onClick={() => chain().setTextAlign('left').run()}><AlignLeft /></Tool>
      <Tool label="Centrar" active={state.center} onClick={() => chain().setTextAlign('center').run()}><AlignCenter /></Tool>
      <Tool label="Alinear a la derecha" active={state.right} onClick={() => chain().setTextAlign('right').run()}><AlignRight /></Tool>
      <Tool label="Justificar" active={state.justify} onClick={() => chain().setTextAlign('justify').run()}><AlignJustify /></Tool>
      <Tool label="Disminuir sangría" onClick={() => indent(editor, -1)}><IndentDecrease /></Tool>
      <Tool label="Aumentar sangría" onClick={() => indent(editor, 1)}><IndentIncrease /></Tool>
      <Select label="Interlineado" value={state.lineHeight} onChange={(v) => setLineHeight(editor, v || null)} className="w-32">
        {LINE_HEIGHTS.map((l) => (
          <option key={l.label} value={l.value}>{l.label}</option>
        ))}
      </Select>
      <Divider />
      <Tool label="Lista con viñetas" active={state.bullet} onClick={() => chain().toggleBulletList().run()}><List /></Tool>
      <Tool label="Lista numerada" active={state.ordered} onClick={() => chain().toggleOrderedList().run()}><ListOrdered /></Tool>
      <Tool label="Lista de tareas" active={state.task} onClick={() => chain().toggleTaskList().run()}><ListChecks /></Tool>
      <Tool label="Cita" active={state.quote} onClick={() => chain().toggleBlockquote().run()}><Quote /></Tool>
      <Tool label="Línea divisoria" onClick={() => chain().setHorizontalRule().run()}><Minus /></Tool>
      <Divider />
      <Tool label="Insertar imagen" onClick={onImage}><ImagePlus /></Tool>
      <Tool label="Insertar tabla" onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon /></Tool>
      {state.inTable && (
        <>
          <Tool label="Añadir fila" onClick={() => chain().addRowAfter().run()}><Rows3 /></Tool>
          <Tool label="Añadir columna" onClick={() => chain().addColumnAfter().run()}><Columns3 /></Tool>
          <Tool label="Borrar fila" onClick={() => chain().deleteRow().run()} tone="danger"><Rows3 /></Tool>
          <Tool label="Borrar columna" onClick={() => chain().deleteColumn().run()} tone="danger"><Columns3 /></Tool>
          <Tool label="Borrar tabla" onClick={() => chain().deleteTable().run()} tone="danger"><Trash2 /></Tool>
        </>
      )}
      <Divider />
      <Tool label="Quitar formato" onClick={() => chain().unsetAllMarks().clearNodes().run()}><RemoveFormatting /></Tool>
    </>
  );
}

function Tool({ label, active, disabled, tone, onClick, children }: { label: string; active?: boolean; disabled?: boolean; tone?: 'danger'; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={clsx(
        'flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors disabled:opacity-30 [&>svg]:size-4',
        active ? 'bg-macaw-light text-macaw-dark' : tone === 'danger' ? 'text-cardinal-dark hover:bg-cardinal-light' : 'text-wolf hover:bg-polar hover:text-eel',
      )}
    >
      {children}
    </button>
  );
}

function Select({ label, value, onChange, className, children }: { label: string; value: string; onChange: (value: string) => void; className?: string; children: ReactNode }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      title={label}
      className={clsx('h-9 shrink-0 rounded-xl bg-polar px-2 text-sm font-bold text-eel outline-none focus-visible:ring-4 focus-visible:ring-macaw/35', className)}
    >
      {children}
    </select>
  );
}

/** Icon button that opens the native color picker; the bar under the icon shows the current color. */
function ColorTool({ label, value, onChange, icon }: { label: string; value: string; onChange: (color: string) => void; icon: ReactNode }) {
  return (
    <label title={label} className="relative flex size-9 shrink-0 cursor-pointer flex-col items-center justify-center rounded-xl text-wolf hover:bg-polar hover:text-eel [&>svg]:size-4">
      {icon}
      <span aria-hidden className="mt-0.5 h-1 w-5 rounded-full" style={{ background: value }} />
      <input type="color" aria-label={label} value={toHex(value)} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
    </label>
  );
}

/** The color input only accepts #rrggbb. */
function toHex(color: string) {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  const rgb = color.match(/\d+/g);
  if (color.startsWith('rgb') && rgb && rgb.length >= 3) return `#${rgb.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
  return '#000000';
}

function Divider() {
  return <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-swan" />;
}
