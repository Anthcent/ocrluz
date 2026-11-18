import bcrypt from 'bcryptjs';
import { Router, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import type { AppContext } from '../context.js';
import { accountSchema, hashPassword, insertAccount, PASSWORD_COST, passwordSchema } from '../lib/accounts.js';
import { HttpError, isUniqueViolation } from '../lib/http-error.js';
import { LOCK_MINUTES, MAX_FAILED_ATTEMPTS, PIN_PATTERN } from '../lib/superadmin.js';
import { currentUser, requireAuth, SESSION_COOKIE, signSession, toSessionUser, type SessionUser } from '../middleware/auth.js';

const loginSchema = z.object({
  email: z.email('Correo no válido').trim().toLowerCase(),
  password: z.string().min(1, 'Escribe tu contraseña'),
});

const superadminLoginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1).max(64),
  password: z.string().min(1).max(200),
  pin: z.string().trim().toUpperCase().regex(PIN_PATTERN),
});

const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema });

const rateLimited = { error: 'Demasiados intentos, espera unos minutos', code: 'rate_limited' };

/**
 * Hash real (mismo coste que las contraseñas) para comparar cuando el usuario no existe y que el
 * tiempo de respuesta no lo delate. Se calcula una sola vez, la primera vez que hace falta.
 */
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= bcrypt.hash('ocryon-dummy-password', PASSWORD_COST));

