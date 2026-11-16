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
import { Check, CloudOff, Download, FileDown, FileText, FileType, ImagePlus, LoaderCircle, Minus, Plus, Printer } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Link, useParams } from 'react-router';
import { errorMessage, useFeedback } from '../components/feedback';
import { BackLink } from '../components/PageHeader';
import { Button, EmptyState, PageLoader } from '../components/ui';
import { api } from '../lib/api';
import { downloadText, formatNumber } from '../lib/format';
import type { Scan } from '../lib/types';
import { docToText, textToHtml } from '../lib/workspace';
import { PageBreak, ParagraphFormat } from '../workspace/extensions';
import { downloadBlob, exportPdf, IMAGE_ACCEPT, readImageFile } from '../workspace/files';
import { FindReplace } from '../workspace/FindReplace';
import { LinkDialog } from '../workspace/LinkDialog';
import { MarqueeSelect } from '../workspace/MarqueeSelect';
import { MobileDock } from '../workspace/MobileDock';
import { PAGE_GAP, pageBox, readPageSetup, withPageSetup, ZOOMS, type PageSetup, type ViewMode, type Zoom } from '../workspace/page';
import { clearPagination, paginate, Pagination } from '../workspace/pagination';
import { SearchHighlight } from '../workspace/search';
import { ToolTabs, Tools, type ToolTab, type ToolbarProps } from '../workspace/Toolbar';
import { insertImage, WorkspaceImage } from '../workspace/WorkspaceImage';

const AUTOSAVE_DELAY = 1200;
const VIEW_KEY = 'ocryon.workspace.view.v2';

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

/** Layout size of an element (not affected by the zoom transform), kept up to date. */
function useSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize((prev) => (prev.width === el.offsetWidth && prev.height === el.offsetHeight ? prev : { width: el.offsetWidth, height: el.offsetHeight }));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/** How the sheet is shown is a per-device choice. It starts as the real sheet, fitted to the width of the screen. */
function loadView(): { view: ViewMode; zoom: Zoom } {
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_KEY) ?? 'null') as { view?: unknown; zoom?: unknown } | null;
    if (saved && (saved.view === 'page' || saved.view === 'flow')) {
      return { view: saved.view, zoom: typeof saved.zoom === 'number' && ZOOMS.includes(saved.zoom) ? saved.zoom : 'fit' };
    }
  } catch {
    // No stored preference.
  }
  return { view: 'page', zoom: 'fit' };
}

