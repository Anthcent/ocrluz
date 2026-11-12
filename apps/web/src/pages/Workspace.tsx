import Highlight from '@tiptap/extension-highlight';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import clsx from 'clsx';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Columns3,
  Download,
  FileText,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Minus,
  Printer,
  Quote,
  Redo2,
  RemoveFormatting,
  Rows3,
  Save,
  Strikethrough,
  Table as TableIcon,
  Trash2,
  Underline,
  Undo2,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { errorMessage, useFeedback } from '../components/feedback';
import { BackLink } from '../components/PageHeader';
import { Button, EmptyState, PageLoader } from '../components/ui';
import { api } from '../lib/api';
import { downloadText, formatNumber } from '../lib/format';
import type { Scan } from '../lib/types';
import { docToText, textToHtml } from '../lib/workspace';

/** Word-style workspace to edit the content of an archived scan. */
export function WorkspacePage() {
  const id = Number(useParams().id);
  const [scan, setScan] = useState<Scan | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setScan(null);
    api.scans
      .get(id)
      .then((r) => setScan(r.scan))
      .catch(() => setNotFound(true));
  }, [id]);

  if (notFound) {
    return <EmptyState icon={<FileText className="size-10" />} title="Escaneo no encontrado" action={<Link to="/archivo"><Button>Volver al archivo</Button></Link>} />;
  }
  if (!scan) return <PageLoader />;
  return <WorkspaceEditor key={scan.id} scan={scan} onSaved={setScan} />;
}