export function authRouter(ctx: AppContext) {
  const router = Router();
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.authRateLimit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: rateLimited,
  });
  const superadminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.superadminRateLimit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: rateLimited,
  });

  /** Emite la cookie de sesión con la versión de credenciales actual; el superadministrador, con menos vida. */
  const setSession = (res: Response, user: SessionUser, credentialsVersion: number) => {
    const ttlSeconds = user.role === 'superadmin' ? config.superadminSessionHours * 60 * 60 : config.sessionDays * 24 * 60 * 60;
    res.cookie(SESSION_COOKIE, signSession(ctx, user, credentialsVersion, ttlSeconds), {
      httpOnly: true,
      sameSite: 'lax',
      secure: ctx.secureCookies,
      maxAge: ttlSeconds * 1000,
      path: '/',
    });
  };

  router.post('/register', limiter, async (req, res) => {
    const data = accountSchema.parse(req.body);
    const taken = new HttpError(409, 'Ya existe una cuenta con ese correo', 'email_taken');
    if (await ctx.db.one('SELECT 1 FROM users WHERE email = ?', [data.email])) throw taken;
    const passwordHash = await hashPassword(data.password);
    const user = await ctx.db
      .transaction((tx) => insertAccount(tx, { email: data.email, name: data.name, passwordHash, role: 'user', markLogin: true }))
      .catch((err) => {
        // Dos registros simultáneos con el mismo correo: gana uno, el otro recibe 409.
        if (isUniqueViolation(err)) throw taken;
        throw err;
      });
    // Una cuenta nueva empieza en la versión de credenciales 0 (valor por defecto de la columna).
    setSession(res, user, 0);
    res.status(201).json({ user });
  });

  router.post('/login', limiter, async (req, res) => {
    const data = loginSchema.parse(req.body);
    type Row = SessionUser & { password_hash: string; credentials_version: number; disabled: boolean; must_change_password: boolean };
    const row = await ctx.db.one<Row>(
      `SELECT id, email, name, role, password_hash, credentials_version, disabled_at IS NOT NULL AS disabled, must_change_password
         FROM users WHERE email = ?`,
      [data.email],
    );
    // Comparamos siempre para no revelar por tiempo de respuesta si el correo existe.
    const ok = await bcrypt.compare(data.password, row?.password_hash ?? '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
    // El superadministrador solo entra por /superadmin/login (con PIN).
    if (!row || !ok || row.role === 'superadmin') throw new HttpError(401, 'Correo o contraseña incorrectos', 'invalid_credentials');
    // Solo se revela que la cuenta está desactivada a quien ya demostró conocer la contraseña.
    if (row.disabled) throw new HttpError(403, 'Tu cuenta está desactivada. Contacta con un administrador.', 'account_disabled');
    // Con una contraseña temporal la sesión se abre igual, pero la API exige cambiarla (requirePasswordChanged).
    const user = toSessionUser({ ...row, mustChangePassword: row.must_change_password });
    await ctx.db.run('UPDATE users SET last_login_at = now() WHERE id = ?', [row.id]);
    setSession(res, user, row.credentials_version);
    res.json({ user });
  });

  /**
   * Acceso del superadministrador: usuario + contraseña + PIN. Nunca dice qué factor falló, si el usuario
   * existe ni si la cuenta está bloqueada (siempre 401 genérico). Tras MAX_FAILED_ATTEMPTS fallos seguidos
   * la cuenta queda bloqueada LOCK_MINUTES.
   */
  router.post('/superadmin/login', superadminLimiter, async (req, res) => {
    const invalid = new HttpError(401, 'Credenciales no válidas', 'invalid_credentials');
    const parsed = superadminLoginSchema.safeParse(req.body);
    if (!parsed.success) throw invalid;
    const { username, password, pin } = parsed.data;
    type Row = SessionUser & { password_hash: string; pin_hash: string | null };
    const candidate = await ctx.db.one<Row>(
      `SELECT id, email, name, role, password_hash, pin_hash FROM users WHERE username = ? AND role = 'superadmin'`,
      [username],
    );
    // Las dos comparaciones se hacen siempre, exista o no el usuario, para igualar el tiempo de respuesta.
    // Se hacen fuera de la transacción para no retener el candado de la fila durante bcrypt.
    const dummy = await getDummyHash();
    const passwordOk = await bcrypt.compare(password, candidate?.password_hash ?? dummy);
    const pinOk = await bcrypt.compare(pin, candidate?.pin_hash ?? dummy);
    if (!candidate) throw invalid;

    // Comprobación del bloqueo y actualización de contadores, atómicas: la fila queda bloqueada (FOR UPDATE)
    // hasta el COMMIT, así que intentos simultáneos se cuentan uno a uno y ninguno entra si ya hay bloqueo.
    const outcome = await ctx.db.transaction(async (tx) => {
      const row = await tx.one<Row & { credentials_version: number; locked: boolean; lock_expired: boolean }>(
        `SELECT id, email, name, role, password_hash, pin_hash, credentials_version,
                COALESCE(locked_until > now(), false) AS locked,
                COALESCE(locked_until <= now(), false) AS lock_expired
           FROM users WHERE id = ? AND role = 'superadmin' FOR UPDATE`,
        [candidate.id],
      );
      if (!row || row.locked) return { ok: false as const };
      // Si las credenciales rotaron entre la comparación y el candado, el resultado de bcrypt ya no vale.
      const unchanged = row.password_hash === candidate.password_hash && row.pin_hash === candidate.pin_hash;
      if (!unchanged) return { ok: false as const };
      if (!passwordOk || !pinOk) {
        // Un bloqueo ya vencido reinicia la cuenta de fallos.
        const previous = row.lock_expired ? 0 : null;
        await tx.run(
          `UPDATE users SET
             failed_attempts = COALESCE(?::int, failed_attempts) + 1,
             locked_until = CASE WHEN COALESCE(?::int, failed_attempts) + 1 >= ?::int THEN now() + make_interval(mins => ?::int) ELSE NULL END
           WHERE id = ?`,
          [previous, previous, MAX_FAILED_ATTEMPTS, LOCK_MINUTES, row.id],
        );
        return { ok: false as const };
      }
      await tx.run('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = now() WHERE id = ?', [row.id]);
      const user: SessionUser = { id: row.id, email: row.email, name: row.name, role: row.role };
      return { ok: true as const, user, credentialsVersion: row.credentials_version };
    });
    if (!outcome.ok) throw invalid;
    setSession(res, outcome.user, outcome.credentialsVersion);
    res.json({ user: outcome.user });
  });

  router.post('/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.status(204).end();
  });

  router.get('/me', requireAuth(ctx), (req, res) => {
    res.json({ user: currentUser(req) });
  });

  router.post('/change-password', limiter, requireAuth(ctx), async (req, res) => {
    const user = currentUser(req);
    if (user.role === 'superadmin') {
      throw new HttpError(403, 'Las credenciales del superadministrador se gestionan en el servidor', 'forbidden');
    }
    const data = changePasswordSchema.parse(req.body);
    const row = (await ctx.db.one<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', [user.id]))!;
    if (!(await bcrypt.compare(data.currentPassword, row.password_hash))) {
      throw new HttpError(400, 'La contraseña actual no es correcta', 'invalid_credentials');
    }
    // La contraseña temporal (que acaba de coincidir con la actual) no vale como nueva.
    if (user.mustChangePassword && data.newPassword === data.currentPassword) {
      throw new HttpError(400, 'La nueva contraseña debe ser distinta de la temporal', 'same_password');
    }
    const hash = await hashPassword(data.newPassword);
    // Nueva versión de credenciales: las demás sesiones de esta cuenta dejan de valer; la actual se renueva.
    // Cambiarla también cumple la obligación pendiente tras un restablecimiento.
    const updated = (await ctx.db.one<{ credentials_version: number }>(
      `UPDATE users SET password_hash = ?, credentials_version = credentials_version + 1, must_change_password = false
        WHERE id = ? RETURNING credentials_version`,
      [hash, user.id],
    ))!;
    setSession(res, user, updated.credentials_version);
    res.status(204).end();
  });

  return router;
}
