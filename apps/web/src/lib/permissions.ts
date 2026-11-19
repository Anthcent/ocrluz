import type { User, UserRole } from './types';

/**
 * What the signed-in staff member may do to another account. Mirrors the server rules (routes/admin.ts)
 * only to decide which controls to show: the server checks every action again.
 */

type AssignableRole = Exclude<UserRole, 'superadmin'>;

const STATUS_TARGETS: Partial<Record<UserRole, UserRole[]>> = {
  operator: ['user'],
  admin: ['user', 'operator'],
  superadmin: ['user', 'operator', 'admin'],
};

const isOther = (me: User | null | undefined, target: { id: number; role?: UserRole }) => !!me && me.id !== target.id && target.role !== 'superadmin';

/** Deactivate or reactivate. Operators only see regular users, whose rows carry no role. */
export function canChangeStatus(me: User | null | undefined, target: { id: number; role?: UserRole }) {
  return isOther(me, target) && !!STATUS_TARGETS[me!.role]?.includes(target.role ?? 'user');
}

/** Roles the actor may give this account (excluding its current one). */
export function assignableRoles(me: User | null | undefined, target: { id: number; role: UserRole }): AssignableRole[] {
  if (!isOther(me, target)) return [];
  const all: AssignableRole[] =
    me!.role === 'superadmin' ? ['user', 'operator', 'admin'] : me!.role === 'admin' && target.role !== 'admin' ? ['user', 'operator'] : [];
  return all.filter((role) => role !== target.role);
}

const RESET_TARGETS: Partial<Record<UserRole, UserRole[]>> = {
  admin: ['user', 'operator'],
  superadmin: ['user', 'operator', 'admin'],
};

/** Reset another account's password (admins only; only the superadmin resets an admin's). */
export function canResetPassword(me: User | null | undefined, target: { id: number; role?: UserRole }) {
  return isOther(me, target) && !!target.role && !!RESET_TARGETS[me!.role]?.includes(target.role);
}

export function canDeleteUser(me: User | null | undefined, target: { id: number; role: UserRole }) {
  if (!isOther(me, target)) return false;
  if (me!.role === 'superadmin') return true;
  return me!.role === 'admin' && target.role !== 'admin';
}

export const ROLE_LABEL: Record<UserRole, string> = {
  user: 'Usuario',
  operator: 'Operador',
  admin: 'Administrador',
  superadmin: 'Superadministrador',
};

/** Button / confirmation copy for moving an account to `role`. */
export const ROLE_ACTION: Record<AssignableRole, { label: string; message: (name: string) => string }> = {
  user: { label: 'Hacer usuario', message: (name) => `${name} dejará de tener acceso a la gestión y volverá a ser un usuario normal.` },
  operator: {
    label: 'Hacer operador',
    message: (name) => `${name} podrá ver la lista de usuarios (sin el contenido de sus escaneos) y desactivar o reactivar cuentas de usuario.`,
  },
  admin: { label: 'Hacer administrador', message: (name) => `${name} podrá ver la actividad de todos los usuarios y eliminar cuentas de usuario.` },
};
