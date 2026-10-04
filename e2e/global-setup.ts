import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

export const FIXTURES = path.join(__dirname, '.fixtures');

const PAGES = [
  'ACTA DE REUNIÓN. En la sede del plantel, a los quince días del mes de marzo, se reunieron los docentes para revisar las calificaciones del lapso.',
  'FICHA DE INSCRIPCIÓN. Estudiante: María Pérez. Grado: tercer año, sección B. Representante: José Pérez, teléfono 0412 555 1234.',
  'INFORME MÉDICO. Paciente con buen estado general de salud. Se indica reposo por tres días y control en una semana.',
];

/** Genera "fotos" de hojas de documentos y un archivo que no es una imagen válida. */
export default async function globalSetup() {
  fs.mkdirSync(FIXTURES, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  for (const [i, text] of PAGES.entries()) {
    await page.setContent(
      `<body style="margin:0;background:#ffffff;font:36px Arial,sans-serif;padding:80px;line-height:1.6;color:#222"><p>${text}</p></body>`,
    );
    await page.screenshot({ path: path.join(FIXTURES, `pagina-${i + 1}.png`) });
  }
  await browser.close();
  fs.writeFileSync(path.join(FIXTURES, 'no-es-imagen.png'), 'esto no es una imagen');
}
