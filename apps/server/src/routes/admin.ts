import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import type { Queryable } from '../db/index.js';
import { fold, foldSql } from '../lib/fold.js';
import { accountSchema, hashPassword, insertAccount } from '../lib/accounts.js';
import { HttpError, isUniqueViolation, notFound } from '../lib/http-error.js';
import { searchTerms } from '../lib/snippet.js';
import { currentUser, isAdminRole, isStaffRole, requireAdmin, requireSuperAdmin, type UserRole } from '../middleware/auth.js';
import { toTsQuery } from './search.js';

/**
 * Panel de administración: estadísticas globales, usuarios y actividad de escaneo.
 * Se monta detrás de requireAuth + requireStaff (ver app.ts) y cada ruta exige su propio nivel:
 * - Operador: solo el listado de usuarios (datos parciales, sin escaneos) y desactivar/reactivar usuarios normales.
 * - Administrador: todo lo demás, salvo crear administradores y asignar el rol de administrador.
 * - Superadministrador: todo. Nadie puede modificar, desactivar ni eliminar al superadministrador desde la API.
 * Nunca devuelve password_hash, pin_hash ni los contadores de bloqueo.
 * Los listados devuelven solo un extracto del texto; GET /scans/:id devuelve el texto completo.
 */

const idParam = z.coerce.number().int().positive();
const roleSchema = z.object({ role: z.enum(['user', 'operator', 'admin'], 'Rol no válido') });
const statusSchema = z.object({ reason: z.string().trim().max(500, 'El motivo es demasiado largo').optional() });

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

const dateRange = {
  from: z.coerce.date('Fecha no válida').optional(),
  to: z.coerce.date('Fecha no válida').optional(),
};

// Diferencia del administrador respecto a UTC en minutos, igual que en /api/stats.
const seriesSchema = {
  tz: z.coerce.number().int().min(-840).max(840).default(0),
  days: z.coerce.number().int().min(7).max(90).default(14),
};

/** Órdenes permitidos del listado de usuarios. La clave llega del cliente; el SQL nunca. */
const USER_SORTS = {
  recent: 'u.created_at DESC, u.id DESC',
  scans: 'COALESCE(s.scans, 0) DESC, u.id DESC',
  // Última actividad: el último acceso o el último escaneo, lo que sea más reciente.
  activity: 'GREATEST(u.last_login_at, s.last_scan) DESC NULLS LAST, u.id DESC',
} as const;

/** Órdenes permitidos de los escaneos de un usuario: por fecha o agrupados por carpeta. */
const SCAN_SORTS = {
  recent: 's.created_at DESC, s.id DESC',
  group: 'g.title ASC NULLS LAST, s.group_id, s.position, s.created_at DESC, s.id DESC',
} as const;

const sortKeys = <T extends object>(sorts: T) => Object.keys(sorts) as [keyof T & string, ...(keyof T & string)[]];

const ENGINES = ['ocrspace', 'gemini', 'tesseract', 'manual'] as const;

const statsSchema = z.object(seriesSchema);
const usersSchema = z.object({
  q: z.string().trim().max(200).optional(),
  role: z.enum(['user', 'operator', 'admin', 'superadmin'], 'Rol no válido').optional(),
  status: z.enum(['active', 'disabled'], 'Estado no válido').optional(),
  sort: z.enum(sortKeys(USER_SORTS), 'Orden no válido').default('recent'),
  ...pagination,
});
const userScansSchema = z.object({
  q: z.string().trim().max(200).optional(),
  engine: z.enum(ENGINES, 'Motor no válido').optional(),
  sort: z.enum(sortKeys(SCAN_SORTS), 'Orden no válido').default('recent'),
  ...dateRange,
  ...pagination,
});
const scansSchema = z.object({
  userId: z.coerce.number().int().positive().optional(),
  user: z.string().trim().max(200).optional(),
  engine: z.enum(ENGINES, 'Motor no válido').optional(),
  ...dateRange,
  ...pagination,
});

