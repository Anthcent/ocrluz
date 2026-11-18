import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { Queryable } from '../db/index.js';
import type { SessionUser } from '../middleware/auth.js';
import { isReservedEmail } from './superadmin.js';

/** Validación y alta de cuentas, compartidas por el registro público y por el alta de administradores. */

export const passwordSchema = z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(200);

export const accountSchema = z.object({
  name: z.string().trim().min(2, 'Escribe tu nombre').max(80),
  email: z
    .email('Correo no válido')
    .trim()
    .toLowerCase()
    .refine((email) => !isReservedEmail(email), 'Correo no válido'),
  password: passwordSchema,
});

export type AccountInput = z.infer<typeof accountSchema>;

export const PASSWORD_COST = 12;

export function hashPassword(password: string) {
  return bcrypt.hash(password, PASSWORD_COST);
}

/** Inserta el usuario y su fila de ajustes. Usar dentro de una transacción. */
export async function insertAccount(
  tx: Queryable,
  data: { email: string; name: string; passwordHash: string; role: 'user' | 'admin'; markLogin: boolean },
) {
  const created = (await tx.one<SessionUser>(
    `INSERT INTO users (email, name, password_hash, role, last_login_at)
     VALUES (?, ?, ?, ?, ${data.markLogin ? 'now()' : 'NULL'}) RETURNING id, email, name, role`,
    [data.email, data.name, data.passwordHash, data.role],
  ))!;
  await tx.run('INSERT INTO settings (user_id) VALUES (?)', [created.id]);
  return created;
}
