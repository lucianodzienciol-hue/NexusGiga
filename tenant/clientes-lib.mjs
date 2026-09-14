// clientes-lib.mjs — núcleo compartido (CLI + panel vía API) para gestión de tenants.
// Sin efectos al importar. Requiere Node 18+ (fetch nativo).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
export const DEFAULT_REGISTRY = path.join(__dirname, '..', 'herramientas', 'clientes.json');

export function validSlug(slug) {
  return /^[a-z0-9][a-z0-9-]{0,62}$/.test(String(slug || '').toLowerCase());
}

export function loadRegistry(regPath) {
  const file = regPath || DEFAULT_REGISTRY;
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const j = JSON.parse(raw);
    if (j && Array.isArray(j.clients)) return j;
  } catch {}
  return { version: 1, clients: [] };
}

export function saveRegistry(reg, regPath) {
  const file = regPath || DEFAULT_REGISTRY;
  const prev = loadRegistry(file);
  if (prev.clients.length > 0 || (reg.clients && reg.clients.length > 0)) {
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      fs.writeFileSync(file + '.' + stamp + '.bak', JSON.stringify(prev, null, 2));
    } catch {}
  }
  const out = { version: 1, clients: reg.clients || [] };
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  try { fs.chmodSync(file, 0o600); } catch {}
  return out;
}

export function upsertLocal(reg, entry, regPath) {
  const ix = reg.clients.findIndex((c) => c.slug === entry.slug);
  if (ix === -1) reg.clients.push(entry);
  else reg.clients[ix] = { ...reg.clients[ix], ...entry };
  return saveRegistry(reg, regPath);
}

export function removeLocal(reg, slug, regPath) {
  reg.clients = reg.clients.filter((c) => c.slug !== slug);
  return saveRegistry(reg, regPath);
}

export async function workerApi(workerBase, panelToken, apiPath, method, body) {
  const url = String(workerBase).replace(/\/+$/, '') + apiPath;
  const r = await fetch(url, {
    method: method || 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + panelToken },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error((j && j.error) || ('HTTP ' + r.status));
    err.status = r.status;
    err.body = j;
    throw err;
  }
  return j;
}

export async function vendorList(workerBase, panelToken) {
  return workerApi(workerBase, panelToken, '/vendor/clients', 'GET');
}

export async function vendorAction(workerBase, panelToken, slug, action, extra) {
  return workerApi(workerBase, panelToken, '/vendor/action', 'POST', { slug, action, ...(extra || {}) });
}

function loadSqlite(dbPath) {
  const creq = createRequire(path.join(ROOT, 'api-server.js'));
  let Database = null;
  try { Database = creq('better-sqlite3'); }
  catch { Database = creq(path.join(ROOT, 'node_modules', 'better-sqlite3')); }
  if (!fs.existsSync(dbPath)) throw new Error('No existe la base: ' + dbPath);
  return new Database(dbPath, { readonly: true });
}

export function readStoreStatic(dbPath) {
  const db = loadSqlite(dbPath);
  const products = db.prepare("SELECT * FROM products WHERE source = 'web' ORDER BY name").all().map((p) => ({
    ...p,
    desc: p.description || p.webDesc || '',
    oferta: !!p.oferta,
    nuevo: !!p.nuevo,
    oldPrice: p.oferta && p.ofertaPrice ? p.ofertaPrice : undefined,
  }));
  const categories = db.prepare('SELECT * FROM web_categories ORDER BY name').all();
  const services = db.prepare('SELECT * FROM web_services ORDER BY name').all();
  let webConfig = {};
  let company = {};
  try {
    const r = db.prepare("SELECT value FROM app_config WHERE key = 'webConfig'").get();
    if (r) webConfig = JSON.parse(r.value);
  } catch {}
  try {
    const r = db.prepare("SELECT value FROM app_config WHERE key = 'companyConfig'").get();
    if (r) company = JSON.parse(r.value);
  } catch {}
  db.close();
  const config = { ...webConfig, companyName: webConfig.companyName || company.companyName || '', whatsapp: webConfig.whatsapp || company.whatsapp || '' };
  return { products, categories, services, config };
}

export function writeStaticFiles(webDir, outDir, store) {
  const SKIP = new Set(['data.json', '_respaldo-viejo']);
  const copyTree = (src, dst) => {
    fs.mkdirSync(dst, { recursive: true });
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
      if (SKIP.has(e.name)) continue;
      const s = path.join(src, e.name), d = path.join(dst, e.name);
      if (e.isDirectory()) copyTree(s, d);
      else fs.copyFileSync(s, d);
    }
  };
  fs.rmSync(outDir, { recursive: true, force: true });
  copyTree(webDir, outDir);
  fs.writeFileSync(path.join(outDir, 'data.json'), JSON.stringify(store, null, 2));
  return outDir;
}

export function backupName(regPath) {
  const stamp = new Date().toISOString().slice(0, 10);
  return (regPath || DEFAULT_REGISTRY) + '.' + stamp + '.bak';
}
