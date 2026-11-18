import { FileScan, FileSpreadsheet, FileText, FolderOpen, ShieldCheck, ShieldOff, Trash2, Type, UserRoundX } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { AuditLog } from '../components/AuditLog';
import { DailyChart, Pagination, Panel, RoleBadge, StatGrid, UserAvatar } from '../components/admin';
import { errorMessage, useFeedback } from '../components/feedback';
import { BackLink, HeaderChip, PageHeader } from '../components/PageHeader';
import { Button, EmptyState, Field, Input, Modal, PageLoader, Segmented, Spinner } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { ENGINE_LABEL } from '../lib/constants';
import { formatDate, formatNumber, timeAgo } from '../lib/format';
import type { AdminScan, AdminUserDetail, AdminUserScan, Paged } from '../lib/types';

const PAGE_SIZE = 10;

export function AdminUserPage() {
  const id = Number(useParams().id);
  const { user: me } = useAuth();
  const { toast, confirm } = useFeedback();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null);
  const [savingRole, setSavingRole] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
  const isAdmin = user.role === 'admin';
  const iAmSuperadmin = me?.role === 'superadmin';
  // Only the superadmin changes roles or deletes admins; nobody can touch the superadmin account.
  const canChangeRole = iAmSuperadmin && user.role !== 'superadmin';
  const canDelete = !isSelf && user.role !== 'superadmin' && (user.role === 'user' || iAmSuperadmin);

  const changeRole = async () => {
    const next = isAdmin ? 'user' : 'admin';
    const ok = await confirm(
      isAdmin
        ? { title: 'Quitar rol de administrador', message: `${user.name} dejará de tener acceso a la administración.`, confirmLabel: 'Quitar rol', danger: true }
        : { title: 'Hacer administrador', message: `${user.name} podrá ver la actividad de todos los usuarios y eliminar cuentas de usuario.`, confirmLabel: 'Hacer administrador' },
    );
    if (!ok) return;
    setSavingRole(true);
    try {
      const { user: updated } = await api.admin.setRole(user.id, next);
      setDetail({ ...detail, user: updated });
      toast(next === 'admin' ? `${user.name} ahora es administrador` : `${user.name} ya no es administrador`);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSavingRole(false);
    }
  };

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
            {isSelf && <HeaderChip tone="violet">Tu cuenta</HeaderChip>}
            <HeaderChip>Alta: {formatDate(user.createdAt)}</HeaderChip>
            <HeaderChip>{user.lastLoginAt ? `Último acceso ${timeAgo(user.lastLoginAt)}` : 'Sin accesos registrados'}</HeaderChip>
          </>
        }
        actions={
          canChangeRole || canDelete ? (
            <>
              {canChangeRole && (
                <Button variant="ghost" icon={isAdmin ? <ShieldOff className="size-5" /> : <ShieldCheck className="size-5" />} onClick={changeRole} loading={savingRole}>
                  {isAdmin ? 'Quitar rol de administrador' : 'Hacer administrador'}
                </Button>
              )}
              {canDelete && (
                <Button variant="danger" icon={<Trash2 className="size-5" />} onClick={() => setDeleting(true)}>
                  Eliminar cuenta
                </Button>
              )}
            </>
          ) : undefined
        }
      />
      {user.role === 'superadmin' ? (
        <p className="-mt-2 mb-5 text-sm text-wolf">La cuenta del superadministrador se gestiona en el servidor y no se puede modificar ni eliminar.</p>
      ) : isSelf ? (
        <p className="-mt-2 mb-5 text-sm text-wolf">Para cambiar tu rol o eliminar tu cuenta, pide ayuda al superadministrador.</p>
      ) : (
        isAdmin &&
        !iAmSuperadmin && <p className="-mt-2 mb-5 text-sm text-wolf">Solo el superadministrador puede cambiar el rol o eliminar la cuenta de un administrador.</p>
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

      {/* Remounts after a role change so the new entry shows up. */}
      <AuditLog key={user.role} targetUserId={user.id} title="Acciones sobre esta cuenta" />

      <DeleteUserModal
        open={deleting}
        name={user.name}
        email={user.email}
        onClose={() => setDeleting(false)}
        onDeleted={() => {
          toast(`Cuenta de ${user.name} eliminada`);
          navigate('/admin', { replace: true });
        }}
        remove={() => api.admin.removeUser(user.id)}
      />
    </div>
  );
}

