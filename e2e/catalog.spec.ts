import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { createScans, expectToast, signUp } from './helpers';

test.describe('Archivo y manejo de lo escaneado', () => {
  test('crear, editar, filtrar y borrar carpetas', async ({ page }) => {
    await signUp(page);
    await page.goto('/archivo');
    await expect(page.getByText('Aún no tienes carpetas')).toBeVisible();

    await page.getByRole('button', { name: 'Nueva carpeta' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nueva carpeta' });
    await dialog.getByLabel('Nombre de la carpeta').fill('Actas del consejo');
    await dialog.getByLabel('Responsable').fill('Secretaría');
    await dialog.getByRole('group', { name: 'Categoría' }).getByRole('button', { name: /^Acta$/ }).click();
    await dialog.getByLabel('Hojas esperadas').fill('250');
    await dialog.getByLabel('Descripción').fill('Período 2024-2025');
    await dialog.getByRole('button', { name: 'Color purple' }).click();
    await dialog.getByRole('button', { name: 'Crear carpeta' }).click();
    await expect(page.getByRole('heading', { name: 'Actas del consejo' })).toBeVisible();
    await expect(page.getByText('Período 2024-2025')).toBeVisible();

    await page.getByRole('button', { name: 'Editar carpeta' }).click();
    const edit = page.getByRole('dialog', { name: 'Editar carpeta' });
    await expect(edit.getByLabel('Nombre de la carpeta')).toHaveValue('Actas del consejo');
    await expect(edit.getByLabel('Responsable')).toHaveValue('Secretaría');
    await expect(edit.getByRole('group', { name: 'Categoría' }).getByRole('button', { name: /^Acta$/ })).toHaveAttribute('aria-pressed', 'true');
    await edit.getByLabel('Nombre de la carpeta').fill('Actas del consejo 2025');
    await edit.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByRole('heading', { name: 'Actas del consejo 2025' })).toBeVisible();
    await expect(page.getByText('Período 2024-2025')).toBeVisible();

    await createScans(page, { newGroup: { title: 'Nómina' }, items: [{ text: 'Listado de estudiantes de tercer año', engine: 'manual' }] });
    await page.goto('/archivo');
    await page.getByLabel('Filtrar', { exact: true }).fill('nomina');
    await expect(page.getByRole('link', { name: 'Nómina', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Actas del consejo 2025', exact: true })).toBeHidden();
    await page.getByLabel('Filtrar', { exact: true }).fill('');

    await page.getByRole('link', { name: 'Actas del consejo 2025', exact: true }).click();
    await page.getByRole('button', { name: 'Borrar carpeta' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Borrar todo' }).click();
    await expect(page).toHaveURL(/\/archivo$/);
    await expectToast(page, 'Carpeta borrada');
    await expect(page.getByRole('link', { name: 'Actas del consejo 2025', exact: true })).toBeHidden();
  });

  test('ficha de carpeta: reordenar, texto completo, exportar, copiar y borrar hojas', async ({ page }) => {
    await signUp(page);
    const { groupId } = await createScans(page, {
      newGroup: { title: 'Carpeta de prueba' },
      items: [
        { text: 'Contenido de la primera', engine: 'manual' },
        { text: 'Contenido de la segunda', engine: 'manual' },
        { text: 'Contenido de la tercera', engine: 'manual' },
      ],
    });
    await page.goto(`/archivo/carpeta/${groupId}`);
    await expect(page.locator('a[href^="/escaneo/"]')).toHaveCount(3);

    // Bajar la primera: el nuevo orden persiste al recargar.
    const saved = page.waitForResponse((r) => r.url().includes('/order') && r.status() === 204);
    await page.getByRole('button', { name: 'Mover después' }).first().click();
    await saved;
    await page.reload();
    const titles = page.locator('a[href^="/escaneo/"] .truncate');
    await expect(titles).toHaveText(['Hoja 2', 'Hoja 1', 'Hoja 3']);

    // Texto: hoja a hoja, con barra de progreso y botones grandes.
    await page.getByRole('button', { name: 'Texto', exact: true }).click();
    const article = page.locator('article');
    await expect(page.getByText('Hoja 1 de 3')).toBeVisible();
    await expect(article).toContainText('Contenido de la segunda');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByText('Hoja 2 de 3')).toBeVisible();
    await expect(article).toContainText('Contenido de la primera');
    await page.getByRole('button', { name: 'Todo seguido' }).click();
    const text = await article.innerText();
    expect(text.indexOf('segunda')).toBeLessThan(text.indexOf('primera'));
    expect(text.indexOf('primera')).toBeLessThan(text.indexOf('tercera'));

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar .txt' }).click();
    const file = await (await download).path();
    const exported = fs.readFileSync(file, 'utf8');
    expect(exported).toBe('Contenido de la segunda\n\nContenido de la primera\n\nContenido de la tercera');
    expect((await download).suggestedFilename()).toBe('Carpeta de prueba.txt');

    await page.getByRole('button', { name: 'Copiar' }).click();
    await expectToast(page, 'Texto copiado');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(exported);

    await page.getByRole('button', { name: 'Hojas', exact: true }).click();
    await page.getByRole('button', { name: 'Borrar hoja' }).last().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Borrar' }).click();
    await expectToast(page, 'Hoja borrada');
    await expect(titles).toHaveCount(2);
  });

  test('ficha de escaneo: editar, navegar entre hojas, mover de carpeta y borrar', async ({ page }) => {
    await signUp(page);
    const folder = await createScans(page, {
      newGroup: { title: 'Revisiones' },
      items: [
        { text: 'Revisión de matemática', engine: 'manual' },
        { text: 'Revisión de física', engine: 'manual' },
      ],
    });
    await createScans(page, { newGroup: { title: 'Otra carpeta' }, items: [{ text: 'Algo', engine: 'manual' }] });

    await page.goto(`/escaneo/${folder.ids[0]}`);
    await expect(page.getByText('1 / 2')).toBeVisible();
    await page.getByRole('button', { name: 'Página siguiente' }).click();
    await expect(page).toHaveURL(new RegExp(`/escaneo/${folder.ids[1]}$`));
    await expect(page.getByLabel('Texto escaneado')).toHaveText('Revisión de física');
    await page.getByRole('button', { name: 'Página anterior' }).click();
    await expect(page.getByLabel('Texto escaneado')).toHaveText('Revisión de matemática');

    // Editar título y texto (el texto se lee por defecto; «Editar» abre el editor).
    await page.getByRole('button', { name: 'Editar', exact: true }).first().click();
    const save = page.getByRole('button', { name: 'Guardar', exact: true });
    await expect(save).toBeDisabled();
    await page.getByLabel('Título').fill('Revisión I');
    await page.getByLabel('Texto escaneado').fill('Érase una vez un texto corregido con cinco palabras más');
    await save.click();
    await expectToast(page, 'Cambios guardados');
    await expect(page.getByText('10 palabras')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Revisión I' })).toBeVisible();
    await expect(page.getByLabel('Texto escaneado')).toContainText('Érase una vez');

    // Mover a otra carpeta y luego dejarlo como documento suelto.
    await page.getByRole('button', { name: 'Mover', exact: true }).first().click();
    await page.getByRole('dialog', { name: 'Mover a…' }).getByRole('button', { name: 'Otra carpeta' }).click();
    await expectToast(page, 'Movido a «Otra carpeta»');
    await expect(page.getByRole('main').getByRole('link', { name: 'Otra carpeta' })).toBeVisible();
    await page.getByRole('button', { name: 'Mover', exact: true }).first().click();
    await page.getByRole('dialog', { name: 'Mover a…' }).getByRole('button', { name: 'Ninguna (documento suelto)' }).click();
    await expectToast(page, 'Ahora es un documento suelto');

    await page.getByRole('button', { name: 'Borrar', exact: true }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Borrar' }).click();
    await expect(page).toHaveURL(/\/archivo\?vista=individuales$/);
    await expect(page.getByText('Sin documentos sueltos')).toBeVisible();
  });

  test('lista de documentos sueltos con paginación', async ({ page }) => {
    await signUp(page);
    await createScans(page, {
      items: Array.from({ length: 35 }, (_, i) => ({ text: `Nota número ${i + 1}`, engine: 'manual' })),
    });
    await page.goto('/archivo?vista=individuales');
    const items = page.locator('a[href^="/escaneo/"]');
    await expect(items).toHaveCount(30);
    await page.getByRole('button', { name: 'Cargar más' }).click();
    await expect(items).toHaveCount(35);
    await expect(page.getByRole('button', { name: 'Cargar más' })).toBeHidden();
  });
});

test.describe('Búsqueda', () => {
  test('busca sin acentos, por prefijo y resalta coincidencias', async ({ page }) => {
    await signUp(page);
    await createScans(page, {
      newGroup: { title: 'Macondo' },
      items: [{ text: 'El coronel Aureliano Buendía había de recordar aquella tarde remota.', engine: 'manual' }],
    });
    await createScans(page, { items: [{ text: 'Receta: harina, agua y sal.', engine: 'manual' }] });

    await page.goto('/buscar');
    await page.getByLabel('Buscar').fill('buendia');
    await expect(page.locator('mark.hit')).toHaveText('Buendía');
    await expect(page.getByText(/1 resultado en 1 carpeta/)).toBeVisible();

    await page.getByLabel('Buscar').fill('hari');
    await expect(page.locator('mark.hit')).toHaveText('harina');
    await expect(page.getByRole('heading', { name: 'Documentos sueltos' })).toBeVisible();

    // Filtros: solo carpetas / solo sueltos.
    await page.getByRole('button', { name: 'Carpetas', exact: true }).click();
    await expect(page.getByText('Sin resultados')).toBeVisible();
    await page.getByRole('button', { name: 'Sueltos', exact: true }).click();
    await expect(page.locator('mark.hit')).toHaveText('harina');
    await page.getByRole('button', { name: 'Todo', exact: true }).click();

    await page.getByLabel('Buscar').fill('xilófono');
    await expect(page.getByText('Sin resultados')).toBeVisible();

    await page.getByLabel('Buscar').fill('');
    await expect(page.getByText('Búsquedas recientes')).toBeVisible();
    // La búsqueda anterior queda como reciente y se puede repetir con un toque.
    await page.getByRole('button', { name: 'buendia' }).click();
    await expect(page.locator('mark.hit')).toHaveText('Buendía');

    await page.getByLabel('Buscar').fill('coronel');
    await page.locator('mark.hit').click();
    await expect(page).toHaveURL(/\/escaneo\/\d+$/);
    await expect(page.getByLabel('Texto escaneado')).toContainText('Aureliano');
  });
});

test.describe('Visor de documentos', () => {
  test('abre el visor, pasa de hoja y muestra el número de página impreso', async ({ page }) => {
    await signUp(page);
    const { groupId } = await createScans(page, {
      newGroup: { title: 'Actas 2024-2025', author: 'Secretaría', category: 'Acta', totalPages: 10 },
      items: [1, 2, 3].map((n) => ({ text: `Texto de la hoja ${n}\n\n— ${n + 40} —`, engine: 'manual', pageLabel: String(n + 40) })),
    });

    // Desde el archivo: la tarjeta tiene acceso directo al visor.
    await page.goto('/archivo');
    await expect(page.getByText('3/10')).toBeVisible();
    await expect(page.getByRole('main').getByText('Responsable: Secretaría')).toBeVisible();
    await page.getByRole('link', { name: 'Abrir visor de «Actas 2024-2025»' }).click();
    const viewer = page.getByRole('dialog', { name: 'Visor: Actas 2024-2025' });
    await expect(viewer).toBeVisible();
    // Sin portada: se abre directamente en la primera hoja.
    await expect(viewer.getByText('Texto de la hoja 1')).toBeVisible();
    await expect(viewer.getByText('Hoja 1 de 3')).toBeVisible();
    // El número impreso va al pie y no se repite dentro del texto.
    await expect(viewer.getByText('pág. 41')).toHaveCount(1);
    await expect(viewer.getByText('— 41 —')).toHaveCount(0);

    // En móvil hay botón «Siguiente»; en escritorio, flechas redondas a los lados.
    await viewer.getByRole('button', { name: /^(Siguiente|Hoja siguiente)$/ }).click();
    await expect(viewer.getByText('Texto de la hoja 2')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(viewer.getByText('Texto de la hoja 3')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(viewer).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/archivo/carpeta/${groupId}$`));

    // Desde la ficha de la carpeta; se pasa de hoja deslizando con el dedo o el ratón.
    await page.getByRole('button', { name: 'Abrir visor' }).click();
    const opened = page.getByRole('dialog', { name: 'Visor: Actas 2024-2025' });
    const box = (await opened.getByTestId('viewer-stage').boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.9, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.2, y, { steps: 8 });
    await page.mouse.up();
    await expect(opened.getByText('Texto de la hoja 2')).toBeVisible();

    // Un deslizamiento corto no cambia de hoja.
    await page.mouse.move(box.x + box.width * 0.9, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.88, y, { steps: 3 });
    await page.mouse.up();
    await expect(opened.getByText('Texto de la hoja 2')).toBeVisible();

    await page.getByRole('slider', { name: 'Ir a la hoja' }).fill('2');
    await expect(opened.getByText('Texto de la hoja 3')).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar visor' }).click();
    await expect(opened).toBeHidden();
  });

  test('las rutas antiguas del catálogo redirigen al archivo', async ({ page }) => {
    await signUp(page);
    const { groupId } = await createScans(page, { newGroup: { title: 'Fichas' }, items: [{ text: 'Ficha de inscripción', engine: 'manual' }] });
    await page.goto(`/catalogo/grupo/${groupId}?libro=1`);
    await expect(page).toHaveURL(new RegExp(`/archivo/carpeta/${groupId}\\?visor=1$`));
    await expect(page.getByRole('dialog', { name: 'Visor: Fichas' })).toBeVisible();
    await page.goto('/catalogo?vista=individuales');
    await expect(page).toHaveURL(/\/archivo\?vista=individuales$/);
  });
});
