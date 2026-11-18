import type {
  AdminScan,
  AdminScanActivity,
  AdminStats,
  AdminUser,
  AdminUserDetail,
  AdminUserListItem,
  AdminUserScan,
  Analysis,
  AuditAction,
  AuditEntry,
  CustomTemplate,
  DocField,
  SavedDocument,
  SavedFinalSummary,
  Engine,
  FinalSummary,
  FinalSummaryListItem,
  Group,
  GroupInput,
  Scan,
  ScanEngine,
  SearchResult,
  Settings,
  Paged,
  Stats,
  User,
  UserRole,
  UserSort,
  UserStatus,
} from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

/** Se dispara cuando el servidor responde 401 para que la app vuelva al login. */
export const UNAUTHORIZED_EVENT = 'ocryon:unauthorized';

async function request<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('X-Requested-With', 'ocryon');
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.json);
  }

  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...init, headers, body, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'Sin conexión con el servidor', 'offline');
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError(res.status, data.error ?? `Error ${res.status}`, data.code);
  }
  return data as T;
}

/** Como `request`, pero con XMLHttpRequest para conocer el avance de la subida (fetch no lo ofrece). */
function uploadWithProgress<T>(path: string, body: FormData, onUpload?: (fraction: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api${path}`);
    xhr.setRequestHeader('X-Requested-With', 'ocryon');
    xhr.upload.onprogress = (e) => e.lengthComputable && onUpload?.(e.loaded / e.total);
    xhr.upload.onloadend = () => onUpload?.(1);
    xhr.onerror = () => reject(new ApiError(0, 'Sin conexión con el servidor', 'offline'));
    xhr.onload = () => {
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // respuesta vacía o no JSON
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data as T);
      if (xhr.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
      reject(new ApiError(xhr.status, (data.error as string) ?? `Error ${xhr.status}`, data.code as string | undefined));
    };
    xhr.send(body);
  });
}

interface PageParams {
  page?: number;
  pageSize?: number;
}
/** Dates go as ISO strings; `to` is exclusive on the server. */
interface DateRangeParams {
  from?: string;
  to?: string;
}
export type UserListParams = PageParams & { q?: string; role?: UserRole; status?: UserStatus; sort?: UserSort };
export type UserScanParams = PageParams & DateRangeParams & { q?: string; engine?: ScanEngine; sort?: 'recent' | 'group' };
export type ActivityParams = PageParams & DateRangeParams & { userId?: number; user?: string; engine?: ScanEngine };
export type AuditParams = PageParams &
  DateRangeParams & { action?: AuditAction; actorId?: number; targetUserId?: number; actor?: string; target?: string };

const qs = (params: Record<string, string | number | undefined>) => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '') as [string, string][];
  return entries.length ? `?${new URLSearchParams(entries)}` : '';
};

export const api = {
  auth: {
    me: () => request<{ user: User }>('/auth/me'),
    login: (email: string, password: string) => request<{ user: User }>('/auth/login', { method: 'POST', json: { email, password } }),
    superadminLogin: (username: string, password: string, pin: string) =>
      request<{ user: User }>('/auth/superadmin/login', { method: 'POST', json: { username, password, pin } }),
    register: (name: string, email: string, password: string) =>
      request<{ user: User }>('/auth/register', { method: 'POST', json: { name, email, password } }),
    logout: () => request<void>('/auth/logout', { method: 'POST' }),
    changePassword: (currentPassword: string, newPassword: string) =>
      request<void>('/auth/change-password', { method: 'POST', json: { currentPassword, newPassword } }),
  },
  settings: {
    get: () => request<Settings>('/settings'),
    update: (patch: Partial<Omit<Settings, 'keys'>> & { ocrspaceKey?: string | null; geminiKey?: string | null }) =>
      request<Settings>('/settings', { method: 'PUT', json: patch }),
    test: (provider: 'ocrspace' | 'gemini') => request<{ ok: true; ms: number }>(`/settings/test/${provider}`, { method: 'POST' }),
  },
  /** OCR en el servidor; `onUpload` recibe el avance de la subida de la imagen (0 a 1). */
  ocr: (image: Blob, engine: Exclude<Engine, 'tesseract'>, language: string, onUpload?: (fraction: number) => void) => {
    const form = new FormData();
    form.append('engine', engine);
    form.append('language', language);
    form.append('image', image, `page.${image.type.split('/')[1] ?? 'jpg'}`);
    return uploadWithProgress<{ text: string; ms: number }>('/ocr', form, onUpload);
  },
  groups: {
    list: () => request<{ groups: Group[] }>('/groups'),
    get: (id: number) => request<{ group: Group; scans: Scan[] }>(`/groups/${id}`),
    categories: () => request<{ categories: { category: string; count: number }[] }>('/groups/categories'),
    create: (data: Partial<GroupInput> & { title: string }) => request<{ group: Group }>('/groups', { method: 'POST', json: data }),
    update: (id: number, data: Partial<GroupInput>) =>
      request<{ group: Group }>(`/groups/${id}`, { method: 'PATCH', json: data }),
    reorder: (id: number, scanIds: number[]) => request<void>(`/groups/${id}/order`, { method: 'PUT', json: { scanIds } }),
    remove: (id: number) => request<void>(`/groups/${id}`, { method: 'DELETE' }),
  },
  scans: {
    list: (params: { scope?: 'all' | 'individual'; limit?: number; offset?: number } = {}) =>
      request<{ scans: Scan[]; total: number }>(`/scans${qs(params)}`),
    get: (id: number) => request<{ scan: Scan }>(`/scans/${id}`),
    create: (data: {
      groupId?: number;
      newGroup?: Partial<GroupInput> & { title: string };
      items: { title?: string; text: string; engine: ScanEngine; language: string; pageLabel?: string }[];
    }) => request<{ groupId: number | null; ids: number[] }>('/scans', { method: 'POST', json: data }),
    update: (id: number, data: { title?: string; text?: string; groupId?: number | null; workspaceHtml?: string }) =>
      request<{ scan: Scan }>(`/scans/${id}`, { method: 'PATCH', json: data }),
    remove: (id: number) => request<void>(`/scans/${id}`, { method: 'DELETE' }),
  },
  documents: {
    list: (params: { template?: string; q?: string } = {}) =>
      request<{ documents: SavedDocument[]; counts: { templateKey: string; count: number }[] }>(`/documents${qs(params)}`),
    get: (id: number) => request<{ document: SavedDocument }>(`/documents/${id}`),
    create: (data: Omit<SavedDocument, 'id' | 'createdAt' | 'updatedAt'>) =>
      request<{ document: SavedDocument }>('/documents', { method: 'POST', json: data }),
    update: (id: number, data: { title?: string; fields?: DocField[] }) =>
      request<{ document: SavedDocument }>(`/documents/${id}`, { method: 'PATCH', json: data }),
    remove: (id: number) => request<void>(`/documents/${id}`, { method: 'DELETE' }),
    extract: (fields: Omit<DocField, 'value'>[], text: string, documentType: string) =>
      request<{ values: Record<string, string> }>('/documents/extract', { method: 'POST', json: { fields, text, documentType } }),
    templates: () => request<{ templates: CustomTemplate[] }>('/documents/templates'),
    createTemplate: (data: { name: string; emoji: string; fields: CustomTemplate['fields'] }) =>
      request<{ template: CustomTemplate }>('/documents/templates', { method: 'POST', json: data }),
    removeTemplate: (id: number) => request<void>(`/documents/templates/${id}`, { method: 'DELETE' }),
  },
  search: (q: string, filters: { groupId?: number; type?: 'all' | 'group' | 'individual'; category?: string; limit?: number } = {}) =>
    request<{ results: SearchResult[]; total: number }>(`/search${qs({ q, ...filters })}`),
  stats: () => request<Stats>(`/stats${qs({ tz: -new Date().getTimezoneOffset() })}`),
  analyses: {
    list: (targetType: 'group' | 'scan', targetId: number) =>
      request<{ analyses: Analysis[] }>(`/analyses${qs({ targetType, targetId })}`),
    online: (targetType: 'group' | 'scan', targetId: number) =>
      request<{ analysis: Analysis }>('/analyses/online', { method: 'POST', json: { targetType, targetId } }),
    saveOffline: (targetType: 'group' | 'scan', targetId: number, content: object) =>
      request<{ analysis: Analysis }>('/analyses/offline', { method: 'POST', json: { targetType, targetId, content } }),
    remove: (id: number) => request<void>(`/analyses/${id}`, { method: 'DELETE' }),
  },
  finalSummaries: {
    list: () => request<{ summaries: FinalSummaryListItem[] }>('/final-summaries'),
    blank: (year: string) => request<{ summary: FinalSummary }>(`/final-summaries/new${qs({ year })}`),
    /** Reads one photographed page with the cloud OCR or the AI; `onUpload` reports the image upload (0 to 1). */
    scan: (image: Blob, engine: 'ocrspace' | 'gemini', onUpload?: (fraction: number) => void) => {
      const form = new FormData();
      form.append('engine', engine);
      form.append('image', image, 'resumen.jpg');
      return uploadWithProgress<{ summary: FinalSummary; warnings: string[]; engine: 'ocrspace' | 'gemini'; words: number; ms: number }>('/final-summaries/scan', form, onUpload);
    },
    /** Parses a page already read on the device (word boxes from Tesseract). */
    parse: (text: string, words: { text: string; left: number; top: number; width: number; height: number }[]) =>
      request<{ summary: FinalSummary; warnings: string[]; words: number }>('/final-summaries/parse', { method: 'POST', json: { text, words } }),
    get: (id: number) => request<SavedFinalSummary>(`/final-summaries/${id}`),
    create: (summary: FinalSummary) => request<SavedFinalSummary>('/final-summaries', { method: 'POST', json: { summary } }),
    update: (id: number, summary: FinalSummary) => request<SavedFinalSummary>(`/final-summaries/${id}`, { method: 'PUT', json: { summary } }),
    remove: (id: number) => request<void>(`/final-summaries/${id}`, { method: 'DELETE' }),
    xlsxUrl: (id: number) => `/api/final-summaries/${id}/xlsx`,
  },
  /**
   * Administration panel. Operators may only call `users` (partial rows), `deactivate` and `reactivate`;
   * the rest is for admins. The server enforces it and answers 403 to everyone else.
   */
  admin: {
    stats: (days = 14) => request<AdminStats>(`/admin/stats${qs({ tz: -new Date().getTimezoneOffset(), days })}`),
    users: <T = AdminUserListItem>(params: UserListParams = {}) => request<Paged & { users: T[] }>(`/admin/users${qs({ ...params })}`),
    user: (id: number, days = 14) => request<AdminUserDetail>(`/admin/users/${id}${qs({ tz: -new Date().getTimezoneOffset(), days })}`),
    userScans: (id: number, params: UserScanParams = {}) => request<Paged & { scans: AdminUserScan[] }>(`/admin/users/${id}/scans${qs({ ...params })}`),
    activity: (params: ActivityParams = {}) => request<Paged & { scans: AdminScanActivity[] }>(`/admin/scans${qs({ ...params })}`),
    scan: (id: number) => request<{ scan: AdminScan }>(`/admin/scans/${id}`),
    setRole: (id: number, role: Exclude<UserRole, 'superadmin'>) => request<{ user: AdminUser }>(`/admin/users/${id}/role`, { method: 'PATCH', json: { role } }),
    /** The response is the partial row for operators and the full account for admins. */
    deactivate: <T = AdminUser>(id: number, reason?: string) =>
      request<{ user: T }>(`/admin/users/${id}/deactivate`, { method: 'POST', json: reason ? { reason } : {} }),
    reactivate: <T = AdminUser>(id: number) => request<{ user: T }>(`/admin/users/${id}/reactivate`, { method: 'POST', json: {} }),
    removeUser: (id: number) => request<void>(`/admin/users/${id}`, { method: 'DELETE' }),
    /** Admins only. The temporary password comes back once, in this response; it is never shown again. */
    resetPassword: (id: number) => request<{ temporaryPassword: string }>(`/admin/users/${id}/reset-password`, { method: 'POST' }),
    /** Superadmin only: creates an admin account with a temporary password. */
    createAdmin: (data: { name: string; email: string; password: string }) => request<{ user: AdminUser }>('/admin/admins', { method: 'POST', json: data }),
    /** Read-only audit log, newest first. */
    audit: (params: AuditParams = {}) => request<Paged & { entries: AuditEntry[] }>(`/admin/audit${qs({ ...params })}`),
  },
};
