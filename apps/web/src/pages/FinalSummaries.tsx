import { Download, FileSpreadsheet, Plus, Users, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '../components/PageHeader';
import { Badge, Button, EmptyState, PageLoader } from '../components/ui';
import { api } from '../lib/api';
import { timeAgo } from '../lib/format';
import type { FinalSummaryListItem } from '../lib/types';

export function FinalSummariesPage() {
  const [items, setItems] = useState<FinalSummaryListItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = () => {
    setFailed(false);
    api.finalSummaries
      .list()
      .then((r) => setItems(r.summaries))
      .catch(() => setFailed(true));
  };
  useEffect(load, []);

  const newButton = (
    <Link to="/resumenes/nuevo" className="inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-bold text-on-accent transition-colors hover:bg-accent-hover">
      <Plus className="size-5" /> Nuevo resumen
    </Link>
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        icon={<FileSpreadsheet />}
        title="Resumen final (formato oficial)"
        subtitle="Toma una foto del Resumen Final del Rendimiento Estudiantil: se llena el mismo formato y lo descargas en Excel listo para imprimir."
        actions={newButton}
      />

      {failed ? (
        <EmptyState icon={<WifiOff className="size-10" />} title="No se pudieron cargar los resúmenes" action={<Button onClick={load}>Reintentar</Button>} />
      ) : !items ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <EmptyState icon={<FileSpreadsheet className="size-10" />} title="Todavía no hay resúmenes" action={newButton}>
          Toma una foto del Resumen Final del Rendimiento Estudiantil y la app llenará el formato por ti.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col rounded-2xl bg-white p-4 shadow-surface ring-1 ring-swan sm:p-5">
              <Link to={`/resumenes/${item.id}`} className="group flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-macaw-light text-macaw-dark">
                  <FileSpreadsheet className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-eel group-hover:text-macaw-dark">
                    {[item.course.year, item.course.section && `«${item.course.section}»`].filter(Boolean).join(' ') || 'Sin curso'}
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-wolf">{item.schoolYear || 'Año escolar sin indicar'}</span>
                </span>
                <Badge tone={item.evaluationType === 'REVISIÓN' ? 'yellow' : 'green'}>{item.evaluationType}</Badge>
              </Link>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-swan pt-3 text-sm">
                <span className="inline-flex items-center gap-1.5 text-wolf">
                  <Users className="size-4" /> {item.students} {item.students === 1 ? 'estudiante' : 'estudiantes'} · {timeAgo(item.updatedAt)}
                </span>
                <a href={api.finalSummaries.xlsxUrl(item.id)} download className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 font-bold text-macaw-dark hover:bg-macaw-light">
                  <Download className="size-4" /> Excel
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
