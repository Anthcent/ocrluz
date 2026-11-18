import clsx from 'clsx';
import { ChevronDown, Ellipsis, Eye, ShieldCheck, Trash2, UserRoundCheck, UserRoundX } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { assignableRoles, canChangeStatus, canDeleteUser, ROLE_ACTION, ROLE_LABEL } from '../lib/permissions';
import type { UserRole } from '../lib/types';
import { errorMessage, useFeedback } from './feedback';
import { Button, Field, Input, Modal, Textarea } from './ui';

/** The fields every list row or detail page has; operators' rows have no role (they are always regular users). */
export interface ManagedUser {
  id: number;
  name: string;
  email: string;
  role?: UserRole;
  disabledAt: string | null;
}

export interface MenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  to?: string;
  onSelect?: () => void;
}

/**
 * Small dropdown menu (button + list of menu items). Closes on outside click, Escape or after picking;
 * arrow keys move between items.
 */
export function ActionMenu({ label, items, trigger, align = 'right' }: { label: string; items: MenuItem[]; trigger?: ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      button.current?.focus();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const entries = [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const current = entries.indexOf(document.activeElement as HTMLElement);
    const next = (current + (e.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length;
    entries[next]?.focus();
  };

  if (items.length === 0) return null;
  const itemClass = (danger?: boolean) =>
    clsx(
      'flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm font-semibold outline-none transition-colors duration-150 focus-visible:bg-polar',
      danger ? 'text-cardinal-dark hover:bg-cardinal-light' : 'text-eel hover:bg-polar',
    );

  return (
    <div ref={root} className="relative shrink-0" onKeyDown={onKeyDown}>
      {trigger ? (
        <Button ref={button} variant="ghost" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {trigger}
          <ChevronDown className="size-4" aria-hidden="true" />
        </Button>
      ) : (
        <button
          ref={button}
          type="button"
          aria-label={label}
          title={label}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex size-11 items-center justify-center rounded-full text-wolf transition-colors duration-200 hover:bg-polar hover:text-eel focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-macaw/35"
        >
          <Ellipsis className="size-5" />
        </button>
      )}
      {open && (
        <div
          role="menu"
          aria-label={label}
          className={clsx('absolute top-full z-30 mt-1 w-60 rounded-2xl bg-white p-1.5 shadow-[0_12px_32px_rgba(30,27,48,0.16)]', align === 'right' ? 'right-0' : 'left-0')}
        >
          {items.map((item) =>
            item.to ? (
              <Link key={item.key} role="menuitem" to={item.to} className={itemClass(item.danger)} onClick={() => setOpen(false)}>
                {item.icon}
                {item.label}
              </Link>
            ) : (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                className={itemClass(item.danger)}
                onClick={() => {
                  setOpen(false);
                  item.onSelect?.();
                }}
              >
                {item.icon}
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Actions on one account, as allowed for the signed-in staff member: deactivate/reactivate, change role and
 * delete (plus «Ver detalle» for admins in the list). `variant="menu"` renders one «…» menu for list rows;
 * `variant="buttons"` renders the detail page's header buttons.
 */
export function UserActions<T extends ManagedUser>({
  user,
  variant,
  onUpdated,
  onDeleted,
}: {
  user: T;
  variant: 'menu' | 'buttons';
  onUpdated: (user: T) => void;
  onDeleted: () => void;
}) {
  const { user: me } = useAuth();
  const { toast, confirm } = useFeedback();
  const [deactivating, setDeactivating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);

  const isAdminViewer = me?.role === 'admin' || me?.role === 'superadmin';
  const statusAllowed = canChangeStatus(me, user);
  const roles = user.role ? assignableRoles(me, { id: user.id, role: user.role }) : [];
  const deleteAllowed = !!user.role && canDeleteUser(me, { id: user.id, role: user.role });

  // Operators get back the partial row and admins the full account: merge it over what the caller had.
  const run = async (action: () => Promise<{ user: Partial<ManagedUser> }>, message: string) => {
    setBusy(true);
    try {
      const { user: updated } = await action();
      onUpdated({ ...user, ...updated } as T);
      toast(message);
      return true;
    } catch (err) {
      toast(errorMessage(err), 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const reactivate = async () => {
    const ok = await confirm({ title: 'Reactivar cuenta', message: `${user.name} podrá volver a iniciar sesión con su contraseña.`, confirmLabel: 'Reactivar' });
    if (ok) await run(() => api.admin.reactivate(user.id), `Cuenta de ${user.name} reactivada`);
  };

  const changeRole = async (role: (typeof roles)[number]) => {
    const ok = await confirm({ title: ROLE_ACTION[role].label, message: ROLE_ACTION[role].message(user.name), confirmLabel: ROLE_ACTION[role].label, danger: role === 'user' });
    if (ok) await run(() => api.admin.setRole(user.id, role), `${user.name} ahora es ${ROLE_LABEL[role].toLowerCase()}`);
  };

  const statusItem: MenuItem | null = statusAllowed
    ? user.disabledAt
      ? { key: 'reactivate', label: 'Reactivar cuenta', icon: <UserRoundCheck className="size-4" />, onSelect: reactivate }
      : { key: 'deactivate', label: 'Desactivar cuenta', icon: <UserRoundX className="size-4" />, onSelect: () => setDeactivating(true) }
    : null;
  const roleItems: MenuItem[] = roles.map((role) => ({
    key: `role-${role}`,
    label: ROLE_ACTION[role].label,
    icon: <ShieldCheck className="size-4" />,
    onSelect: () => changeRole(role),
  }));
  const deleteItem: MenuItem | null = deleteAllowed
    ? { key: 'delete', label: 'Eliminar cuenta', icon: <Trash2 className="size-4" />, danger: true, onSelect: () => setDeleting(true) }
    : null;

  const modals = (
    <>
      <DeactivateUserModal
        open={deactivating}
        name={user.name}
        onClose={() => setDeactivating(false)}
        submit={async (reason) => {
          if (await run(() => api.admin.deactivate(user.id, reason), `Cuenta de ${user.name} desactivada`)) setDeactivating(false);
        }}
      />
      <DeleteUserModal
        open={deleting}
        name={user.name}
        email={user.email}
        onClose={() => setDeleting(false)}
        remove={() => api.admin.removeUser(user.id)}
        onDeleted={() => {
          setDeleting(false);
          toast(`Cuenta de ${user.name} eliminada`);
          onDeleted();
        }}
      />
    </>
  );

  if (variant === 'menu') {
    const items = [
      ...(isAdminViewer ? [{ key: 'detail', label: 'Ver detalle', icon: <Eye className="size-4" />, to: `/admin/usuarios/${user.id}` }] : []),
      ...(statusItem ? [statusItem] : []),
      ...roleItems,
      ...(deleteItem ? [deleteItem] : []),
    ];
    return (
      <>
        <ActionMenu label={`Acciones para ${user.name}`} items={items} />
        {modals}
      </>
    );
  }

  if (!statusItem && roleItems.length === 0 && !deleteItem) return null;
  return (
    <>
      {roleItems.length > 0 && <ActionMenu label={`Cambiar el rol de ${user.name}`} items={roleItems} trigger="Cambiar rol" align="left" />}
      {statusItem && (
        <Button variant="ghost" icon={statusItem.icon} onClick={statusItem.onSelect} loading={busy}>
          {statusItem.label}
        </Button>
      )}
      {deleteItem && (
        <Button variant="danger" icon={<Trash2 className="size-5" />} onClick={deleteItem.onSelect}>
          Eliminar cuenta
        </Button>
      )}
      {modals}
    </>
  );
}

/** Deactivation keeps every scan and folder; the account just cannot sign in until it is reactivated. */
function DeactivateUserModal({ open, name, onClose, submit }: { open: boolean; name: string; onClose: () => void; submit: (reason?: string) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => {
    if (busy) return;
    setReason('');
    onClose();
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await submit(reason.trim() || undefined);
    setBusy(false);
    setReason('');
  };

  return (
    <Modal open={open} onClose={close} title="Desactivar cuenta">
      <form onSubmit={onSubmit} className="space-y-4">
        <p className="text-wolf">
          <strong className="text-eel">{name}</strong> no podrá iniciar sesión y sus sesiones abiertas se cerrarán al momento. Sus escaneos, carpetas y documentos se
          conservan, y puedes reactivar la cuenta cuando quieras.
        </p>
        <Field label="Motivo (opcional)" hint="Queda guardado en la auditoría.">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="plain" onClick={close} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" variant="danger" loading={busy}>
            Desactivar
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Deleting an account is irreversible, so the admin must type the account's email to confirm. */
export function DeleteUserModal({
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
      setBusy(false);
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
