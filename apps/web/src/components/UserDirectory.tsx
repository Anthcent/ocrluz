import { Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../lib/api';
import { formatNumber, timeAgo } from '../lib/format';
import type { AdminUserListItem, OperatorUserListItem, UserRole, UserSort, UserStatus } from '../lib/types';
import { filterInputClass, FilterField, Pagination, Panel, RoleBadge, StatusBadge, useDebounced, usePaged, UserAvatar } from './admin';
import { UserActions } from './UserActions';
import { Input, PageLoader, Spinner } from './ui';

type Row = AdminUserListItem | OperatorUserListItem;

const SORTS: { value: UserSort; label: string }[] = [
  { value: 'recent', label: 'Más recientes' },
  { value: 'scans', label: 'Más escaneos' },
  { value: 'activity', label: 'Última actividad' },
];

const ROLES: { value: UserRole | ''; label: string }[] = [
  { value: '', label: 'Todos los roles' },
  { value: 'user', label: 'Usuarios' },
  { value: 'operator', label: 'Operadores' },
  { value: 'admin', label: 'Administradores' },
  { value: 'superadmin', label: 'Superadministrador' },
];

const STATUSES: { value: UserStatus | ''; label: string }[] = [
  { value: '', label: 'Todas' },
  { value: 'active', label: 'Activas' },
  { value: 'disabled', label: 'Desactivadas' },
];

const hasRole = (row: Row): row is AdminUserListItem => 'role' in row;

/**
 * Accounts list with search, filters, sort, pagination and per-row actions. In `operator` mode the server
 * already returns only regular users with partial data; rows are not links because operators cannot open
 * an account's detail.
 */
export function UserDirectory({ mode, title = 'Usuarios', className }: { mode: 'admin' | 'operator'; title?: string; className?: string }) {
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim());
  const [role, setRole] = useState<UserRole | ''>('');
  const [status, setStatus] = useState<UserStatus | ''>('');
  const [sort, setSort] = useState<UserSort>('recent');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [lastQ, setLastQ] = useState(q);
  // A new search goes back to the first page.
  if (q !== lastQ) {
    setLastQ(q);
    setPage(1);
  }

  const { data, setData, error, loading, reload } = usePaged(
    () => api.admin.users<Row>({ q, role: role || undefined, status: status || undefined, sort, page, pageSize }),
    [q, role, status, sort, page, pageSize],
  );

  const filter =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  const filtered = !!(q || role || status);

  return (
    <Panel
      className={className}
      title={title}
      subtitle={data ? `${formatNumber(data.total)} ${data.total === 1 ? 'cuenta' : 'cuentas'}${filtered ? ' encontradas' : ''}` : undefined}
      actions={loading && data ? <Spinner className="size-5" /> : undefined}
    >
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="relative col-span-2 sm:col-span-4">
          <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-wolf" />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre o correo" aria-label="Buscar usuarios por nombre o correo" className="pl-12" />
        </div>
        {mode === 'admin' && (
          <FilterField label="Rol">
            <select className={filterInputClass} value={role} onChange={(e) => filter(setRole)(e.target.value as UserRole | '')}>
              {ROLES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </FilterField>
        )}
        <FilterField label="Estado">
          <select className={filterInputClass} value={status} onChange={(e) => filter(setStatus)(e.target.value as UserStatus | '')}>
            {STATUSES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Ordenar por" className={mode === 'admin' ? 'col-span-2' : undefined}>
          <select className={filterInputClass} value={sort} onChange={(e) => filter(setSort)(e.target.value as UserSort)}>
            {SORTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </FilterField>
      </div>

      {error ? (
        <p role="alert" className="text-sm font-semibold text-cardinal-dark">
          {error}
        </p>
      ) : !data ? (
        <PageLoader />
      ) : data.users.length === 0 ? (
        <p className="py-6 text-center text-sm text-wolf">{filtered ? 'Ningún usuario coincide con la búsqueda.' : 'No hay usuarios.'}</p>
      ) : (
        <ul className="divide-y divide-swan" data-testid="admin-users">
          {data.users.map((u) => (
            <li key={u.id} className="flex items-center gap-1">
              <UserRow user={u} linked={mode === 'admin'} />
              <UserActions
                user={u}
                variant="menu"
                onUpdated={(updated) => setData({ ...data, users: data.users.map((row) => (row.id === updated.id ? updated : row)) })}
                onDeleted={reload}
              />
            </li>
          ))}
        </ul>
      )}

      {data && (
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      )}
    </Panel>
  );
}

function UserRow({ user: u, linked }: { user: Row; linked: boolean }) {
  const body = (
    <>
      <UserAvatar name={u.name} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-semibold text-eel">{u.name}</span>
          {hasRole(u) && <RoleBadge role={u.role} />}
          <StatusBadge disabledAt={u.disabledAt} />
        </div>
        <div className="truncate text-sm text-wolf">{u.email}</div>
        <div className="truncate text-xs text-wolf sm:hidden">
          {formatNumber(u.scanCount)} {u.scanCount === 1 ? 'hoja' : 'hojas'} · {u.lastLoginAt ? `Último acceso ${timeAgo(u.lastLoginAt)}` : 'Sin accesos'}
        </div>
      </div>
      <div className="hidden shrink-0 text-right text-sm sm:block">
        <div className="font-semibold tabular-nums text-eel">
          {formatNumber(u.scanCount)} {u.scanCount === 1 ? 'hoja' : 'hojas'}
        </div>
        <div className="text-xs text-wolf">{u.lastScanAt ? `Último escaneo ${timeAgo(u.lastScanAt)}` : 'Sin escaneos'}</div>
        <div className="text-xs text-wolf">{u.lastLoginAt ? `Último acceso ${timeAgo(u.lastLoginAt)}` : 'Sin accesos'}</div>
      </div>
    </>
  );
  const rowClass = '-ml-2 flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2.5';
  return linked ? (
    <Link to={`/admin/usuarios/${u.id}`} className={`${rowClass} transition-colors duration-200 hover:bg-polar`}>
      {body}
    </Link>
  ) : (
    <div className={rowClass}>{body}</div>
  );
}
