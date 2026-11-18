import type { Database } from '../db/index.js';

/**
 * Superadministrador: una única cuenta raíz cuyas credenciales viven en el entorno del servidor
 * (SUPERADMIN_USERNAME, SUPERADMIN_PASSWORD_HASH, SUPERADMIN_PIN_HASH). Al arrancar se copian a la
 * base de datos; para rotarlas basta con cambiar el entorno y reiniciar. Así sobrevive a la pérdida
 * de la base y solo puede recuperarla quien controla el servidor.
 */

/** Dominio reservado (RFC 2606): nadie puede registrarlo, así que este correo nunca choca con una cuenta real. */
export const SUPERADMIN_EMAIL = 'superadmin@ocrluz.invalid';
export const SUPERADMIN_NAME = 'Superadministrador';

export const USERNAME_PATTERN = /^[a-z0-9._-]{4,32}$/;
export const BCRYPT_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
/** El PIN se valida como 12 caracteres [A-Z0-9]; el generador evita además 0/O/1/I/L. */
export const PIN_LENGTH = 12;
export const PIN_PATTERN = /^[A-Z0-9]{12}$/;

/** Fallos consecutivos permitidos antes de bloquear la cuenta, y duración del bloqueo. */
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

export interface SuperadminCredentials {
  username: string;
  passwordHash: string;
  pinHash: string;
}

/** Correos con dominio `.invalid` (reservado): no se aceptan para cuentas normales. */
export function isReservedEmail(email: string) {
  return /@(?:[^@]+\.)?invalid$/i.test(email.trim());
}

/**
 * Lee las credenciales del entorno. Sin ninguna variable devuelve undefined (desarrollo y pruebas);
 * con solo algunas, o con valores mal formados, lanza un error para no arrancar a medias.
 */
export function parseSuperadminEnv(env: Record<string, string | undefined>): SuperadminCredentials | undefined {
  // `docker run --env-file` no quita las comillas: se aceptan valores envueltos en comillas simples o dobles.
  const read = (name: string) => (env[name]?.trim() ?? '').replace(/^(['"])(.*)\1$/, '$2');
  const username = read('SUPERADMIN_USERNAME');
  const passwordHash = read('SUPERADMIN_PASSWORD_HASH');
  const pinHash = read('SUPERADMIN_PIN_HASH');
  if (!username && !passwordHash && !pinHash) return undefined;
  if (!username || !passwordHash || !pinHash) {
    throw new Error('Define SUPERADMIN_USERNAME, SUPERADMIN_PASSWORD_HASH y SUPERADMIN_PIN_HASH juntas (o ninguna).');
  }
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error('SUPERADMIN_USERNAME debe tener entre 4 y 32 caracteres: minúsculas, números, punto, guion o guion bajo.');
  }
  for (const [name, value] of [
    ['SUPERADMIN_PASSWORD_HASH', passwordHash],
    ['SUPERADMIN_PIN_HASH', pinHash],
  ] as const) {
    if (!BCRYPT_PATTERN.test(value)) {
      throw new Error(`${name} no parece un hash bcrypt ($2a$/$2b$/$2y$). En el .env escríbelo entre comillas simples.`);
    }
  }
  return { username, passwordHash, pinHash };
}

export type SyncResult = 'created' | 'updated' | 'conflict';

/**
 * Crea la fila del superadministrador o, si ya existe, le aplica las credenciales del entorno y
 * levanta cualquier bloqueo. Si la contraseña o el PIN cambian de verdad, sube la versión de
 * credenciales para cerrar las sesiones abiertas; un reinicio sin cambios no cierra ninguna.
 *
 * Si una cuenta normal ya usa el correo reservado o el usuario configurado, no la toca: lo registra
 * como error y devuelve 'conflict' para que el servidor arranque igualmente, sin superadministrador.
 */
export async function syncSuperadmin(db: Database, creds: SuperadminCredentials): Promise<SyncResult> {
  return db.transaction(async (tx) => {
    const existing = await tx.one<{ id: number; password_hash: string; pin_hash: string | null }>(
      `SELECT id, password_hash, pin_hash FROM users WHERE role = 'superadmin' FOR UPDATE`,
    );
    // El correo reservado solo importa al crear la cuenta; el usuario, siempre (es UNIQUE).
    const clash = await tx.one<{ id: number; email: string }>(
      `SELECT id, email FROM users WHERE role <> 'superadmin' AND (username = ? OR (?::boolean AND email = ?)) LIMIT 1`,
      [creds.username, !existing, SUPERADMIN_EMAIL],
    );
    if (clash) {
      console.error(
        `Error: no se sincroniza el superadministrador porque la cuenta normal #${clash.id} ya usa ` +
          `el correo reservado ${SUPERADMIN_EMAIL} o el usuario «${creds.username}». No se ha modificado esa cuenta. ` +
          'Cambia SUPERADMIN_USERNAME, o revisa y renombra o elimina esa cuenta, y reinicia el servidor. ' +
          'Mientras tanto el servidor funciona sin superadministrador.',
      );
      return 'conflict';
    }
    if (existing) {
      const rotated = existing.password_hash !== creds.passwordHash || existing.pin_hash !== creds.pinHash;
      await tx.run(
        `UPDATE users SET username = ?, password_hash = ?, pin_hash = ?, failed_attempts = 0, locked_until = NULL,
           credentials_version = credentials_version + ?::int
         WHERE id = ?`,
        [creds.username, creds.passwordHash, creds.pinHash, rotated ? 1 : 0, existing.id],
      );
      return 'updated';
    }
    const created = (await tx.one<{ id: number }>(
      `INSERT INTO users (email, name, password_hash, role, username, pin_hash) VALUES (?, ?, ?, 'superadmin', ?, ?) RETURNING id`,
      [SUPERADMIN_EMAIL, SUPERADMIN_NAME, creds.passwordHash, creds.username, creds.pinHash],
    ))!;
    await tx.run('INSERT INTO settings (user_id) VALUES (?)', [created.id]);
    return 'created';
  });
}
