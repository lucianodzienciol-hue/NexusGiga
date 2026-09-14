#!/usr/bin/env node
// cargar-tenant.mjs — Vincula la tienda online a la app instalada en la PC del cliente.
// Escribe tenantSlug/tenantWorker/tenantToken en companyConfig de la base local.
// Uso:
//   node herramientas/cargar-tenant.mjs --db "<ruta database.db>" --slug <slug>
//     --worker <URL worker> --token <syncToken>
// La app debe estar CERRADA (la base no puede estar en uso).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  return def;
}

const dbPath = path.resolve(arg('db', ''));
const slug = (arg('slug', '') || '').toLowerCase().trim();
const worker = (arg('worker', '') || '').replace(/\/+$/, '');
const token = arg('token', '');

if (!dbPath || !fs.existsSync(dbPath)) { console.error('Falta --db <ruta database.db> válida (y la app cerrada).'); process.exit(2); }
if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) { console.error('Falta --slug válido.'); process.exit(2); }
if (!/^https?:\/\//.test(worker)) { console.error('Falta --worker <URL>.'); process.exit(2); }
if (!token) { console.error('Falta --token <syncToken>.'); process.exit(2); }

const creq = createRequire(path.join(ROOT, 'api-server.js'));
let Database;
try { Database = creq('better-sqlite3'); }
catch { Database = creq(path.join(ROOT, 'node_modules', 'better-sqlite3')); }

const db = new Database(dbPath);
db.prepare('CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT)').run();
let current = {};
try {
  const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get('companyConfig');
  if (row) current = JSON.parse(row.value);
} catch {}
const updated = { ...current, tenantSlug: slug, tenantWorker: worker, tenantToken: token };
db.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?,?)').run('companyConfig', JSON.stringify(updated));
db.close();
console.log(`OK: tienda "${slug}" vinculada en ${dbPath}`);
console.log('Abrí la app → Pedidos → Sincronizar tienda para verificar.');