const AUDIT_ACTIONS = ['view_scan', 'change_role', 'delete_user', 'create_admin', 'deactivate_user', 'reactivate_user'] as const;
type AuditAction = (typeof AUDIT_ACTIONS)[number];

const auditSchema = z.object({
  action: z.enum(AUDIT_ACTIONS, 'Acción no válida').optional(),
  actorId: z.coerce.number().int().positive().optional(),
  targetUserId: z.coerce.number().int().positive().optional(),
  // Texto libre sobre el correo del actor o del afectado (copia guardada en el registro).
  actor: z.string().trim().max(200).optional(),
  target: z.string().trim().max(200).optional(),
  ...dateRange,
  ...pagination,
});

interface AuditEntry {
  actorId: number;
  actorEmail: string;
  action: AuditAction;
  targetUserId?: number;
  targetEmail?: string;
  targetScanId?: number;
  details?: Record<string, unknown>;
}

/** Añade una fila al registro de auditoría. Dentro de una transacción, si falla se deshace toda la acción. */
function writeAudit(db: Queryable, entry: AuditEntry) {
  return db.run(
    `INSERT INTO admin_audit_log (actor_id, actor_email, action, target_user_id, target_email, target_scan_id, details)
     VALUES (?, ?, ?, ?, ?, ?, ?::jsonb)`,
    [
      entry.actorId,
      entry.actorEmail,
      entry.action,
      entry.targetUserId ?? null,
      entry.targetEmail ?? null,
      entry.targetScanId ?? null,
      JSON.stringify(entry.details ?? {}),
    ],
  );
}

const PREVIEW_CHARS = 200;

const USER_COLUMNS = `u.id, u.email, u.name, u.role, u.created_at AS "createdAt", u.last_login_at AS "lastLoginAt",
  u.disabled_at AS "disabledAt", u.disabled_reason AS "disabledReason"`;

/** Lo único que ve un operador de cada cuenta: sin rol, sin palabras, sin títulos ni texto de escaneos. */
const OPERATOR_USER_COLUMNS = `u.id, u.name, u.email, u.created_at AS "createdAt", u.last_login_at AS "lastLoginAt",
  u.disabled_at AS "disabledAt", COALESCE(s.scans, 0) AS "scanCount", s.last_scan AS "lastScanAt"`;

const ADMIN_USER_LIST_COLUMNS = `${USER_COLUMNS}, COALESCE(s.scans, 0) AS "scanCount", COALESCE(s.words, 0) AS "wordCount", s.last_scan AS "lastScanAt"`;

const SCAN_TOTALS_JOIN = `LEFT JOIN (
    SELECT user_id, COUNT(*) AS scans, SUM(word_count) AS words, MAX(created_at) AS last_scan FROM scans GROUP BY user_id
  ) s ON s.user_id = u.id`;

/**
 * Cuentas que cada rol puede desactivar o reactivar. El operador solo gestiona usuarios normales;
 * el superadministrador no aparece como afectado posible en ningún caso.
 */
const STATUS_TARGETS: Partial<Record<UserRole, readonly string[]>> = {
  operator: ['user'],
  admin: ['user', 'operator'],
  superadmin: ['user', 'operator', 'admin'],
};

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** Escaneos por día (en la hora local indicada por tz) de los últimos `days` días, incluidos los días sin actividad. */
async function scansPerDay(db: Queryable, tz: number, days: number, userId?: number) {
  const rows = await db.query<{ day: string; count: number }>(
    `SELECT to_char((created_at AT TIME ZONE 'UTC') + make_interval(mins => ?::int), 'YYYY-MM-DD') AS day, COUNT(*) AS count
       FROM scans
      WHERE created_at > now() - make_interval(days => ?::int)
        ${userId ? 'AND user_id = ?' : ''}
      GROUP BY day`,
    userId ? [tz, days + 2, userId] : [tz, days + 2],
  );
  const counts = new Map(rows.map((r) => [r.day, r.count]));
  const localNow = new Date(Date.now() + tz * 60_000);
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(localNow);
    d.setUTCDate(d.getUTCDate() - (days - 1 - i));
    const day = isoDay(d);
    return { day, count: counts.get(day) ?? 0 };
  });
}