function WorkspaceEditor({ scan }: { scan: Scan }) {
  const { toast, confirm } = useFeedback();
  const saved = useMemo(() => readPageSetup(scan.workspaceHtml ?? ''), [scan.workspaceHtml]);
  const [title, setTitle] = useState(scan.title);
  const titleRef = useRef(title);
  titleRef.current = title;
  const [page, setPage] = useState<PageSetup>(saved.setup);
  const pageRef = useRef(page);
  pageRef.current = page;
  const [{ view, zoom }, setViewState] = useState(loadView);

  const deskRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const addImageRef = useRef<(file: File | undefined) => Promise<void>>(async () => {});

  const [tab, setTab] = useState<ToolTab>('home');
  const [exporting, setExporting] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [finding, setFinding] = useState(false);
  const [linking, setLinking] = useState(false);
  const [pages, setPages] = useState(1);

  /** Image files pasted or dropped on the document are added like picked ones. */
  const takeImage = (files: FileList | undefined | null) => {
    const file = [...(files ?? [])].find((f) => f.type.startsWith('image/'));
    if (!file) return false;
    void addImageRef.current(file);
    return true;
  };

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
      PageBreak,
      Pagination,
      SearchHighlight,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      WorkspaceImage,
      Placeholder.configure({ placeholder: 'Escribe aquí el contenido del documento…' }),
    ],
    content: saved.html || textToHtml(scan.text),
    editorProps: {
      attributes: { class: 'workspace-doc', 'aria-label': 'Documento' },
      // Text copied from Word or Excel also carries a picture of itself: only a bare image counts as one.
      handlePaste: (_view, e) => !e.clipboardData?.types.some((t) => t.startsWith('text/')) && takeImage(e.clipboardData?.files),
      handleDrop: (_view, e) => {
        if (!takeImage(e.dataTransfer?.files)) return false;
        e.preventDefault();
        return true;
      },
    },
    onUpdate: () => autosave.markChanged(),
  });

  const autosave = useAutosave(async () => {
    if (!editor) return;
    await api.scans.update(scan.id, { title: titleRef.current, text: docToText(editor.getJSON()), workspaceHtml: withPageSetup(editor.getHTML(), pageRef.current) });
  });

  const text = useEditorState({ editor, selector: ({ editor }) => (editor ? editor.getText() : '') });
  const words = useMemo(() => text.split(/\s+/).filter(Boolean).length, [text]);
  const characters = useMemo(() => text.replace(/\n/g, '').length, [text]);

  // Sheet geometry: real paper size in page view, scaled to fit the screen or to the chosen zoom.
  const box = pageBox(page);
  const paged = view === 'page';
  const desk = useSize(deskRef);
  const sheet = useSize(sheetRef);
  const scale = !paged ? 1 : zoom === 'fit' ? (desk.width ? Math.min(1, desk.width / box.width) : 1) : zoom / 100;

  // Page view: the text is split into real sheets, with the margins and the gap between them.
  const dead = box.margin * 2 + PAGE_GAP;
  useEffect(() => {
    const content = contentRef.current;
    if (!editor || !content) return;
    if (!paged) {
      clearPagination(editor);
      setPages(1);
      return;
    }
    let frame = 0;
    const run = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setPages(paginate(editor, content, box.contentHeight, dead)));
    };
    run();
    editor.on('update', run);
    const observer = new ResizeObserver(run);
    observer.observe(content);
    // Web fonts change the line breaks when they arrive.
    void document.fonts?.ready.then(run);
    return () => {
      cancelAnimationFrame(frame);
      editor.off('update', run);
      observer.disconnect();
    };
  }, [editor, paged, box.contentHeight, box.contentWidth, dead]);

  // Ctrl/Cmd + wheel zooms the sheet instead of the whole browser page.
  const zoomRef = useRef<(direction: 1 | -1) => void>(() => {});
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      zoomRef.current(e.deltaY < 0 ? 1 : -1);
    };
    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => scroller.removeEventListener('wheel', onWheel);
  }, [editor]);

  // Ctrl/Cmd + S saves right away; Ctrl/Cmd + F opens find and replace; Ctrl/Cmd + K adds a link.
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
      } else if (key === 'k') {
        e.preventDefault();
        setLinking(true);
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
      await insertImage(editor, await readImageFile(file));
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };
  addImageRef.current = addImage;

  const exportWith = async (job: () => Promise<void>) => {
    setExporting(true);
    try {
      editor.commands.blur();
      await job();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setExporting(false);
    }
  };

  const actions = {
    image: () => fileRef.current?.click(),
    pdf: () =>
      exportWith(async () => {
        if (contentRef.current) await exportPdf(contentRef.current, fileName, page);
      }),
    docx: () =>
      exportWith(async () => {
        const { exportDocx } = await import('../workspace/docx');
        downloadBlob(`${fileName}.docx`, await exportDocx(editor.getJSON(), title, page));
      }),
    txt: () => downloadText(`${fileName}.txt`, docToText(editor.getJSON())),
    print: () => window.print(),
  };

  const changePage = (next: PageSetup) => {
    setPage(next);
    pageRef.current = next;
    autosave.markChanged();
  };

  const changeView = (next: { view: ViewMode; zoom: Zoom }) => {
    setViewState(next);
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(next));
    } catch {
      // Private mode: the choice just lasts for this visit.
    }
  };

  // The OCR text is known while the scan was never edited here; afterwards the server keeps it.
  const original = scan.originalText ?? (scan.workspaceHtml ? null : scan.text);
  const restore = async () => {
    if (!original) return;
    const ok = await confirm({
      title: 'Restaurar texto original',
      message: 'Todo el contenido del documento se reemplazará por el texto tal como salió del escaneo. Si te arrepientes, puedes deshacerlo.',
      confirmLabel: 'Restaurar',
      danger: true,
    });
    if (!ok) return;
    editor.chain().focus().insertContentAt({ from: 0, to: editor.state.doc.content.size }, textToHtml(original)).run();
    toast('Texto original restaurado');
  };

  const toolProps: ToolbarProps = {
    editor,
    tab,
    onTab: setTab,
    onImage: actions.image,
    onFind: () => setFinding(true),
    onLink: () => setLinking(true),
    selecting,
    onToggleSelect: () => setSelecting((v) => !v),
    page,
    onPage: changePage,
    view,
    onView: (next) => changeView({ view: next, zoom }),
    zoom,
    onZoom: (next) => changeView({ view, zoom: next }),
    onRestore: original ? restore : undefined,
  };

  const percent = Math.round(scale * 100);
  const stepZoom = (direction: 1 | -1) => {
    const next = direction > 0 ? ZOOMS.find((z) => z > percent) : [...ZOOMS].reverse().find((z) => z < percent);
    if (next) changeView({ view: 'page', zoom: next });
  };
  zoomRef.current = stepZoom;

  // Height of the text column: whole pages, plus what separates them.
  const columnHeight = pages * box.contentHeight + (pages - 1) * dead;

  return (
    <div className="workspace-page mx-auto max-w-6xl space-y-3 pb-40 lg:space-y-4 lg:pb-0">
      {/* The printed page uses the same paper and margins as the sheet. */}
      <style>{`@page { size: ${box.width / 96}in ${box.height / 96}in; margin: ${box.margin / 96}in; }`}</style>
      <input ref={fileRef} type="file" accept={IMAGE_ACCEPT} hidden onChange={(e) => { void addImage(e.target.files?.[0]); e.target.value = ''; }} />

      <div className="workspace-chrome flex flex-wrap items-center gap-3">
        <BackLink to={`/escaneo/${scan.id}`}>{scan.title || 'Escaneo'}</BackLink>
        <SaveIndicator status={autosave.status} onRetry={autosave.flush} />
        <div className="ml-auto hidden flex-wrap gap-2 lg:flex">
          <Button variant="ghost" size="sm" icon={<ImagePlus className="size-4" />} onClick={actions.image}>Imagen</Button>
          <Button variant="ghost" size="sm" icon={<Download className="size-4" />} onClick={actions.txt}>.txt</Button>
          <Button variant="ghost" size="sm" icon={<Printer className="size-4" />} onClick={actions.print}>Imprimir</Button>
          <Button variant="ghost" size="sm" icon={<FileType className="size-4" />} disabled={exporting} onClick={actions.docx}>Word</Button>
          <Button size="sm" icon={<FileDown className="size-4" />} loading={exporting} onClick={actions.pdf}>Exportar PDF</Button>
        </div>
      </div>

      <div className="workspace-chrome sticky top-20 z-10 hidden rounded-2xl bg-white p-2 shadow-surface lg:block">
        <ToolTabs {...toolProps} />
        <div role="toolbar" aria-label="Formato" className="mt-1.5 flex min-h-9 flex-wrap items-center gap-1 border-t border-swan/70 pt-1.5">
          <Tools {...toolProps} />
        </div>
      </div>

      {selecting && (
        <p className="workspace-chrome rounded-xl bg-macaw-light px-4 py-2 text-sm font-semibold text-macaw-dark">
          Selección por área activa: arrastra sobre la hoja para seleccionar lo que quede dentro. Toca de nuevo la herramienta para volver a escribir.
        </p>
      )}

      <div ref={scrollerRef} className="workspace-desk overflow-x-auto rounded-[24px] px-2 py-4 sm:px-6 sm:py-8">
        <div ref={deskRef} aria-hidden />
        <div className="workspace-zoom-box mx-auto" style={paged ? { width: box.width * scale, height: (sheet.height || box.height) * scale } : undefined}>
          <div
            ref={sheetRef}
            data-zoom-layer
            data-view={view}
            className={paged ? 'workspace-sheet workspace-sheet-paged bg-white' : 'workspace-sheet mx-auto w-full max-w-[816px] bg-white px-5 py-8 shadow-[0_2px_10px_rgba(41,36,68,0.12)] sm:p-[72px]'}
            style={paged ? { width: box.width, minHeight: box.height, padding: box.margin, transform: `scale(${scale})`, transformOrigin: 'top left' } : undefined}
          >
            <div
              ref={contentRef}
              className="relative isolate flex flex-col bg-white"
              style={paged ? { minHeight: columnHeight, ['--doc-min' as string]: '0px' } : { ['--doc-min' as string]: '55vh' }}
            >
              <input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  autosave.markChanged();
                }}
                maxLength={200}
                aria-label="Título del documento"
                placeholder="Título del documento"
                className="mb-6 w-full border-0 bg-transparent text-2xl font-black text-eel outline-none placeholder:text-hare sm:text-3xl"
              />
              <EditorContent editor={editor} className="flex min-h-0 flex-1 flex-col" />
              <MarqueeSelect editor={editor} active={selecting} bleed={paged ? box.margin : 20} />
              {paged &&
                Array.from({ length: pages - 1 }, (_, i) => (
                  // End of a sheet: its bottom margin, the gap, and the top margin of the next one.
                  <div
                    key={i}
                    data-export-ignore
                    aria-hidden
                    className="page-gap"
                    style={{ top: (i + 1) * box.contentHeight + i * dead, height: dead, left: -box.margin, right: -box.margin, ['--page-margin' as string]: `${box.margin}px` }}
                  >
                    <span>
                      Página {i + 2} de {pages}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>

      <div className="workspace-chrome flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1 text-xs font-semibold text-wolf">
        <span data-testid="workspace-status">
          {paged && `${formatNumber(pages)} ${pages > 1 ? 'páginas' : 'página'} · `}
          {formatNumber(words)} palabras · {formatNumber(characters)} caracteres
        </span>
        {paged && (
          <span className="flex items-center gap-1">
            <button type="button" onClick={() => changeView({ view, zoom: 'fit' })} aria-pressed={zoom === 'fit'} className="h-9 rounded-full px-3 font-bold hover:bg-white hover:text-eel aria-pressed:text-eel">
              Ajustar
            </button>
            <ZoomButton label="Alejar" onClick={() => stepZoom(-1)}><Minus /></ZoomButton>
            <span className="w-11 text-center tabular-nums text-eel" aria-label="Zoom">{percent} %</span>
            <ZoomButton label="Acercar" onClick={() => stepZoom(1)}><Plus /></ZoomButton>
          </span>
        )}
      </div>

      {finding && <FindReplace editor={editor} onClose={() => setFinding(false)} />}
      {linking && <LinkDialog editor={editor} onClose={() => setLinking(false)} />}
      <MobileDock {...toolProps} actions={actions} exporting={exporting} />
    </div>
  );
}

function ZoomButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="flex size-9 items-center justify-center rounded-full hover:bg-white hover:text-eel [&>svg]:size-4">
      {children}
    </button>
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
