import { createApp } from './app.js';
import { config } from './config.js';
import { openDatabase } from './db/index.js';
import { createCipher } from './lib/crypto.js';
import { resolveSecret } from './lib/secrets.js';
import { syncSuperadmin } from './lib/superadmin.js';

// Aplica las migraciones pendientes antes de aceptar tráfico.
const db = await openDatabase({ url: config.databaseUrl, dataDir: config.dataDir });
console.log(config.databaseUrl ? 'Base de datos: PostgreSQL (DATABASE_URL)' : `Base de datos: PGlite en ${config.dataDir}`);
// El entorno manda: crea el superadministrador o le aplica las credenciales actuales (nunca se registran los hashes).
if (config.superadmin) {
  // Ante un choque con una cuenta normal, syncSuperadmin ya lo registra como error y la app arranca sin él.
  if ((await syncSuperadmin(db, config.superadmin)) !== 'conflict') console.log('Superadministrador sincronizado');
} else {
  console.warn('Aviso: SUPERADMIN_USERNAME / SUPERADMIN_PASSWORD_HASH / SUPERADMIN_PIN_HASH no están definidas; no se sincroniza el superadministrador.');
}
const app = createApp(
  {
    db,
    cipher: createCipher(await resolveSecret(db, 'ENCRYPTION_KEY', config.encryptionKey)),
    jwtSecret: await resolveSecret(db, 'JWT_SECRET', config.jwtSecret),
    secureCookies: config.isProduction,
    fallbackKeys: config.fallbackKeys,
  },
  { webDist: config.webDist },
);

const server = app.listen(config.port, config.host, () => {
  console.log(`Ocryon escuchando en http://${config.host}:${config.port}`);
});

// Parada ordenada (docker stop / redespliegue): termina las peticiones en curso y cierra la base.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    server.close(() => {
      void db.close().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
