import clsx from 'clsx';
import { Flashlight, FlashlightOff, Grid3x3, LayoutGrid, X, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { PendingPage } from '../lib/pages-store';
import { ScanProgressBar } from './ScanProgressBar';
import type { ScanProgress } from './ScanSession';
import { useScanSession } from './ScanSession';
import { STATUS } from './status';
import { useObjectUrl } from './useObjectUrl';
import { usePresence } from './usePresence';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Se llama si el navegador no permite usar la cámara en vivo (p. ej. sin HTTPS). */
  onUnavailable: (reason: string) => void;
  /** Retake mode: a single shot that replaces one sheet instead of adding to the batch. */
  retake?: { sheetNumber: number; onShot: (photo: Blob) => void };
}

const GUIDE_KEY = 'ocryon:camera-guide';

function readGuidePreference() {
  try {
    return localStorage.getItem(GUIDE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Fullscreen burst camera. Captures of this session appear numbered at the bottom and can be discarded. */
export function CameraCapture(props: Props) {
  const { mounted, shown } = usePresence(props.open, 200);
  if (!mounted) return null;
  return (
    <div
      className={clsx(
        'fixed inset-0 z-50 transition-[opacity,transform] ease-out-strong',
        shown ? 'translate-y-0 opacity-100 duration-300' : 'translate-y-4 opacity-0 duration-200',
      )}
    >
      <CameraBody {...props} />
    </div>
  );
}

function CameraBody({ open, onClose, onUnavailable, retake }: Props) {
  const session = useScanSession();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [flash, setFlash] = useState(0);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [guide, setGuide] = useState(readGuidePreference);
  const [capturedIds, setCapturedIds] = useState<string[]>([]);

  // Captures of this camera session that still exist (they can be discarded from here).
  const captured = capturedIds.map((id) => session.pages.find((p) => p.id === id)).filter((p): p is PendingPage => Boolean(p));
  const offset = session.pages.length - captured.length;
  const count = captured.length;

  useEffect(() => {
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      onUnavailable('Este navegador no deja usar la cámara desde aquí. Se abrirá la cámara del sistema.');
      return;
    }
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
      })
      .then((stream) => {
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          void video.play();
        }
        const track = stream.getVideoTracks()[0];
        const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
        setTorchSupported(Boolean(caps?.torch));
      })
      .catch((err: DOMException) => {
        onUnavailable(
          err?.name === 'NotAllowedError'
            ? 'La cámara está bloqueada para este sitio. Permite el acceso en el navegador o elige fotos de la galería.'
            : 'La cámara no respondió. Se abrirá la cámara del sistema.',
        );
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [onUnavailable]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    stripRef.current?.scrollTo({ left: stripRef.current.scrollWidth, behavior: 'smooth' });
  }, [capturedIds.length]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] }).catch(() => {});
    setTorchOn(next);
  };

  const toggleGuide = () => {
    setGuide((g) => {
      try {
        localStorage.setItem(GUIDE_KEY, g ? '0' : '1');
      } catch {
        // Preference only lives for this visit.
      }
      return !g;
    });
  };

  const shoot = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob(
      async (blob) => {
        if (!blob) return;
        if (retake) {
          retake.onShot(blob);
          return;
        }
        const { ids } = await session.addImages([blob]);
        setCapturedIds((c) => [...c, ...ids]);
      },
      'image/jpeg',
      0.92,
    );
    setFlash((f) => f + 1);
    navigator.vibrate?.(25);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={retake ? `Repetir la foto de la hoja ${retake.sheetNumber}` : 'Cámara'} className="flex size-full flex-col bg-black text-white">
      <div className="flex items-center justify-between gap-3 p-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="Salir de la cámara"
          className="flex size-12 items-center justify-center rounded-full bg-white/15 transition-colors hover:bg-white/25"
        >
          <X className="size-6" />
        </button>
        <div className="flex flex-col items-center">
          <div className="rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold" aria-live="polite">
            {retake ? (
              `Nueva foto para la hoja ${retake.sheetNumber}`
            ) : count === 0 ? (
              'Encuadra la hoja completa'
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <span key={count} className="inline-block animate-pop-in tabular-nums">
                  {count}
                </span>
                {count === 1 ? 'hoja capturada' : 'hojas capturadas'}
              </span>
            )}
          </div>
          {session.autoScan && !retake && (
            <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-bee">
              <Zap className="size-3" fill="currentColor" aria-hidden /> Se leen al capturar
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={toggleGuide}
            aria-label="Guía de encuadre"
            aria-pressed={guide}
            title="Guía de encuadre"
            className={clsx('flex size-12 items-center justify-center rounded-full transition-colors', guide ? 'bg-white text-eel' : 'bg-white/15 hover:bg-white/25')}
          >
            {guide ? <Grid3x3 className="size-6" /> : <LayoutGrid className="size-6" />}
          </button>
          {torchSupported && (
            <button
              type="button"
              onClick={toggleTorch}
              aria-label="Luz de la cámara"
              aria-pressed={torchOn}
              title="Luz de la cámara"
              className={clsx('flex size-12 items-center justify-center rounded-full transition-colors', torchOn ? 'bg-bee text-eel' : 'bg-white/15 hover:bg-white/25')}
            >
              {torchOn ? <Flashlight className="size-6" /> : <FlashlightOff className="size-6" />}
            </button>
          )}
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted onLoadedData={() => setReady(true)} className="absolute inset-0 size-full object-contain" />
        {guide ? (
          <div className="pointer-events-none absolute inset-6 animate-fade-in rounded-2xl border-2 border-white/70" aria-hidden>
            <div className="grid size-full grid-cols-3 grid-rows-3">
              {Array.from({ length: 9 }, (_, i) => (
                <span key={i} className="border-[0.5px] border-white/30" />
              ))}
            </div>
          </div>
        ) : (
          <div className="pointer-events-none absolute inset-6 rounded-2xl border border-white/35" aria-hidden />
        )}
        {/* Shutter feedback: a short white blink, restarted on every capture. */}
        {flash > 0 && <div key={flash} className="pointer-events-none absolute inset-0 animate-[shutter_180ms_ease-out_forwards] bg-white" aria-hidden />}
      </div>

      {count > 0 && !retake && (
        <div ref={stripRef} className="flex gap-2 overflow-x-auto px-4 pt-3" aria-label="Capturas de esta sesión">
          {captured.map((p, i) => (
            <CapturedThumb key={p.id} page={p} progress={session.progress[p.id]} n={offset + i + 1} onRemove={() => session.remove(p.id)} />
          ))}
        </div>
      )}

      <div className="pb-safe grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-6 py-5">
        <span />
        <button
          type="button"
          onClick={shoot}
          disabled={!ready}
          aria-label={retake ? 'Capturar la nueva foto' : 'Capturar hoja'}
          className="group flex size-20 shrink-0 items-center justify-center rounded-full border-[3px] border-white transition-transform duration-150 ease-out active:scale-95 disabled:opacity-40"
        >
          <span className="size-[3.75rem] rounded-full bg-white transition-transform duration-100 ease-out group-active:scale-90" />
        </button>
        <div className="flex justify-end">
          {!retake && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-12 items-center rounded-full bg-white px-5 text-sm font-bold text-eel transition-[transform,background-color] duration-150 ease-out hover:bg-feather-light active:scale-[0.97]"
            >
              {count > 0 ? 'Ver lote' : 'Salir'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CapturedThumb({ page, progress, n, onRemove }: { page: PendingPage; progress?: ScanProgress; n: number; onRemove: () => void }) {
  const url = useObjectUrl(page.image);
  const status = STATUS[page.status];
  return (
    <div className="relative h-24 w-[4.5rem] shrink-0 animate-pop-in overflow-hidden rounded-xl bg-white/15 ring-1 ring-white/50">
      {url && <img src={url} alt={`Captura ${n}`} className="size-full object-cover" />}
      <span className="absolute bottom-1 left-1 flex size-6 items-center justify-center rounded-md bg-white text-xs font-bold text-eel">{n}</span>
      {page.status === 'scanning' ? (
        <div className="absolute inset-x-1 bottom-8">
          <ScanProgressBar progress={progress} size="sm" dark />
        </div>
      ) : (
        <span className={clsx('absolute bottom-1.5 right-1.5 size-3 rounded-full ring-2 ring-white', status.dot)} title={status.label} />
      )}
      <button
        type="button"
        onClick={onRemove}
        disabled={page.status === 'scanning'}
        aria-label={`Descartar captura ${n}`}
        className="absolute right-0 top-0 flex size-9 items-center justify-center rounded-full transition-colors disabled:opacity-40"
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-black/60 hover:bg-cardinal">
          <X className="size-4" strokeWidth={3} />
        </span>
      </button>
    </div>
  );
}
