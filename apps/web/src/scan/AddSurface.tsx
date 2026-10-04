import clsx from 'clsx';
import { Camera, Clipboard, FolderUp, ImageUp, LoaderCircle } from 'lucide-react';
import { Button } from '../components/ui';

/**
 * Desktop entry point for new sheets: a large drop surface while the batch is empty that
 * collapses into a slim bar once there are sheets. Mobile uses the capture dock instead.
 */
export function AddSurface({
  compact,
  dragging,
  adding,
  onFiles,
  onCamera,
}: {
  compact: boolean;
  dragging: boolean;
  adding: boolean;
  onFiles: () => void;
  onCamera: () => void;
}) {
  if (compact) {
    return (
      <div
        className={clsx(
          'hidden items-center gap-3 rounded-2xl px-4 py-3 transition-[background-color,box-shadow] duration-200 ease-out lg:flex',
          dragging ? 'bg-macaw-light shadow-[inset_0_0_0_2px_var(--color-macaw)]' : 'bg-white shadow-[0_1px_2px_rgba(41,36,68,0.06)]',
        )}
        data-testid="add-bar"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-polar text-eel">
          {adding ? <LoaderCircle className="size-5 animate-spin" /> : <FolderUp className="size-5" />}
        </span>
        <p className="min-w-0 flex-1 text-sm font-semibold text-wolf" role="status">
          {adding ? 'Optimizando fotos…' : dragging ? 'Suéltalas para sumarlas al lote' : 'Arrastra más fotos aquí o pégalas con Ctrl+V'}
        </p>
        <Button variant="ghost" size="sm" icon={<Camera className="size-4" />} onClick={onCamera}>
          Usar la cámara
        </Button>
        <Button variant="secondary" size="sm" icon={<ImageUp className="size-4" />} onClick={onFiles} disabled={adding}>
          Elegir archivos
        </Button>
      </div>
    );
  }

  return (
    <div
      onClick={onFiles}
      data-testid="drop-surface"
      className={clsx(
        'group hidden cursor-pointer flex-col items-center justify-center rounded-2xl px-8 py-14 text-center transition-[background-color,box-shadow] duration-200 ease-out lg:flex',
        dragging
          ? 'bg-macaw-light shadow-[inset_0_0_0_2px_var(--color-macaw)]'
          : 'bg-white shadow-[inset_0_0_0_1.5px_var(--color-swan)] hover:bg-snow hover:shadow-[inset_0_0_0_1.5px_var(--color-macaw)]',
      )}
    >
      <span
        className={clsx(
          'mb-5 flex size-16 items-center justify-center rounded-2xl transition-[transform,background-color,color] duration-200 ease-out-strong',
          dragging ? 'scale-110 bg-macaw text-eel' : 'bg-macaw-light text-macaw-dark',
        )}
      >
        {adding ? <LoaderCircle className="size-8 animate-spin" /> : <ImageUp className="size-8" />}
      </span>
      <h2 className="text-xl font-bold text-eel">{dragging ? 'Suelta las fotos para sumarlas' : 'Trae aquí las hojas'}</h2>
      <p className="mt-2 max-w-md text-wolf" role="status">
        {adding ? 'Optimizando fotos…' : 'Arrastra fotos o escaneos (JPG, PNG o WEBP), haz clic para buscarlos en tu equipo o pégalos desde el portapapeles.'}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
        <Button icon={<ImageUp className="size-4" />} onClick={onFiles} disabled={adding}>
          Elegir archivos
        </Button>
        <Button variant="ghost" icon={<Camera className="size-4" />} onClick={onCamera}>
          Usar la cámara
        </Button>
      </div>
      <p className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-wolf">
        <Clipboard className="size-3.5" aria-hidden /> Atajo: <kbd className="rounded-md bg-polar px-1.5 py-0.5 font-sans text-eel">Ctrl</kbd> +{' '}
        <kbd className="rounded-md bg-polar px-1.5 py-0.5 font-sans text-eel">V</kbd> pega una captura
      </p>
    </div>
  );
}