function UserScans({ userId }: { userId: number }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<(Paged & { scans: AdminUserScan[] }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openScanId, setOpenScanId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api.admin
      .userScans(userId, { page, pageSize: PAGE_SIZE })
      .then((r) => active && setData(r))
      .catch((err) => active && setError(errorMessage(err)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [userId, page]);

  return (
    <Panel
      className="mb-5"
      title="Escaneos"
      subtitle={data ? `${formatNumber(data.total)} en total. Abre un escaneo para leer su texto completo.` : undefined}
      actions={loading && data ? <Spinner className="size-5" /> : undefined}
    >
      {error ? (
        <p role="alert" className="text-sm font-semibold text-cardinal-dark">
          {error}
        </p>
      ) : !data ? (
        <PageLoader />
      ) : data.scans.length === 0 ? (
        <p className="py-6 text-center text-sm text-wolf">Este usuario todavía no ha guardado escaneos.</p>
      ) : (
        <ul className="divide-y divide-swan">
          {data.scans.map((s) => (
            <li key={s.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <button
                  type="button"
                  onClick={() => setOpenScanId(s.id)}
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
                {s.groupTitle ? `Carpeta: ${s.groupTitle}` : 'Hoja suelta'} · {ENGINE_LABEL[s.engine] ?? s.engine} · {formatNumber(s.wordCount)}{' '}
                {s.wordCount === 1 ? 'palabra' : 'palabras'}
              </div>
              {s.preview && <p className="mt-1 line-clamp-2 max-w-[70ch] text-sm text-wolf">{s.preview}</p>}
            </li>
          ))}
        </ul>
      )}
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      <ScanTextModal scanId={openScanId} onClose={() => setOpenScanId(null)} />
    </Panel>
  );
}

/** Full text of one scan (read-only), loaded on demand so the list stays light. */
function ScanTextModal({ scanId, onClose }: { scanId: number | null; onClose: () => void }) {
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
          <p className="text-sm text-wolf">
            {scan.userName} · {scan.groupTitle ? `Carpeta: ${scan.groupTitle}` : 'Hoja suelta'} · {ENGINE_LABEL[scan.engine] ?? scan.engine} ·{' '}
            {new Date(scan.createdAt).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })} · {formatNumber(scan.wordCount)}{' '}
            {scan.wordCount === 1 ? 'palabra' : 'palabras'}
          </p>
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
            <div className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-polar p-4 text-[0.9375rem] leading-relaxed text-eel" tabIndex={0} aria-label="Texto del escaneo">
              {text}
            </div>
          ) : (
            <p className="text-sm text-wolf">Este escaneo no tiene texto.</p>
          )}
        </div>
      )}
    </Modal>
  );
}

/** Deleting an account is irreversible, so the admin must type the account's email to confirm. */
function DeleteUserModal({
  open,
  name,
  email,
  onClose,
  onDeleted,
  remove,
}: {
  open: boolean;
  name: string;
  email: string;
  onClose: () => void;
  onDeleted: () => void;
  remove: () => Promise<void>;
}) {
  const { toast } = useFeedback();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  const close = () => {
    if (busy) return;
    setTyped('');
    onClose();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!matches) return;
    setBusy(true);
    try {
      await remove();
      setTyped('');
      onDeleted();
    } catch (err) {
      toast(errorMessage(err), 'error');
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Eliminar cuenta">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-wolf">
          Se eliminarán la cuenta de <strong className="text-eel">{name}</strong> y todos sus datos: escaneos, carpetas, documentos y resúmenes finales. Esta acción no se
          puede deshacer.
        </p>
        <Field label={`Escribe ${email} para confirmar`}>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="plain" onClick={close} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" variant="danger" loading={busy} disabled={!matches}>
            Eliminar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