function WorkspaceEditor({ scan, onSaved }: { scan: Scan; onSaved: (scan: Scan) => void }) {
  const { toast } = useFeedback();
  const [title, setTitle] = useState(scan.title);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder: 'Escribe aquí el contenido del documento…' }),
    ],
    content: scan.workspaceHtml || textToHtml(scan.text),
    editorProps: { attributes: { class: 'workspace-doc', 'aria-label': 'Documento' } },
    onUpdate: () => setDirty(true),
  });

  const words = useEditorState({
    editor,
    selector: ({ editor }) => (editor ? editor.getText().split(/\s+/).filter(Boolean).length : 0),
  });

  const isDirty = dirty || title !== scan.title;

  useEffect(() => {
    if (!isDirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  const save = async () => {
    if (!editor || saving) return;
    setSaving(true);
    try {
      const { scan: updated } = await api.scans.update(scan.id, {
        title,
        text: docToText(editor.getJSON()),
        workspaceHtml: editor.getHTML(),
      });
      onSaved(updated);
      setDirty(false);
      toast('Documento guardado');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  // Ctrl/Cmd + S saves, like a word processor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!editor) return <PageLoader />;

  return (
    <div className="workspace-page mx-auto max-w-6xl space-y-4">
      <div className="workspace-chrome flex flex-wrap items-center gap-3">
        <BackLink to={`/escaneo/${scan.id}`}>{scan.title || 'Escaneo'}</BackLink>
        <span className="text-sm font-semibold text-wolf">{isDirty ? 'Cambios sin guardar' : 'Todo guardado'}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" icon={<Download className="size-4" />} onClick={() => downloadText(`${title || 'documento'}.txt`, docToText(editor.getJSON()))}>
            .txt
          </Button>
          <Button variant="ghost" size="sm" icon={<Printer className="size-4" />} onClick={() => window.print()}>
            Imprimir / PDF
          </Button>
          <Button size="sm" icon={<Save className="size-4" />} loading={saving} disabled={!isDirty} onClick={save}>
            Guardar
          </Button>
        </div>
      </div>

      <Toolbar editor={editor} />

      <div className="workspace-desk rounded-[24px] bg-swan/60 px-2 py-6 sm:px-6 sm:py-10">
        <div className="workspace-sheet mx-auto min-h-[1000px] w-full max-w-[816px] bg-white px-6 py-10 shadow-[0_2px_10px_rgba(41,36,68,0.12)] sm:px-[72px] sm:py-[72px]">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            aria-label="Título del documento"
            placeholder="Título del documento"
            className="mb-6 w-full border-0 bg-transparent text-3xl font-black text-eel outline-none placeholder:text-hare"
          />
          <EditorContent editor={editor} />
        </div>
      </div>

      <div className="workspace-chrome text-right text-xs font-semibold text-wolf">{formatNumber(words)} palabras</div>
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  // Re-render on selection/transaction so active states stay in sync.
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      block: editor.isActive('heading', { level: 1 }) ? 'h1' : editor.isActive('heading', { level: 2 }) ? 'h2' : editor.isActive('heading', { level: 3 }) ? 'h3' : 'p',
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      underline: editor.isActive('underline'),
      strike: editor.isActive('strike'),
      highlight: editor.isActive('highlight'),
      left: editor.isActive({ textAlign: 'left' }),
      center: editor.isActive({ textAlign: 'center' }),
      right: editor.isActive({ textAlign: 'right' }),
      justify: editor.isActive({ textAlign: 'justify' }),
      bullet: editor.isActive('bulletList'),
      ordered: editor.isActive('orderedList'),
      quote: editor.isActive('blockquote'),
      inTable: editor.isActive('table'),
      canUndo: editor.can().undo(),
      canRedo: editor.can().redo(),
    }),
  });

  const chain = () => editor.chain().focus();

  const setBlock = (value: string) => {
    if (value === 'p') chain().setParagraph().run();
    else chain().setHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 }).run();
  };

  return (
    <div role="toolbar" aria-label="Formato" className="workspace-chrome sticky top-20 z-10 flex flex-wrap items-center gap-1 rounded-2xl bg-white p-2 shadow-surface">
      <Tool label="Deshacer" onClick={() => chain().undo().run()} disabled={!state.canUndo}><Undo2 /></Tool>
      <Tool label="Rehacer" onClick={() => chain().redo().run()} disabled={!state.canRedo}><Redo2 /></Tool>
      <Divider />
      <select
        value={state.block}
        onChange={(e) => setBlock(e.target.value)}
        aria-label="Estilo de párrafo"
        className="h-9 rounded-xl bg-polar px-2 text-sm font-bold text-eel outline-none focus-visible:ring-4 focus-visible:ring-macaw/35"
      >
        <option value="p">Texto normal</option>
        <option value="h1">Título 1</option>
        <option value="h2">Título 2</option>
        <option value="h3">Título 3</option>
      </select>
      <Divider />
      <Tool label="Negrita" active={state.bold} onClick={() => chain().toggleBold().run()}><Bold /></Tool>
      <Tool label="Cursiva" active={state.italic} onClick={() => chain().toggleItalic().run()}><Italic /></Tool>
      <Tool label="Subrayado" active={state.underline} onClick={() => chain().toggleUnderline().run()}><Underline /></Tool>
      <Tool label="Tachado" active={state.strike} onClick={() => chain().toggleStrike().run()}><Strikethrough /></Tool>
      <Tool label="Resaltar" active={state.highlight} onClick={() => chain().toggleHighlight().run()}><Highlighter /></Tool>
      <Divider />
      <Tool label="Alinear a la izquierda" active={state.left} onClick={() => chain().setTextAlign('left').run()}><AlignLeft /></Tool>
      <Tool label="Centrar" active={state.center} onClick={() => chain().setTextAlign('center').run()}><AlignCenter /></Tool>
      <Tool label="Alinear a la derecha" active={state.right} onClick={() => chain().setTextAlign('right').run()}><AlignRight /></Tool>
      <Tool label="Justificar" active={state.justify} onClick={() => chain().setTextAlign('justify').run()}><AlignJustify /></Tool>
      <Divider />
      <Tool label="Lista con viñetas" active={state.bullet} onClick={() => chain().toggleBulletList().run()}><List /></Tool>
      <Tool label="Lista numerada" active={state.ordered} onClick={() => chain().toggleOrderedList().run()}><ListOrdered /></Tool>
      <Tool label="Cita" active={state.quote} onClick={() => chain().toggleBlockquote().run()}><Quote /></Tool>
      <Tool label="Línea divisoria" onClick={() => chain().setHorizontalRule().run()}><Minus /></Tool>
      <Divider />
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
    </div>
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
        'flex size-9 items-center justify-center rounded-xl transition-colors disabled:opacity-30 [&>svg]:size-4',
        active ? 'bg-macaw-light text-macaw-dark' : tone === 'danger' ? 'text-cardinal-dark hover:bg-cardinal-light' : 'text-wolf hover:bg-polar hover:text-eel',
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden className="mx-1 h-6 w-px bg-swan" />;
}
