import { expect, test } from '@playwright/test';
import { BAD_IMAGE, createScans, expectToast, isMobile, pageImage, signUp } from './helpers';

test('loose and folder scans open the workspace from a corner button', async ({ page }) => {
  await signUp(page);
  const loose = await createScans(page, { items: [{ title: 'Informe suelto', text: 'Texto del informe', engine: 'manual' }] });
  const folder = await createScans(page, { newGroup: { title: 'Carpeta de prueba' }, items: [{ text: 'Hoja de carpeta', engine: 'manual' }] });

  await page.goto(`/archivo/carpeta/${folder.groupId}`);
  await expect(page.getByRole('link', { name: 'Zona de trabajo' })).toBeVisible();

  await page.goto('/archivo?vista=individuales');
  await page.getByRole('link', { name: 'Zona de trabajo' }).click();
  await expect(page).toHaveURL(new RegExp(`/zona-de-trabajo/${loose.ids[0]}$`));
});

test('workspace autosaves, places images and exports a real PDF', async ({ page }, testInfo) => {
  await signUp(page);
  const { ids } = await createScans(page, { items: [{ title: 'Informe', text: 'Texto del informe', engine: 'manual' }] });
  await page.goto(`/zona-de-trabajo/${ids[0]}`);

  const doc = page.getByRole('textbox', { name: 'Documento', exact: true });
  await expect(doc).toContainText('Texto del informe');
  // On mobile the workspace toolbar replaces the main navigation.
  if (isMobile(page)) await expect(page.getByRole('navigation', { name: 'Principal' })).toBeHidden();
  await doc.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' editado');
  await expect(page.getByRole('status').filter({ hasText: 'Guardado' })).toBeVisible();

  // Image: added over the text by default, then switched to the other wrap modes.
  const chooser = page.waitForEvent('filechooser');
  if (isMobile(page)) {
    await page.getByRole('button', { name: 'Más opciones' }).click();
    await page.getByRole('menuitem', { name: 'Añadir imagen' }).click();
  } else {
    await page.getByRole('button', { name: 'Imagen', exact: true }).click();
  }
  await (await chooser).setFiles(pageImage(1));

  const figure = page.locator('.workspace-image');
  await expect(figure).toHaveAttribute('data-wrap', 'front');
  await expect(figure).toHaveCSS('position', 'absolute');
  await page.getByRole('button', { name: 'Cuadrado (el texto la rodea)' }).click();
  await expect(figure).toHaveCSS('float', 'left');
  await page.getByRole('button', { name: 'Arriba y abajo' }).click();
  await expect(figure).toHaveCSS('clear', 'both');
  await page.screenshot({ path: testInfo.outputPath('imagen.png') });

  await expect(page.getByRole('status').filter({ hasText: 'Guardado' })).toBeVisible();
  await page.reload();
  await expect(page.locator('.workspace-image')).toHaveAttribute('data-wrap', 'topBottom');

  const download = page.waitForEvent('download');
  if (isMobile(page)) {
    await page.getByRole('button', { name: 'Más opciones' }).click();
    await page.getByRole('menuitem', { name: 'Exportar PDF' }).click();
  } else {
    await page.getByRole('button', { name: 'Exportar PDF' }).click();
  }
  const pdf = await download;
  expect(pdf.suggestedFilename()).toBe('Informe.pdf');
  const path = testInfo.outputPath('informe.pdf');
  await pdf.saveAs(path);
  const { readFileSync } = await import('node:fs');
  expect(readFileSync(path).subarray(0, 5).toString()).toBe('%PDF-');

  await page.goto(`/escaneo/${ids[0]}`);
  await expect(page.getByRole('article', { name: 'Texto escaneado' })).toContainText('Texto del informe editado');
});

test('an unreadable image shows a clear message instead of a decoder error', async ({ page }) => {
  await signUp(page);
  const { ids } = await createScans(page, { items: [{ title: 'Informe', text: 'Texto', engine: 'manual' }] });
  await page.goto(`/zona-de-trabajo/${ids[0]}`);
  await page.locator('input[type="file"]').setInputFiles(BAD_IMAGE);
  await expectToast(page, 'No se pudo leer la imagen');
  await expect(page.locator('.workspace-image')).toHaveCount(0);
});

test('word tools: area selection, find and replace and images in tables', async ({ page }, testInfo) => {
  await signUp(page);
  const { ids } = await createScans(page, { items: [{ title: 'Acta', text: 'Primera línea del acta\nSegunda línea del acta\nTercera línea', engine: 'manual' }] });
  await page.goto(`/zona-de-trabajo/${ids[0]}`);
  const doc = page.getByRole('textbox', { name: 'Documento', exact: true });
  await expect(doc).toContainText('Tercera línea');

  // Mobile: tapping the handle (same as swiping up) shows every tool at once.
  if (isMobile(page)) {
    await page.getByRole('button', { name: 'Mostrar todas las herramientas' }).click();
    await expect(page.getByRole('button', { name: 'Mostrar menos herramientas' })).toBeVisible();
  }

  // Area selection: drag a rectangle over the first two lines, then make them bold.
  await page.getByRole('button', { name: 'Selección por área' }).first().click();
  const first = await doc.locator('p').nth(0).boundingBox();
  const second = await doc.locator('p').nth(1).boundingBox();
  await page.mouse.move(first!.x + 2, first!.y + 4);
  await page.mouse.down();
  await page.mouse.move(second!.x + second!.width - 4, second!.y + second!.height - 4, { steps: 5 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Negrita' }).first().click();
  await expect(doc.locator('p').nth(0).locator('strong')).toContainText('Primera');
  await expect(doc.locator('p').nth(1).locator('strong')).toContainText('Segunda');
  await expect(doc.locator('p').nth(2).locator('strong')).toHaveCount(0);
  await page.getByRole('button', { name: 'Selección por área' }).first().click();

  // Find and replace, ignoring accents.
  await page.getByRole('button', { name: 'Buscar y reemplazar' }).first().click();
  await page.getByRole('textbox', { name: 'Buscar', exact: true }).fill('linea');
  await page.getByRole('textbox', { name: 'Reemplazar con' }).fill('fila');
  await page.getByRole('button', { name: 'Todo', exact: true }).click();
  await expect(doc).toContainText('Tercera fila');
  await page.getByRole('button', { name: 'Cerrar búsqueda' }).click();

  // Image inside a table cell.
  await doc.locator('p').nth(2).click();
  await page.keyboard.press('End');
  await page.getByRole('button', { name: 'Insertar tabla' }).first().click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Insertar imagen' }).first().click();
  await (await chooser).setFiles(pageImage(1));
  await expect(doc.locator('td .workspace-image, th .workspace-image')).toHaveCount(1);
  await expect(doc.locator('.workspace-image')).toHaveAttribute('data-wrap', 'topBottom');
  await page.screenshot({ path: testInfo.outputPath('tabla.png') });
  await expect(page.getByRole('status').filter({ hasText: 'Guardado' })).toBeVisible();
});
