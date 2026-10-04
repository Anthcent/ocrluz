import { expect, test } from '@playwright/test';
import { createScans, signUp } from './helpers';
// Ninguna pantalla debe tener desplazamiento horizontal en móvil.
test('sin desbordamiento horizontal', async ({ page }) => {
  await signUp(page);
  const { groupId, ids } = await createScans(page, { newGroup: { title: 'Una carpeta con un título bastante largo para probar', author: 'Coordinación de control de estudios y evaluación', category: 'Ficha de inscripción', totalPages: 10 }, items: [{ text: 'inscripción '.repeat(50), engine: 'manual' }] });
  await createScans(page, { items: [{ text: 'Constancia: la ficha de inscripción del estudiante debe entregarse en secretaría mañana.', engine: 'manual' }] });
  const doc = await page.request.post('/api/documents', {
    headers: { 'X-Requested-With': 'ocryon' },
    data: { templateKey: 'informe_medico', templateName: 'Informe médico', title: 'Informe médico con un título muy largo para probar el desbordamiento V-12345678', fields: [{ key: 'paciente', label: 'Paciente', type: 'text', value: 'Una paciente con un nombre y apellidos larguísimos de verdad' }], text: 'texto', engine: 'manual', method: 'manual' },
  });
  const { document } = await doc.json();
  for (const url of ['/documentos', '/documentos/nuevo', `/documentos/${document.id}`, '/', '/escanear', '/archivo', '/archivo?vista=individuales', `/archivo/carpeta/${groupId}`, `/escaneo/${ids[0]}`, '/buscar?q=inscripcion', '/ajustes']) {
    await page.goto(url);
    await page.waitForTimeout(600);
    const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(sw, url).toBeLessThanOrEqual(cw);
  }
});