const escapeLike = (word: string) => word.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Cada palabra de la búsqueda debe aparecer en el nombre o el correo, sin importar acentos ni mayúsculas. */
function userSearch(q: string | undefined, alias = 'u') {
  const words = q ? (fold(q).match(/[\p{L}\p{N}@._+-]+/gu) ?? []).slice(0, 8) : [];
  return {
    where: words.map(() => `${foldSql(`${alias}.name || ' ' || ${alias}.email`)} LIKE ?`),
    params: words.map((word) => `%${escapeLike(word)}%`),
  };
}

/** Acumula condiciones WHERE con sus parámetros en el mismo orden. */
function conditions() {
  const where: string[] = [];
  const params: unknown[] = [];
  return {
    where,
    params,
    add(sql: string, ...values: unknown[]) {
      where.push(sql);
      params.push(...values);
    },
    merge(other: { where: string[]; params: unknown[] }) {
      where.push(...other.where);
      params.push(...other.params);
    },
    get clause() {
      return where.length ? `WHERE ${where.join(' AND ')}` : '';
    },
  };
}

const offsetOf = (page: number, pageSize: number) => (page - 1) * pageSize;

const forbidden = (message = 'No tienes permiso para acceder a esta sección') => new HttpError(403, message, 'forbidden');

export function adminRouter(ctx: AppContext) {
  const router = Router();

  const findUser = async (id: number) => {
    const user = await ctx.db.one(
      `SELECT ${USER_COLUMNS}, d.email AS "disabledByEmail" FROM users u LEFT JOIN users d ON d.id = u.disabled_by WHERE u.id = ?`,
      [id],
    );
    if (!user) throw notFound('Usuario');
    return user;
  };

  /** La cuenta tal como la puede ver quien pregunta: el operador recibe solo los datos parciales. */
  const userForActor = async (id: number, actorRole: UserRole) => {
    if (isAdminRole(actorRole)) return findUser(id);
    const user = await ctx.db.one(`SELECT ${OPERATOR_USER_COLUMNS} FROM users u ${SCAN_TOTALS_JOIN} WHERE u.id = ?`, [id]);
    if (!user) throw notFound('Usuario');
    return user;
  };

  router.get('/stats', requireAdmin, async (req, res) => {
    const { tz, days } = statsSchema.parse(req.query);
    const totals = (await ctx.db.one<Record<string, number>>(
      `SELECT (SELECT COUNT(*) FROM users) AS users,
              (SELECT COUNT(*) FROM users WHERE role IN ('admin', 'superadmin')) AS admins,
              (SELECT COUNT(*) FROM scans) AS scans,
              (SELECT COALESCE(SUM(word_count), 0) FROM scans) AS words,
              (SELECT COUNT(*) FROM groups) AS groups,
              (SELECT COUNT(*) FROM documents) AS documents`,
    ))!;
    const perDay = await scansPerDay(ctx.db, tz, days);
    const topUsers = await ctx.db.query(
      `SELECT u.id, u.name, u.email, COUNT(s.id) AS scans, COALESCE(SUM(s.word_count), 0) AS words
         FROM users u JOIN scans s ON s.user_id = u.id
        GROUP BY u.id ORDER BY scans DESC, u.id ASC LIMIT 5`,
    );
    const recentScans = await ctx.db.query(
      `SELECT s.id, s.title, s.engine, s.created_at AS "createdAt", u.id AS "userId", u.name AS "userName", u.email AS "userEmail"
         FROM scans s JOIN users u ON u.id = s.user_id
        ORDER BY s.created_at DESC, s.id DESC LIMIT 10`,
    );
    res.json({ totals, perDay, topUsers, recentScans });
  });

  /**
   * Listado de cuentas, con búsqueda, filtros, orden y paginación. El operador solo ve usuarios normales
   * y con las columnas de OPERATOR_USER_COLUMNS: la proyección se decide aquí, nunca en el cliente.
   */
  router.get('/users', async (req, res) => {
    const { q, role, status, sort, page, pageSize } = usersSchema.parse(req.query);
    const actor = currentUser(req);
    const operator = !isAdminRole(actor.role);
    const filter = conditions();
    filter.merge(userSearch(q));
    if (operator) filter.add(`u.role = 'user'`);
    if (role) filter.add('u.role = ?', role);
    if (status) filter.add(status === 'disabled' ? 'u.disabled_at IS NOT NULL' : 'u.disabled_at IS NULL');
    const { total } = (await ctx.db.one<{ total: number }>(`SELECT COUNT(*) AS total FROM users u ${filter.clause}`, filter.params))!;
    const users = await ctx.db.query(
      `SELECT ${operator ? OPERATOR_USER_COLUMNS : ADMIN_USER_LIST_COLUMNS}
         FROM users u ${SCAN_TOTALS_JOIN}
         ${filter.clause}
        ORDER BY ${USER_SORTS[sort]}
        LIMIT ? OFFSET ?`,
      [...filter.params, pageSize, offsetOf(page, pageSize)],
    );
    res.json({ users, total, page, pageSize });
  });

  router.get('/users/:id', requireAdmin, async (req, res) => {
    const id = idParam.parse(req.params.id);
    const { tz, days } = statsSchema.parse(req.query);
    const user = await findUser(id);
    const totals = (await ctx.db.one<Record<string, unknown>>(
      `SELECT (SELECT COUNT(*) FROM scans WHERE user_id = ?) AS scans,
              (SELECT COALESCE(SUM(word_count), 0) FROM scans WHERE user_id = ?) AS words,
              (SELECT MAX(created_at) FROM scans WHERE user_id = ?) AS "lastScanAt",
              (SELECT COUNT(*) FROM groups WHERE user_id = ?) AS groups,
              (SELECT COUNT(*) FROM documents WHERE user_id = ?) AS documents,
              (SELECT COUNT(*) FROM final_summaries WHERE user_id = ?) AS "finalSummaries"`,
      [id, id, id, id, id, id],
    ))!;
    const byEngine = await ctx.db.query(
      `SELECT engine, COUNT(*) AS count, COALESCE(SUM(word_count), 0) AS words
         FROM scans WHERE user_id = ? GROUP BY engine ORDER BY count DESC, engine`,
      [id],
    );
    const perDay = await scansPerDay(ctx.db, tz, days, id);
    res.json({ user, stats: { ...totals, byEngine, perDay } });
  });

  // Escaneos de un usuario: búsqueda por título o texto, filtros por motor y fecha (`to` exclusivo), y orden por carpeta.
  router.get('/users/:id/scans', requireAdmin, async (req, res) => {
    const id = idParam.parse(req.params.id);
    const { q, engine, from, to, sort, page, pageSize } = userScansSchema.parse(req.query);
    await findUser(id);
    const filter = conditions();
    filter.add('s.user_id = ?', id);
    const terms = q ? searchTerms(q) : [];
    if (terms.length) filter.add(`s.search @@ to_tsquery('simple', ?)`, toTsQuery(terms));
    if (engine) filter.add('s.engine = ?', engine);
    if (from) filter.add('s.created_at >= ?::timestamptz', from.toISOString());
    if (to) filter.add('s.created_at < ?::timestamptz', to.toISOString());
    const { total } = (await ctx.db.one<{ total: number }>(`SELECT COUNT(*) AS total FROM scans s ${filter.clause}`, filter.params))!;
    const scans = await ctx.db.query(
      `SELECT s.id, s.title, s.engine, s.language, s.word_count AS "wordCount", s.created_at AS "createdAt",
              s.group_id AS "groupId", g.title AS "groupTitle", left(s.text, ?::int) AS preview
         FROM scans s LEFT JOIN groups g ON g.id = s.group_id
         ${filter.clause}
        ORDER BY ${SCAN_SORTS[sort]}
        LIMIT ? OFFSET ?`,
      [PREVIEW_CHARS, ...filter.params, pageSize, offsetOf(page, pageSize)],
    );
    res.json({ scans, total, page, pageSize });
  });

  // Registro global de actividad: quién escaneó, cuándo y con qué motor. `to` es exclusivo.
  router.get('/scans', requireAdmin, async (req, res) => {
    const { userId, user, engine, from, to, page, pageSize } = scansSchema.parse(req.query);
    const filter = conditions();
    if (userId) filter.add('s.user_id = ?', userId);
    filter.merge(userSearch(user));
    if (engine) filter.add('s.engine = ?', engine);
    if (from) filter.add('s.created_at >= ?::timestamptz', from.toISOString());
    if (to) filter.add('s.created_at < ?::timestamptz', to.toISOString());
    const { total } = (await ctx.db.one<{ total: number }>(
      `SELECT COUNT(*) AS total FROM scans s JOIN users u ON u.id = s.user_id ${filter.clause}`,
      filter.params,
    ))!;
    const scans = await ctx.db.query(
      `SELECT s.id, s.title, s.engine, s.language, s.word_count AS "wordCount", s.created_at AS "createdAt",
              u.id AS "userId", u.name AS "userName", u.email AS "userEmail"
         FROM scans s JOIN users u ON u.id = s.user_id
         ${filter.clause}
        ORDER BY s.created_at DESC, s.id DESC
        LIMIT ? OFFSET ?`,
      [...filter.params, pageSize, offsetOf(page, pageSize)],
    );
    res.json({ scans, total, page, pageSize });
  });

  // Escaneo completo (texto incluido) de cualquier usuario, para revisarlo desde el panel.
  router.get('/scans/:id', requireAdmin, async (req, res) => {
    const id = idParam.parse(req.params.id);
    const scan = await ctx.db.one(
      `SELECT s.id, s.title, s.text, s.original_text AS "originalText", s.engine, s.language, s.word_count AS "wordCount",
              s.page_label AS "pageLabel", s.created_at AS "createdAt", s.updated_at AS "updatedAt",
              s.group_id AS "groupId", g.title AS "groupTitle",
              u.id AS "userId", u.name AS "userName", u.email AS "userEmail"
         FROM scans s JOIN users u ON u.id = s.user_id LEFT JOIN groups g ON g.id = s.group_id
        WHERE s.id = ?`,
      [id],
    );
    if (!scan) throw notFound('Escaneo');
    // Leer el texto de otra persona queda registrado; si no se puede registrar, no se entrega el texto.
    const actor = currentUser(req);
    await writeAudit(ctx.db, {
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'view_scan',
      targetUserId: scan.userId as number,
      targetEmail: scan.userEmail as string,
      targetScanId: id,
      details: { title: scan.title },
    });
    res.json({ scan });
  });

  /**
   * Bloquea la fila del actor y la del afectado y comprueba, dentro de la transacción, el rol actual
   * del actor (pudo cambiar o desactivarse después de validar la sesión). El superadministrador nunca
   * es un afectado válido.
   */
  const lockActorAndTarget = async (tx: Queryable, actorId: number, targetId: number, allowed: (role: string) => boolean) => {
    const rows = await tx.query<{ id: number; email: string; role: UserRole; disabled: boolean }>(
      'SELECT id, email, role, disabled_at IS NOT NULL AS disabled FROM users WHERE id IN (?, ?) ORDER BY id FOR UPDATE',
      [actorId, targetId],
    );
    const actor = rows.find((r) => r.id === actorId);
    const target = rows.find((r) => r.id === targetId);
    if (!actor || actor.disabled || !allowed(actor.role)) throw forbidden();
    if (!target) throw notFound('Usuario');
    if (target.role === 'superadmin') {
      throw new HttpError(403, 'No se puede modificar ni eliminar al superadministrador', 'superadmin_protected');
    }
    return { actor, target };
  };

  /**
   * Cambios de rol. El superadministrador asigna usuario, operador o administrador; un administrador
   * solo alterna usuario y operador sobre cuentas que no sean de administrador.
   */
  router.patch('/users/:id/role', requireAdmin, async (req, res) => {
    const id = idParam.parse(req.params.id);
    const { role } = roleSchema.parse(req.body);
    const actorId = currentUser(req).id;
    await ctx.db.transaction(async (tx) => {
      const { actor, target } = await lockActorAndTarget(tx, actorId, id, isAdminRole);
      if (actor.role !== 'superadmin') {
        const limited = ['user', 'operator'];
        if (!limited.includes(target.role) || !limited.includes(role)) {
          throw forbidden('Solo el superadministrador puede asignar o quitar el rol de administrador');
        }
      }
      if (target.role === role) return;
      await tx.run('UPDATE users SET role = ? WHERE id = ?', [role, id]);
      // Si el registro falla, la transacción deshace también el cambio de rol.
      await writeAudit(tx, {
        actorId,
        actorEmail: actor.email,
        action: 'change_role',
        targetUserId: id,
        targetEmail: target.email,
        details: { from: target.role, to: role },
      });
    });
    res.json({ user: await findUser(id) });
  });

  /**
   * Desactivar o reactivar una cuenta sin borrar sus datos. Al desactivar se sube la versión de credenciales
   * (y requireAuth rechaza las cuentas desactivadas), así que sus sesiones abiertas dejan de valer al momento.
   */
  const setStatus = (disable: boolean) =>
    async (req: Request, res: Response) => {
      const id = idParam.parse(req.params.id);
      const { reason } = statusSchema.parse(req.body ?? {});
      const me = currentUser(req);
      await ctx.db.transaction(async (tx) => {
        const { actor, target } = await lockActorAndTarget(tx, me.id, id, isStaffRole);
        if (id === me.id) throw new HttpError(409, 'No puedes desactivar ni reactivar tu propia cuenta', 'self_action');
        if (!STATUS_TARGETS[actor.role]?.includes(target.role)) {
          throw forbidden(actor.role === 'operator' ? 'Solo puedes gestionar cuentas de usuario' : 'Solo el superadministrador puede gestionar a otro administrador');
        }
        if (target.disabled === disable) return;
        if (disable) {
          await tx.run(
            `UPDATE users SET disabled_at = now(), disabled_by = ?, disabled_reason = ?, credentials_version = credentials_version + 1 WHERE id = ?`,
            [me.id, reason || null, id],
          );
        } else {
          await tx.run('UPDATE users SET disabled_at = NULL, disabled_by = NULL, disabled_reason = NULL WHERE id = ?', [id]);
        }
        // Si el registro falla, la transacción deshace también el cambio de estado.
        await writeAudit(tx, {
          actorId: me.id,
          actorEmail: actor.email,
          action: disable ? 'deactivate_user' : 'reactivate_user',
          targetUserId: id,
          targetEmail: target.email,
          details: disable && reason ? { role: target.role, reason } : { role: target.role },
        });
      });
      res.json({ user: await userForActor(id, me.role) });
    };

  router.post('/users/:id/deactivate', setStatus(true));
  router.post('/users/:id/reactivate', setStatus(false));

  // Los administradores eliminan usuarios y operadores; eliminar a otro administrador exige ser superadministrador.
  router.delete('/users/:id', requireAdmin, async (req, res) => {
    const id = idParam.parse(req.params.id);
    const actorId = currentUser(req).id;
    await ctx.db.transaction(async (tx) => {
      const { actor, target } = await lockActorAndTarget(tx, actorId, id, isAdminRole);
      if (id === actorId) throw new HttpError(409, 'No puedes eliminar tu propia cuenta desde el panel', 'self_action');
      if (target.role === 'admin' && actor.role !== 'superadmin') {
        throw forbidden('Solo el superadministrador puede eliminar a otro administrador');
      }
      // El correo se copia antes de borrar: el registro no tiene clave foránea al afectado.
      await writeAudit(tx, {
        actorId,
        actorEmail: actor.email,
        action: 'delete_user',
        targetUserId: id,
        targetEmail: target.email,
        details: { role: target.role },
      });
      // Las tablas de cada usuario usan ON DELETE CASCADE: se borran sus escaneos, grupos, documentos, etc.
      await tx.run('DELETE FROM users WHERE id = ?', [id]);
    });
    res.status(204).end();
  });

  // Alta directa de un administrador (con contraseña temporal): solo el superadministrador.
  router.post('/admins', requireSuperAdmin, async (req, res) => {
    const data = accountSchema.parse(req.body);
    const actorId = currentUser(req).id;
    const taken = new HttpError(409, 'Ya existe una cuenta con ese correo', 'email_taken');
    if (await ctx.db.one('SELECT 1 FROM users WHERE email = ?', [data.email])) throw taken;
    const passwordHash = await hashPassword(data.password);
    const created = await ctx.db
      .transaction(async (tx) => {
        const actor = await tx.one<{ email: string; role: string }>('SELECT email, role FROM users WHERE id = ? FOR UPDATE', [actorId]);
        if (actor?.role !== 'superadmin') throw forbidden('Solo el superadministrador puede hacer esto');
        const user = await insertAccount(tx, { email: data.email, name: data.name, passwordHash, role: 'admin', markLogin: false });
        // Si el registro falla, la transacción deshace también el alta.
        await writeAudit(tx, {
          actorId,
          actorEmail: actor.email,
          action: 'create_admin',
          targetUserId: user.id,
          targetEmail: user.email,
          details: { name: user.name },
        });
        return user;
      })
      .catch((err) => {
        // Dos altas simultáneas con el mismo correo: gana una, la otra recibe 409.
        if (isUniqueViolation(err)) throw taken;
        throw err;
      });
    res.status(201).json({ user: await findUser(created.id) });
  });

  // Registro de auditoría, del más reciente al más antiguo. Solo lectura: no hay rutas para editarlo ni borrarlo.
  router.get('/audit', requireAdmin, async (req, res) => {
    const { action, actorId, targetUserId, actor, target, from, to, page, pageSize } = auditSchema.parse(req.query);
    const filter = conditions();
    if (action) filter.add('a.action = ?', action);
    if (actorId) filter.add('a.actor_id = ?', actorId);
    if (targetUserId) filter.add('a.target_user_id = ?', targetUserId);
    if (actor) filter.add('lower(a.actor_email) LIKE ?', `%${escapeLike(actor.toLowerCase())}%`);
    if (target) filter.add(`lower(COALESCE(a.target_email, '')) LIKE ?`, `%${escapeLike(target.toLowerCase())}%`);
    if (from) filter.add('a.created_at >= ?::timestamptz', from.toISOString());
    if (to) filter.add('a.created_at < ?::timestamptz', to.toISOString());
    const { total } = (await ctx.db.one<{ total: number }>(`SELECT COUNT(*) AS total FROM admin_audit_log a ${filter.clause}`, filter.params))!;
    const entries = await ctx.db.query(
      `SELECT a.id, a.action, a.actor_id AS "actorId", a.actor_email AS "actorEmail",
              a.target_user_id AS "targetUserId", a.target_email AS "targetEmail", a.target_scan_id AS "targetScanId",
              (t.id IS NOT NULL) AS "targetExists", a.details, a.created_at AS "createdAt"
         FROM admin_audit_log a LEFT JOIN users t ON t.id = a.target_user_id
         ${filter.clause}
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT ? OFFSET ?`,
      [...filter.params, pageSize, offsetOf(page, pageSize)],
    );
    res.json({ entries, total, page, pageSize });
  });

  return router;
}
