import { expect, test } from '@playwright/test';
import { createScans, expectToast, signUp } from './helpers';

test('loose and folder scans open the workspace from a corner button', async ({ page }, testInfo) => {
  await signUp(page);
  const loose = await createScans(page, { items: [{ title: 'Informe suelto', text: 'Texto del informe', engine: 'manual' }] });
  const folder = await createScans(page, { newGroup: { title: 'Carpeta de prueba' }, items: [{ text: 'Hoja de carpeta', engine: 'manual' }] });

  await page.goto('/archivo?vista=individuales');
  const looseButton = page.getByRole('link', { name: 'Zona de trabajo' });
  await expect(looseButton).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('sueltos.png') });

  await page.goto(`/archivo/carpeta/${folder.groupId}`);
  await expect(page.getByRole('link', { name: 'Zona de trabajo' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('carpeta.png') });

  await page.goto('/archivo?vista=individuales');
  await looseButton.click();
  await expect(page).toHaveURL(new RegExp(`/zona-de-trabajo/${loose.ids[0]}$`));

  const doc = page.getByRole('textbox', { name: 'Documento', exact: true });
  await expect(doc).toContainText('Texto del informe');
  await doc.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' editado');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expectToast(page, 'Documento guardado');
  await page.screenshot({ path: testInfo.outputPath('zona-de-trabajo.png') });

  await page.goto(`/escaneo/${loose.ids[0]}`);
  await expect(page.getByRole('article', { name: 'Texto escaneado' })).toContainText('Texto del informe editado');
});
