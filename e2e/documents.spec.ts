import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { expectToast, pageImage, signUp, updateSettings } from './helpers';

const form = (page: Page) => page.locator('main');

test.describe('Documentos', () => {
  test('escanear un informe médico: los datos se detectan en el dispositivo, se corrigen, se guardan y se exportan', async ({ page }) => {
    await signUp(page);
    // El simulador devuelve el texto de un informe médico con esta clave.
    await updateSettings(page, { ocrspaceKey: 'doc-informe-1', defaultEngine: 'ocrspace' });
    await page.goto('/documentos');
    await expect(page.getByText('Aún no tienes documentos')).toBeVisible();

    await page.getByRole('link', { name: 'Nuevo documento' }).click();
    await expect(page.getByRole('heading', { name: '¿Qué documento vas a escanear?' })).toBeVisible();
    await page.getByRole('button', { name: /^Informe médico/ }).click();

    // Se pueden quitar fotos antes de leer.
    await page.getByLabel('Subir imágenes del documento').setInputFiles([pageImage(1), pageImage(2)]);
    await expect(page.getByTestId('doc-photos').getByRole('img')).toHaveCount(2);
    await page.getByRole('button', { name: 'Quitar foto 2' }).click();
    await expect(page.getByTestId('doc-photos').getByRole('img')).toHaveCount(1);
    // Sin clave de Gemini la IA queda desactivada.
    await expect(page.getByRole('switch', { name: 'Completar con IA' })).toHaveAttribute('aria-checked', 'false');

    await page.getByRole('button', { name: 'Leer documento' }).click();
    await expect(page.getByText('Leyendo tu documento…')).toBeVisible();
    await expect(page.getByText('Detectado en tu dispositivo')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('detected-count')).toHaveText(/^6 de 6 campos detectados/);

    const f = form(page);
    await expect(f.getByLabel('Paciente', { exact: true })).toHaveValue('María Pérez');
    await expect(f.getByLabel('Cédula', { exact: true })).toHaveValue('V-12345678');
    await expect(f.getByLabel('Fecha', { exact: true })).toHaveValue('2025-03-15');
    await expect(f.getByLabel('Médico', { exact: true })).toHaveValue('Dr. Luis Gómez');
    await expect(f.getByLabel('Diagnóstico')).toHaveValue('Faringitis aguda');
    await expect(f.getByLabel('Indicaciones')).toHaveValue('Reposo por tres días');
    await expect(page.getByLabel('Título del documento')).toHaveValue(/^Informe médico V-12345678/);

    await f.getByLabel('Paciente', { exact: true }).fill('María Pérez López');
    await page.getByRole('button', { name: /Guardar documento/ }).click();
    await expectToast(page, 'Documento guardado');
    await expect(page).toHaveURL(/\/documentos\/\d+$/);
    await expect(f.getByLabel('Paciente', { exact: true })).toHaveValue('María Pérez López');

    // Editar desde el detalle.
    await f.getByLabel('Indicaciones').fill('Reposo por cinco días');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expectToast(page, 'Cambios guardados');
    await page.reload();
    await expect(f.getByLabel('Indicaciones')).toHaveValue('Reposo por cinco días');

    // Lista, búsqueda por cualquier dato y exportación.
    await page.getByRole('link', { name: 'Documentos' }).first().click();
    await expect(page.getByRole('link', { name: /Informe médico V-12345678/ })).toBeVisible();
    await page.getByLabel('Buscar documentos').fill('12345678');
    await expect(page.getByRole('link', { name: /Informe médico V-12345678/ })).toBeVisible();
    await page.getByLabel('Buscar documentos').fill('no-existe-nada');
    await expect(page.getByText('Ningún documento coincide')).toBeVisible();
    await page.getByLabel('Limpiar búsqueda').click();

    await page.getByRole('group', { name: 'Filtrar por tipo' }).getByRole('button', { name: /Informe médico/ }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar CSV' }).click()]);
    expect(download.suggestedFilename()).toBe('Informe médico.csv');
    const csv = fs.readFileSync((await download.path())!, 'utf8');
    expect(csv).toContain('Título;Tipo;Fecha de registro;Paciente;Cédula');
    expect(csv).toContain('María Pérez López');
    expect(csv).toContain('Reposo por cinco días');

    // Borrar.
    await page.getByRole('link', { name: /Informe médico V-12345678/ }).click();
    await page.getByRole('button', { name: 'Borrar' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Borrar' }).click();
    await expectToast(page, 'Documento borrado');
    await expect(page.getByText('Aún no tienes documentos')).toBeVisible();
  });

  test('con la clave de Gemini la IA completa el formulario', async ({ page }) => {
    await signUp(page);
    await updateSettings(page, { ocrspaceKey: 'doc-informe-2', geminiKey: 'clave-de-prueba-123', defaultEngine: 'ocrspace' });
    await page.goto('/documentos/nuevo');
    await page.getByRole('button', { name: /^Acta/ }).click();
    await expect(page.getByRole('switch', { name: 'Completar con IA' })).toHaveAttribute('aria-checked', 'true');
    await page.getByLabel('Subir imágenes del documento').setInputFiles([pageImage(1)]);
    await page.getByRole('button', { name: 'Leer documento' }).click();
    await expect(page.getByText('Detectado con IA')).toBeVisible({ timeout: 20_000 });
    await expect(form(page).getByLabel('Tipo de acta', { exact: true })).toHaveValue('IA Tipo de acta');
    await expect(form(page).getByLabel('Lugar', { exact: true })).toHaveValue('IA Lugar');
    await page.getByRole('button', { name: /Guardar documento/ }).click();
    await expectToast(page, 'Documento guardado');
    await expect(page.getByText('Detectado con IA')).toBeVisible();
  });

  test('crear un tipo de documento propio y llenarlo a mano', async ({ page }) => {
    await signUp(page);
    await page.goto('/documentos');
    await page.getByRole('button', { name: 'Crear tipo' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nuevo tipo de documento' });
    await dialog.getByLabel('Nombre del tipo').fill('Constancia de pago');
    await dialog.getByRole('button', { name: 'Icono 🎓' }).click();
    await dialog.getByLabel('Nombre del campo 1').fill('Estudiante');
    await dialog.getByLabel('Nombre del campo 2').fill('Fecha de pago');
    await dialog.getByRole('button', { name: 'Añadir campo' }).click();
    await dialog.getByLabel('Nombre del campo 3').fill('Monto');
    await dialog.getByLabel('Tipo del campo 3').selectOption('money');
    await dialog.getByRole('button', { name: 'Crear tipo' }).click();
    await expectToast(page, 'Tipo de documento creado');
    await expect(page.getByText('Estudiante · Fecha de pago · Monto')).toBeVisible();

    await page.getByRole('link', { name: 'Nuevo documento' }).click();
    await page.getByRole('button', { name: /Constancia de pago/ }).click();
    await page.getByRole('button', { name: 'Llenar a mano' }).click();
    await page.getByLabel('Título del documento').fill('Constancia 55');
    await form(page).getByLabel('Estudiante').fill('Ana Torres');
    await form(page).getByLabel('Fecha de pago').fill('2025-06-01');
    await form(page).getByLabel('Monto').fill('350.50');
    await page.getByRole('button', { name: /Guardar documento \(3\/3\)/ }).click();
    await expectToast(page, 'Documento guardado');
    await expect(page.getByRole('heading', { name: 'Constancia 55' })).toBeVisible();

    await page.goto('/documentos');
    await expect(page.getByRole('link', { name: /Constancia 55/ })).toBeVisible();
    // Borrar el tipo conserva los documentos ya guardados.
    await page.getByRole('button', { name: 'Borrar tipo Constancia de pago' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Borrar' }).click();
    await expectToast(page, 'Tipo borrado');
    await expect(page.getByRole('link', { name: /Constancia 55/ })).toBeVisible();
  });
});
