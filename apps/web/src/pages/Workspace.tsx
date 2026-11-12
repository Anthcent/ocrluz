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
  Check,
  CloudOff,
  Columns3,
  Download,
  EllipsisVertical,
  FileDown,
  FileText,
  Highlighter,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  LoaderCircle,
  Minus,
  Printer,
  Quote,
  Redo2,
  RemoveFormatting,
  Rows3,
  Strikethrough,
  Table as TableIcon,
  Trash2,
  Underline,
  Undo2,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { errorMessage, useFeedback } from '../components/feedback';
import { BackLink } from '../components/PageHeader';
import { Button, EmptyState, PageLoader } from '../components/ui';
import { api } from '../lib/api';
import { downloadText, formatNumber } from '../lib/format';
import type { Scan } from '../lib/types';
import { docToText, textToHtml } from '../lib/workspace';
import { exportPdf, IMAGE_ACCEPT, readImageFile } from '../workspace/files';
import { WorkspaceImage } from '../workspace/WorkspaceImage';

const AUTOSAVE_DELAY = 1200;

type SaveStatus = 'saved' | 'pending' | 'saving' | 'error';

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
  return <WorkspaceEditor key={scan.id} scan={scan} />;
}

/**
 * Saves every change after a short pause. Only one request runs at a time; edits made
 * while it is in flight trigger another save right after it finishes.
 */
function useAutosave(save: () => Promise<void>) {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const saveRef = useRef(save);
  saveRef.current = save;
  const state = useRef({ version: 0, savedVersion: 0, inFlight: false, timer: 0 });

  const flush = async () => {
    const s = state.current;
    window.clearTimeout(s.timer);
    if (s.inFlight || s.version === s.savedVersion) return;
    s.inFlight = true;
    const version = s.version;
    setStatus('saving');
    let failed = false;
    try {
      await saveRef.current();
      s.savedVersion = version;
      setStatus(s.version === version ? 'saved' : 'pending');
    } catch {
      failed = true;
      setStatus('error');
    } finally {
      s.inFlight = false;
    }
    // Edits made during the request are saved next; after an error we wait for a retry or a new edit.
    if (!failed && s.version !== s.savedVersion) s.timer = window.setTimeout(flush, AUTOSAVE_DELAY);
  };

  const markChanged = () => {
    const s = state.current;
    s.version++;
    setStatus('pending');
    window.clearTimeout(s.timer);
    s.timer = window.setTimeout(flush, AUTOSAVE_DELAY);
  };

  const unsaved = status !== 'saved';
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  // Leaving the page within the autosave delay still saves the last edits.
  useEffect(() => () => void flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return { status, markChanged, flush };
}

function WorkspaceEditor({ scan }: { scan: Scan }) {
  const { toast } = useFeedback();
  const [title, setTitle] = useState(scan.title);
  const titleRef = useRef(title);
  titleRef.current = title;
  const contentRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      WorkspaceImage,
      Placeholder.configure({ placeholder: 'Escribe aquí el contenido del documento…' }),
    ],
    content: scan.workspaceHtml || textToHtml(scan.text),
    editorProps: { attributes: { class: 'workspace-doc', 'aria-label': 'Documento' } },
    onUpdate: () => autosave.markChanged(),
  });

  const autosave = useAutosave(async () => {
    if (!editor) return;
    await api.scans.update(scan.id, { title: titleRef.current, text: docToText(editor.getJSON()), workspaceHtml: editor.getHTML() });
  });

  const words = useEditorState({
    editor,
    selector: ({ editor }) => (editor ? editor.getText().split(/\s+/).filter(Boolean).length : 0),
  });

  // Ctrl/Cmd + S saves right away, like a word processor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void autosave.flush();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!editor) return <PageLoader />;

  const fileName = title.trim() || 'documento';

  const addImage = async (file: File | undefined) => {
    if (!file) return;
    try {
      const src = await readImageFile(file);
      const { state, view } = editor;
      const { $from } = state.selection;
      // Insert after the current block so the text is not split; the image starts over the text.
      const pos = $from.depth > 0 ? $from.after(1) : state.selection.to;
      const root = view.dom.getBoundingClientRect();
      const caret = view.coordsAtPos(state.selection.from);
      const width = 40;
      editor
        .chain()
        .focus()
        .insertContentAt(pos, { type: 'workspaceImage', attrs: { src, width, wrap: 'front', align: 'left', x: (100 - width) / 2, y: Math.max(0, caret.bottom - root.top + 8) } })
        .setNodeSelection(pos)
        .run();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  const savePdf = async () => {
    if (!contentRef.current) return;
    setExporting(true);
    try {
      editor.commands.blur();
      await exportPdf(contentRef.current, fileName);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setExporting(false);
    }
  };

  const actions = {
    image: () => fileRef.current?.click(),
    pdf: savePdf,
    txt: () => downloadText(`${fileName}.txt`, docToText(editor.getJSON())),
    print: () => window.print(),
  };

  return (
    <div className="workspace-page mx-auto max-w-6xl space-y-4 pb-24 lg:pb-0">
      <input ref={fileRef} type="file" accept={IMAGE_ACCEPT} hidden onChange={(e) => { void addImage(e.target.files?.[0]); e.target.value = ''; }} />

      <div className="workspace-chrome flex flex-wrap items-center gap-3">
        <BackLink to={`/escaneo/${scan.id}`}>{scan.title || 'Escaneo'}</BackLink>
        <SaveIndicator status={autosave.status} onRetry={autosave.flush} />
        <div className="ml-auto hidden flex-wrap gap-2 lg:flex">
          <Button variant="ghost" size="sm" icon={<ImagePlus className="size-4" />} onClick={actions.image}>Imagen</Button>
          <Button variant="ghost" size="sm" icon={<Download className="size-4" />} onClick={actions.txt}>.txt</Button>
          <Button variant="ghost" size="sm" icon={<Printer className="size-4" />} onClick={actions.print}>Imprimir</Button>
          <Button size="sm" icon={<FileDown className="size-4" />} loading={exporting} onClick={actions.pdf}>Exportar PDF</Button>
        </div>
      </div>

      <div role="toolbar" aria-label="Formato" className="workspace-chrome sticky top-20 z-10 hidden flex-wrap items-center gap-1 rounded-2xl bg-white p-2 shadow-surface lg:flex">
        <Tools editor={editor} onImage={actions.image} />
      </div>

      <div className="workspace-desk rounded-[24px] bg-swan/60 px-2 py-6 sm:px-6 sm:py-10">
        <div className="workspace-sheet mx-auto min-h-[1000px] w-full max-w-[816px] bg-white px-5 py-8 shadow-[0_2px_10px_rgba(41,36,68,0.12)] sm:px-[72px] sm:py-[72px]">
          <div ref={contentRef} className="bg-white">
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                autosave.markChanged();
              }}
              maxLength={200}
              aria-label="Título del documento"
              placeholder="Título del documento"
              className="mb-6 w-full border-0 bg-transparent text-3xl font-black text-eel outline-none placeholder:text-hare"
            />
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>

      <div className="workspace-chrome text-right text-xs font-semibold text-wolf">{formatNumber(words)} palabras</div>

      <MobileDock editor={editor} actions={actions} exporting={exporting} />
    </div>
  );
}

