import { expect, test } from '@playwright/test';
import { createScans, isMobile, pageImage, signUp } from './helpers';

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
