import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import type { Queryable } from '../db/index.js';
import { fold, foldSql } from '../lib/fold.js';
import { accountSchema, hashPassword, insertAccount } from '../lib/accounts.js';
import { HttpError, isUniqueViolation, notFound } from '../lib/http-error.js';
import { currentUser, isAdminRole, requireSuperAdmin } from '../middleware/auth.js';

/**
 * Panel de administración: estadísticas globales, usuarios y actividad de escaneo.
 * Se monta detrás de requireAuth + requireAdmin (ver app.ts). Nunca devuelve password_hash, pin_hash ni
 * los contadores de bloqueo. Crear administradores y cambiar roles es exclusivo del superadministrador;
 * nadie puede modificar ni eliminar al superadministrador desde la API.
 * Los listados devuelven solo un extracto del texto; GET /scans/:id devuelve el texto completo.
 */

const idParam = z.coerce.number().int().positive();
const roleSchema = z.object({ role: z.enum(['user', 'admin'], 'Rol no válido') });

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

// Diferencia del administrador respecto a UTC en minutos, igual que en /api/stats.
const seriesSchema = {
  tz: z.coerce.number().int().min(-840).max(840).default(0),
  days: z.coerce.number().int().min(7).max(90).default(14),
};

const statsSchema = z.object(seriesSchema);
const usersSchema = z.object({
  q: z.string().trim().max(200).optional(),
  role: z.enum(['user', 'admin', 'superadmin'], 'Rol no válido').optional(),
  ...pagination,
});
const scansSchema = z.object({
  userId: z.coerce.number().int().positive().optional(),
  from: z.coerce.date('Fecha no válida').optional(),
  to: z.coerce.date('Fecha no válida').optional(),
  ...pagination,
});

const AUDIT_ACTIONS = ['view_scan', 'change_role', 'delete_user', 'create_admin'] as const;
type AuditAction = (typeof AUDIT_ACTIONS)[number];

