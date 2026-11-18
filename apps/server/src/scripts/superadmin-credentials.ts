/**
 * Genera las credenciales del superadministrador y las tres líneas para el entorno del servidor.
 *
 *   npm run superadmin:credentials                       # genera usuario, contraseña y PIN
 *   npm run superadmin:credentials -- --username ana.sa  # usuario propio
 *   SUPERADMIN_PASSWORD=... SUPERADMIN_PIN=... npm run superadmin:credentials   # solo calcula los hashes
 *
 * Los valores en claro se muestran una única vez: guárdalos en un gestor de contraseñas.
 * Los hashes bcrypt contienen «$»: en el .env van entre comillas simples para que nada los expanda.
 */
import { randomInt } from 'node:crypto';
import { parseArgs } from 'node:util';
import bcrypt from 'bcryptjs';
import { PASSWORD_COST } from '../lib/accounts.js';
import { PIN_LENGTH, PIN_PATTERN, USERNAME_PATTERN } from '../lib/superadmin.js';

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
/** Sin comillas, barra invertida, «$» ni espacios: se pueden pegar sin escapar en .env, shells y paneles. */
const SYMBOLS = '!#%*+-=?@^_~';
/** PIN: mayúsculas y dígitos sin los ambiguos 0/O/1/I/L. */
const PIN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PASSWORD_LENGTH = 24;
const MIN_PASSWORD_LENGTH = 16;

const pick = (alphabet: string) => alphabet[randomInt(alphabet.length)];
const randomString = (alphabet: string, length: number) => Array.from({ length }, () => pick(alphabet)).join('');

function shuffle<T>(items: T[]) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** 24 caracteres con al menos uno de cada clase (minúsculas, mayúsculas, dígitos y símbolos). */
function generatePassword() {
  const all = LOWER + UPPER + DIGITS + SYMBOLS;
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < PASSWORD_LENGTH) chars.push(pick(all));
  return shuffle(chars).join('');
}

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

const { values } = parseArgs({ options: { username: { type: 'string' } } });

const username = (values.username ?? `sa-${randomString(LOWER + DIGITS, 8)}`).trim().toLowerCase();
if (!USERNAME_PATTERN.test(username)) fail('el usuario debe tener entre 4 y 32 caracteres: minúsculas, números, punto, guion o guion bajo.');

const envPassword = process.env.SUPERADMIN_PASSWORD;
const envPin = process.env.SUPERADMIN_PIN?.trim().toUpperCase();
if (envPassword !== undefined && envPassword.length < MIN_PASSWORD_LENGTH) fail(`SUPERADMIN_PASSWORD debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
if (envPin !== undefined && !PIN_PATTERN.test(envPin)) fail(`SUPERADMIN_PIN debe tener exactamente ${PIN_LENGTH} caracteres A-Z o 0-9.`);

/** Motivo por el que un PIN elegido a mano es débil, o undefined si no se detecta ninguno. */
function weakPinReason(value: string): string | undefined {
  const MIN_DISTINCT = 6;
  if (new Set(value).size === 1) return 'todos los caracteres son iguales';
  const codes = [...value].map((c) => c.charCodeAt(0));
  const steps = codes.slice(1).map((code, i) => code - codes[i]);
  if (steps.every((step) => step === 1) || steps.every((step) => step === -1)) return 'es una secuencia (p. ej. ABCD… o 9876…)';
  if (new Set(value).size < MIN_DISTINCT) return `tiene menos de ${MIN_DISTINCT} caracteres distintos`;
  return undefined;
}

if (envPin !== undefined) {
  const reason = weakPinReason(envPin);
  if (reason) console.warn(`Aviso: el SUPERADMIN_PIN indicado es débil (${reason}). Mejor deja que el script genere uno.
`);
}

const password = envPassword ?? generatePassword();
const pin = envPin ?? randomString(PIN_ALPHABET, PIN_LENGTH);
const [passwordHash, pinHash] = await Promise.all([bcrypt.hash(password, PASSWORD_COST), bcrypt.hash(pin, PASSWORD_COST)]);

console.log('Credenciales del superadministrador (se muestran una sola vez; guárdalas en un gestor de contraseñas):\n');
console.log(`  Usuario:     ${username}`);
console.log(`  Contraseña:  ${envPassword === undefined ? password : '(la de SUPERADMIN_PASSWORD)'}`);
console.log(`  PIN:         ${envPin === undefined ? pin : '(el de SUPERADMIN_PIN)'}`);
console.log('\nLíneas para el entorno del servidor (los hashes van entre comillas simples por los «$»):\n');
console.log(`SUPERADMIN_USERNAME=${username}`);
console.log(`SUPERADMIN_PASSWORD_HASH='${passwordHash}'`);
console.log(`SUPERADMIN_PIN_HASH='${pinHash}'`);
console.log('\nDespués reinicia el servidor: al arrancar crea o actualiza el superadministrador. Entra en /superadmin.');
