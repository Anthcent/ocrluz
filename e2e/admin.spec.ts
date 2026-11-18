import { expect, test, type Browser } from '@playwright/test';
import { createScans, expectToast, isMobile, signUp } from './helpers';

const HEADERS = { 'X-Requested-With': 'ocryon' };

// Credenciales fijas SOLO de prueba: sus hashes están en playwright.config.ts (SUPERADMIN_*).
const SUPERADMIN = { username: 'sa-e2etest', password: 'E2e-Solo-Pruebas-123!', pin: 'E2EPRUEBA234' };
const ADMIN_PASSWORD = 'temporal123';

let seq = 0;
const uniqueEmail = (prefix: string) => `${prefix}-${Date.now()}-${++seq}@example.com`;

/** El superadministrador crea un administrador por API desde un contexto aparte. */
async function createAdminViaApi(browser: Browser, name: string) {
  const context = await browser.newContext();
  const login = await context.request.post('/api/auth/superadmin/login', { headers: HEADERS, data: SUPERADMIN });
  expect(login.status()).toBe(200);
  const email = uniqueEmail('admin');
  const res = await context.request.post('/api/admin/admins', { headers: HEADERS, data: { name, email, password: ADMIN_PASSWORD } });
  expect(res.status()).toBe(201);
  expect((await res.json()).user.role).toBe('admin');
  await context.close();
  return email;
}

