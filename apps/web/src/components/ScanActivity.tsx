import { Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../lib/api';
import { ENGINE_LABEL } from '../lib/constants';
import { formatNumber, timeAgo } from '../lib/format';
import type { ScanEngine } from '../lib/types';
import { dayToIso, filterInputClass, FilterField, Pagination, Panel, useDebounced, usePaged } from './admin';
import { ScanTextModal } from './ScanTextModal';
import { Input, PageLoader, Spinner } from './ui';

export const ENGINE_OPTIONS: { value: ScanEngine | ''; label: string }[] = [
  { value: '', label: 'Todos los motores' },
  ...(Object.keys(ENGINE_LABEL) as ScanEngine[]).map((value) => ({ value, label: ENGINE_LABEL[value] })),
];

/** Global scan activity (admins): who scanned what and when, with filters and pagination. */
export function ScanActivity() {
  const [user, setUser] = useState('');
  const userQuery = useDebounced(user.trim());
  const [engine, setEngine] = useState<ScanEngine | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [open, setOpen] = useState<number | null>(null);
  const [lastQuery, setLastQuery] = useState(userQuery);
  if (userQuery !== lastQuery) {
    setLastQuery(userQuery);
    setPage(1);
  }

  const { data, error, loading } = usePaged(
    () => api.admin.activity({ user: userQuery, engine: engine || undefined, from: dayToIso(from), to: dayToIso(to, true), page, pageSize }),
    [userQuery, engine, from, to, page, pageSize],
  );
  const resetPage =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  return (
    <Panel
      title="Actividad de escaneo"
      subtitle={data ? `${formatNumber(data.total)} ${data.total === 1 ? 'escaneo' : 'escaneos'}. Abre uno para leer su texto completo (queda registrado).` : undefined}
      actions={loading && data ? <Spinner className="size-5" /> : undefined}
    >
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="relative col-span-2 sm:col-span-4">
          <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-wolf" />
          <Input type="search" value={user} onChange={(e) => setUser(e.target.value)} placeholder="Filtrar por nombre o correo del usuario" aria-label="Filtrar la actividad por usuario" className="pl-12" />
        </div>
        <FilterField label="Motor" className="col-span-2 sm:col-span-2">
          <select className={filterInputClass} value={engine} onChange={(e) => resetPage(setEngine)(e.target.value as ScanEngine | '')}>
            {ENGINE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Desde">
          <input type="date" className={filterInputClass} value={from} max={to || undefined} onChange={(e) => resetPage(setFrom)(e.target.value)} />
        </FilterField>
        <FilterField label="Hasta">
          <input type="date" className={filterInputClass} value={to} min={from || undefined} onChange={(e) => resetPage(setTo)(e.target.value)} />
        </FilterField>
      </div>

      {error ? (
        <p role="alert" className="text-sm font-semibold text-cardinal-dark">
          {error}
        </p>
      ) : !data ? (
        <PageLoader />
      ) : data.scans.length === 0 ? (
        <p className="py-6 text-center text-sm text-wolf">No hay escaneos con estos filtros.</p>
      ) : (
        <ul className="divide-y divide-swan" data-testid="admin-activity">
          {data.scans.map((s, i) => (
            <li key={s.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => setOpen(i)}
                  className="block max-w-full truncate rounded-md text-left font-semibold text-eel underline-offset-2 hover:text-macaw-dark hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-macaw/35"
                  aria-label={`Leer el texto completo de ${s.title || 'Sin título'}`}
                >
                  {s.title || 'Sin título'}
                </button>
                <div className="truncate text-sm text-wolf">
                  <Link to={`/admin/usuarios/${s.userId}`} className="font-semibold text-macaw-dark hover:underline">
                    {s.userName}
                  </Link>{' '}
                  · {ENGINE_LABEL[s.engine] ?? s.engine} · {formatNumber(s.wordCount)} {s.wordCount === 1 ? 'palabra' : 'palabras'}
                </div>
              </div>
              <time dateTime={s.createdAt} title={new Date(s.createdAt).toLocaleString('es')} className="shrink-0 text-xs font-semibold text-wolf">
                {timeAgo(s.createdAt)}
              </time>
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
      <ScanTextModal ids={data?.scans.map((s) => s.id) ?? []} index={open} onIndexChange={setOpen} onClose={() => setOpen(null)} />
    </Panel>
  );
}
