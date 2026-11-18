import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { openDatabase, toPositional, type Database } from './db/index.js';
import { migrations } from './db/migrations.js';
import { createCipher } from './lib/crypto.js';
import { resolveSecret } from './lib/secrets.js';
import { isReservedEmail, parseSuperadminEnv, SUPERADMIN_EMAIL, syncSuperadmin, type SuperadminCredentials } from './lib/superadmin.js';
import { buildSnippet, searchTerms } from './lib/snippet.js';
import { toTsQuery } from './routes/search.js';

// Un único PostgreSQL embebido (PGlite) para todo el archivo: arrancarlo cuesta unos segundos.
let db: Database;
// Credenciales de prueba del superadministrador; hashes con coste bajo para que los tests sean rápidos.
const SA = { username: 'sa-prueba01', password: 'Clave-Super-Segura-123!', pin: 'ABCDEFGH2345' };
let saCreds: SuperadminCredentials;
beforeAll(async () => {
  db = await openDatabase({});
  saCreds = { username: SA.username, passwordHash: await bcrypt.hash(SA.password, 4), pinHash: await bcrypt.hash(SA.pin, 4) };
}, 60_000);
afterAll(() => db?.close());
beforeEach(async () => {
  await db.run('TRUNCATE users, groups, scans, analyses, doc_templates, documents, final_summaries, settings, admin_audit_log RESTART IDENTITY CASCADE');
});

function setup(existingApp?: ReturnType<typeof createApp>) {
  const app =
    existingApp ??
    createApp({
      db,
      cipher: createCipher('test-secret-key-123456'),
      jwtSecret: 'test-jwt-secret-123456',
      secureCookies: false,
      fallbackKeys: { ocrspace: '', gemini: '' },
    });
  const agent = request.agent(app);
  const post = (url: string, body?: object) => agent.post(url).set('X-Requested-With', 'ocryon').send(body);
  return { db, app, agent, post };
}

/** Sincroniza el superadministrador (como al arrancar) y abre una sesión suya sobre la app indicada. */
async function superadminSession(app?: ReturnType<typeof createApp>) {
  await syncSuperadmin(db, saCreds);
  const s = setup(app);
  await s.post('/api/auth/superadmin/login', SA).expect(200);
  return s;
}

async function registered(email = 'ana@example.com') {
  const s = setup();
  await s.post('/api/auth/register', { name: 'Ana', email, password: 'secreto123' }).expect(201);
  return s;
}

describe('auth', () => {
  it('registra, mantiene la sesión y cierra sesión', async () => {
    const { agent, post } = await registered();
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.user.email).toBe('ana@example.com');
    await post('/api/auth/logout').expect(204);
  });

  it('rechaza correo duplicado y credenciales incorrectas', async () => {
    const { post } = await registered();
    await post('/api/auth/register', { name: 'Ana', email: 'ANA@example.com', password: 'secreto123' }).expect(409);
    await post('/api/auth/login', { email: 'ana@example.com', password: 'otra-clave' }).expect(401);
    await post('/api/auth/login', { email: 'ana@example.com', password: 'secreto123' }).expect(200);
  });

  it('cambiar la contraseña cierra las demás sesiones pero mantiene la actual', async () => {
    const current = await registered();
    const other = setup();
    await other.post('/api/auth/login', { email: 'ana@example.com', password: 'secreto123' }).expect(200);
    await current.post('/api/auth/change-password', { currentPassword: 'secreto123', newPassword: 'nueva-clave-123' }).expect(204);
    await current.agent.get('/api/auth/me').expect(200);
    await other.agent.get('/api/auth/me').expect(401);
    expect(await db.one('SELECT credentials_version AS v FROM users WHERE email = ?', ['ana@example.com'])).toEqual({ v: 1 });
  });

  it('acepta los tokens emitidos antes de la versión de credenciales (sin claim «v»)', async () => {
    const { app } = await registered();
    const { id } = (await db.one<{ id: number }>('SELECT id FROM users WHERE email = ?', ['ana@example.com']))!;
    const legacy = jwt.sign({ sub: String(id) }, 'test-jwt-secret-123456', { expiresIn: '7d' });
    const res = await request(app).get('/api/auth/me').set('Cookie', `ocryon_session=${legacy}`).expect(200);
    expect(res.body.user.email).toBe('ana@example.com');
    // Tras subir la versión, ese token antiguo deja de valer.
    await db.run('UPDATE users SET credentials_version = 1 WHERE id = ?', [id]);
    await request(app).get('/api/auth/me').set('Cookie', `ocryon_session=${legacy}`).expect(401);
  });

  it('exige la cabecera anti-CSRF en peticiones que modifican datos', async () => {
    const { agent } = setup();
    await agent.post('/api/auth/login').send({ email: 'a@b.co', password: 'x' }).expect(403);
  });

  it('protege las rutas privadas', async () => {
    const { agent } = setup();
    await agent.get('/api/groups').expect(401);
  });
});

describe('ajustes', () => {
  it('guarda las API keys cifradas y nunca las devuelve en claro', async () => {
    const { agent, db } = await registered();
    const res = await agent
      .put('/api/settings')
      .set('X-Requested-With', 'ocryon')
      .send({ ocrspaceKey: 'K81234567890ABCD', defaultEngine: 'gemini', autoScan: true })
      .expect(200);
    expect(res.body.keys.ocrspace).toEqual({ configured: true, source: 'user', masked: '••••ABCD' });
    expect(res.body.defaultEngine).toBe('gemini');
    expect(JSON.stringify(res.body)).not.toContain('K81234567890ABCD');
    const row = await db.one<{ ocrspace_key_enc: string }>('SELECT ocrspace_key_enc FROM settings');
    expect(row!.ocrspace_key_enc).not.toContain('K81234567890ABCD');
  });

  it('pide configurar la clave antes de usar OCR', async () => {
    const { agent } = await registered();
    const res = await agent
      .post('/api/ocr')
      .set('X-Requested-With', 'ocryon')
      .field('engine', 'ocrspace')
      .attach('image', Buffer.from([0xff, 0xd8, 0xff]), { filename: 'p.jpg', contentType: 'image/jpeg' })
      .expect(412);
    expect(res.body.code).toBe('missing_api_key');
  });
});

describe('escaneos, grupos y búsqueda', () => {
  it('guarda un grupo nuevo con páginas en orden y busca sin acentos', async () => {
    const { agent, post } = await registered();
    const saved = await post('/api/scans', {
      newGroup: { title: 'Actas 2024-2025' },
      items: [
        { text: 'Muchos años después, frente al pelotón de fusilamiento', engine: 'ocrspace' },
        { text: 'el coronel Aureliano Buendía había de recordar', engine: 'gemini' },
      ],
    }).expect(201);
    expect(saved.body.ids).toHaveLength(2);

    const group = await agent.get(`/api/groups/${saved.body.groupId}`).expect(200);
    expect(group.body.scans.map((s: any) => s.title)).toEqual(['Hoja 1', 'Hoja 2']);
    expect(group.body.scans[0].wordCount).toBe(8);

    const search = await agent.get('/api/search').query({ q: 'aureliano buendia' }).expect(200);
    expect(search.body.results).toHaveLength(1);
    expect(search.body.results[0].snippet).toContain('\u0002Aureliano\u0003');

    const list = await agent.get('/api/groups').expect(200);
    expect(list.body.groups[0]).toMatchObject({ scanCount: 2, wordCount: 15 });
  });

  it('la edición parcial de un grupo conserva los campos no enviados', async () => {
    const { agent, post } = await registered();
    const { body } = await post('/api/groups', { title: 'Carpeta', description: 'Notas', color: 'purple' }).expect(201);
    const res = await agent.patch(`/api/groups/${body.group.id}`).set('X-Requested-With', 'ocryon').send({ title: 'Carpeta 2' }).expect(200);
    expect(res.body.group).toMatchObject({ title: 'Carpeta 2', description: 'Notas', color: 'purple' });
  });

  it('login con correo inexistente responde 401 (no 500)', async () => {
    const { post } = setup();
    await post('/api/auth/login', { email: 'nadie@example.com', password: 'loquesea' }).expect(401);
  });

  it('guarda escaneos individuales y actualiza el índice al editar', async () => {
    const { agent, post } = await registered();
    const saved = await post('/api/scans', { items: [{ text: 'Receta de pan casero\nHarina y agua', engine: 'tesseract' }] }).expect(201);
    const id = saved.body.ids[0];
    const individual = await agent.get('/api/scans').query({ scope: 'individual' }).expect(200);
    expect(individual.body.scans[0].title).toBe('Receta de pan casero');

    await agent.patch(`/api/scans/${id}`).set('X-Requested-With', 'ocryon').send({ text: 'Receta de tortillas' }).expect(200);
    expect((await agent.get('/api/search').query({ q: 'harina' })).body.results).toHaveLength(0);
    expect((await agent.get('/api/search').query({ q: 'tortil' })).body.results).toHaveLength(1);
  });

  it('aísla los datos entre usuarios', async () => {
    const a = await registered('a@example.com');
    const saved = await a.post('/api/scans', { items: [{ text: 'secreto de A', engine: 'manual' }] }).expect(201);
    const { app } = a;
    const b = request.agent(app);
    await b.post('/api/auth/register').set('X-Requested-With', 'ocryon').send({ name: 'Bea', email: 'b@example.com', password: 'secreto123' }).expect(201);
    await b.get(`/api/scans/${saved.body.ids[0]}`).expect(404);
    expect((await b.get('/api/search').query({ q: 'secreto' })).body.results).toHaveLength(0);
  });

  it('guarda análisis offline y los borra con su escaneo', async () => {
    const { agent, post, db } = await registered();
    const saved = await post('/api/scans', { items: [{ text: 'Un texto corto para analizar', engine: 'manual' }] }).expect(201);
    const id = saved.body.ids[0];
    await post('/api/analyses/offline', { targetType: 'scan', targetId: id, content: { palabras: 5 } }).expect(201);
    const list = await agent.get('/api/analyses').query({ targetType: 'scan', targetId: id }).expect(200);
    expect(list.body.analyses[0].content).toEqual({ palabras: 5 });
    await agent.delete(`/api/scans/${id}`).set('X-Requested-With', 'ocryon').expect(204);
    expect(await db.one('SELECT COUNT(*) AS n FROM analyses')).toEqual({ n: 0 });
  });
});

