import { Eye, KeyRound, ShieldCheck, ShieldOff, UserRoundCheck, UserRoundMinus, UserRoundPlus, UserRoundX, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { api } from '../lib/api';
import { formatNumber, timeAgo } from '../lib/format';
import type { AuditAction, AuditEntry } from '../lib/types';
import { ChipFilter, dayToIso, filterInputClass, FilterField, Pagination, Panel, useDebounced, usePaged } from './admin';
import { PageLoader, Spinner } from './ui';

type Filter = AuditAction | 'all';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todo' },
  { value: 'view_scan', label: 'Lecturas' },
  { value: 'change_role', label: 'Roles' },
  { value: 'create_admin', label: 'Altas' },
  { value: 'deactivate_user', label: 'Desactivaciones' },
  { value: 'reactivate_user', label: 'Reactivaciones' },
  { value: 'reset_password', label: 'Contraseñas' },
  { value: 'delete_user', label: 'Eliminaciones' },
];

const ROLE_NAME: Record<string, string> = { admin: 'administrador', operator: 'operador' };

function iconFor(entry: AuditEntry): { icon: LucideIcon; tile: string } {
  switch (entry.action) {
    case 'view_scan':
      return { icon: Eye, tile: 'bg-macaw-light text-macaw-dark' };
    case 'delete_user':
      return { icon: UserRoundX, tile: 'bg-cardinal-light text-cardinal-dark' };
    case 'create_admin':
      return { icon: UserRoundPlus, tile: 'bg-beetle-light text-beetle-dark' };
    case 'deactivate_user':
      return { icon: UserRoundMinus, tile: 'bg-bee-light text-bee-dark' };
    case 'reactivate_user':
      return { icon: UserRoundCheck, tile: 'bg-feather-light text-feather-dark' };
    case 'reset_password':
      return { icon: KeyRound, tile: 'bg-bee-light text-bee-dark' };
    default:
      return entry.details.to === 'user' ? { icon: ShieldOff, tile: 'bg-polar text-eel' } : { icon: ShieldCheck, tile: 'bg-polar text-eel' };
  }
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
      return entry.details.to && entry.details.to !== 'user' ? (
        <>
          {actor} hizo {ROLE_NAME[entry.details.to] ?? entry.details.to} a {target}
        </>
      ) : (
        <>
          {actor} quitó el rol de {ROLE_NAME[entry.details.from ?? ''] ?? 'administrador'} a {target}
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
    case 'deactivate_user':
      return (
        <>
          {actor} desactivó la cuenta de {target}
          {entry.details.reason ? ` (motivo: «${entry.details.reason}»)` : ''}
        </>
      );
    case 'reactivate_user':
      return (
        <>
          {actor} reactivó la cuenta de {target}
        </>
      );
    case 'reset_password':
      return (
        <>
          {actor} restableció la contraseña de {target}
        </>
      );
  }
}

/**
 * Admin audit log as a list of sentences, newest first, with an action filter and pagination.
 * With `targetUserId` it shows only what was done to that account; `advanced` adds actor, target and
 * date filters (the dedicated «Auditoría» tab).
 */
export function AuditLog({
  targetUserId,
  title = 'Auditoría',
  pageSize: initialPageSize = 10,
  advanced = false,
}: {
  targetUserId?: number;
  title?: string;
  pageSize?: number;
  advanced?: boolean;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [actor, setActor] = useState('');
  const [target, setTarget] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const actorQuery = useDebounced(actor.trim());
  const targetQuery = useDebounced(target.trim());
  const [lastText, setLastText] = useState(`${actorQuery}\n${targetQuery}`);
  if (`${actorQuery}\n${targetQuery}` !== lastText) {
    setLastText(`${actorQuery}\n${targetQuery}`);
    setPage(1);
  }

  const { data, error, loading } = usePaged(
    () =>
      api.admin.audit({
        action: filter === 'all' ? undefined : filter,
        targetUserId,
        actor: actorQuery,
        target: targetQuery,
        from: dayToIso(from),
        to: dayToIso(to, true),
        page,
        pageSize,
      }),
    [filter, targetUserId, actorQuery, targetQuery, from, to, page, pageSize],
  );

  const resetPage =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };
  const narrowed = filter !== 'all' || !!(actorQuery || targetQuery || from || to);

  return (
    <Panel
      title={title}
      subtitle={
        data
          ? `${formatNumber(data.total)} ${data.total === 1 ? 'acción registrada' : 'acciones registradas'}`
          : 'Lecturas de escaneos, cambios de rol, altas, desactivaciones, contraseñas restablecidas y eliminaciones hechas desde la administración'
      }
      actions={loading && data ? <Spinner className="size-5" /> : undefined}
    >
      <div className="mb-3">
        <ChipFilter label="Tipo de acción" value={filter} onChange={resetPage(setFilter)} options={FILTERS} />
      </div>
      {advanced && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <FilterField label="Quién lo hizo">
            <input type="search" className={filterInputClass} value={actor} onChange={(e) => setActor(e.target.value)} placeholder="Correo" aria-label="Filtrar por correo de quien hizo la acción" />
          </FilterField>
          <FilterField label="Cuenta afectada">
            <input type="search" className={filterInputClass} value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Correo" aria-label="Filtrar por correo de la cuenta afectada" />
          </FilterField>
          <FilterField label="Desde">
            <input type="date" className={filterInputClass} value={from} max={to || undefined} onChange={(e) => resetPage(setFrom)(e.target.value)} />
          </FilterField>
          <FilterField label="Hasta">
            <input type="date" className={filterInputClass} value={to} min={from || undefined} onChange={(e) => resetPage(setTo)(e.target.value)} />
          </FilterField>
        </div>
      )}

      {error ? (
        <p role="alert" className="text-sm font-semibold text-cardinal-dark">
          {error}
        </p>
      ) : !data ? (
        <PageLoader />
      ) : data.entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-wolf">{narrowed ? 'No hay acciones con estos filtros.' : 'Todavía no hay acciones registradas.'}</p>
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

      {data && (
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onChange={setPage}
          onPageSizeChange={
            advanced
              ? (size) => {
                  setPageSize(size);
                  setPage(1);
                }
              : undefined
          }
        />
      )}
    </Panel>
  );
}
