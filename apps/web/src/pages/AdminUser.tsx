import { Ban, FileScan, FileSpreadsheet, FileText, FolderOpen, Search, Type, UserRoundX } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { AuditLog } from '../components/AuditLog';
import { DailyChart, dayToIso, filterInputClass, FilterField, Pagination, Panel, RoleBadge, StatGrid, StatusBadge, useDebounced, usePaged, UserAvatar } from '../components/admin';
import { errorMessage } from '../components/feedback';
import { BackLink, HeaderChip, PageHeader } from '../components/PageHeader';
import { ENGINE_OPTIONS } from '../components/ScanActivity';
import { ScanTextModal } from '../components/ScanTextModal';
import { Button, EmptyState, Input, PageLoader, Spinner, Toggle } from '../components/ui';
import { UserActions } from '../components/UserActions';
import { api, ApiError } from '../lib/api';
import { ENGINE_LABEL } from '../lib/constants';
import { formatDate, formatNumber, timeAgo } from '../lib/format';
import type { AdminUserDetail, AdminUserScan, ScanEngine } from '../lib/types';

export function AdminUserPage() {
  const id = Number(useParams().id);
  const { user: me } = useAuth();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null);
  // Bumped after an action on the account so its audit section reloads.
  const [version, setVersion] = useState(0);

  const load = useCallback(() => {
    setError(null);
    api.admin
      .user(id)
      .then(setDetail)
      .catch((err) => setError({ message: errorMessage(err), notFound: err instanceof ApiError && err.status === 404 }));
  }, [id]);
  useEffect(load, [load]);

  if (error) {
    return (
      <EmptyState
        icon={<UserRoundX className="size-10" />}
        title={error.notFound ? 'Usuario no encontrado' : 'No se pudo cargar el usuario'}
        action={<Button onClick={() => (error.notFound ? navigate('/admin') : load())}>{error.notFound ? 'Volver a administración' : 'Reintentar'}</Button>}
      >
        {error.notFound ? 'Es posible que la cuenta se haya eliminado.' : error.message}
      </EmptyState>
    );
  }
  if (!detail) return <PageLoader />;

  const { user, stats } = detail;
  const isSelf = me?.id === user.id;
  const iAmSuperadmin = me?.role === 'superadmin';

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        back={<BackLink to="/admin">Administración</BackLink>}
        icon={<UserAvatar name={user.name} className="size-12 text-lg" />}
        bareIcon
        title={user.name}
        subtitle={user.email}
        meta={
          <>
            <RoleBadge role={user.role} />
            <StatusBadge disabledAt={user.disabledAt} />
            {isSelf && <HeaderChip tone="violet">Tu cuenta</HeaderChip>}
            <HeaderChip>Alta: {formatDate(user.createdAt)}</HeaderChip>
            <HeaderChip>{user.lastLoginAt ? `Último acceso ${timeAgo(user.lastLoginAt)}` : 'Sin accesos registrados'}</HeaderChip>
          </>
        }
        actions={
          <UserActions
            user={user}
            variant="buttons"
            onUpdated={(updated) => {
              setDetail({ ...detail, user: updated });
              setVersion((v) => v + 1);
              // The response of a role change has no «disabledByEmail»: reload to keep the notice accurate.
              load();
            }}
            onDeleted={() => navigate('/admin', { replace: true })}
          />
        }
      />
      {user.disabledAt && (
        <div role="note" className="-mt-2 mb-5 flex items-start gap-3 rounded-2xl bg-cardinal-light p-4 text-sm text-cardinal-dark">
          <Ban className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <p>
            <strong className="font-bold">Cuenta desactivada</strong> {timeAgo(user.disabledAt)}
            {user.disabledByEmail ? ` por ${user.disabledByEmail}` : ''}. No puede iniciar sesión; sus datos se conservan.
            {user.disabledReason ? ` Motivo: «${user.disabledReason}».` : ''}
          </p>
        </div>
      )}
      {user.role === 'superadmin' ? (
        <p className="-mt-2 mb-5 text-sm text-wolf">La cuenta del superadministrador se gestiona en el servidor y no se puede modificar ni eliminar.</p>
      ) : isSelf ? (
        <p className="-mt-2 mb-5 text-sm text-wolf">Para cambiar tu rol o eliminar tu cuenta, pide ayuda al superadministrador.</p>
      ) : (
        user.role === 'admin' &&
        !iAmSuperadmin && <p className="-mt-2 mb-5 text-sm text-wolf">Solo el superadministrador puede cambiar el rol, desactivar o eliminar la cuenta de un administrador.</p>
      )}

      <StatGrid
        className="mb-5"
        items={[
          { key: 'scans', label: stats.scans === 1 ? 'hoja' : 'hojas', value: stats.scans, icon: FileText, tile: 'bg-feather-light text-feather-dark' },
          { key: 'words', label: stats.words === 1 ? 'palabra' : 'palabras', value: stats.words, icon: Type, tile: 'bg-bee-light text-bee-dark' },
          { key: 'groups', label: stats.groups === 1 ? 'carpeta' : 'carpetas', value: stats.groups, icon: FolderOpen, tile: 'bg-macaw-light text-macaw-dark' },
          { key: 'documents', label: stats.documents === 1 ? 'documento' : 'documentos', value: stats.documents, icon: FileScan, tile: 'bg-feather-light text-feather-dark' },
          { key: 'summaries', label: stats.finalSummaries === 1 ? 'resumen final' : 'resúmenes finales', value: stats.finalSummaries, icon: FileSpreadsheet, tile: 'bg-polar text-eel' },
        ]}
      />

      <div className="mb-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="Escaneos por día" subtitle={stats.lastScanAt ? `Último escaneo ${timeAgo(stats.lastScanAt)}` : 'Todavía no ha escaneado'}>
          <DailyChart data={stats.perDay} label={`Escaneos por día de ${user.name}`} />
        </Panel>
        <Panel title="Por motor de OCR">
          {stats.byEngine.length === 0 ? (
            <p className="text-sm text-wolf">Sin escaneos.</p>
          ) : (
            <dl className="divide-y divide-swan">
              {stats.byEngine.map((e) => (
                <div key={e.engine} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <dt className="font-semibold text-eel">{ENGINE_LABEL[e.engine] ?? e.engine}</dt>
                  <dd className="text-right text-sm tabular-nums text-wolf">
                    {formatNumber(e.count)} {e.count === 1 ? 'hoja' : 'hojas'} · {formatNumber(e.words)} {e.words === 1 ? 'palabra' : 'palabras'}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </Panel>
      </div>

      <UserScans userId={user.id} />

      <AuditLog key={version} targetUserId={user.id} title="Acciones sobre esta cuenta" />
    </div>
  );
}

/** Groups consecutive scans of the same folder (the list comes sorted by folder when grouping is on). */
function groupByFolder(scans: AdminUserScan[]) {
  const groups: { key: string; title: string; items: { scan: AdminUserScan; index: number }[] }[] = [];
  scans.forEach((scan, index) => {
    const key = scan.groupId === null ? 'loose' : String(scan.groupId);
    const last = groups.at(-1);
    if (last?.key === key) last.items.push({ scan, index });
    else groups.push({ key, title: scan.groupTitle ? `Carpeta: ${scan.groupTitle}` : 'Hojas sueltas', items: [{ scan, index }] });
  });
  return groups;
}

function UserScans({ userId }: { userId: number }) {
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim());
  const [engine, setEngine] = useState<ScanEngine | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [grouped, setGrouped] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [open, setOpen] = useState<number | null>(null);
  const [lastQ, setLastQ] = useState(q);
  if (q !== lastQ) {
    setLastQ(q);
    setPage(1);
  }

  const { data, error, loading } = usePaged(
    () =>
      api.admin.userScans(userId, {
        q,
        engine: engine || undefined,
        from: dayToIso(from),
        to: dayToIso(to, true),
        sort: grouped ? 'group' : 'recent',
        page,
        pageSize,
      }),
    [userId, q, engine, from, to, grouped, page, pageSize],
  );
  const resetPage =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };
  const filtered = !!(q || engine || from || to);

  const renderScan = ({ scan: s, index }: { scan: AdminUserScan; index: number }) => (
    <li key={s.id} className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={() => setOpen(index)}
          className="min-w-0 truncate rounded-md text-left font-semibold text-eel underline-offset-2 hover:text-macaw-dark hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-macaw/35"
          aria-label={`Leer el texto completo de ${s.title || 'Sin título'}`}
        >
          {s.title || 'Sin título'}
        </button>
        <time dateTime={s.createdAt} className="shrink-0 text-xs font-semibold text-wolf">
          {new Date(s.createdAt).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })}
        </time>
      </div>
      <div className="mt-0.5 text-sm text-wolf">
        {!grouped && <>{s.groupTitle ? `Carpeta: ${s.groupTitle}` : 'Hoja suelta'} · </>}
        {ENGINE_LABEL[s.engine] ?? s.engine} · {formatNumber(s.wordCount)} {s.wordCount === 1 ? 'palabra' : 'palabras'}
      </div>
      {s.preview && <p className="mt-1 line-clamp-2 max-w-[70ch] text-sm text-wolf">{s.preview}</p>}
    </li>
  );

  return (
    <Panel
      className="mb-5"
      title="Escaneos"
      subtitle={data ? `${formatNumber(data.total)} ${filtered ? 'encontrados' : 'en total'}. Abre un escaneo para leer su texto completo (queda registrado).` : undefined}
      actions={loading && data ? <Spinner className="size-5" /> : undefined}
    >
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="relative col-span-2 sm:col-span-4">
          <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-wolf" />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar en el título o el texto" aria-label="Buscar en los escaneos de este usuario" className="pl-12" />
        </div>
        <FilterField label="Motor">
          <select className={filterInputClass} value={engine} onChange={(e) => resetPage(setEngine)(e.target.value as ScanEngine | '')}>
            {ENGINE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </FilterField>
        <div className="flex items-end justify-between gap-3 rounded-xl px-1 pb-1.5 sm:justify-start">
          <span className="text-sm font-semibold text-eel">Agrupar por carpeta</span>
          <Toggle checked={grouped} onChange={resetPage(setGrouped)} label="Agrupar por carpeta" />
        </div>
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
        <p className="py-6 text-center text-sm text-wolf">{filtered ? 'Ningún escaneo coincide con los filtros.' : 'Este usuario todavía no ha guardado escaneos.'}</p>
      ) : grouped ? (
        <div className="space-y-4">
          {groupByFolder(data.scans).map((group) => (
            <section key={group.key} aria-label={group.title}>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-eel">
                <FolderOpen className="size-4 text-wolf" aria-hidden="true" />
                {group.title}
                <span className="font-semibold text-wolf">({group.items.length})</span>
              </h3>
              <ul className="divide-y divide-swan rounded-xl border border-swan px-3 py-2">{group.items.map(renderScan)}</ul>
            </section>
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-swan">{data.scans.map((scan, index) => renderScan({ scan, index }))}</ul>
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