describe('grupos con más datos y búsqueda filtrada', () => {
  it('guarda responsable, categoría, total de hojas y número de página detectado', async () => {
    const { agent, post } = await registered();
    const saved = await post('/api/scans', {
      newGroup: { title: 'Fichas 1er año', author: 'Secretaría', category: 'Ficha de inscripción', totalPages: 600, color: 'blue' },
      items: [{ text: 'Ficha de inscripción del estudiante', engine: 'manual', pageLabel: '15' }],
    }).expect(201);
    const { body } = await agent.get(`/api/groups/${saved.body.groupId}`).expect(200);
    expect(body.group).toMatchObject({ author: 'Secretaría', category: 'Ficha de inscripción', totalPages: 600 });
    expect(body.scans[0].pageLabel).toBe('15');
    const cats = await agent.get('/api/groups/categories').expect(200);
    expect(cats.body.categories).toEqual([{ category: 'Ficha de inscripción', count: 1 }]);
  });

  it('filtra la búsqueda por tipo y categoría', async () => {
    const { agent, post } = await registered();
    await post('/api/scans', { newGroup: { title: 'Carpeta A', category: 'Acta' }, items: [{ text: 'la batalla de Ayacucho', engine: 'manual' }] });
    await post('/api/scans', { newGroup: { title: 'Carpeta B', category: 'Nómina' }, items: [{ text: 'otra batalla imaginaria', engine: 'manual' }] });
    await post('/api/scans', { items: [{ text: 'apunte sobre una batalla', engine: 'manual' }] });
    const all = await agent.get('/api/search').query({ q: 'batalla' });
    expect(all.body.total).toBe(3);
    expect((await agent.get('/api/search').query({ q: 'batalla', type: 'individual' })).body.total).toBe(1);
    expect((await agent.get('/api/search').query({ q: 'batalla', type: 'group' })).body.total).toBe(2);
    const hist = await agent.get('/api/search').query({ q: 'batalla', category: 'Acta' });
    expect(hist.body.results.map((r: any) => r.groupTitle)).toEqual(['Carpeta A']);
  });

  it('aplica las migraciones una sola vez y conserva los datos al reabrir', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocryon-pg-'));
    const first = await openDatabase({ dataDir });
    await first.run(`INSERT INTO users (email, name, password_hash) VALUES ('a@b.co', 'A', 'x')`);
    await first.close();
    const again = await openDatabase({ dataDir });
    expect(await again.one('SELECT COUNT(*) AS n FROM schema_migrations')).toEqual({ n: migrations.length });
    expect(await again.one('SELECT email FROM users')).toEqual({ email: 'a@b.co' });
    await again.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }, 60_000);

  it('reordena las páginas de un grupo', async () => {
    const { agent, post } = await registered();
    const saved = await post('/api/scans', {
      newGroup: { title: 'Orden' },
      items: ['uno', 'dos', 'tres'].map((text) => ({ text, engine: 'manual' })),
    }).expect(201);
    const [a, b, c] = saved.body.ids;
    await agent.put(`/api/groups/${saved.body.groupId}/order`).set('X-Requested-With', 'ocryon').send({ scanIds: [c, a, b] }).expect(204);
    const { body } = await agent.get(`/api/groups/${saved.body.groupId}`).expect(200);
    expect(body.scans.map((s: any) => s.text)).toEqual(['tres', 'uno', 'dos']);
  });

  it('busca sin acentos en ambos sentidos y por prefijo, y devuelve fechas ISO', async () => {
    const { agent, post } = await registered();
    await post('/api/scans', { items: [{ text: 'Y vio treinta o cuarenta molinos de viento en la Mancha, dijo García Márquez', engine: 'manual' }] });
    const accented = await agent.get('/api/search').query({ q: 'MÁRQUEZ' }).expect(200);
    expect(accented.body.total).toBe(1);
    const prefix = await agent.get('/api/search').query({ q: 'garcia marq' }).expect(200);
    expect(prefix.body.results[0].snippet).toContain('\u0002García\u0003 \u0002Márquez\u0003');
    expect(prefix.body.results[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect((await agent.get('/api/search').query({ q: 'molinos de nieve' })).body.total).toBe(0);
  });
});

describe('documentos', () => {
  const record = {
    templateKey: 'acta',
    templateName: 'Acta',
    title: 'Acta ACT001-123',
    fields: [
      { key: 'numero', label: 'Número', type: 'id', value: 'ACT001-123' },
      { key: 'total', label: 'Total', type: 'money', value: '118.00' },
    ],
    text: 'ACTA ACT001-123 TOTAL 118.00',
    engine: 'tesseract',
    method: 'rules',
  };

  it('guarda, busca, filtra, edita y borra documentos', async () => {
    const { agent, post } = await registered();
    const created = await post('/api/documents', record).expect(201);
    const id = created.body.document.id;
    expect(created.body.document.fields[1]).toMatchObject({ key: 'total', value: '118.00' });
    await post('/api/documents', { ...record, templateKey: 'informe_medico', templateName: 'Informe médico', title: 'Informe reposo' }).expect(201);

    const all = await agent.get('/api/documents').expect(200);
    expect(all.body.documents).toHaveLength(2);
    expect(all.body.counts).toEqual(expect.arrayContaining([{ templateKey: 'acta', count: 1 }]));
    expect((await agent.get('/api/documents').query({ template: 'informe_medico' })).body.documents).toHaveLength(1);
    expect((await agent.get('/api/documents').query({ q: 'ACT001' })).body.documents).toHaveLength(2);
    expect((await agent.get('/api/documents').query({ q: 'reposo' })).body.documents).toHaveLength(1);
    // Sin acentos ni mayúsculas, y con comodines de LIKE tratados como texto.
    await post('/api/documents', { ...record, title: 'Acta de María Pérez' }).expect(201);
    expect((await agent.get('/api/documents').query({ q: 'maria PEREZ' })).body.documents).toHaveLength(1);
    expect((await agent.get('/api/documents').query({ q: '100%' })).body.documents).toHaveLength(0);
    await agent.delete(`/api/documents/${(await agent.get('/api/documents').query({ q: 'maria' })).body.documents[0].id}`).set('X-Requested-With', 'ocryon').expect(204);

    const fields = [...record.fields];
    fields[1] = { ...fields[1], value: '120.00' };
    const patched = await agent.patch(`/api/documents/${id}`).set('X-Requested-With', 'ocryon').send({ fields }).expect(200);
    expect(patched.body.document.fields[1].value).toBe('120.00');
    await agent.delete(`/api/documents/${id}`).set('X-Requested-With', 'ocryon').expect(204);
    await agent.get(`/api/documents/${id}`).expect(404);
  });

  it('crea tipos de documento propios y rechaza campos repetidos', async () => {
    const { agent, post } = await registered();
    const tpl = { name: 'Orden de compra', emoji: '🧾', fields: [{ key: 'proveedor', label: 'Proveedor', type: 'text' }] };
    const res = await post('/api/documents/templates', tpl).expect(201);
    expect(res.body.template.fields).toEqual(tpl.fields);
    await post('/api/documents/templates', { ...tpl, fields: [tpl.fields[0], tpl.fields[0]] }).expect(400);
    expect((await agent.get('/api/documents/templates')).body.templates).toHaveLength(1);
  });

  it('la extracción con IA pide la API key de Gemini', async () => {
    const { post } = await registered();
    const res = await post('/api/documents/extract', { fields: [{ key: 'total', label: 'Total', type: 'money' }], text: 'TOTAL 10' }).expect(412);
    expect(res.body.code).toBe('missing_api_key');
  });

  it('aísla los documentos entre usuarios', async () => {
    const a = await registered('doc-a@example.com');
    const created = await a.post('/api/documents', record);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const { body } = created;
    const b = request.agent(a.app);
    await b.post('/api/auth/register').set('X-Requested-With', 'ocryon').send({ name: 'Beto', email: 'doc-b@example.com', password: 'secreto123' }).expect(201);
    await b.get(`/api/documents/${body.document.id}`).expect(404);
    expect((await b.get('/api/documents')).body.documents).toHaveLength(0);
  });
});

describe('utilidades', () => {
  it('construye consultas de texto completo seguras', () => {
    expect(toTsQuery(searchTerms('hola "mundo" | !x* & Ñandú'))).toBe('hola & mundo & x & nandu:*');
    expect(searchTerms('  ')).toEqual([]);
    expect(toPositional('a = ? AND b IN (?, ?)')).toBe('a = $1 AND b IN ($2, $3)');
  });

  it('genera y conserva los secretos que no se configuraron; el del entorno tiene prioridad', async () => {
    const generated = await resolveSecret(db, 'PRUEBA_SECRET', undefined);
    expect(generated).toMatch(/^[0-9a-f]{64}$/);
    expect(await resolveSecret(db, 'PRUEBA_SECRET', undefined)).toBe(generated);
    expect(await resolveSecret(db, 'PRUEBA_SECRET', 'desde-el-entorno-123')).toBe('desde-el-entorno-123');
  });

  it('recorta el fragmento alrededor de la coincidencia', () => {
    const text = `${'palabra '.repeat(40)}el Ingenioso hidalgo ${'final '.repeat(40)}`;
    const snippet = buildSnippet(text, ['ingenioso']);
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
    expect(snippet).toContain('\u0002Ingenioso\u0003 hidalgo');
    expect(snippet.split(' ').length).toBeLessThanOrEqual(23);
  });

  it('resume la actividad de la semana en la zona horaria del usuario', async () => {
    const { agent, post } = await registered();
    await post('/api/scans', { items: [{ text: 'hoy', engine: 'manual' }] });
    const res = await agent.get('/api/stats').query({ tz: -300 }).expect(200);
    expect(res.body.week).toHaveLength(7);
    expect(res.body.week.at(-1).count).toBe(1);
    expect(res.body).not.toHaveProperty('streak');
  });
});

describe('resúmenes finales', () => {
  it('crea, edita, exporta a Excel y recuerda los datos de la institución', async () => {
    const { agent, post } = await registered();
    const blank = (await agent.get('/api/final-summaries/new').query({ year: 'TERCERO' }).expect(200)).body.summary;
    expect(blank.areas.map((a: { code: string }) => a.code)).toContain('BIO');

    blank.institution.name = 'LICEO DE PRUEBA';
    blank.course = { ...blank.course, section: 'B', plan: 'CIENCIA Y TECNOLOGÍA', planCode: '31060' };
    blank.students = [{ id: 'V30000001', lastNames: 'GOMEZ', firstNames: 'ANA', birthPlace: 'TRUJILLO', state: 'TR', sex: 'F', birthDay: '01', birthMonth: '02', birthYear: '2010', grades: ['15', '9', '20', '18', '12', '10', '11', '14', '16', 'A'] }];
    const created = (await post('/api/final-summaries', { summary: blank }).expect(201)).body;
    expect(created.title).toBe('Resumen final · TERCERO «B»');

    created.summary.students[0].grades[1] = '12';
    const updated = await agent.put(`/api/final-summaries/${created.id}`).set('X-Requested-With', 'ocryon').send({ summary: created.summary }).expect(200);
    expect(updated.body.summary.students[0].grades[1]).toBe('12');

    const file = await agent.get(`/api/final-summaries/${created.id}/xlsx`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(file.headers['content-disposition']).toContain('RESUMEN_FINAL_REGULAR_TERCERO_B.xlsx');
    expect((file.body as Buffer).subarray(0, 2).toString()).toBe('PK');

    const next = (await agent.get('/api/final-summaries/new').expect(200)).body.summary;
    expect(next.institution.name).toBe('LICEO DE PRUEBA');
    expect(next.course.planCode).toBe('31060');
    expect(next.students).toEqual([]);
  });

  it('rechaza más de 35 estudiantes y aísla los resúmenes entre usuarios', async () => {
    const ana = await registered();
    const blank = (await ana.agent.get('/api/final-summaries/new').expect(200)).body.summary;
    const student = { id: 'V1', lastNames: 'A', firstNames: 'B', birthPlace: '', state: '', sex: 'M', birthDay: '', birthMonth: '', birthYear: '', grades: Array(10).fill('15') };
    await ana.post('/api/final-summaries', { summary: { ...blank, students: Array(36).fill(student) } }).expect(400);
    const { id } = (await ana.post('/api/final-summaries', { summary: blank }).expect(201)).body;

    const beto = await registered('beto@example.com');
    await beto.agent.get(`/api/final-summaries/${id}`).expect(404);
    await beto.agent.get(`/api/final-summaries/${id}/xlsx`).expect(404);
    expect((await beto.agent.get('/api/final-summaries').expect(200)).body.summaries).toEqual([]);
  });
});

describe('administración', () => {
  const ADMIN = 'admin@example.com';

  /** Un administrador (promovido directamente en la base) y una usuaria normal sobre la misma app. */
  async function adminAndUser() {
    const admin = setup();
    await admin.post('/api/auth/register', { name: 'Admin', email: ADMIN, password: 'secreto123' }).expect(201);
    await db.run(`UPDATE users SET role = 'admin' WHERE email = ?`, [ADMIN]);
    const user = request.agent(admin.app);
    const userPost = (url: string, body?: object) => user.post(url).set('X-Requested-With', 'ocryon').send(body);
    const { body } = await userPost('/api/auth/register', { name: 'Ana', email: 'ana@example.com', password: 'secreto123' }).expect(201);
    return { admin, user, userPost, userId: body.user.id as number };
  }

  /** Además, el superadministrador (sincronizado desde las credenciales de prueba) con su propia sesión. */
  async function withSuperadmin() {
    const base = await adminAndUser();
    const sa = await superadminSession(base.admin.app);
    return { ...base, sa };
  }

  const routes = (id: number) =>
    [
      ['get', '/api/admin/stats'],
      ['get', '/api/admin/users'],
      ['get', `/api/admin/users/${id}`],
      ['get', `/api/admin/users/${id}/scans`],
      ['get', '/api/admin/scans'],
      ['get', '/api/admin/scans/1'],
      ['get', '/api/admin/audit'],
      ['patch', `/api/admin/users/${id}/role`],
      ['post', `/api/admin/users/${id}/deactivate`],
      ['post', `/api/admin/users/${id}/reactivate`],
      ['delete', `/api/admin/users/${id}`],
      ['post', '/api/admin/admins'],
    ] as const;

  it('exige sesión (401) y rol de administrador (403) en todas las rutas', async () => {
    const { admin, user, userId } = await adminAndUser();
    const anonymous = request.agent(admin.app);
    for (const [method, url] of routes(userId)) {
      await anonymous[method](url).set('X-Requested-With', 'ocryon').send({ role: 'admin' }).expect(401);
      const res = await user[method](url).set('X-Requested-With', 'ocryon').send({ role: 'admin' }).expect(403);
      expect(res.body.code).toBe('forbidden');
    }
    expect((await db.one<{ role: string }>('SELECT role FROM users WHERE id = ?', [userId]))!.role).toBe('user');
  });

  it('expone el rol en la sesión y nunca devuelve la contraseña', async () => {
    const { admin } = await adminAndUser();
    expect((await admin.agent.get('/api/auth/me').expect(200)).body.user).toEqual({ id: expect.any(Number), email: ADMIN, name: 'Admin', role: 'admin' });
    const login = await admin.post('/api/auth/login', { email: ADMIN, password: 'secreto123' }).expect(200);
    expect(login.body.user.role).toBe('admin');
    expect(JSON.stringify(login.body)).not.toContain('password');
    const other = await registered('normal@example.com');
    expect((await other.agent.get('/api/auth/me')).body.user.role).toBe('user');
  });

  it('lista usuarios, detalle, escaneos y estadísticas globales', async () => {
    const { admin, userPost, userId } = await adminAndUser();
    await userPost('/api/scans', {
      newGroup: { title: 'Actas' },
      items: [
        { text: 'uno dos tres', engine: 'ocrspace' },
        { text: 'x'.repeat(500), engine: 'gemini' },
      ],
    }).expect(201);
    await admin.post('/api/scans', { items: [{ text: 'hola mundo', engine: 'manual' }] }).expect(201);

    const stats = (await admin.agent.get('/api/admin/stats').query({ tz: -300, days: 7 }).expect(200)).body;
    expect(stats.totals).toEqual({ users: 2, admins: 1, scans: 3, words: 6, groups: 1, documents: 0 });
    expect(stats.perDay).toHaveLength(7);
    expect(stats.perDay.at(-1).count).toBe(3);
    expect(stats.topUsers[0]).toMatchObject({ id: userId, email: 'ana@example.com', scans: 2 });
    expect(stats.recentScans).toHaveLength(3);
    expect(stats.recentScans[0]).toMatchObject({ userEmail: ADMIN, engine: 'manual' });
    expect(stats.recentScans[0].createdAt).toMatch(/Z$/);

    const list = (await admin.agent.get('/api/admin/users').expect(200)).body;
    expect(list.total).toBe(2);
    const ana = list.users.find((u: any) => u.id === userId);
    expect(ana).toMatchObject({ email: 'ana@example.com', role: 'user', scanCount: 2, wordCount: 4 });
    expect(ana.lastScanAt).toMatch(/Z$/);
    expect(JSON.stringify(list)).not.toContain('password');
    const found = (await admin.agent.get('/api/admin/users').query({ q: 'ANA' }).expect(200)).body;
    expect(found.users.map((u: any) => u.id)).toEqual([userId]);
    const admins = (await admin.agent.get('/api/admin/users').query({ role: 'admin' }).expect(200)).body;
    expect(admins.users.map((u: any) => u.email)).toEqual([ADMIN]);
    await admin.agent.get('/api/admin/users').query({ role: 'root' }).expect(400);
    const paged = (await admin.agent.get('/api/admin/users').query({ page: 2, pageSize: 1 }).expect(200)).body;
    expect(paged).toMatchObject({ total: 2, page: 2, pageSize: 1 });
    expect(paged.users).toHaveLength(1);

    const detail = (await admin.agent.get(`/api/admin/users/${userId}`).expect(200)).body;
    expect(detail.user).toMatchObject({ id: userId, email: 'ana@example.com', role: 'user' });
    expect(detail.user).not.toHaveProperty('password_hash');
    expect(detail.stats).toMatchObject({ scans: 2, words: 4, groups: 1, documents: 0 });
    expect(detail.stats.byEngine).toEqual(
      expect.arrayContaining([
        { engine: 'ocrspace', count: 1, words: 3 },
        { engine: 'gemini', count: 1, words: 1 },
      ]),
    );
    expect(detail.stats.perDay).toHaveLength(14);

    const scans = (await admin.agent.get(`/api/admin/users/${userId}/scans`).expect(200)).body;
    expect(scans.total).toBe(2);
    expect(scans.scans[0]).toMatchObject({ groupTitle: 'Actas', engine: 'gemini' });
    expect(scans.scans[0].preview).toHaveLength(200);
    expect(scans.scans[0]).not.toHaveProperty('text');

    const log = (await admin.agent.get('/api/admin/scans').query({ userId }).expect(200)).body;
    expect(log.total).toBe(2);
    expect(log.scans.every((s: any) => s.userEmail === 'ana@example.com')).toBe(true);
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect((await admin.agent.get('/api/admin/scans').query({ from: future }).expect(200)).body.total).toBe(0);
    expect((await admin.agent.get('/api/admin/scans').query({ to: future }).expect(200)).body.total).toBe(3);

    await admin.agent.get('/api/admin/users/9999').expect(404);
    await admin.agent.get('/api/admin/users/9999/scans').expect(404);
  });

  it('el superadministrador cambia roles; el administrador elimina usuarios en cascada sin tocar los datos de otros', async () => {
    const { admin, user, userPost, userId, sa } = await withSuperadmin();
    await userPost('/api/scans', { newGroup: { title: 'Suyo' }, items: [{ text: 'de Ana', engine: 'manual' }] }).expect(201);
    await admin.post('/api/scans', { items: [{ text: 'del admin', engine: 'manual' }] }).expect(201);
    const role = (id: number | string, value: string) => sa.agent.patch(`/api/admin/users/${id}/role`).set('X-Requested-With', 'ocryon').send({ role: value });

    expect((await role(userId, 'admin').expect(200)).body.user.role).toBe('admin');
    expect((await user.get('/api/auth/me')).body.user.role).toBe('admin');
    await role(userId, 'user').expect(200);
    await role(userId, 'root').expect(400);
    await role(userId, 'superadmin').expect(400);
    await role(9999, 'admin').expect(404);

    await admin.agent.delete(`/api/admin/users/${userId}`).set('X-Requested-With', 'ocryon').expect(204);
    await admin.agent.delete(`/api/admin/users/${userId}`).set('X-Requested-With', 'ocryon').expect(404);
    for (const table of ['scans', 'groups', 'settings']) {
      expect(await db.one(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`, [userId])).toEqual({ n: 0 });
    }
    expect(await db.one('SELECT COUNT(*) AS n FROM scans')).toEqual({ n: 1 });
    // La cookie de la cuenta borrada deja de valer.
    await user.get('/api/auth/me').expect(401);
    await user.get('/api/scans').expect(401);
  });

  it('el administrador no cambia roles, no crea administradores, no elimina a otro administrador ni a sí mismo', async () => {
    const { admin, userId, sa } = await withSuperadmin();
    const adminId = (await admin.agent.get('/api/auth/me')).body.user.id;
    const patch = (id: number, role: string) => admin.agent.patch(`/api/admin/users/${id}/role`).set('X-Requested-With', 'ocryon').send({ role });
    const remove = (id: number) => admin.agent.delete(`/api/admin/users/${id}`).set('X-Requested-With', 'ocryon');

    expect((await patch(userId, 'admin').expect(403)).body.code).toBe('forbidden');
    expect((await patch(adminId, 'user').expect(403)).body.code).toBe('forbidden');
    const created = await admin.post('/api/admin/admins', { name: 'Otro', email: 'otro@example.com', password: 'secreto123' }).expect(403);
    expect(created.body.code).toBe('forbidden');
    expect(await db.one(`SELECT COUNT(*) AS n FROM users WHERE email = 'otro@example.com'`)).toEqual({ n: 0 });

    expect((await remove(adminId).expect(409)).body.code).toBe('self_action');

    // Otro administrador (promovido por el superadministrador): un administrador no puede eliminarlo.
    await sa.agent.patch(`/api/admin/users/${userId}/role`).set('X-Requested-With', 'ocryon').send({ role: 'admin' }).expect(200);
    expect((await remove(userId).expect(403)).body.code).toBe('forbidden');
    expect(await db.one('SELECT COUNT(*) AS n FROM users WHERE id = ?', [userId])).toEqual({ n: 1 });
    // El superadministrador sí.
    await sa.agent.delete(`/api/admin/users/${userId}`).set('X-Requested-With', 'ocryon').expect(204);
    expect(await db.one('SELECT COUNT(*) AS n FROM admin_audit_log WHERE action = ?', ['delete_user'])).toEqual({ n: 1 });
  });

  it('nadie puede eliminar, degradar ni cambiar al superadministrador', async () => {
    const { admin, sa } = await withSuperadmin();
    const saId = (await sa.agent.get('/api/auth/me').expect(200)).body.user.id;
    for (const agent of [admin.agent, sa.agent]) {
      for (const role of ['user', 'admin']) {
        const res = await agent.patch(`/api/admin/users/${saId}/role`).set('X-Requested-With', 'ocryon').send({ role });
        expect(res.status).toBe(403);
      }
      expect((await agent.delete(`/api/admin/users/${saId}`).set('X-Requested-With', 'ocryon')).status).toBe(403);
    }
    const res = await sa.agent.delete(`/api/admin/users/${saId}`).set('X-Requested-With', 'ocryon').expect(403);
    expect(res.body.code).toBe('superadmin_protected');
    expect(await db.one(`SELECT role FROM users WHERE id = ?`, [saId])).toEqual({ role: 'superadmin' });
    expect(await db.one('SELECT COUNT(*) AS n FROM admin_audit_log')).toEqual({ n: 0 });
  });

  it('el superadministrador crea administradores (auditado) que entran con el login normal', async () => {
    const { sa } = await withSuperadmin();
    const created = await sa.post('/api/admin/admins', { name: 'Nuevo Admin', email: 'NUEVO@example.com', password: 'temporal123' }).expect(201);
    expect(created.body.user).toMatchObject({ email: 'nuevo@example.com', name: 'Nuevo Admin', role: 'admin', lastLoginAt: null });
    expect(JSON.stringify(created.body)).not.toContain('password');

    const login = await setup().post('/api/auth/login', { email: 'nuevo@example.com', password: 'temporal123' }).expect(200);
    expect(login.body.user.role).toBe('admin');
    expect(await db.one('SELECT COUNT(*) AS n FROM settings WHERE user_id = ?', [created.body.user.id])).toEqual({ n: 1 });

    const audit = (await sa.agent.get('/api/admin/audit').query({ action: 'create_admin' }).expect(200)).body;
    expect(audit.total).toBe(1);
    expect(audit.entries[0]).toMatchObject({
      action: 'create_admin',
      actorEmail: SUPERADMIN_EMAIL,
      targetUserId: created.body.user.id,
      targetEmail: 'nuevo@example.com',
      details: { name: 'Nuevo Admin' },
    });

    expect((await sa.post('/api/admin/admins', { name: 'Otra', email: 'nuevo@example.com', password: 'temporal123' }).expect(409)).body.code).toBe('email_taken');
    await sa.post('/api/admin/admins', { name: 'Otra', email: 'otra@reserved.invalid', password: 'temporal123' }).expect(400);
    await sa.post('/api/admin/admins', { name: 'Otra', email: 'otra@example.com', password: 'corta' }).expect(400);
  });

  it('el administrador lee el texto completo de un escaneo ajeno; nadie más puede', async () => {
    const { admin, user, userPost, userId } = await adminAndUser();
    const long = `${'palabra '.repeat(100)}final`;
    const saved = await userPost('/api/scans', { newGroup: { title: 'Carpeta de Ana' }, items: [{ text: long, engine: 'gemini' }] }).expect(201);
    const scanId = saved.body.ids[0];

    const { body } = await admin.agent.get(`/api/admin/scans/${scanId}`).expect(200);
    expect(body.scan).toMatchObject({ id: scanId, text: long, originalText: null, engine: 'gemini', groupTitle: 'Carpeta de Ana', userId, userEmail: 'ana@example.com', userName: 'Ana' });
    expect(body.scan).not.toHaveProperty('workspaceHtml');

    const denied = await user.get(`/api/admin/scans/${scanId}`).expect(403);
    expect(denied.body.code).toBe('forbidden');
    await request.agent(admin.app).get(`/api/admin/scans/${scanId}`).expect(401);
    await admin.agent.get('/api/admin/scans/9999').expect(404);
  });

  it('registra la fecha del último inicio de sesión', async () => {
    const { admin, userPost, userId } = await adminAndUser();
    await db.run('UPDATE users SET last_login_at = NULL WHERE id = ?', [userId]);
    await userPost('/api/auth/login', { email: 'ana@example.com', password: 'secreto123' }).expect(200);
    const { body } = await admin.agent.get(`/api/admin/users/${userId}`).expect(200);
    expect(body.user.lastLoginAt).toMatch(/Z$/);
  });

  describe('auditoría', () => {
    const audit = (agent: ReturnType<typeof request.agent>, query: object = {}) => agent.get('/api/admin/audit').query(query);

    it('registra la lectura de un escaneo ajeno', async () => {
      const { admin, userPost, userId } = await adminAndUser();
      const saved = await userPost('/api/scans', { items: [{ title: 'Factura', text: 'importe', engine: 'manual' }] }).expect(201);
      const scanId = saved.body.ids[0];
      await admin.agent.get(`/api/admin/scans/${scanId}`).expect(200);
      await admin.agent.get('/api/admin/scans/9999').expect(404);

      const { body } = await audit(admin.agent).expect(200);
      expect(body).toMatchObject({ total: 1, page: 1, pageSize: 20 });
      expect(body.entries[0]).toMatchObject({
        action: 'view_scan',
        actorEmail: ADMIN,
        targetUserId: userId,
        targetEmail: 'ana@example.com',
        targetScanId: scanId,
        targetExists: true,
        details: { title: 'Factura' },
      });
      expect(body.entries[0].createdAt).toMatch(/Z$/);
    });

    it('registra cambios de rol con origen y destino, y filtra y pagina del más reciente al más antiguo', async () => {
      const { admin, userId, sa } = await withSuperadmin();
      const saId = (await sa.agent.get('/api/auth/me')).body.user.id;
      const role = (value: string) => sa.agent.patch(`/api/admin/users/${userId}/role`).set('X-Requested-With', 'ocryon').send({ role: value });
      await role('admin').expect(200);
      await role('admin').expect(200); // sin cambios: no se registra
      await role('user').expect(200);

      const { body } = await audit(admin.agent).expect(200);
      expect(body.total).toBe(2);
      expect(body.entries.map((e: any) => e.details)).toEqual([
        { from: 'admin', to: 'user' },
        { from: 'user', to: 'admin' },
      ]);
      expect(body.entries[0]).toMatchObject({ action: 'change_role', actorId: saId, actorEmail: SUPERADMIN_EMAIL, targetUserId: userId, targetEmail: 'ana@example.com' });

      const paged = (await audit(admin.agent, { page: 2, pageSize: 1 }).expect(200)).body;
      expect(paged.entries.map((e: any) => e.details.to)).toEqual(['admin']);
      expect((await audit(admin.agent, { action: 'delete_user' }).expect(200)).body.total).toBe(0);
      expect((await audit(admin.agent, { actorId: saId, targetUserId: userId }).expect(200)).body.total).toBe(2);
      expect((await audit(admin.agent, { targetUserId: saId }).expect(200)).body.total).toBe(0);
      await audit(admin.agent, { action: 'otra' }).expect(400);
    });

    it('el registro sobrevive al borrado del afectado y del actor', async () => {
      const { admin, userPost, userId, sa } = await withSuperadmin();
      const adminId = (await admin.agent.get('/api/auth/me')).body.user.id;
      const saved = await userPost('/api/scans', { items: [{ title: 'Nota', text: 'texto', engine: 'manual' }] }).expect(201);
      await admin.agent.get(`/api/admin/scans/${saved.body.ids[0]}`).expect(200);
      // El superadministrador elimina al administrador que leyó el escaneo.
      await sa.agent.delete(`/api/admin/users/${adminId}`).set('X-Requested-With', 'ocryon').expect(204);

      const { body } = await audit(sa.agent).expect(200);
      expect(body.total).toBe(2);
      const [deletion, reading] = body.entries;
      expect(deletion).toMatchObject({ action: 'delete_user', actorEmail: SUPERADMIN_EMAIL, targetUserId: adminId, targetEmail: ADMIN, targetExists: false, details: { role: 'admin' } });
      // El actor borrado queda con actor_id NULL pero conserva su correo.
      expect(reading).toMatchObject({ action: 'view_scan', actorId: null, actorEmail: ADMIN, targetUserId: userId });
    });

    it('un borrado cuyo registro falla se deshace entero', async () => {
      const { admin, userId } = await adminAndUser();
      await db.run(`ALTER TABLE admin_audit_log ADD CONSTRAINT audit_test_block CHECK (action <> 'delete_user')`);
      try {
        await admin.agent.delete(`/api/admin/users/${userId}`).set('X-Requested-With', 'ocryon').expect(500);
      } finally {
        await db.run('ALTER TABLE admin_audit_log DROP CONSTRAINT audit_test_block');
      }
      expect(await db.one('SELECT COUNT(*) AS n FROM users WHERE id = ?', [userId])).toEqual({ n: 1 });
    });

    it('un administrador degradado durante la petición no puede eliminar a nadie (403) y nada se registra', async () => {
      const { userId } = await adminAndUser();
      const adminId = (await db.one<{ id: number }>('SELECT id FROM users WHERE email = ?', [ADMIN]))!.id;
      // La sesión se validó cuando aún era administrador (el middleware ve un rol desfasado);
      // entre tanto el superadministrador lo degradó. Solo la comprobación dentro de la transacción lo detiene.
      const staleSession: Database = {
        ...db,
        one: (sql, params) =>
          sql.startsWith('SELECT id, email, name, role FROM users')
            ? db.one(sql, params).then((u) => (u ? ({ ...u, role: 'admin' } as never) : undefined))
            : db.one(sql, params),
      };
      const stale = request.agent(
        createApp({
          db: staleSession,
          cipher: createCipher('test-secret-key-123456'),
          jwtSecret: 'test-jwt-secret-123456',
          secureCookies: false,
          fallbackKeys: { ocrspace: '', gemini: '' },
        }),
      );
      await stale.post('/api/auth/login').set('X-Requested-With', 'ocryon').send({ email: ADMIN, password: 'secreto123' }).expect(200);
      await db.run(`UPDATE users SET role = 'user' WHERE id = ?`, [adminId]);
      const res = await stale.delete(`/api/admin/users/${userId}`).set('X-Requested-With', 'ocryon');
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('forbidden');
      expect(await db.one('SELECT COUNT(*) AS n FROM users WHERE id = ?', [userId])).toEqual({ n: 1 });
      expect(await db.one('SELECT COUNT(*) AS n FROM admin_audit_log')).toEqual({ n: 0 });
    });

    it('no se puede modificar ni borrar el registro desde la API', async () => {
      const { admin, user, userPost } = await adminAndUser();
      await audit(user).expect(403);
      await audit(request.agent(admin.app)).expect(401);
      const saved = await userPost('/api/scans', { items: [{ text: 'algo', engine: 'manual' }] }).expect(201);
      await admin.agent.get(`/api/admin/scans/${saved.body.ids[0]}`).expect(200);
      for (const method of ['post', 'put', 'patch', 'delete'] as const) {
        for (const url of ['/api/admin/audit', '/api/admin/audit/1']) {
          const res = await admin.agent[method](url).set('X-Requested-With', 'ocryon').send({ action: 'view_scan' });
          expect(res.status).toBe(404);
        }
      }
      expect(await db.one('SELECT COUNT(*) AS n FROM admin_audit_log')).toEqual({ n: 1 });
    });
  });
});

describe('operadores, roles y desactivación', () => {
  type Session = ReturnType<typeof setup> & { id: number };
  const H = { 'X-Requested-With': 'ocryon' };

  /** Registra una cuenta y, si hace falta, le asigna el rol directamente en la base. */
  async function account(email: string, role: 'user' | 'operator' | 'admin' = 'user'): Promise<Session> {
    const s = setup();
    const { body } = await s.post('/api/auth/register', { name: email.split('@')[0], email, password: 'secreto123' }).expect(201);
    if (role !== 'user') await db.run('UPDATE users SET role = ? WHERE id = ?', [role, body.user.id]);
    return { ...s, id: body.user.id as number };
  }

  const deactivate = (s: ReturnType<typeof setup>, id: number, body: object = {}) => s.post(`/api/admin/users/${id}/deactivate`, body);
  const reactivate = (s: ReturnType<typeof setup>, id: number) => s.post(`/api/admin/users/${id}/reactivate`);
  const setRole = (s: ReturnType<typeof setup>, id: number, role: string) => s.agent.patch(`/api/admin/users/${id}/role`).set(H).send({ role });
  const auditRows = () =>
    db.query('SELECT action, actor_email AS "actorEmail", target_user_id AS "targetUserId", details FROM admin_audit_log ORDER BY id');

  it('el operador solo ve el listado parcial de usuarios; el resto del panel le responde 403', async () => {
    const op = await account('op@example.com', 'operator');
    const ana = await account('ana@example.com');
    await account('adm@example.com', 'admin');
    await account('op2@example.com', 'operator');
    const saved = await ana.post('/api/scans', { newGroup: { title: 'Carpeta reservada' }, items: [{ title: 'Título reservado', text: 'texto reservado', engine: 'manual' }] }).expect(201);
    const scanId = saved.body.ids[0];

    const denied = [
      ['get', '/api/admin/stats'],
      ['get', '/api/admin/audit'],
      ['get', '/api/admin/scans'],
      ['get', `/api/admin/scans/${scanId}`],
      ['get', `/api/admin/users/${ana.id}`],
      ['get', `/api/admin/users/${ana.id}/scans`],
      ['patch', `/api/admin/users/${ana.id}/role`],
      ['delete', `/api/admin/users/${ana.id}`],
      ['post', '/api/admin/admins'],
    ] as const;
    for (const [method, url] of denied) {
      const res = await op.agent[method](url).set(H).send({ role: 'operator', name: 'Otro', email: 'otro@example.com', password: 'secreto123' });
      expect(res.status, `${method} ${url}`).toBe(403);
      expect(res.body.code).toBe('forbidden');
    }

    const list = (await op.agent.get('/api/admin/users').expect(200)).body;
    // Solo cuentas de usuario normal, y solo las columnas parciales.
    expect(list).toMatchObject({ total: 1, page: 1, pageSize: 20 });
    expect(list.users).toEqual([
      {
        id: ana.id,
        name: 'ana',
        email: 'ana@example.com',
        createdAt: expect.stringMatching(/Z$/),
        lastLoginAt: expect.stringMatching(/Z$/),
        disabledAt: null,
        scanCount: 1,
        lastScanAt: expect.stringMatching(/Z$/),
      },
    ]);
    expect(JSON.stringify(list)).not.toMatch(/reservad|wordCount|"role"|preview|text/);
    expect((await op.agent.get('/api/admin/users').query({ role: 'admin' }).expect(200)).body.total).toBe(0);
    expect(await db.one('SELECT role FROM users WHERE id = ?', [ana.id])).toEqual({ role: 'user' });
    expect(await auditRows()).toEqual([]);
  });

  it('el operador desactiva y reactiva usuarios normales, pero no a operadores, administradores, a sí mismo ni al superadministrador', async () => {
    const op = await account('op@example.com', 'operator');
    const ana = await account('ana@example.com');
    const op2 = await account('op2@example.com', 'operator');
    const adm = await account('adm@example.com', 'admin');
    const sa = await superadminSession(op.app);
    const saId = (await sa.agent.get('/api/auth/me')).body.user.id;

    const off = await deactivate(op, ana.id, { reason: 'Cuenta duplicada' }).expect(200);
    expect(off.body.user).toMatchObject({ id: ana.id, disabledAt: expect.stringMatching(/Z$/) });
    expect(off.body.user).not.toHaveProperty('role');
    // Repetir no cambia nada ni se vuelve a registrar.
    await deactivate(op, ana.id).expect(200);

    for (const target of [op2.id, adm.id]) {
      expect((await deactivate(op, target).expect(403)).body.code).toBe('forbidden');
      expect((await reactivate(op, target).expect(403)).body.code).toBe('forbidden');
    }
    expect((await deactivate(op, op.id).expect(409)).body.code).toBe('self_action');
    for (const s of [op, adm, sa]) {
      expect((await deactivate(s, saId).expect(403)).body.code).toBe('superadmin_protected');
    }
    expect((await deactivate(adm, adm.id).expect(409)).body.code).toBe('self_action');
    await deactivate(op, 9999).expect(404);
    expect((await deactivate(op, ana.id, { reason: 'x'.repeat(501) })).status).toBe(400);

    const on = await reactivate(op, ana.id).expect(200);
    expect(on.body.user.disabledAt).toBeNull();
    expect(await db.one('SELECT disabled_by AS "by", disabled_reason AS reason FROM users WHERE id = ?', [ana.id])).toEqual({ by: null, reason: null });

    expect(await auditRows()).toEqual([
      { action: 'deactivate_user', actorEmail: 'op@example.com', targetUserId: ana.id, details: { role: 'user', reason: 'Cuenta duplicada' } },
      { action: 'reactivate_user', actorEmail: 'op@example.com', targetUserId: ana.id, details: { role: 'user' } },
    ]);
    expect(await db.one(`SELECT COUNT(*) AS n FROM users WHERE disabled_at IS NOT NULL`)).toEqual({ n: 0 });
  });

  it('el administrador desactiva operadores pero no administradores; el superadministrador sí', async () => {
    const adm = await account('adm@example.com', 'admin');
    const op = await account('op@example.com', 'operator');
    const adm2 = await account('adm2@example.com', 'admin');
    const sa = await superadminSession(adm.app);

    expect((await deactivate(adm, op.id).expect(200)).body.user).toMatchObject({ role: 'operator', disabledAt: expect.any(String), disabledByEmail: 'adm@example.com' });
    expect((await deactivate(adm, adm2.id).expect(403)).body.code).toBe('forbidden');
    await deactivate(sa, adm2.id, { reason: 'Baja temporal' }).expect(200);
    await adm2.agent.get('/api/admin/users').expect(401);
    await reactivate(sa, adm2.id).expect(200);
    await adm2.post('/api/auth/login', { email: 'adm2@example.com', password: 'secreto123' }).expect(200);
    await adm2.agent.get('/api/admin/users').expect(200);
  });

  it('el administrador asigna el rol de operador pero no el de administrador; el superadministrador asigna todos', async () => {
    const adm = await account('adm@example.com', 'admin');
    const ana = await account('ana@example.com');
    const adm2 = await account('adm2@example.com', 'admin');
    const sa = await superadminSession(adm.app);

    expect((await setRole(adm, ana.id, 'operator').expect(200)).body.user.role).toBe('operator');
    expect((await ana.agent.get('/api/auth/me')).body.user.role).toBe('operator');
    // Ya operadora, entra al listado parcial.
    await ana.agent.get('/api/admin/users').expect(200);
    await setRole(adm, ana.id, 'user').expect(200);
    expect((await setRole(adm, ana.id, 'admin').expect(403)).body.code).toBe('forbidden');
    expect((await setRole(adm, adm2.id, 'operator').expect(403)).body.code).toBe('forbidden');
    expect((await setRole(adm, adm2.id, 'user').expect(403)).body.code).toBe('forbidden');
    await setRole(adm, ana.id, 'superadmin').expect(400);

    for (const role of ['operator', 'admin', 'user']) {
      expect((await setRole(sa, ana.id, role).expect(200)).body.user.role).toBe(role);
    }
    await setRole(sa, adm2.id, 'operator').expect(200);
    await setRole(sa, ana.id, 'superadmin').expect(400);

    const changes = (await auditRows()).map((r: any) => [r.actorEmail, r.details.from, r.details.to]);
    expect(changes).toEqual([
      ['adm@example.com', 'user', 'operator'],
      ['adm@example.com', 'operator', 'user'],
      [SUPERADMIN_EMAIL, 'user', 'operator'],
      [SUPERADMIN_EMAIL, 'operator', 'admin'],
      [SUPERADMIN_EMAIL, 'admin', 'user'],
      [SUPERADMIN_EMAIL, 'admin', 'operator'],
    ]);
  });

  it('una cuenta desactivada pierde sus sesiones al momento, no puede entrar y conserva sus datos hasta reactivarla', async () => {
    const adm = await account('adm@example.com', 'admin');
    const ana = await account('ana@example.com');
    await ana.post('/api/scans', { items: [{ text: 'mis apuntes', engine: 'manual' }] }).expect(201);
    const other = setup();
    await other.post('/api/auth/login', { email: 'ana@example.com', password: 'secreto123' }).expect(200);

    await deactivate(adm, ana.id).expect(200);
    await ana.agent.get('/api/auth/me').expect(401);
    await other.agent.get('/api/scans').expect(401);

    const denied = await setup().post('/api/auth/login', { email: 'ana@example.com', password: 'secreto123' }).expect(403);
    expect(denied.body).toEqual({ error: 'Tu cuenta está desactivada. Contacta con un administrador.', code: 'account_disabled' });
    // Con la contraseña incorrecta no se revela el estado de la cuenta.
    const wrong = await setup().post('/api/auth/login', { email: 'ana@example.com', password: 'otra-clave' }).expect(401);
    expect(wrong.body.code).toBe('invalid_credentials');
    expect(await db.one('SELECT COUNT(*) AS n FROM scans WHERE user_id = ?', [ana.id])).toEqual({ n: 1 });
    // Una sesión firmada aunque sea con la versión actual tampoco vale mientras esté desactivada.
    const { v } = (await db.one<{ v: number }>('SELECT credentials_version AS v FROM users WHERE id = ?', [ana.id]))!;
    expect(v).toBe(1);
    const forged = jwt.sign({ sub: String(ana.id), v }, 'test-jwt-secret-123456', { expiresIn: '1h' });
    await request(ana.app).get('/api/auth/me').set('Cookie', `ocryon_session=${forged}`).expect(401);

    await reactivate(adm, ana.id).expect(200);
    const back = setup();
    await back.post('/api/auth/login', { email: 'ana@example.com', password: 'secreto123' }).expect(200);
    const scans = (await back.agent.get('/api/scans').expect(200)).body;
    expect(scans.scans.map((s: any) => s.text)).toEqual(['mis apuntes']);
  });

  it('pagina, filtra y ordena el listado de usuarios con una lista cerrada de órdenes', async () => {
    const adm = await account('adm@example.com', 'admin');
    const u1 = await account('u1@example.com');
    const u2 = await account('u2@example.com');
    const u3 = await account('u3@example.com');
    await u2.post('/api/scans', { items: [{ text: 'a', engine: 'manual' }, { text: 'b', engine: 'manual' }] }).expect(201);
    await u3.post('/api/scans', { items: [{ text: 'c', engine: 'manual' }] }).expect(201);
    await db.run(
      `UPDATE users SET last_login_at = CASE id WHEN ? THEN '2020-01-01'::timestamptz WHEN ? THEN '2024-01-01'::timestamptz ELSE '2021-01-01'::timestamptz END`,
      [adm.id, u1.id],
    );
    await db.run(`UPDATE scans SET created_at = now() - interval '1 hour' WHERE user_id = ?`, [u2.id]);
    await setRole(adm, u3.id, 'operator').expect(200);
    await deactivate(adm, u1.id).expect(200);

    const emails = async (query: object) => (await adm.agent.get('/api/admin/users').query(query).expect(200)).body.users.map((u: any) => u.email.split('@')[0]);
    expect(await emails({ sort: 'recent' })).toEqual(['u3', 'u2', 'u1', 'adm']);
    expect(await emails({ sort: 'scans' })).toEqual(['u2', 'u3', 'u1', 'adm']);
    expect(await emails({ sort: 'activity' })).toEqual(['u3', 'u2', 'u1', 'adm']);
    expect(await emails({ status: 'disabled' })).toEqual(['u1']);
    expect(await emails({ status: 'active', sort: 'scans' })).toEqual(['u2', 'u3', 'adm']);
    expect(await emails({ role: 'operator' })).toEqual(['u3']);
    expect(await emails({ q: 'U2' })).toEqual(['u2']);

    const paged = (await adm.agent.get('/api/admin/users').query({ sort: 'scans', page: 2, pageSize: 2 }).expect(200)).body;
    expect(paged).toMatchObject({ total: 4, page: 2, pageSize: 2 });
    expect(paged.users.map((u: any) => u.email)).toEqual(['u1@example.com', 'adm@example.com']);
    expect(paged.users[0]).toMatchObject({ disabledAt: expect.any(String), role: 'user', wordCount: 0 });

    for (const query of [{ sort: 'email' }, { sort: 'created_at; DROP TABLE users' }, { status: 'todos' }, { pageSize: 101 }, { page: 0 }]) {
      const res = await adm.agent.get('/api/admin/users').query(query);
      expect(res.status, JSON.stringify(query)).toBe(400);
    }
    expect(await db.one('SELECT COUNT(*) AS n FROM users')).toEqual({ n: 4 });
  });

  it('busca y filtra los escaneos de un usuario y los agrupa por carpeta', async () => {
    const adm = await account('adm@example.com', 'admin');
    const ana = await account('ana@example.com');
    await ana.post('/api/scans', { newGroup: { title: 'Zeta' }, items: [{ text: 'manzana verde', engine: 'ocrspace' }] }).expect(201);
    await ana.post('/api/scans', { newGroup: { title: 'Alfa' }, items: [{ text: 'pera', engine: 'ocrspace' }] }).expect(201);
    await ana.post('/api/scans', { items: [{ title: 'Árbol', text: 'manzana roja', engine: 'gemini' }] }).expect(201);
    const scans = (query: object) => adm.agent.get(`/api/admin/users/${ana.id}/scans`).query(query);

    expect((await scans({ q: 'MANZ' }).expect(200)).body.total).toBe(2);
    expect((await scans({ q: 'arbol' }).expect(200)).body.scans.map((s: any) => s.title)).toEqual(['Árbol']);
    expect((await scans({ engine: 'gemini' }).expect(200)).body.total).toBe(1);
    expect((await scans({ from: new Date(Date.now() + 60_000).toISOString() }).expect(200)).body.total).toBe(0);
    expect((await scans({ sort: 'group' }).expect(200)).body.scans.map((s: any) => s.groupTitle)).toEqual(['Alfa', 'Zeta', null]);
    await scans({ sort: 'title' }).expect(400);
    await scans({ engine: 'otro' }).expect(400);
  });

  it('filtra la auditoría por actor, afectado y fechas', async () => {
    const adm = await account('adm@example.com', 'admin');
    const ana = await account('ana@example.com');
    const beto = await account('beto@example.com');
    await deactivate(adm, ana.id).expect(200);
    await deactivate(adm, beto.id).expect(200);
    await reactivate(adm, beto.id).expect(200);
    const audit = async (query: object) => (await adm.agent.get('/api/admin/audit').query(query).expect(200)).body.total;

    expect(await audit({ actor: 'ADM@' })).toBe(3);
    expect(await audit({ actor: 'nadie' })).toBe(0);
    expect(await audit({ target: 'beto' })).toBe(2);
    expect(await audit({ target: 'beto', action: 'reactivate_user' })).toBe(1);
    expect(await audit({ action: 'deactivate_user' })).toBe(2);
    expect(await audit({ from: new Date(Date.now() + 60_000).toISOString() })).toBe(0);
    expect(await audit({ to: new Date(Date.now() + 60_000).toISOString() })).toBe(3);
    expect(await audit({ target: '100%' })).toBe(0);
    await adm.agent.get('/api/admin/audit').query({ from: 'ayer' }).expect(400);
  });
});

describe('superadministrador', () => {
  const login = (s: ReturnType<typeof setup>, body: object) => s.post('/api/auth/superadmin/login', body);

  it('al arrancar crea el superadministrador y después aplica la rotación de credenciales', async () => {
    expect(await syncSuperadmin(db, saCreds)).toBe('created');
    const row = await db.one<Record<string, unknown>>(`SELECT id, email, name, username, role FROM users WHERE role = 'superadmin'`);
    expect(row).toMatchObject({ email: SUPERADMIN_EMAIL, name: 'Superadministrador', username: SA.username, role: 'superadmin' });
    expect(await db.one('SELECT COUNT(*) AS n FROM settings WHERE user_id = ?', [row!.id])).toEqual({ n: 1 });

    // Rotación: nuevo usuario, contraseña y PIN; el bloqueo se levanta y los datos anteriores dejan de valer.
    await db.run(`UPDATE users SET failed_attempts = 5, locked_until = now() + interval '10 minutes' WHERE id = ?`, [row!.id]);
    const rotated = { username: 'sa-rotado99', passwordHash: await bcrypt.hash('Otra-Clave-Larga-456?', 4), pinHash: await bcrypt.hash('ZZZZ22223333', 4) };
    expect(await syncSuperadmin(db, rotated)).toBe('updated');
    expect(await db.one(`SELECT id, username, failed_attempts AS "failedAttempts", locked_until AS "lockedUntil" FROM users WHERE role = 'superadmin'`)).toEqual({
      id: row!.id,
      username: 'sa-rotado99',
      failedAttempts: 0,
      lockedUntil: null,
    });
    const s = setup();
    await login(s, SA).expect(401);
    await login(s, { username: 'sa-rotado99', password: 'Otra-Clave-Larga-456?', pin: 'zzzz22223333' }).expect(200);
  });

  it('rotar la contraseña o el PIN cierra sus sesiones; reiniciar sin cambios no', async () => {
    const s = await superadminSession();
    // Reinicio con las mismas credenciales: la sesión sigue viva.
    expect(await syncSuperadmin(db, saCreds)).toBe('updated');
    await s.agent.get('/api/auth/me').expect(200);
    // Solo cambia el PIN: la sesión anterior deja de valer.
    const newPin = 'ZZZZ22223333';
    expect(await syncSuperadmin(db, { ...saCreds, pinHash: await bcrypt.hash(newPin, 4) })).toBe('updated');
    await s.agent.get('/api/auth/me').expect(401);
    const fresh = setup();
    await login(fresh, { ...SA, pin: newPin }).expect(200);
    await fresh.agent.get('/api/auth/me').expect(200);
    expect(await db.one(`SELECT credentials_version AS v FROM users WHERE role = 'superadmin'`)).toEqual({ v: 1 });
  });

  it('su sesión caduca a las 12 horas', async () => {
    await syncSuperadmin(db, saCreds);
    const res = await login(setup(), SA).expect(200);
    const cookie = String(res.headers['set-cookie']);
    const token = /ocryon_session=([^;]+)/.exec(cookie)![1];
    const payload = jwt.decode(token) as jwt.JwtPayload;
    expect(payload.exp! - payload.iat!).toBe(12 * 60 * 60);
    expect(payload.v).toBe(0);
    expect(cookie).toMatch(/Max-Age=43200/);
  });

  it('si una cuenta normal ya usa el correo reservado, arranca sin superadministrador y no la toca', async () => {
    const hash = await bcrypt.hash('secreto123', 4);
    await db.run(`INSERT INTO users (email, name, password_hash) VALUES (?, 'Ana', ?)`, [SUPERADMIN_EMAIL, hash]);
    const before = await db.one(`SELECT * FROM users WHERE email = ?`, [SUPERADMIN_EMAIL]);
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args.join(' '));
    try {
      expect(await syncSuperadmin(db, saCreds)).toBe('conflict');
    } finally {
      console.error = original;
    }
    expect(String(errors[0])).toMatch(/no se sincroniza el superadministrador/);
    expect(await db.one(`SELECT * FROM users WHERE email = ?`, [SUPERADMIN_EMAIL])).toEqual(before);
    expect(await db.one(`SELECT COUNT(*) AS n FROM users WHERE role = 'superadmin'`)).toEqual({ n: 0 });
    // La app sigue sirviendo a los usuarios normales.
    await setup().post('/api/auth/login', { email: SUPERADMIN_EMAIL, password: 'secreto123' }).expect(200);
    await login(setup(), SA).expect(401);
  });

  it('valida las variables de entorno', () => {
    expect(parseSuperadminEnv({})).toBeUndefined();
    expect(parseSuperadminEnv({ SUPERADMIN_USERNAME: SA.username, SUPERADMIN_PASSWORD_HASH: ` ${saCreds.passwordHash} `, SUPERADMIN_PIN_HASH: `'${saCreds.pinHash}'` })).toEqual(saCreds);
    expect(() => parseSuperadminEnv({ SUPERADMIN_USERNAME: SA.username })).toThrow(/juntas/);
    expect(() => parseSuperadminEnv({ SUPERADMIN_USERNAME: 'A!', SUPERADMIN_PASSWORD_HASH: saCreds.passwordHash, SUPERADMIN_PIN_HASH: saCreds.pinHash })).toThrow(/SUPERADMIN_USERNAME/);
    expect(() => parseSuperadminEnv({ SUPERADMIN_USERNAME: SA.username, SUPERADMIN_PASSWORD_HASH: 'texto-plano', SUPERADMIN_PIN_HASH: saCreds.pinHash })).toThrow(/SUPERADMIN_PASSWORD_HASH/);
  });

  it('entra con usuario, contraseña y PIN correctos, y el PIN no distingue mayúsculas', async () => {
    await syncSuperadmin(db, saCreds);
    const s = setup();
    const res = await login(s, { ...SA, username: SA.username.toUpperCase(), pin: SA.pin.toLowerCase() }).expect(200);
    expect(res.body.user).toEqual({ id: expect.any(Number), email: SUPERADMIN_EMAIL, name: 'Superadministrador', role: 'superadmin' });
    expect(JSON.stringify(res.body)).not.toMatch(/hash|failed|pin/i);
    expect((await s.agent.get('/api/auth/me').expect(200)).body.user.role).toBe('superadmin');
    // Cuenta como administrador en todo el panel.
    await s.agent.get('/api/admin/stats').expect(200);
    const users = (await s.agent.get('/api/admin/users').expect(200)).body;
    expect(JSON.stringify(users)).not.toMatch(/hash|failed_attempts|locked|username/i);
    expect(await db.one(`SELECT last_login_at IS NOT NULL AS ok FROM users WHERE role = 'superadmin'`)).toEqual({ ok: true });
  });

  it('responde el mismo error genérico con contraseña, PIN o usuario incorrectos', async () => {
    await syncSuperadmin(db, saCreds);
    const s = setup();
    const attempts = [
      { ...SA, password: 'otra-clave' },
      { ...SA, pin: 'ABCDEFGH9999' },
      { ...SA, username: 'sa-noexiste' },
      { ...SA, pin: 'corto' },
    ];
    for (const body of attempts) {
      const res = await login(s, body).expect(401);
      expect(res.body).toEqual({ error: 'Credenciales no válidas', code: 'invalid_credentials' });
    }
    // Solo cuentan los fallos con el usuario correcto y un PIN con formato válido.
    expect(await db.one(`SELECT failed_attempts AS n FROM users WHERE role = 'superadmin'`)).toEqual({ n: 2 });
    await login(s, SA).expect(200);
    expect(await db.one(`SELECT failed_attempts AS n FROM users WHERE role = 'superadmin'`)).toEqual({ n: 0 });
  });

  it('bloquea la cuenta 15 minutos tras 5 fallos seguidos, aunque después acierte', async () => {
    await syncSuperadmin(db, saCreds);
    const s = setup();
    for (let i = 0; i < 5; i++) await login(s, { ...SA, password: `mala-${i}` }).expect(401);
    // Bloqueada responde el mismo 401 genérico: no confirma que el usuario exista.
    const locked = await login(s, SA).expect(401);
    expect(locked.body).toEqual({ error: 'Credenciales no válidas', code: 'invalid_credentials' });
    const row = await db.one<{ minutes: number }>(`SELECT round(extract(epoch FROM locked_until - now()) / 60) AS minutes FROM users WHERE role = 'superadmin'`);
    expect(Number(row!.minutes)).toBe(15);
    expect(await db.one(`SELECT last_login_at AS t FROM users WHERE role = 'superadmin'`)).toEqual({ t: null });

    // Vencido el bloqueo, vuelve a entrar y el contador se reinicia.
    await db.run(`UPDATE users SET locked_until = now() - interval '1 second' WHERE role = 'superadmin'`);
    await login(s, SA).expect(200);
    expect(await db.one(`SELECT failed_attempts AS n, locked_until AS l FROM users WHERE role = 'superadmin'`)).toEqual({ n: 0, l: null });
  });

  it('intentos fallidos simultáneos se cuentan uno a uno y bloquean la cuenta', async () => {
    await syncSuperadmin(db, saCreds);
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => login(setup(), { ...SA, password: `mala-${i}` })));
    expect(results.map((r) => r.status)).toEqual(Array(8).fill(401));
    const row = await db.one<{ n: number; locked: boolean }>(
      `SELECT failed_attempts AS n, locked_until > now() AS locked FROM users WHERE role = 'superadmin'`,
    );
    // Los 5 primeros cuentan y bloquean; los demás llegan con la cuenta ya bloqueada y no suman.
    expect(row).toEqual({ n: 5, locked: true });
    // Con la cuenta bloqueada, ni las credenciales correctas (ni en paralelo) abren sesión.
    const correct = await Promise.all([login(setup(), SA), login(setup(), SA)]);
    expect(correct.map((r) => r.status)).toEqual([401, 401]);
    expect(await db.one(`SELECT last_login_at AS t FROM users WHERE role = 'superadmin'`)).toEqual({ t: null });
  });

  it('el login normal rechaza al superadministrador y no puede cambiar su contraseña', async () => {
    await syncSuperadmin(db, saCreds);
    const s = setup();
    const normal = await s.post('/api/auth/login', { email: SUPERADMIN_EMAIL, password: SA.password }).expect(401);
    expect(normal.body.code).toBe('invalid_credentials');
    await login(s, SA).expect(200);
    const res = await s.post('/api/auth/change-password', { currentPassword: SA.password, newPassword: 'nueva-clave-123' }).expect(403);
    expect(res.body.error).toMatch(/servidor/);
    expect(await bcrypt.compare(SA.password, (await db.one<{ h: string }>(`SELECT password_hash AS h FROM users WHERE role = 'superadmin'`))!.h)).toBe(true);
  });

  it('rechaza registrar correos del dominio reservado .invalid', async () => {
    const s = setup();
    for (const email of [SUPERADMIN_EMAIL, 'ana@algo.invalid', 'ANA@INVALID']) {
      await s.post('/api/auth/register', { name: 'Ana', email, password: 'secreto123' }).expect(400);
    }
    expect(isReservedEmail('ana@invalid.example.com')).toBe(false);
  });

  it('solo puede existir un superadministrador', async () => {
    await syncSuperadmin(db, saCreds);
    await expect(db.run(`INSERT INTO users (email, name, password_hash, role) VALUES ('otro@example.com', 'Otro', 'x', 'superadmin')`)).rejects.toThrow();
    await expect(db.run(`INSERT INTO users (email, name, password_hash, role) VALUES ('raro@example.com', 'Raro', 'x', 'root')`)).rejects.toThrow();
    expect(await db.one(`SELECT COUNT(*) AS n FROM users WHERE role = 'superadmin'`)).toEqual({ n: 1 });
  });
});
