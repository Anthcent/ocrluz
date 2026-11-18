import { Eye, ShieldCheck, ShieldOff, UserRoundPlus, UserRoundX, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { api } from '../lib/api';
import { formatNumber, timeAgo } from '../lib/format';
import type { AuditAction, AuditEntry, Paged } from '../lib/types';
import { Pagination, Panel } from './admin';
import { errorMessage } from './feedback';
import { PageLoader, Segmented, Spinner } from './ui';

type Filter = AuditAction | 'all';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todo' },
  { value: 'view_scan', label: 'Lecturas' },
  { value: 'change_role', label: 'Roles' },
  { value: 'create_admin', label: 'Altas' },
  { value: 'delete_user', label: 'Eliminaciones' },
];

function iconFor(entry: AuditEntry): { icon: LucideIcon; tile: string } {
  if (entry.action === 'view_scan') return { icon: Eye, tile: 'bg-macaw-light text-macaw-dark' };
  if (entry.action === 'delete_user') return { icon: UserRoundX, tile: 'bg-cardinal-light text-cardinal-dark' };
  if (entry.action === 'create_admin') return { icon: UserRoundPlus, tile: 'bg-beetle-light text-beetle-dark' };
  return entry.details.to === 'admin' ? { icon: ShieldCheck, tile: 'bg-polar text-eel' } : { icon: ShieldOff, tile: 'bg-polar text-eel' };
}

/** «ana@x leyó el escaneo «Factura» de juan@y»: one readable sentence per entry. */
function Sentence({ entry }: { entry: AuditEntry }) {
  const actor = <strong className="font-semibold text-eel">{entry.actorEmail}</strong>;
  const targetEmail = entry.targetEmail ?? 'una cuenta';
  const target: ReactNode =
    entry.targetExists && entry.targetUserId ? (
      <Link to={`/admin/usuarios/${entry.targetUserId}`} className="font-semibold text-macaw-dark hover:underline">
        {targetEmail}
      </Link>
    ) : (
      <strong className="font-semibold text-eel">{targetEmail}</strong>
    );
  switch (entry.action) {
    case 'view_scan':
      return (
        <>
          {actor} leyó el escaneo «{entry.details.title || 'Sin título'}» de {target}
        </>
      );
    case 'change_role':
      return entry.details.to === 'admin' ? (
        <>
          {actor} hizo administrador a {target}
        </>
      ) : (
        <>
          {actor} quitó el rol de administrador a {target}
        </>
      );
    case 'delete_user':
      return (
        <>
          {actor} eliminó la cuenta de {target}
        </>
      );
    case 'create_admin':
      return (
        <>
          {actor} creó la cuenta de administrador {target}
        </>
      );
  }
}

/**
 * Admin audit log as a list of sentences, newest first, with an action filter and pagination.
 * With `targetUserId` it shows only what was done to that account.
 */
export function AuditLog({ targetUserId, title = 'Auditoría', pageSize = 10 }: { targetUserId?: number; title?: string; pageSize?: number }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<(Paged & { entries: AuditEntry[] }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api.admin
      .audit({ action: filter === 'all' ? undefined : filter, targetUserId, page, pageSize })
      .then((r) => active && setData(r))
      .catch((err) => active && setError(errorMessage(err)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [filter, targetUserId, page, pageSize]);

  const changeFilter = (next: Filter) => {
    setFilter(next);
    setPage(1);
  };

  return (
    <Panel
      title={title}
      subtitle={
        data
          ? `${formatNumber(data.total)} ${data.total === 1 ? 'acción registrada' : 'acciones registradas'}`
          : 'Lecturas de escaneos, cambios de rol, altas de administradores y eliminaciones hechas desde la administración'
      }
      actions={loading && data ? <Spinner className="size-5" /> : undefined}
    >
      <div className="mb-3">
        <Segmented value={filter} onChange={changeFilter} options={FILTERS} />
      </div>

      {error ? (
        <p role="alert" className="text-sm font-semibold text-cardinal-dark">
          {error}
        </p>
      ) : !data ? (
        <PageLoader />
      ) : data.entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-wolf">{filter === 'all' ? 'Todavía no hay acciones registradas.' : 'No hay acciones de este tipo.'}</p>
      ) : (
        <ul className="divide-y divide-swan" data-testid="admin-audit">
          {data.entries.map((entry) => {
            const { icon: Icon, tile } = iconFor(entry);
            return (
              <li key={entry.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                <span aria-hidden="true" className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${tile}`}>
                  <Icon className="size-[18px]" />
                </span>
                <p className="min-w-0 flex-1 break-words text-sm text-wolf">
                  <Sentence entry={entry} />
                  {' · '}
                  <time dateTime={entry.createdAt} title={new Date(entry.createdAt).toLocaleString('es')} className="whitespace-nowrap text-xs font-semibold">
                    {timeAgo(entry.createdAt)}
                  </time>
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
    </Panel>
  );
}