test.describe('Administración', () => {
  test('un usuario normal no ve ni abre el panel', async ({ page }) => {
    await signUp(page);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('link', { name: 'Administración' })).toHaveCount(0);
    expect((await page.request.get('/api/admin/stats')).status()).toBe(403);
    expect((await page.request.post('/api/admin/admins', { headers: HEADERS, data: {} })).status()).toBe(403);
  });

  test('el administrador revisa la actividad de un usuario, lee su escaneo y elimina la cuenta', async ({ page, browser }) => {
    const adminEmail = await createAdminViaApi(browser, 'Admin');
    const res = await page.request.post('/api/auth/login', { headers: HEADERS, data: { email: adminEmail, password: ADMIN_PASSWORD } });
    expect(res.status()).toBe(200);
    expect((await res.json()).user.role).toBe('admin');

    // Otra cuenta, con su propio escaneo largo.
    const otherContext = await browser.newContext();
    const otherPage = await otherContext.newPage();
    const other = await signUp(otherPage, 'Carla Revisada');
    const fullText = `${'línea de prueba '.repeat(30)}FIN DEL TEXTO`;
    await createScans(otherPage, { items: [{ title: 'Hoja de Carla', text: fullText, engine: 'manual' }] });
    await otherContext.close();

    // Escritorio: acceso desde el menú lateral. Móvil: desde Ajustes.
    if (isMobile(page)) {
      await page.goto('/ajustes');
      await page.getByRole('link', { name: 'Abrir administración' }).click();
    } else {
      await page.goto('/');
      await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Administración' }).click();
    }
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Administración', level: 1 })).toBeVisible();

    await page.getByRole('searchbox', { name: 'Buscar usuarios por nombre o correo' }).fill(other.email);
    const users = page.getByTestId('admin-users');
    await expect(users.getByRole('link')).toHaveCount(1);
    await users.getByRole('link', { name: /Carla Revisada/ }).click();
    await expect(page.getByRole('heading', { name: 'Carla Revisada', level: 1 })).toBeVisible();

    await page.getByRole('button', { name: 'Leer el texto completo de Hoja de Carla' }).click();
    const dialog = page.getByRole('dialog', { name: 'Hoja de Carla' });
    await expect(dialog.getByLabel('Texto del escaneo')).toContainText('FIN DEL TEXTO');
    await dialog.getByRole('button', { name: 'Cerrar' }).click();

    await page.getByRole('button', { name: 'Eliminar cuenta' }).click();
    const confirm = page.getByRole('dialog', { name: 'Eliminar cuenta' });
    const submit = confirm.getByRole('button', { name: 'Eliminar', exact: true });
    await expect(submit).toBeDisabled();
    await confirm.getByLabel(`Escribe ${other.email} para confirmar`).fill(other.email);
    await submit.click();
    await expectToast(page, 'Cuenta de Carla Revisada eliminada');
    await expect(page).toHaveURL(/\/admin$/);

    // La auditoría conserva la lectura y la eliminación aunque la cuenta ya no exista.
    const audit = page.getByRole('region', { name: 'Auditoría' });
    await expect(audit.getByTestId('admin-audit')).toContainText(`${adminEmail} eliminó la cuenta de ${other.email}`);
    await expect(audit.getByTestId('admin-audit')).toContainText(`${adminEmail} leyó el escaneo «Hoja de Carla» de ${other.email}`);
    await audit.getByRole('button', { name: 'Eliminaciones' }).click();
    await expect(audit.getByTestId('admin-audit')).not.toContainText('leyó el escaneo «Hoja de Carla»');
  });

  test('el superadministrador entra con PIN y crea un administrador que entra con el login normal sin controles de rol', async ({ page, browser }) => {
    // Una cuenta normal para comprobar luego qué controles ve el administrador.
    const otherContext = await browser.newContext();
    const regular = await signUp(await otherContext.newPage(), 'Rita Normal');
    await otherContext.close();

    await page.goto('/login');
    await page.getByRole('link', { name: 'Acceso de superadministrador' }).click();
    await expect(page).toHaveURL(/\/superadmin$/);
    await expect(page.getByRole('heading', { name: 'Acceso de superadministrador', level: 1 })).toBeVisible();

    // Un PIN incorrecto da un error genérico.
    await page.getByLabel('Usuario').fill(SUPERADMIN.username);
    await page.getByLabel('Contraseña').fill(SUPERADMIN.password);
    const pin = page.getByLabel('PIN');
    await pin.fill('zzzzzzzz9999');
    await expect(pin).toHaveValue('ZZZZZZZZ9999');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('alert')).toHaveText('Credenciales no válidas');

    await pin.fill(SUPERADMIN.pin.toLowerCase());
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Administración', level: 1 })).toBeVisible();

    // La cuenta del superadministrador lleva su propia insignia.
    await page.getByRole('searchbox', { name: 'Buscar usuarios por nombre o correo' }).fill('superadmin@ocrluz.invalid');
    await expect(page.getByTestId('admin-users').getByRole('link')).toHaveCount(1);
    await expect(page.getByTestId('admin-users')).toContainText('Superadministrador');

    const admins = page.getByRole('region', { name: 'Administradores' });
    await admins.getByRole('button', { name: 'Crear administrador' }).click();
    const dialog = page.getByRole('dialog', { name: 'Crear administrador' });
    const adminEmail = uniqueEmail('nuevo-admin');
    await dialog.getByLabel('Nombre').fill('Nora Admin');
    await dialog.getByLabel('Correo electrónico').fill(adminEmail);
    await dialog.getByLabel('Contraseña temporal').fill(ADMIN_PASSWORD);
    await dialog.getByRole('button', { name: 'Crear', exact: true }).click();
    await expectToast(page, 'Administrador Nora Admin creado');
    await expect(admins.getByTestId('admin-admins')).toContainText(adminEmail);
    await expect(page.getByRole('region', { name: 'Auditoría' }).getByTestId('admin-audit')).toContainText(
      `superadmin@ocrluz.invalid creó la cuenta de administrador ${adminEmail}`,
    );

    // Ajustes: sin cambio de contraseña para el superadministrador.
    await page.goto('/ajustes');
    await expect(page.getByTestId('superadmin-credentials-note')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cambiar contraseña' })).toHaveCount(0);

    // El nuevo administrador entra con el login normal.
    await page.context().clearCookies();
    await page.goto('/login');
    await page.getByLabel('Correo electrónico').fill(adminEmail);
    await page.getByLabel('Contraseña').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).not.toHaveURL(/\/login$/);

    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Administración', level: 1 })).toBeVisible();
    await expect(page.getByTestId('admin-users')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Administradores' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Crear administrador' })).toHaveCount(0);

    await page.getByRole('searchbox', { name: 'Buscar usuarios por nombre o correo' }).fill(regular.email);
    // Wait for the debounced search: both projects share the database and create a «Rita Normal».
    await expect(page.getByTestId('admin-users').getByRole('link')).toHaveCount(1);
    await page.getByTestId('admin-users').getByRole('link', { name: /Rita Normal/ }).click();
    await expect(page.getByRole('heading', { name: 'Rita Normal', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Eliminar cuenta' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hacer administrador' })).toHaveCount(0);
  });
});
