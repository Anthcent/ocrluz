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

  test('el administrador restablece la contraseña de un usuario, que entra con la temporal y debe cambiarla', async ({ page, browser }) => {
    const adminEmail = await createAdminViaApi(browser, 'Admin Reset');
    const accounts = await browser.newContext();
    const rosa = await signUp(await accounts.newPage(), 'Rosa Olvidadiza');
    await accounts.close();

    expect((await page.request.post('/api/auth/login', { headers: HEADERS, data: { email: adminEmail, password: ADMIN_PASSWORD } })).status()).toBe(200);
    await page.goto('/admin?tab=usuarios');
    await page.getByRole('searchbox', { name: 'Buscar usuarios por nombre o correo' }).fill(rosa.email);
    await expect(page.getByTestId('admin-users').getByRole('link')).toHaveCount(1);
    await page.getByTestId('admin-users').getByRole('link', { name: /Rosa Olvidadiza/ }).click();
    await expect(page.getByRole('heading', { name: 'Rosa Olvidadiza', level: 1 })).toBeVisible();

    await page.getByRole('button', { name: 'Restablecer contraseña' }).click();
    const confirm = page.getByRole('dialog', { name: 'Restablecer contraseña' });
    await expect(confirm).toContainText('Sus sesiones abiertas se cerrarán');
    await confirm.getByRole('button', { name: 'Restablecer', exact: true }).click();

    const result = page.getByRole('dialog', { name: 'Contraseña temporal' });
    await expect(result).toContainText('Compártela por un canal seguro; no se volverá a mostrar');
    const field = result.getByRole('textbox', { name: 'Contraseña temporal' });
    await expect(field).toHaveValue(/^[A-HJ-NP-Za-km-z2-9]{14}$/);
    const temporary = await field.inputValue();
    await result.getByRole('button', { name: 'Listo' }).click();
    await expect(result).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Acciones sobre esta cuenta' }).getByTestId('admin-audit')).toContainText(
      `${adminEmail} restableció la contraseña de ${rosa.email}`,
    );

    // La usuaria entra con la temporal y solo puede cambiarla.
    const rosaContext = await browser.newContext();
    const rosaPage = await rosaContext.newPage();
    await rosaPage.goto('/login');
    await rosaPage.getByLabel('Correo electrónico').fill(rosa.email);
    await rosaPage.getByLabel('Contraseña').fill(temporary);
    await rosaPage.getByRole('button', { name: 'Entrar' }).click();
    await expect(rosaPage).toHaveURL(/\/cambiar-contrasena$/);
    await expect(rosaPage.getByRole('heading', { name: 'Cambiar contraseña', level: 1 })).toBeVisible();
    await rosaPage.goto('/archivo');
    await expect(rosaPage).toHaveURL(/\/cambiar-contrasena$/);
    expect((await rosaPage.request.get('/api/scans')).status()).toBe(403);

    // La temporal no sirve como nueva.
    await rosaPage.getByLabel('Contraseña temporal').fill(temporary);
    await rosaPage.getByLabel(/^Nueva contraseña/).fill(temporary);
    await rosaPage.getByLabel('Repite la nueva contraseña').fill(temporary);
    await rosaPage.getByRole('button', { name: 'Guardar y continuar' }).click();
    await expect(rosaPage.getByRole('alert')).toHaveText('La nueva contraseña debe ser distinta de la temporal');

    await rosaPage.getByLabel(/^Nueva contraseña/).fill('mi-clave-nueva-123');
    await rosaPage.getByLabel('Repite la nueva contraseña').fill('mi-clave-nueva-123');
    await rosaPage.getByRole('button', { name: 'Guardar y continuar' }).click();
    await expect(rosaPage).toHaveURL(/\/$/);
    await expect(rosaPage.getByRole('heading', { name: 'Cambiar contraseña', level: 1 })).toHaveCount(0);
    expect((await rosaPage.request.get('/api/scans')).status()).toBe(200);
    await rosaContext.close();
  });

  test('el superadministrador hace operadora a una usuaria, que desactiva a un usuario y restablece la contraseña de otro', async ({ page, browser }) => {
    // Tres cuentas normales: la futura operadora, el usuario que se desactivará y el que recibirá una temporal.
    const accounts = await browser.newContext();
    const olga = await signUp(await accounts.newPage(), 'Olga Operadora');
    const victor = await signUp(await accounts.newPage(), 'Victor Desactivable');
    const pablo = await signUp(await accounts.newPage(), 'Pablo Olvidadizo');
    await accounts.close();

    // El superadministrador la promueve a operadora desde su ficha.
    expect((await page.request.post('/api/auth/superadmin/login', { headers: HEADERS, data: SUPERADMIN })).status()).toBe(200);
    await page.goto('/admin?tab=usuarios');
    await page.getByRole('searchbox', { name: 'Buscar usuarios por nombre o correo' }).fill(olga.email);
    await expect(page.getByTestId('admin-users').getByRole('link')).toHaveCount(1);
    await page.getByTestId('admin-users').getByRole('link', { name: /Olga Operadora/ }).click();
    await expect(page.getByRole('heading', { name: 'Olga Operadora', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Cambiar rol' }).click();
    await page.getByRole('menuitem', { name: 'Hacer operador' }).click();
    await page.getByRole('dialog', { name: 'Hacer operador' }).getByRole('button', { name: 'Hacer operador' }).click();
    await expectToast(page, 'Olga Operadora ahora es operador');
    await expect(page.getByText('Operador', { exact: true })).toBeVisible();

    // La operadora entra con el login normal y llega a su sección.
    await page.context().clearCookies();
    await page.goto('/login');
    await page.getByLabel('Correo electrónico').fill(olga.email);
    await page.getByLabel('Contraseña').fill(olga.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).not.toHaveURL(/\/login$/);
    if (isMobile(page)) {
      await page.goto('/ajustes');
      await page.getByRole('link', { name: 'Abrir gestión de usuarios' }).click();
    } else {
      await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Gestión de usuarios' }).click();
    }
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Gestión de usuarios', level: 1 })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Secciones de administración' })).toHaveCount(0);
    // El servidor le niega el resto del panel.
    expect((await page.request.get('/api/admin/stats')).status()).toBe(403);
    expect((await page.request.get('/api/admin/audit')).status()).toBe(403);

    // Listado parcial: sin enlace al detalle ni rol; solo desactivar y restablecer la contraseña.
    await page.getByRole('searchbox', { name: 'Buscar usuarios por nombre o correo' }).fill(victor.email);
    const users = page.getByTestId('admin-users');
    await expect(users.getByRole('listitem')).toHaveCount(1);
    await expect(users).toContainText(victor.email);
    await expect(users.getByRole('link')).toHaveCount(0);
    await expect(users).not.toContainText('Usuario');
    await users.getByRole('button', { name: 'Acciones para Victor Desactivable' }).click();
    const menu = page.getByRole('menu', { name: 'Acciones para Victor Desactivable' });
    await expect(menu.getByRole('menuitem')).toHaveText(['Desactivar cuenta', 'Restablecer contraseña']);
    await menu.getByRole('menuitem', { name: 'Desactivar cuenta' }).click();
    const dialog = page.getByRole('dialog', { name: 'Desactivar cuenta' });
    await dialog.getByLabel('Motivo (opcional)').fill('Prueba de desactivación');
    await dialog.getByRole('button', { name: 'Desactivar', exact: true }).click();
    await expectToast(page, 'Cuenta de Victor Desactivable desactivada');
    await expect(users).toContainText('Desactivada');

    // El usuario desactivado ya no puede entrar.
    const victorContext = await browser.newContext();
    const victorPage = await victorContext.newPage();
    await victorPage.goto('/login');
    await victorPage.getByLabel('Correo electrónico').fill(victor.email);
    await victorPage.getByLabel('Contraseña').fill(victor.password);
    await victorPage.getByRole('button', { name: 'Entrar' }).click();
    await expect(victorPage.getByText('Tu cuenta está desactivada. Contacta con un administrador.')).toBeVisible();
    await expect(victorPage).toHaveURL(/\/login$/);
    await victorContext.close();

    // La operadora restablece la contraseña de otro usuario desde el menú.
    await page.getByRole('searchbox', { name: 'Buscar usuarios por nombre o correo' }).fill(pablo.email);
    await expect(users).toContainText(pablo.email);
    await expect(users.getByRole('listitem')).toHaveCount(1);
    await users.getByRole('button', { name: 'Acciones para Pablo Olvidadizo' }).click();
    await page.getByRole('menu', { name: 'Acciones para Pablo Olvidadizo' }).getByRole('menuitem', { name: 'Restablecer contraseña' }).click();
    await page.getByRole('dialog', { name: 'Restablecer contraseña' }).getByRole('button', { name: 'Restablecer', exact: true }).click();
    const result = page.getByRole('dialog', { name: 'Contraseña temporal' });
    const field = result.getByRole('textbox', { name: 'Contraseña temporal' });
    await expect(field).toHaveValue(/^[A-HJ-NP-Za-km-z2-9]{14}$/);
    const temporary = await field.inputValue();
    await result.getByRole('button', { name: 'Listo' }).click();
    await expect(result).toHaveCount(0);

    // Pablo entra con la temporal y debe cambiarla antes de seguir.
    const pabloContext = await browser.newContext();
    const pabloPage = await pabloContext.newPage();
    await pabloPage.goto('/login');
    await pabloPage.getByLabel('Correo electrónico').fill(pablo.email);
    await pabloPage.getByLabel('Contraseña').fill(temporary);
    await pabloPage.getByRole('button', { name: 'Entrar' }).click();
    await expect(pabloPage).toHaveURL(/\/cambiar-contrasena$/);
    await pabloPage.getByLabel('Contraseña temporal').fill(temporary);
    await pabloPage.getByLabel(/^Nueva contraseña/).fill('pablo-clave-nueva-123');
    await pabloPage.getByLabel('Repite la nueva contraseña').fill('pablo-clave-nueva-123');
    await pabloPage.getByRole('button', { name: 'Guardar y continuar' }).click();
    await expect(pabloPage).toHaveURL(/\/$/);
    await pabloContext.close();
  });
});
