/**
 * Simulador local de OCR.space y Gemini para las pruebas E2E.
 * Responde con el mismo formato que las APIs reales; la clave "clave-invalida" simula una clave rechazada.
 */
import http from 'node:http';

const PORT = Number(process.env.MOCK_PORT ?? 4010);
const INVALID = 'clave-invalida';
// Pequeña espera para que en las pruebas se vea la barra de progreso, como con la API real.
const DELAY_MS = Number(process.env.MOCK_DELAY_MS ?? 600);
const wait = () => new Promise((r) => setTimeout(r, DELAY_MS));

const ANALYSIS = {
  resumen: 'Acta de reunión de docentes para revisar las calificaciones del lapso.',
  tipoDocumento: 'Acta',
  datosClave: [
    { dato: 'Número de acta', valor: '12' },
    { dato: 'Fecha', valor: '2025-03-15' },
  ],
  entidades: [{ nombre: 'Unidad Educativa San José', tipo: 'institución' }],
  observaciones: ['No se menciona la firma del director.'],
  calidadOcr: 'Buena, sin errores evidentes.',
};

/** Con una API key de OCR.space que empieza por «doc-informe» se devuelve el texto de un informe médico. */
const MEDICAL_REPORT = [
  'Clínica Santa Ana',
  'INFORME MÉDICO',
  'Paciente: María Pérez',
  'Cédula: V-12345678',
  'Fecha: 15/03/2025',
  'Médico tratante: Dr. Luis Gómez',
  'Diagnóstico: Faringitis aguda',
  'Indicaciones: Reposo por tres días',
].join('\r\n');

let counter = 0;

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': typeof body === 'string' ? 'text/plain' : 'application/json' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

http
  .createServer(async (req, res) => {
    const body = await readBody(req);

    if (req.method === 'POST' && req.url === '/parse/image') {
      if (req.headers.apikey === INVALID) return send(res, 403, 'The API key is invalid');
      await wait();
      counter++;
      if (String(req.headers.apikey).startsWith('doc-informe')) {
        return send(res, 200, { IsErroredOnProcessing: false, OCRExitCode: 1, ParsedResults: [{ ParsedText: MEDICAL_REPORT }] });
      }
      return send(res, 200, {
        IsErroredOnProcessing: false,
        OCRExitCode: 1,
        ParsedResults: [{ ParsedText: `Texto de OCR.space número ${counter}: acta de reunión de docentes del plantel.\r\n\r\n— ${counter + 10} —\r\n` }],
      });
    }

    const gemini = req.url?.match(/^\/v1beta\/models\/([^/:]+):generateContent/);
    if (req.method === 'POST' && gemini) {
      if (req.headers['x-goog-api-key'] === INVALID) {
        return send(res, 400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.' } });
      }
      if (gemini[1] === 'modelo-inexistente') return send(res, 404, { error: { code: 404, message: 'model not found' } });
      const payload = JSON.parse(body.toString('utf8'));
      await wait();
      const parts = payload.contents?.[0]?.parts ?? [];
      let text = 'ok';
      const schema = payload.generationConfig?.responseSchema;
      if (schema && !schema.properties?.resumen) {
        // Extracción de datos de un documento: un valor reconocible por campo.
        text = JSON.stringify(Object.fromEntries(Object.entries(schema.properties).map(([key, p]) => [key, `IA ${p.description ?? key}`])));
      } else if (schema) text = JSON.stringify(ANALYSIS);
      else if (parts.some((p) => p.inline_data)) {
        counter++;
        text = `Texto de Gemini número ${counter}: ficha de inscripción del estudiante.`;
      }
      return send(res, 200, { candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] });
    }

    send(res, 404, { error: 'not found' });
  })
  .listen(PORT, () => console.log(`Simulador de proveedores en http://localhost:${PORT}`));
