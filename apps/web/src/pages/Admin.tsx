import { FileScan, FileText, FolderOpen, Search, ShieldCheck, Type, UserRoundPlus, UsersRound, WifiOff } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { AuditLog } from '../components/AuditLog';
import { DailyChart, Pagination, Panel, RoleBadge, StatGrid, UserAvatar } from '../components/admin';
import { errorMessage, useFeedback } from '../components/feedback';
import { PageHeader } from '../components/PageHeader';
import { Button, EmptyState, Field, Input, Modal, PageLoader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { ENGINE_LABEL } from '../lib/constants';
import { formatNumber, timeAgo } from '../lib/format';
import type { AdminStats, AdminUserListItem, Paged } from '../lib/types';

const PAGE_SIZE = 20;

export function AdminPage() {
  const { user: me } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  // Bumped after creating an admin so the lists reload.
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    api.admin
      .stats()
      .then(setStats)
      .catch((err) => setError(errorMessage(err)));
  };
  useEffect(load, []);

  if (error) {
    return (
      <EmptyState icon={<WifiOff className="size-10" />} title="No se pudo cargar la administración" action={<Button onClick={load}>Reintentar</Button>}>
        {error}
      </EmptyState>
    );
  }
  if (!stats) return <PageLoader />;

  const { totals } = stats;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader icon={<ShieldCheck />} tone="ink" title="Administración" subtitle="Cuentas de la aplicación y actividad de escaneo de todos los usuarios." />

      <StatGrid
        className="mb-5"
        items={[
          { key: 'users', label: totals.users === 1 ? 'usuario' : 'usuarios', value: totals.users, icon: UsersRound, tile: 'bg-macaw-light text-macaw-dark' },
          { key: 'admins', label: totals.admins === 1 ? 'administrador' : 'administradores', value: totals.admins, icon: ShieldCheck, tile: 'bg-polar text-eel' },
          { key: 'scans', label: totals.scans === 1 ? 'hoja' : 'hojas', value: totals.scans, icon: FileText, tile: 'bg-feather-light text-feather-dark' },
          { key: 'words', label: totals.words === 1 ? 'palabra' : 'palabras', value: totals.words, icon: Type, tile: 'bg-bee-light text-bee-dark' },
          { key: 'groups', label: totals.groups === 1 ? 'carpeta' : 'carpetas', value: totals.groups, icon: FolderOpen, tile: 'bg-macaw-light text-macaw-dark' },
          { key: 'documents', label: totals.documents === 1 ? 'documento' : 'documentos', value: totals.documents, icon: FileScan, tile: 'bg-feather-light text-feather-dark' },
        ]}
      />

      <div className="mb-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="Escaneos por día" subtitle={`Últimos ${stats.perDay.length} días, en tu hora local`}>
          <DailyChart data={stats.perDay} label="Escaneos por día" />
          {stats.topUsers.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-2 text-sm font-bold text-eel">Usuarios más activos</h3>
              <ol className="space-y-1">
                {stats.topUsers.map((u) => (
                  <li key={u.id}>
                    <Link to={`/admin/usuarios/${u.id}`} className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-2 py-1.5 transition-colors duration-200 hover:bg-polar">
                      <span className="min-w-0 truncate font-semibold text-eel">{u.name}</span>
                      <span className="shrink-0 text-sm tabular-nums text-wolf">
                        {formatNumber(u.scans)} {u.scans === 1 ? 'hoja' : 'hojas'}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Panel>

        <Panel title="Actividad reciente" subtitle="Últimos escaneos guardados">
          {stats.recentScans.length === 0 ? (
            <p className="text-sm text-wolf">Todavía no hay escaneos.</p>
          ) : (
            <ul className="divide-y divide-swan">
              {stats.recentScans.map((s) => (
                <li key={s.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-eel">{s.title || 'Sin título'}</div>
                    <div className="truncate text-sm text-wolf">
                      <Link to={`/admin/usuarios/${s.userId}`} className="font-semibold text-macaw-dark hover:underline">
                        {s.userName}
                      </Link>{' '}
                      · {ENGINE_LABEL[s.engine] ?? s.engine}
                    </div>
                  </div>
                  <time dateTime={s.createdAt} title={new Date(s.createdAt).toLocaleString('es')} className="shrink-0 text-xs font-semibold text-wolf">
                    {timeAgo(s.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {me?.role === 'superadmin' && <AdminList key={`admins-${version}`} onCreated={() => {
            setVersion((v) => v + 1);
            load();
          }} />}

      <UserList key={`users-${version}`} />

      <AuditLog key={`audit-${version}`} title="Auditoría" pageSize={PAGE_SIZE} />
    </div>
  );
}

function UserList() {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<(Paged & { users: AdminUserListItem[] }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(query.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api.admin
      .users({ q: debounced, page, pageSize: PAGE_SIZE })
      .then((r) => active && setData(r))
      .catch((err) => active && setError(errorMessage(err)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [debounced, page]);

  return (
    <Panel
      className="mb-5"
      title="Usuarios"
      subtitle={data ? `${formatNumber(data.total)} ${data.total === 1 ? 'cuenta' : 'cuentas'}${debounced ? ' encontradas' : ''}` : undefined}
      actions={loading && data ? <Spinner className="size-5" /> : undefined}
    >
      <div className="relative mb-3">
        <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-wolf" />
        <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre o correo" aria-label="Buscar usuarios por nombre o correo" className="pl-12" />
      </div>

      {error ? (
        <p role="alert" className="text-sm font-semibold text-cardinal-dark">
          {error}
        </p>
      ) : !data ? (
        <PageLoader />
      ) : data.users.length === 0 ? (
        <p className="py-6 text-center text-sm text-wolf">{debounced ? 'Ningún usuario coincide con la búsqueda.' : 'No hay usuarios.'}</p>
      ) : (
        <ul className="divide-y divide-swan" data-testid="admin-users">
          {data.users.map((u) => (
            <li key={u.id}>
              <Link to={`/admin/usuarios/${u.id}`} className="-mx-2 flex min-h-14 items-center gap-3 rounded-xl px-2 py-2.5 transition-colors duration-200 hover:bg-polar">
                <UserAvatar name={u.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate font-semibold text-eel">{u.name}</span>
                    <RoleBadge role={u.role} />
                  </div>
                  <div className="truncate text-sm text-wolf">{u.email}</div>
                </div>
                <div className="hidden shrink-0 text-right text-sm sm:block">
                  <div className="font-semibold tabular-nums text-eel">
                    {formatNumber(u.scanCount)} {u.scanCount === 1 ? 'hoja' : 'hojas'}
                  </div>
                  <div className="text-xs text-wolf">{u.lastScanAt ? `Último escaneo ${timeAgo(u.lastScanAt)}` : 'Sin escaneos'}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
    </Panel>
  );
}

/** Superadmin only: the admin accounts and a shortcut to create one. Roles change from each account's page. */
function AdminList({ onCreated }: { onCreated: () => void }) {
  const [admins, setAdmins] = useState<AdminUserListItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let active = true;
    api.admin
      .users({ role: 'admin', pageSize: 100 })
      .then((r) => {
        if (!active) return;
        setAdmins(r.users);
        setTotal(r.total);
      })
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, []);

  return (
    <Panel
      className="mb-5"
      title="Administradores"
      subtitle={admins ? `${formatNumber(total)} ${total === 1 ? 'administrador' : 'administradores'}. Solo tú puedes crearlos, promoverlos o quitarles el rol.` : undefined}
      actions={
        <Button size="sm" icon={<UserRoundPlus className="size-4" />} onClick={() => setCreating(true)}>
          Crear administrador
        </Button>
      }
    >
      {error ? (
        <p role="alert" className="text-sm font-semibold text-cardinal-dark">
          {error}
        </p>
      ) : !admins ? (
        <PageLoader />
      ) : admins.length === 0 ? (
        <p className="py-6 text-center text-sm text-wolf">Todavía no hay administradores.</p>
      ) : (
        <ul className="divide-y divide-swan" data-testid="admin-admins">
          {admins.map((u) => (
            <li key={u.id}>
              <Link to={`/admin/usuarios/${u.id}`} className="-mx-2 flex min-h-14 items-center gap-3 rounded-xl px-2 py-2.5 transition-colors duration-200 hover:bg-polar">
                <UserAvatar name={u.name} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-eel">{u.name}</div>
                  <div className="truncate text-sm text-wolf">{u.email}</div>
                </div>
                <div className="hidden shrink-0 text-right text-xs text-wolf sm:block">{u.lastLoginAt ? `Último acceso ${timeAgo(u.lastLoginAt)}` : 'Sin accesos'}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <CreateAdminModal open={creating} onClose={() => setCreating(false)} onCreated={onCreated} />
    </Panel>
  );
}

function CreateAdminModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { toast } = useFeedback();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setName('');
    setEmail('');
    setPassword('');
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { user } = await api.admin.createAdmin({ name: name.trim(), email: email.trim(), password });
      toast(`Administrador ${user.name} creado`);
      reset();
      setBusy(false);
      onClose();
      onCreated();
    } catch (err) {
      toast(errorMessage(err), 'error');
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Crear administrador">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-wolf">La cuenta podrá ver la actividad de todos los usuarios y eliminar cuentas de usuario. Comparte la contraseña temporal por un canal seguro.</p>
        <Field label="Nombre">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" required minLength={2} maxLength={80} autoFocus />
        </Field>
        <Field label="Correo electrónico">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} required />
        </Field>
        <Field label="Contraseña temporal" hint="Mínimo 8 caracteres. Pide que la cambie en Ajustes al entrar.">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required minLength={8} maxLength={200} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="plain" onClick={close} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" loading={busy}>
            Crear
          </Button>
        </div>
      </form>
    </Modal>
  );
}