const auditSchema = z.object({
  action: z.enum(AUDIT_ACTIONS, 'Acción no válida').optional(),
  actorId: z.coerce.number().int().positive().optional(),
  targetUserId: z.coerce.number().int().positive().optional(),
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

const USER_COLUMNS = `u.id, u.email, u.name, u.role, u.created_at AS "createdAt", u.last_login_at AS "lastLoginAt"`;

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

/** Cada palabra de la búsqueda debe aparecer en el nombre o el correo, sin importar acentos ni mayúsculas. */
function userSearch(q: string | undefined) {
  const words = q ? (fold(q).match(/[\p{L}\p{N}@._+-]+/gu) ?? []).slice(0, 8) : [];
  return {
    where: words.map(() => `${foldSql("u.name || ' ' || u.email")} LIKE ?`),
    params: words.map((word) => `%${word.replace(/[\\%_]/g, (c) => `\\${c}`)}%`),
  };
}

const offsetOf = (page: number, pageSize: number) => (page - 1) * pageSize;

export function adminRouter(ctx: AppContext) {
  const router = Router();

  const findUser = async (id: number) => {
    const user = await ctx.db.one(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = ?`, [id]);
    if (!user) throw notFound('Usuario');
    return user;
  };

  router.get('/stats', async (req, res) => {
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

  router.get('/users', async (req, res) => {
    const { q, role, page, pageSize } = usersSchema.parse(req.query);
    const search = userSearch(q);
    if (role) {
      search.where.push('u.role = ?');
      search.params.push(role);
    }
    const where = search.where.length ? `WHERE ${search.where.join(' AND ')}` : '';
    const { total } = (await ctx.db.one<{ total: number }>(`SELECT COUNT(*) AS total FROM users u ${where}`, search.params))!;
    const users = await ctx.db.query(
      `SELECT ${USER_COLUMNS}, COALESCE(s.scans, 0) AS "scanCount", COALESCE(s.words, 0) AS "wordCount", s.last_scan AS "lastScanAt"
         FROM users u
         LEFT JOIN (
           SELECT user_id, COUNT(*) AS scans, SUM(word_count) AS words, MAX(created_at) AS last_scan FROM scans GROUP BY user_id
         ) s ON s.user_id = u.id
         ${where}
        ORDER BY u.created_at DESC, u.id DESC
        LIMIT ? OFFSET ?`,
      [...search.params, pageSize, offsetOf(page, pageSize)],
    );
    res.json({ users, total, page, pageSize });
  });

  router.get('/users/:id', async (req, res) => {
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

  router.get('/users/:id/scans', async (req, res) => {
    const id = idParam.parse(req.params.id);
    const { page, pageSize } = z.object(pagination).parse(req.query);
    await findUser(id);
    const { total } = (await ctx.db.one<{ total: number }>('SELECT COUNT(*) AS total FROM scans WHERE user_id = ?', [id]))!;
    const scans = await ctx.db.query(
      `SELECT s.id, s.title, s.engine, s.language, s.word_count AS "wordCount", s.created_at AS "createdAt",
              s.group_id AS "groupId", g.title AS "groupTitle", left(s.text, ?::int) AS preview
         FROM scans s LEFT JOIN groups g ON g.id = s.group_id
        WHERE s.user_id = ?
        ORDER BY s.created_at DESC, s.id DESC
        LIMIT ? OFFSET ?`,
      [PREVIEW_CHARS, id, pageSize, offsetOf(page, pageSize)],
    );
    res.json({ scans, total, page, pageSize });
  });

  // Registro global de actividad: quién escaneó, cuándo y con qué motor. `to` es exclusivo.
  router.get('/scans', async (req, res) => {
    const { userId, from, to, page, pageSize } = scansSchema.parse(req.query);
    const where: string[] = [];
    const params: unknown[] = [];
    if (userId) {
      where.push('s.user_id = ?');
      params.push(userId);
    }
    if (from) {
      where.push('s.created_at >= ?::timestamptz');
      params.push(from.toISOString());
    }
    if (to) {
      where.push('s.created_at < ?::timestamptz');
      params.push(to.toISOString());
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { total } = (await ctx.db.one<{ total: number }>(`SELECT COUNT(*) AS total FROM scans s ${clause}`, params))!;
    const scans = await ctx.db.query(
      `SELECT s.id, s.title, s.engine, s.language, s.word_count AS "wordCount", s.created_at AS "createdAt",
              u.id AS "userId", u.name AS "userName", u.email AS "userEmail"
         FROM scans s JOIN users u ON u.id = s.user_id
         ${clause}
        ORDER BY s.created_at DESC, s.id DESC
        LIMIT ? OFFSET ?`,
      [...params, pageSize, offsetOf(page, pageSize)],
    );
    res.json({ scans, total, page, pageSize });
  });

  // Escaneo completo (texto incluido) de cualquier usuario, para revisarlo desde el panel.
  router.get('/scans/:id', async (req, res) => {
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

  const forbidden = (message = 'No tienes permiso para acceder a esta sección') => new HttpError(403, message, 'forbidden');

  /**
   * Bloquea la fila del actor y la del afectado y comprueba, dentro de la transacción, el rol actual
   * del actor (pudo cambiar después de validar la sesión). El superadministrador nunca es un afectado válido.
   */
  const lockActorAndTarget = async (tx: Queryable, actorId: number, targetId: number) => {
    const rows = await tx.query<{ id: number; email: string; role: string }>(
      'SELECT id, email, role FROM users WHERE id IN (?, ?) ORDER BY id FOR UPDATE',
      [actorId, targetId],
    );
    const actor = rows.find((r) => r.id === actorId);
    const target = rows.find((r) => r.id === targetId);
    if (!actor || !isAdminRole(actor.role)) throw forbidden();
    if (!target) throw notFound('Usuario');
    if (target.role === 'superadmin') {
      throw new HttpError(403, 'No se puede modificar ni eliminar al superadministrador', 'superadmin_protected');
    }
    return { actor, target };
  };

  // Promover o degradar entre usuario y administrador: solo el superadministrador.
  router.patch('/users/:id/role', requireSuperAdmin, async (req, res) => {
    const id = idParam.parse(req.params.id);
    const { role } = roleSchema.parse(req.body);
    const actorId = currentUser(req).id;
    await ctx.db.transaction(async (tx) => {
      const { actor, target } = await lockActorAndTarget(tx, actorId, id);
      if (actor.role !== 'superadmin') throw forbidden('Solo el superadministrador puede hacer esto');
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

  // Los administradores eliminan usuarios normales; eliminar a otro administrador exige ser superadministrador.
  router.delete('/users/:id', async (req, res) => {
    const id = idParam.parse(req.params.id);
    const actorId = currentUser(req).id;
    await ctx.db.transaction(async (tx) => {
      const { actor, target } = await lockActorAndTarget(tx, actorId, id);
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
  router.get('/audit', async (req, res) => {
    const { action, actorId, targetUserId, page, pageSize } = auditSchema.parse(req.query);
    const where: string[] = [];
    const params: unknown[] = [];
    if (action) {
      where.push('a.action = ?');
      params.push(action);
    }
    if (actorId) {
      where.push('a.actor_id = ?');
      params.push(actorId);
    }
    if (targetUserId) {
      where.push('a.target_user_id = ?');
      params.push(targetUserId);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { total } = (await ctx.db.one<{ total: number }>(`SELECT COUNT(*) AS total FROM admin_audit_log a ${clause}`, params))!;
    const entries = await ctx.db.query(
      `SELECT a.id, a.action, a.actor_id AS "actorId", a.actor_email AS "actorEmail",
              a.target_user_id AS "targetUserId", a.target_email AS "targetEmail", a.target_scan_id AS "targetScanId",
              (t.id IS NOT NULL) AS "targetExists", a.details, a.created_at AS "createdAt"
         FROM admin_audit_log a LEFT JOIN users t ON t.id = a.target_user_id
         ${clause}
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT ? OFFSET ?`,
      [...params, pageSize, offsetOf(page, pageSize)],
    );
    res.json({ entries, total, page, pageSize });
  });

  return router;
}
