import Highlight from '@tiptap/extension-highlight';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extension-placeholder';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyleKit } from '@tiptap/extension-text-style';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Check, CloudOff, Download, FileDown, FileText, ImagePlus, LoaderCircle, Printer } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { errorMessage, useFeedback } from '../components/feedback';
import { BackLink } from '../components/PageHeader';
import { Button, EmptyState, PageLoader } from '../components/ui';
import { api } from '../lib/api';
import { downloadText, formatNumber } from '../lib/format';
import type { Scan } from '../lib/types';
import { docToText, textToHtml } from '../lib/workspace';
import { ParagraphFormat } from '../workspace/extensions';
import { exportPdf, IMAGE_ACCEPT, readImageFile } from '../workspace/files';
import { FindReplace } from '../workspace/FindReplace';
import { MarqueeSelect } from '../workspace/MarqueeSelect';
import { MobileDock } from '../workspace/MobileDock';
import { Tools } from '../workspace/Toolbar';
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
  const [selecting, setSelecting] = useState(false);
  const [finding, setFinding] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true } }),
      TextStyleKit,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight.configure({ multicolor: true }),
      Subscript,
      Superscript,
      TaskList,
      TaskItem.configure({ nested: true }),
      ParagraphFormat,
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

  // Ctrl/Cmd + S saves right away; Ctrl/Cmd + F opens find and replace, like a word processor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault();
        void autosave.flush();
      } else if (key === 'f' || key === 'h') {
        e.preventDefault();
        setFinding(true);
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
      if (editor.isActive('table')) {
        // Inside a table the image goes in the current cell, on its own line and cell-wide.
        const pos = $from.after($from.depth);
        editor.chain().focus().insertContentAt(pos, { type: 'workspaceImage', attrs: { src, width: 100, wrap: 'topBottom', align: 'center' } }).setNodeSelection(pos).run();
        return;
      }
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

  const toolProps = {
    editor,
    onImage: actions.image,
    onFind: () => setFinding(true),
    selecting,
    onToggleSelect: () => setSelecting((v) => !v),
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
        <Tools {...toolProps} />
      </div>

      {selecting && (
        <p className="workspace-chrome rounded-xl bg-macaw-light px-4 py-2 text-sm font-semibold text-macaw-dark">
          Selección por área activa: arrastra sobre la hoja para seleccionar lo que quede dentro. Toca de nuevo la herramienta para volver a escribir.
        </p>
      )}

      <div className="workspace-desk rounded-[24px] bg-swan/60 px-2 py-6 sm:px-6 sm:py-10">
        <div className="workspace-sheet mx-auto min-h-[1000px] w-full max-w-[816px] bg-white px-5 py-8 shadow-[0_2px_10px_rgba(41,36,68,0.12)] sm:px-[72px] sm:py-[72px]">
          <div ref={contentRef} className="relative bg-white">
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
            <MarqueeSelect editor={editor} active={selecting} />
          </div>
        </div>
      </div>

      <div className="workspace-chrome text-right text-xs font-semibold text-wolf">{formatNumber(words)} palabras</div>

      {finding && <FindReplace editor={editor} onClose={() => setFinding(false)} />}
      <MobileDock {...toolProps} actions={actions} exporting={exporting} />
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
