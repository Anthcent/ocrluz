import { ChevronLeft, ChevronRight, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../lib/api';
import { ENGINE_LABEL, LANGUAGES } from '../lib/constants';
import { copyText, formatNumber } from '../lib/format';
import type { AdminScan } from '../lib/types';
import { errorMessage, useFeedback } from './feedback';
import { Button, Modal, PageLoader, Segmented } from './ui';

const dateTime = (value: string) => new Date(value).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * Full text of one scan (read-only), loaded on demand so lists stay light. Every load is recorded in the
 * audit log by the server. `ids` is the list the scan was opened from: «Anterior» and «Siguiente» move
 * through it without closing the dialog.
 */
export function ScanTextModal({ ids, index, onIndexChange, onClose }: { ids: number[]; index: number | null; onIndexChange: (index: number) => void; onClose: () => void }) {
  const { toast } = useFeedback();
  const scanId = index === null ? null : (ids[index] ?? null);
  const [scan, setScan] = useState<AdminScan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  useEffect(() => {
    if (scanId === null) return;
    let active = true;
    setScan(null);
    setError(null);
    setShowOriginal(false);
    api.admin
      .scan(scanId)
      .then((r) => active && setScan(r.scan))
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [scanId]);

  const hasOriginal = !!scan?.originalText && scan.originalText !== scan.text;
  const text = scan ? (showOriginal && scan.originalText ? scan.originalText : scan.text) : '';
  const hasPrev = index !== null && index > 0;
  const hasNext = index !== null && index < ids.length - 1;

  const copy = async () => {
    try {
      await copyText(text);
      toast('Texto copiado');
    } catch {
      toast('No se pudo copiar el texto', 'error');
    }
  };

  const meta = scan
    ? [
        ['Usuario', <Link key="u" to={`/admin/usuarios/${scan.userId}`} onClick={onClose} className="font-semibold text-macaw-dark hover:underline">{scan.userName}</Link>],
        ['Carpeta', scan.groupTitle ?? 'Hoja suelta'],
        ['Motor', ENGINE_LABEL[scan.engine] ?? scan.engine],
        ['Idioma', LANGUAGES.find((l) => l.code === scan.language)?.label ?? scan.language],
        ['Palabras', formatNumber(scan.wordCount)],
        ...(scan.pageLabel ? [['Página impresa', scan.pageLabel]] : []),
        ['Creado', dateTime(scan.createdAt)],
        ['Actualizado', dateTime(scan.updatedAt)],
      ]
    : [];

  return (
    <Modal open={scanId !== null} onClose={onClose} title={scan?.title || 'Escaneo'} wide>
      {error ? (
        <p role="alert" className="text-sm font-semibold text-cardinal-dark">
          {error}
        </p>
      ) : !scan ? (
        <PageLoader />
      ) : (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-polar p-3 text-sm sm:grid-cols-4">
            {meta.map(([label, value]) => (
              <div key={label as string} className="min-w-0">
                <dt className="text-xs font-semibold text-wolf">{label}</dt>
                <dd className="truncate font-semibold text-eel">{value}</dd>
              </div>
            ))}
          </dl>
          {hasOriginal && (
            <Segmented<'current' | 'original'>
              value={showOriginal ? 'original' : 'current'}
              onChange={(v) => setShowOriginal(v === 'original')}
              options={[
                { value: 'current', label: 'Texto actual' },
                { value: 'original', label: 'Texto original del OCR' },
              ]}
            />
          )}
          {text ? (
            <div className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-swan p-4 text-[0.9375rem] leading-relaxed text-eel" tabIndex={0} aria-label="Texto del escaneo">
              {text}
            </div>
          ) : (
            <p className="text-sm text-wolf">Este escaneo no tiene texto.</p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" size="sm" icon={<Copy className="size-4" />} onClick={copy} disabled={!text}>
              Copiar texto
            </Button>
            {ids.length > 1 && index !== null && (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" icon={<ChevronLeft className="size-4" />} disabled={!hasPrev} onClick={() => onIndexChange(index - 1)}>
                  Anterior
                </Button>
                <span className="text-sm font-semibold tabular-nums text-wolf">
                  {index + 1} de {ids.length}
                </span>
                <Button variant="ghost" size="sm" disabled={!hasNext} onClick={() => onIndexChange(index + 1)}>
                  Siguiente
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
