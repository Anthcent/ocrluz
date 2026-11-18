import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { AppContext } from '../context.js';
import { HttpError } from '../lib/http-error.js';

export const SESSION_COOKIE = 'ocryon_session';

export type UserRole = 'user' | 'operator' | 'admin' | 'superadmin';

/** El superadministrador cuenta como administrador en todo el panel. */
export const isAdminRole = (role: string | undefined) => role === 'admin' || role === 'superadmin';

/** Personal: operadores (gestión limitada de usuarios), administradores y superadministrador. */
export const isStaffRole = (role: string | undefined) => role === 'operator' || isAdminRole(role);

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

/**
 * Firma la cookie de sesión. `v` es la versión de credenciales del usuario en ese momento: si después
 * cambia (cambio de contraseña, rotación del superadministrador), requireAuth rechaza el token.
 */
export function signSession(ctx: AppContext, user: Pick<SessionUser, 'id'>, credentialsVersion: number, ttlSeconds: number) {
  return jwt.sign({ sub: String(user.id), v: credentialsVersion }, ctx.jwtSecret, { expiresIn: ttlSeconds });
}

export function requireAuth(ctx: AppContext) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) return next(new HttpError(401, 'Inicia sesión para continuar', 'unauthenticated'));
    let userId: number;
    let version: number;
    try {
      const payload = jwt.verify(token, ctx.jwtSecret) as jwt.JwtPayload;
      userId = Number(payload.sub);
      // Los tokens emitidos antes de existir el claim cuentan como versión 0 (no se cierran esas sesiones).
      version = payload.v === undefined ? 0 : Number(payload.v);
      if (!Number.isInteger(userId) || !Number.isInteger(version)) throw new Error('token mal formado');
    } catch {
      return next(new HttpError(401, 'Tu sesión expiró, vuelve a iniciar sesión', 'unauthenticated'));
    }
    try {
      // Una cuenta desactivada pierde la sesión al instante, aunque el token siga vigente.
      const user = await ctx.db.one<SessionUser>(
        'SELECT id, email, name, role FROM users WHERE id = ? AND credentials_version = ? AND disabled_at IS NULL',
        [userId, version],
      );
      if (!user) return next(new HttpError(401, 'Tu sesión expiró, vuelve a iniciar sesión', 'unauthenticated'));
      req.user = user;
      next();
    } catch (err) {
      // Un fallo de la base de datos no es un problema de sesión: que lo gestione el manejador de errores.
      next(err);
    }
  };
}

/** Obtiene el usuario autenticado (solo usar detrás de requireAuth). */
export function currentUser(req: Request): SessionUser {
  if (!req.user) throw new HttpError(401, 'No autenticado', 'unauthenticated');
  return req.user;
}

/** Operadores, administradores y superadministrador (usar detrás de requireAuth). */
export function requireStaff(req: Request, _res: Response, next: NextFunction) {
  if (!isStaffRole(req.user?.role)) return next(new HttpError(403, 'No tienes permiso para acceder a esta sección', 'forbidden'));
  next();
}

/** Administradores y superadministrador (usar detrás de requireAuth). */
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!isAdminRole(req.user?.role)) return next(new HttpError(403, 'No tienes permiso para acceder a esta sección', 'forbidden'));
  next();
}

/** Solo el superadministrador (usar detrás de requireAuth). */
export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== 'superadmin') return next(new HttpError(403, 'Solo el superadministrador puede hacer esto', 'forbidden'));
  next();
}