function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === 'error') {
    return (
      <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 text-sm font-bold text-cardinal-dark hover:underline">
        <CloudOff className="size-4" /> No se pudo guardar · Reintentar
      </button>
    );
  }
  return (
    <span role="status" className="inline-flex items-center gap-1.5 text-sm font-semibold text-wolf">
      {status === 'saved' ? <Check className="size-4 text-feather-dark" /> : <LoaderCircle className="size-4 animate-spin" />}
      {status === 'saved' ? 'Guardado' : 'Guardando…'}
    </span>
  );
}

type Actions = { image: () => void; pdf: () => void; txt: () => void; print: () => void };

/** Mobile: tools in a subtle bottom bar with horizontal scroll, plus a menu for file actions. */
function MobileDock({ editor, actions, exporting }: { editor: Editor; actions: Actions; exporting: boolean }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as globalThis.Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div className="workspace-chrome workspace-dock fixed inset-x-3 z-30 flex items-center gap-1 rounded-2xl bg-white/95 p-1.5 shadow-floating backdrop-blur lg:hidden">
      <div role="toolbar" aria-label="Formato" className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain">
        <Tools editor={editor} onImage={actions.image} />
      </div>
      <span aria-hidden className="h-7 w-px shrink-0 bg-swan" />
      <div ref={menuRef} className="relative shrink-0">
        <button
          type="button"
          aria-label="Más opciones"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={clsx('flex size-10 items-center justify-center rounded-xl transition-colors', open ? 'bg-eel text-white' : 'text-eel hover:bg-polar')}
        >
          {exporting ? <LoaderCircle className="size-5 animate-spin" /> : <EllipsisVertical className="size-5" />}
        </button>
        {open && (
          <div role="menu" className="absolute bottom-full right-0 mb-2 w-56 overflow-hidden rounded-2xl bg-white p-1.5 shadow-floating">
            <MenuItem icon={<ImagePlus />} onClick={run(actions.image)}>Añadir imagen</MenuItem>
            <MenuItem icon={<FileDown />} onClick={run(actions.pdf)}>Exportar PDF</MenuItem>
            <MenuItem icon={<Download />} onClick={run(actions.txt)}>Descargar .txt</MenuItem>
            <MenuItem icon={<Printer />} onClick={run(actions.print)}>Imprimir</MenuItem>
          </div>
        )}
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

function Tools({ editor, onImage }: { editor: Editor; onImage: () => void }) {
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
    <>
      <Tool label="Deshacer" onClick={() => chain().undo().run()} disabled={!state.canUndo}><Undo2 /></Tool>
      <Tool label="Rehacer" onClick={() => chain().redo().run()} disabled={!state.canRedo}><Redo2 /></Tool>
      <Divider />
      <select
        value={state.block}
        onChange={(e) => setBlock(e.target.value)}
        aria-label="Estilo de párrafo"
        className="h-9 shrink-0 rounded-xl bg-polar px-2 text-sm font-bold text-eel outline-none focus-visible:ring-4 focus-visible:ring-macaw/35"
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

function Divider() {
  return <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-swan" />;
}
