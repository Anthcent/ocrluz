import { expect, test, type Page } from '@playwright/test';
import { BAD_IMAGE, createScans, expectToast, pageImage, signUp, updateSettings } from './helpers';

const cards = (page: Page) => page.getByTestId('page-card');
const upload = (page: Page, files: string[]) => page.locator('input[type=file][multiple]').setInputFiles(files);

/** Los pasos empiezan plegados; se abren al pulsarlos. */
async function openStep(page: Page, title: '¿Dónde se guarda?' | '¿Cómo escanear?') {
  // En móvil el título es corto («¿Dónde?», «¿Cómo?»), así que se busca por su primera palabra.
  const header = page.getByRole('button', { name: new RegExp(title.split(' ')[0]) });
  if ((await header.getAttribute('aria-expanded')) === 'false') await header.click();
}

async function chooseEngine(page: Page, name: 'OCR.space' | 'Gemini' | 'Tesseract') {
  await openStep(page, '¿Cómo escanear?');
  await page.getByRole('button', { name: new RegExp(`^${name.replace('.', '\\.')}`) }).click();
}

test.describe('Escáner', () => {
  test('avisa si falta la API key del motor elegido', async ({ page }) => {
    await signUp(page);
    await page.goto('/escanear');
    // Visible incluso con el paso plegado.
    await expect(page.getByText(/sin API key/i).locator('visible=true').first()).toBeVisible();
    await chooseEngine(page, 'Tesseract');
    await expect(page.getByText('Para usar OCR.space necesitas su API key')).toBeHidden();
  });

  test('modo manual con OCR.space: escanear, revisar en el visor, reordenar, quitar y guardar individuales', async ({ page }) => {
    await signUp(page);
    await updateSettings(page, { ocrspaceKey: 'clave-de-prueba-123' });
    await page.goto('/escanear');

    await upload(page, [pageImage(1), pageImage(2), pageImage(3)]);
    await expectToast(page, '3 imágenes añadidas');
    await expect(cards(page)).toHaveCount(3);
    await expect(page.getByText('0 de 3 escaneadas')).toBeVisible();
    await expect(cards(page).getByText('Sin escanear')).toHaveCount(3);
    // Numeradas en orden.
    await expect(cards(page).nth(2).getByText('3', { exact: true })).toBeVisible();

    // Escanear solo la primera página.
    await cards(page).nth(0).getByRole('button', { name: 'Escanear', exact: true }).click();
    await expect(cards(page).nth(0).getByText('Listo')).toBeVisible();
    await expect(cards(page).nth(0).getByText(/^pág\. \d+$/)).toBeVisible();
    await expect(page.getByText('1 de 3 escaneadas')).toBeVisible();
    await expect(cards(page).nth(1).getByText('Sin escanear')).toBeVisible();

    // Escanear el resto de golpe: mientras tanto se ve una barra de progreso, no un spinner.
    await page.getByRole('button', { name: 'Escanear (2)' }).click();
    const bar = cards(page).getByRole('progressbar').first();
    await expect(bar).toBeVisible();
    await expect(bar).toHaveAttribute('aria-valuenow', /^[1-9]\d*$/);
    await expect(page.getByText('3 de 3 escaneadas')).toBeVisible();

    // Corregir el texto de la segunda página desde el visor.
    await cards(page).nth(1).getByRole('button', { name: 'Ver texto' }).click();
    const viewer = page.getByRole('dialog', { name: 'Página 2' });
    await expect(viewer.getByText('de 3')).toBeVisible();
    await viewer.getByLabel('Texto de la página').fill('Texto corregido a mano');
    await viewer.getByRole('button', { name: 'Guardar texto' }).click();
    await expectToast(page, 'Texto actualizado');
    await viewer.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(cards(page).nth(1).getByText('Texto corregido a mano')).toBeVisible();

    // Moverla al principio y quitar la última.
    await cards(page).nth(1).getByRole('button', { name: 'Mover antes' }).click();
    await expect(cards(page).nth(0).getByText('Texto corregido a mano')).toBeVisible();
    await page.getByRole('button', { name: 'Quitar página 3' }).click();
    await expect(cards(page)).toHaveCount(2);

    await page.getByRole('button', { name: 'Guardar (2)' }).click();
    await expect(page).toHaveURL(/\/archivo\?vista=individuales$/);
    await expectToast(page, '¡Guardado! +2');
    await expect(page.getByText('Texto corregido a mano').first()).toBeVisible();
    await expect(page.getByText(/Texto de OCR.space número \d+/).first()).toBeVisible();

    // Tras guardar, las fotos se descartan del escáner.
    await page.goto('/escanear');
    await expect(page.getByText('Aún no hay páginas')).toBeVisible();
  });

  test('visor: navegar, girar, escanear y quitar', async ({ page }) => {
    await signUp(page);
    await updateSettings(page, { ocrspaceKey: 'clave-de-prueba-123' });
    await page.goto('/escanear');
    await upload(page, [pageImage(1), pageImage(2)]);
    await page.getByRole('button', { name: 'Ver página 1' }).click();

    let viewer = page.getByRole('dialog', { name: 'Página 1' });
    await viewer.getByRole('button', { name: 'Página siguiente' }).click();
    viewer = page.getByRole('dialog', { name: 'Página 2' });
    await expect(viewer).toBeVisible();
    await viewer.getByRole('button', { name: 'Ir a la página 1' }).click();
    viewer = page.getByRole('dialog', { name: 'Página 1' });

    // Girar cambia la orientación de la foto (ancho ↔ alto).
    const img = viewer.getByRole('img', { name: 'Página 1' });
    const before = await img.evaluate((el: HTMLImageElement) => el.naturalWidth / el.naturalHeight);
    await viewer.getByRole('button', { name: 'Girar' }).click();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth / el.naturalHeight)).toBeCloseTo(1 / before, 2);

    await viewer.getByRole('button', { name: 'Escanear' }).click();
    await expect(viewer.getByLabel('Texto de la página')).toHaveValue(/Texto de OCR.space/);

    await viewer.getByRole('button', { name: 'Quitar' }).click();
    await expect(page.getByRole('dialog', { name: 'Página 1' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(cards(page)).toHaveCount(1);
  });

  test('quitar todas las páginas', async ({ page }) => {
    await signUp(page);
    await page.goto('/escanear');
    await upload(page, [pageImage(1), pageImage(2)]);
    await expect(cards(page)).toHaveCount(2);
    await page.getByRole('button', { name: 'Quitar todas' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Quitar todas' }).click();
    await expect(page.getByText('Aún no hay páginas')).toBeVisible();
  });

  test('escaneo automático con Gemini y guardado en una carpeta nueva', async ({ page }) => {
    await signUp(page);
    await updateSettings(page, { geminiKey: 'clave-de-prueba-123' });
    await page.goto('/escanear');
    await chooseEngine(page, 'Gemini');
    await page.getByRole('switch', { name: 'Escaneo automático' }).click();

    await upload(page, [pageImage(1), pageImage(2)]);
    // Sin pulsar «Escanear»: se procesan solas.
    await expect(page.getByText('2 de 2 escaneadas')).toBeVisible();

    await openStep(page, '¿Dónde se guarda?');
    await page.getByRole('button', { name: /^Carpeta/ }).click();
    await page.getByLabel('Nombre de la carpeta').fill('Fichas de inscripción 3er año');
    await page.getByLabel('Responsable').fill('Secretaría');
    await page.getByRole('group', { name: 'Categoría' }).getByRole('button', { name: /Ficha de inscripción/ }).click();
    await page.getByLabel('Hojas esperadas').fill('100');
    await page.getByRole('button', { name: 'Color blue' }).click();
    await expect(page.getByTestId('sheet-count')).toHaveText('2 hojas detectadas');
    await expect(page.getByText('2 de 100 hojas')).toBeVisible();
    await page.getByRole('button', { name: 'Guardar (2)' }).click();

    await expect(page).toHaveURL(/\/archivo\/carpeta\/\d+$/);
    await expect(page.getByRole('heading', { name: 'Fichas de inscripción 3er año' })).toBeVisible();
    await expect(page.getByRole('main').getByText('Responsable: Secretaría')).toBeVisible();
    await expect(page.getByText('2 / 100')).toBeVisible();
    await expect(page.getByText('Hoja 1', { exact: true })).toBeVisible();
    await expect(page.getByText('Hoja 2', { exact: true })).toBeVisible();
  });

  test('pide nombre para la carpeta nueva antes de guardar', async ({ page }) => {
    await signUp(page);
    await page.goto('/escanear');
    await openStep(page, '¿Dónde se guarda?');
    await page.getByRole('button', { name: /^Carpeta/ }).click();
    await upload(page, [pageImage(1)]);
    await page.getByRole('button', { name: 'Ver página 1' }).click();
    await page.getByLabel('Texto de la página').fill('Escrito a mano');
    await page.getByRole('button', { name: 'Guardar texto' }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Guardar (1)' }).click();
    await expectToast(page, 'Ponle un nombre a la carpeta');
    await expect(page.getByLabel('Nombre de la carpeta')).toBeVisible();
  });

  test('añadir hojas a una carpeta existente desde su ficha', async ({ page }) => {
    await signUp(page);
    await updateSettings(page, { ocrspaceKey: 'clave-de-prueba-123' });
    const res = await page.request.post('/api/scans', {
      headers: { 'X-Requested-With': 'ocryon' },
      data: { newGroup: { title: 'Mis actas' }, items: [{ text: 'Primera hoja guardada', engine: 'manual' }] },
    });
    const { groupId } = await res.json();

    await page.goto(`/archivo/carpeta/${groupId}`);
    await page.getByRole('button', { name: 'Añadir hojas' }).first().click();
    await expect(page).toHaveURL(new RegExp(`/escanear\\?grupo=${groupId}$`));
    await expect(page.getByText('Carpeta: Mis actas').or(page.getByText('se añadirán al final de «Mis actas»')).locator('visible=true').first()).toBeVisible();
    await openStep(page, '¿Dónde se guarda?');
    await expect(page.getByRole('group', { name: 'Carpeta' }).getByRole('button', { name: 'Mis actas' })).toHaveAttribute('aria-pressed', 'true');

    await upload(page, [pageImage(3)]);
    await page.getByRole('button', { name: 'Escanear (1)' }).click();
    await expect(page.getByText('1 de 1 escaneadas')).toBeVisible();
    await page.getByRole('button', { name: 'Guardar (1)' }).click();

    await expect(page).toHaveURL(new RegExp(`/archivo/carpeta/${groupId}$`));
    await expect(page.locator('a[href^="/escaneo/"]')).toHaveCount(2);
    await expect(page.getByRole('link', { name: /Hoja 2/ })).toBeVisible();
  });

  test('buscar la carpeta entre muchas: por responsable, categoría o una frase del texto', async ({ page }) => {
    await signUp(page);
    const folders = [
      { title: 'Actas del consejo', author: 'Coordinación Pedagógica', category: 'Acta', text: 'Se reunió el consejo de docentes del plantel.' },
      { title: 'Archivo de química', author: '', category: 'Materia vista', text: 'La tabla periódica ordena los elementos.' },
      { title: 'Expedientes médicos', author: '', category: '', description: 'Reposos de diciembre', text: 'Paciente con faringitis aguda.' },
      { title: 'Carpeta sin nombre claro', author: '', category: '', text: 'Constancia de inscripción del estudiante en el lapso escolar.' },
      { title: 'Nóminas antiguas', author: 'Secretaría', category: 'Nómina', text: 'Listado de estudiantes del año escolar.' },
      { title: 'Partidas', author: 'Registro', category: 'Partida de nacimiento', text: 'Nació en la ciudad de Valencia.' },
    ];
    for (const b of folders) {
      await createScans(page, { newGroup: { title: b.title, author: b.author, category: b.category, description: b.description ?? '' }, items: [{ text: b.text, engine: 'manual' }] });
    }
    await page.goto('/escanear');
    await openStep(page, '¿Dónde se guarda?');
    await page.getByRole('button', { name: /^Carpeta/ }).click();
    // Solo los recientes como accesos rápidos; el resto, con el buscador.
    await expect(page.getByRole('group', { name: 'Carpeta' }).getByRole('button')).toHaveCount(5);

    await page.getByRole('button', { name: 'Buscar entre tus 6 carpetas' }).click();
    const picker = page.getByRole('dialog', { name: 'Buscar carpeta' });
    const results = picker.getByRole('list', { name: 'Carpetas encontradas' }).getByRole('listitem');
    await expect(results).toHaveCount(6);

    // Sin tildes y por responsable.
    await picker.getByLabel('Texto a buscar').fill('coordinacion pedagogica');
    await expect(results).toHaveCount(1);
    await expect(results.first()).toContainText('Actas del consejo');
    await expect(results.first().getByText('Responsable', { exact: true })).toBeVisible();

    // Por la descripción.
    await picker.getByLabel('Texto a buscar').fill('diciembre');
    await expect(results).toHaveCount(1);
    await expect(results.first()).toContainText('Expedientes médicos');

    // No recuerdo el nombre, pero sí una frase del texto.
    await picker.getByLabel('Texto a buscar').fill('constancia de inscripcion');
    await expect(results).toHaveCount(1);
    await expect(results.first()).toContainText('Carpeta sin nombre claro');
    await expect(results.first()).toContainText('1 coincidencia en el texto');
    await picker.getByRole('button', { name: /Buscar también dentro del texto/ }).click();
    await expect(picker.getByText('Ninguna carpeta coincide')).toBeVisible();
    await picker.getByRole('button', { name: /Buscar también dentro del texto/ }).click();
    await expect(results).toHaveCount(1);

    // Filtro por categoría y orden alfabético.
    await picker.getByRole('button', { name: 'Quitar filtros' }).click();
    await picker.getByRole('group', { name: 'Filtrar carpetas' }).getByRole('button', { name: /Nómina/ }).click();
    await expect(results).toHaveCount(1);
    await expect(picker.getByTestId('group-picker-count')).toHaveText('1 de 6 carpetas');
    await picker.getByRole('group', { name: 'Filtrar carpetas' }).getByRole('button', { name: /Nómina/ }).click();
    await picker.getByRole('button', { name: 'A–Z' }).click();
    await expect(results.first()).toContainText('Actas del consejo');

    // Al elegirlo aparece seleccionado entre los accesos rápidos aunque no fuera reciente.
    await picker.getByLabel('Texto a buscar').fill('constancia');
    await picker.getByRole('button', { name: 'Elegir Carpeta sin nombre claro' }).click();
    await expect(picker).toBeHidden();
    await expect(page.getByRole('group', { name: 'Carpeta' }).getByRole('button', { name: 'Carpeta sin nombre claro' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('se añadirán al final de «Carpeta sin nombre claro»')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Carpeta' }).getByRole('button')).toHaveCount(5);
  });

  test('una API key inválida detiene la cola y muestra el error', async ({ page }) => {
    await signUp(page);
    await updateSettings(page, { ocrspaceKey: 'clave-invalida' });
    await page.goto('/escanear');
    await upload(page, [pageImage(1), pageImage(2)]);
    await page.getByRole('button', { name: 'Escanear (2)' }).click();
    await expect(cards(page).nth(0).getByText('La API key de OCR.space no es válida')).toBeVisible();
    // La segunda no se intenta: vuelve a quedar pendiente.
    await expect(cards(page).nth(1).getByText('Sin escanear')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Guardar/ })).toBeDisabled();
  });

  test('las páginas pendientes sobreviven a una recarga y no las ve otro usuario', async ({ page }) => {
    await signUp(page);
    await page.goto('/escanear');
    await upload(page, [pageImage(1), pageImage(2)]);
    await expect(cards(page)).toHaveCount(2);
    await page.reload();
    await expect(cards(page)).toHaveCount(2);

    await page.goto('/');
    await expect(page.getByText('Tienes 2 páginas sin guardar')).toBeVisible();

    // Otro usuario en el mismo navegador (mismo IndexedDB) no ve esas fotos.
    await page.request.post('/api/auth/logout', { headers: { 'X-Requested-With': 'ocryon' } });
    await signUp(page, 'Otro usuario');
    await page.goto('/escanear');
    await expect(page.getByText('Aún no hay páginas')).toBeVisible();
  });

  test('rechaza archivos que no son imágenes', async ({ page }) => {
    await signUp(page);
    await page.goto('/escanear');
    await upload(page, [BAD_IMAGE, pageImage(1)]);
    await expectToast(page, 'Una imagen no se pudo leer');
    await expect(cards(page)).toHaveCount(1);
  });

  test('cámara en ráfaga: fotos numeradas y se pueden quitar antes de terminar', async ({ page }) => {
    await signUp(page);
    await page.goto('/escanear');
    await page.getByRole('button', { name: 'Tomar fotos' }).click();
    const shutter = page.getByRole('button', { name: 'Tomar foto', exact: true });
    await expect(shutter).toBeEnabled();
    await shutter.click();
    await expect(page.getByText('1 página', { exact: true })).toBeVisible();
    await shutter.click();
    await shutter.click();
    await expect(page.getByText('3 páginas', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Quitar foto 2' }).click();
    await expect(page.getByText('2 páginas', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Terminar' }).click();
    await expect(cards(page)).toHaveCount(2);
  });

  test('Tesseract reconoce el texto en el propio dispositivo', async ({ page }) => {
    test.setTimeout(120_000);
    await signUp(page);
    await page.goto('/escanear');
    await chooseEngine(page, 'Tesseract');
    await upload(page, [pageImage(1)]);
    await page.getByRole('button', { name: 'Escanear (1)' }).click();
    await expect(cards(page).nth(0).getByText('Listo')).toBeVisible({ timeout: 90_000 });
    await expect(cards(page).nth(0)).toContainText('reunieron los docentes');
  });
});
