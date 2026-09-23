import express from 'express';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
import crypto from 'crypto';
import os from 'os';
import { exec, execSync } from 'child_process';

const __dirname = path.resolve(path.dirname(process.argv[1] || '.'));
const require = createRequire(pathToFileURL(path.join(__dirname, 'api-server.js')).href);
const IS_EXE = !/^node(\.exe)?$/i.test(path.basename(process.execPath || ''));
const ROOT = process.env.NEXUS_DATA_DIR || (IS_EXE ? path.dirname(process.execPath) : path.resolve(__dirname));
try { fs.mkdirSync(ROOT, { recursive: true }); } catch {}

// Si los datos viven fuera del programa (Electron/VBS), migrar la base vieja
// que haya junto al ejecutable una sola vez.
function migrateLegacyDb() {
  try {
    if (!process.env.NEXUS_DATA_DIR || fs.existsSync(DB_FILE)) return;
    const legacy = path.join(path.dirname(process.execPath), 'database.db');
    if (fs.existsSync(legacy) && path.resolve(legacy) !== path.resolve(DB_FILE)) {
      fs.copyFileSync(legacy, DB_FILE);
      console.log('[API] Base migrada desde ' + legacy);
    }
  } catch (e) { console.error('[API] Migración de base:', e.message); }
}
const DB_FILE = path.join(ROOT, 'database.db');
const WEB_DIR = path.resolve(__dirname, 'web');
const DIST_DIR = (() => {
  const lite = path.resolve(__dirname, 'dist-lite');
  if (String(process.env.APP_EDITION || 'full').toLowerCase() === 'lite' && fs.existsSync(path.join(lite, 'index.html'))) return lite;
  return path.resolve(__dirname, 'dist');
})();
const BACKUPS_DIR = path.resolve(ROOT, 'backups');
const PORT = parseInt(process.env.PORT || '4051', 10);
const IS_STANDALONE = process.env.STANDALONE === 'true';

// Minimal .env loader (no dependency)
function loadEnv() {
  try {
    const p = path.join(ROOT, '.env');
    if (!fs.existsSync(p)) return;
    const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
    for (const l of lines) {
      const m = l.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch (e) {
    console.error('[API] Error loading .env:', e.message);
  }
}
loadEnv();

let db = null;
const sseClients = [];

function broadcastSSE(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (let i = sseClients.length - 1; i >= 0; i--) {
    try {
      sseClients[i].write(msg);
    } catch {
      sseClients.splice(i, 1);
    }
  }
}

function checkIntegrity(handle) {
  try {
    const row = handle.prepare('PRAGMA integrity_check').get();
    return row && row.integrity_check === 'ok';
  } catch { return false; }
}

function openDbReadOnly(file) {
  let Database = null;
  try { Database = require('better-sqlite3'); }
  catch { Database = require(path.join(path.dirname(process.execPath), 'native', 'better-sqlite3')); }
  return new Database(file, { readonly: true });
}

function backupTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function getDb() {
  if (db) return db;
  try {
    let Database = null;
    try { Database = require('better-sqlite3'); }
    catch { Database = require(path.join(path.dirname(process.execPath), 'native', 'better-sqlite3')); }
    db = new Database(DB_FILE, {});
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    db.pragma('foreign_keys = ON');
    if (!checkIntegrity(db)) {
      try { db.close(); } catch {}
      db = null;
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const sick = path.join(ROOT, `database-corrupt-${stamp}.db`);
      try {
        if (fs.existsSync(DB_FILE)) fs.copyFileSync(DB_FILE, sick);
        for (const sfx of ['-wal', '-shm', '-journal']) {
          try { fs.rmSync(DB_FILE + sfx, { force: true }); } catch {}
        }
        try { fs.rmSync(DB_FILE, { force: true }); } catch {}
      } catch {}
      console.error(`[API] Base de datos corrupta: se resguardo en ${sick} y se arranca con base nueva.`);
      db = new Database(DB_FILE, {});
      db.pragma('journal_mode = WAL');
      db.pragma('busy_timeout = 5000');
      db.pragma('foreign_keys = ON');
    }
    return db;
  } catch (e) {
    console.error('[API] Error loading better-sqlite3:', e.message);
    return null;
  }
}

const app = express();
app.use(express.json({ limit: '10mb' }));
// Compresión gzip para JSON del API y estáticos: reduce ~70% el peso transferido.
app.use(compression());

// ============ SECURITY ============
const SESSION_NAME = 'nexus_session';
const SESSION_SECRET = crypto.randomBytes(32).toString('hex');

function hmac(val) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(val).digest('hex');
}

function getCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i !== -1) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function hasValidSession(req) {
  const raw = getCookies(req.headers.cookie || '')[SESSION_NAME];
  if (!raw) return false;
  const dot = raw.lastIndexOf('.');
  if (dot === -1) return false;
  const token = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!token || !sig) return false;
  const expected = hmac(token);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function setSession(res) {
  const token = crypto.randomBytes(32).toString('hex');
  const val = token + '.' + hmac(token);
  res.setHeader('Set-Cookie', SESSION_NAME + '=' + val + '; HttpOnly; SameSite=Strict; Path=/');
}

function setSessionIfMissing(req, res) {
  if (!hasValidSession(req)) setSession(res);
}

// In-memory rate limiter (simple, per-IP)
const rateBuckets = new Map();
function rateLimit(opts) {
  return (req, res, next) => {
    const key = (req.ip || req.socket?.remoteAddress || 'local') + '|' + req.path;
    const now = Date.now();
    const bucket = rateBuckets.get(key) || { count: 0, resetAt: now + opts.windowMs };
    if (bucket.resetAt <= now) { bucket.count = 0; bucket.resetAt = now + opts.windowMs; }
    bucket.count++;
    if (bucket.count > opts.max) {
      return res.status(429).json({ error: 'Demasiadas solicitudes. Intente más tarde.' });
    }
    rateBuckets.set(key, bucket);
    if (rateBuckets.size > 10000) rateBuckets.clear();
    next();
  };
}

const ALLOWED_HOSTS = ['localhost', '127.0.0.1', '::1'];

// Security headers + DNS-rebinding protection (server is local-only)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  const hostname = (req.headers.host || '').split(':')[0].toLowerCase();
  if (!ALLOWED_HOSTS.includes(hostname)) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  next();
});

// CORS: allow the storefront (deployed on GitHub Pages / configured web origin)
// to POST orders to this local server, otherwise the browser blocks the request.
const ALLOWED_ORIGINS = new Set([
  'http://localhost:4050',
  'http://127.0.0.1:4050',
  'https://malcriadodevinos-bot.github.io'
]);
function isAllowedCorsOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  const cfg = getConfig('companyConfig', {});
  for (const u of [cfg.domain, cfg.webUrl]) {
    if (u) {
      try { if (new URL(u).origin === origin) return true; } catch {}
    }
  }
  return false;
}
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && isAllowedCorsOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// Issue the admin session cookie on non-API (page/assets) requests
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  setSessionIfMissing(req, res);
  next();
});

// ============ DEMO TRIAL (N días desde primer uso; solo con NEXUS_DEMO=1) ============
const DEMO_MODE = process.env.NEXUS_DEMO === '1';
const DEMO_DAYS = Math.max(1, parseInt(process.env.NEXUS_DEMO_DAYS || '15', 10) || 15);
const DEMO_EDITION = String(process.env.APP_EDITION || 'full').toLowerCase() === 'lite' ? 'lite' : 'full';
const DEMO_REG = 'HKCU\\Software\\NexusDemo\\' + DEMO_EDITION;
let demoCache = null;
let demoCacheAt = 0;
function demoRegRead() {
  try {
    const out = execSync(`reg query "${DEMO_REG}" /v installDate`, { timeout: 8000 }).toString();
    const m = out.match(/installDate\s+REG_SZ\s+(\S+)/);
    return m ? m[1] : null;
  } catch { return null; }
}
function demoRegWrite(iso) {
  try { execSync(`reg add "${DEMO_REG}" /v installDate /t REG_SZ /d "${iso}" /f`, { timeout: 8000, stdio: 'ignore' }); } catch {}
}
function demoParse(v) {
  if (!v) return null;
  const t = new Date(String(v)).getTime();
  return Number.isFinite(t) ? t : null;
}
function demoState() {
  const now = Date.now();
  if (demoCache && now - demoCacheAt < 60000) return demoCache;
  const fromDb = demoParse(getConfig('demoInstallDate', null));
  let fromFile = null;
  try {
    const p = path.join(ROOT, '.demo-anchor');
    if (fs.existsSync(p)) fromFile = demoParse(fs.readFileSync(p, 'utf8').trim());
  } catch {}
  const fromReg = demoParse(demoRegRead());
  let install = null;
  for (const t of [fromDb, fromFile, fromReg]) {
    if (t != null && (install == null || t < install)) install = t;
  }
  const iso = new Date(install == null ? now : install).toISOString();
  if (install == null) {
    install = now;
    try { setConfig('demoInstallDate', iso); } catch {}
    try { fs.writeFileSync(path.join(ROOT, '.demo-anchor'), iso); } catch {}
    demoRegWrite(iso);
  } else {
    if (fromDb == null) { try { setConfig('demoInstallDate', iso); } catch {} }
    try {
      const p = path.join(ROOT, '.demo-anchor');
      if (!fs.existsSync(p)) fs.writeFileSync(p, iso);
    } catch {}
    if (fromReg == null) demoRegWrite(iso);
  }
  const expiresAt = install + DEMO_DAYS * 86400000;
  const tampered = now < install - 86400000;
  const daysLeft = tampered ? 0 : Math.max(0, Math.ceil((expiresAt - now) / 86400000));
  demoCache = {
    demo: true, edition: DEMO_EDITION, days: DEMO_DAYS,
    installDate: new Date(install).toISOString(), expiresAt: new Date(expiresAt).toISOString(),
    daysLeft, expired: tampered || now >= expiresAt,
  };
  demoCacheAt = now;
  return demoCache;
}

// API gate: everything under /api requires a session unless explicitly public
function isLocalRequest(req) {
  const ip = String((req.socket && req.socket.remoteAddress) || '');
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}
const PUBLIC_API_PATHS = new Set(['/api/web-data', '/api/visits/stats']);
app.use('/api', (req, res, next) => {
  const full = req.baseUrl + req.path;
  if (req.method === 'POST' && full === '/api/orders') return next();
  if (req.method === 'POST' && full === '/api/visits/increment') return next();
  if (req.method === 'POST' && full === '/api/save' && isLocalRequest(req)) return next();
  if (req.method === 'POST' && full === '/api/generate-catalog-csv' && isLocalRequest(req)) return next();
  if (req.method === 'GET' && full.startsWith('/api/repairs/lookup/')) return next();
  if (PUBLIC_API_PATHS.has(full) && req.method === 'GET') return next();
  if (DEMO_MODE && req.method === 'GET' && full === '/api/demo-status') return next();
  if (DEMO_MODE && demoState().expired) return res.status(403).json({ error: 'Período de prueba finalizado' });
  if (hasValidSession(req)) return next();
  return res.status(401).json({ error: 'No autorizado' });
});

app.use((req, _res, next) => {
  console.log(`[API] ${req.method} ${req.url}`);
  next();
});

// ============ SCHEMA & SEED ============
const SCHEMA_VERSION = 1;
function ensureSchema() {
  const d = getDb();
  if (!d) throw new Error('Sin base de datos: no se pudo abrir ' + DB_FILE);
  d.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      price REAL NOT NULL DEFAULT 0,
      cost REAL NOT NULL DEFAULT 0,
      stock REAL NOT NULL DEFAULT 0,
      category TEXT NOT NULL DEFAULT 'Varios',
      source TEXT DEFAULT 'local',
      description TEXT DEFAULT '',
      image TEXT DEFAULT '',
      oferta INTEGER DEFAULT 0,
      nuevo INTEGER DEFAULT 0,
      webDesc TEXT DEFAULT '',
      ofertaPrice REAL DEFAULT 0,
      price_mayorista REAL NOT NULL DEFAULT 0,
      fichaTecnica TEXT DEFAULT '',
      fichaTecnicaFile TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      document TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      phone TEXT DEFAULT '-',
      email TEXT DEFAULT '-'
    );
    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      ruc TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      phone TEXT DEFAULT '-',
      email TEXT DEFAULT '-'
    );
    CREATE TABLE IF NOT EXISTS payment_methods (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      requiresCash INTEGER DEFAULT 0,
      icon TEXT DEFAULT '',
      adjustment REAL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      total REAL NOT NULL DEFAULT 0,
      paymentMethod TEXT NOT NULL DEFAULT 'Efectivo',
      clientId TEXT DEFAULT '',
      clientName TEXT DEFAULT 'Cliente General',
      cashReceived REAL DEFAULT 0,
      change REAL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      saleId TEXT NOT NULL,
      productId TEXT DEFAULT '',
      productName TEXT DEFAULT '',
      quantity REAL NOT NULL DEFAULT 0,
      price REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (saleId) REFERENCES sales(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS purchases (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      providerId TEXT DEFAULT '',
      providerName TEXT DEFAULT '',
      paymentMethod TEXT DEFAULT 'Efectivo',
      total REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchaseId TEXT NOT NULL,
      productId TEXT DEFAULT '',
      productName TEXT DEFAULT '',
      quantity REAL NOT NULL DEFAULT 0,
      cost REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (purchaseId) REFERENCES purchases(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'transferencia',
      description TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS repairs (
      id TEXT PRIMARY KEY,
      code TEXT,
      clientId TEXT DEFAULT '',
      clientName TEXT DEFAULT '',
      clientPhone TEXT DEFAULT '',
      equipment TEXT DEFAULT '',
      marca TEXT DEFAULT '',
      modelo TEXT DEFAULT '',
      status TEXT DEFAULT 'recibido',
      price REAL DEFAULT 0,
      problem TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      date TEXT NOT NULL,
      updatedAt TEXT
    );
    CREATE TABLE IF NOT EXISTS site_visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      count INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS web_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS web_services (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      desc TEXT DEFAULT '',
      icon TEXT DEFAULT '',
      price REAL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS restock_pending (
      id TEXT PRIMARY KEY,
      productId TEXT NOT NULL,
      productName TEXT NOT NULL,
      productCode TEXT DEFAULT '',
      quantity REAL NOT NULL DEFAULT 1,
      createdAt TEXT DEFAULT '',
      updatedAt TEXT DEFAULT '',
      notes TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS monthly_stats (
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      sales_count INTEGER NOT NULL DEFAULT 0,
      cash_amount REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS exchanges (
      id TEXT PRIMARY KEY,
      clientId TEXT DEFAULT '',
      clientName TEXT DEFAULT '',
      productId TEXT DEFAULT '',
      productName TEXT DEFAULT '',
      status TEXT DEFAULT 'recibido',
      date TEXT NOT NULL,
      notes TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      content TEXT DEFAULT '',
      date TEXT NOT NULL,
      category TEXT DEFAULT ''
    );
  `);
  // Índices de consulta: aceleran filtros por fecha, código y joins de ítems.
  const idx = [
    'CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date)',
    'CREATE INDEX IF NOT EXISTS idx_sale_items_saleId ON sale_items(saleId)',
    'CREATE INDEX IF NOT EXISTS idx_purchase_items_purchaseId ON purchase_items(purchaseId)',
    'CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(date)',
    'CREATE INDEX IF NOT EXISTS idx_repairs_code ON repairs(code)',
    'CREATE INDEX IF NOT EXISTS idx_repairs_date ON repairs(date)',
    'CREATE INDEX IF NOT EXISTS idx_products_source ON products(source)',
    'CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date)',
    'CREATE INDEX IF NOT EXISTS idx_monthly_stats_year_month ON monthly_stats(year, month)',
    'CREATE INDEX IF NOT EXISTS idx_restock_product ON restock_pending(productId)',
  ];
  for (const s of idx) { try { d.exec(s); } catch {} }
  d.pragma(`user_version = ${SCHEMA_VERSION}`);
}

function seedDefaults() {
  const d = getDb();
  if (!d) throw new Error('Sin base de datos: no se pudo abrir ' + DB_FILE);
  const pmts = [
    { id: 'pm1', name: 'Efectivo', requiresCash: 1, adjustment: 0 },
    { id: 'pm2', name: 'Tarjeta', requiresCash: 0, adjustment: 0 },
    { id: 'pm3', name: 'Transferencia', requiresCash: 0, adjustment: 0 },
  ];
  const insPmt = d.prepare('INSERT OR IGNORE INTO payment_methods (id, name, requiresCash, icon, adjustment) VALUES (?,?,?,\'\',?)');
  for (const pm of pmts) insPmt.run(pm.id, pm.name, pm.requiresCash, pm.adjustment);

  const cl = { id: 'c1', document: '99999999', name: 'Cliente General', phone: '-', email: 'general@nexuspos.com' };
  d.prepare('INSERT OR IGNORE INTO clients (id, document, name, phone, email) VALUES (?,?,?,?,?)').run(cl.id, cl.document, cl.name, cl.phone, cl.email);

  console.log('[API] Defaults de sistema listos (métodos de pago y cliente general)');
}

ensureSchema();
seedDefaults();

// ============ LEGACY SCHEMA MIGRATION ============
// Reconciles older Lite DB shapes with the extended tables used by
// Vender/Compras/Reparaciones/Pendientes/Estadisticas.
function migrateLegacySchema() {
  try {
    const d = getDb();
    // restock_pending: add productCode / createdAt / updatedAt (Lite v1 kept notes)
    for (const col of ['productCode TEXT DEFAULT \'\'', 'createdAt TEXT DEFAULT \'\'', 'updatedAt TEXT DEFAULT \'\'']) {
      try { d.exec(`ALTER TABLE restock_pending ADD COLUMN ${col}`); } catch {}
    }
    // products: wholesale price (0 = sin mayorista, usa minorista)
    try { d.exec('ALTER TABLE products ADD COLUMN price_mayorista REAL NOT NULL DEFAULT 0'); } catch {}
    // monthly_stats: old Lite shape used (id, month, totalSales, ...) — incompatible
    // with the year/month/sales_count/cash_amount shape. Only rebuild on legacy shape,
    // resguardando la tabla vieja en vez de borrarla.
    const cols = d.prepare("PRAGMA table_info(monthly_stats)").all().map(c => c.name);
    if (cols.includes('totalSales') || (cols.length > 0 && !cols.includes('sales_count'))) {
      const bakName = `monthly_stats_legacy_${backupTimestamp().replace(/[T-]/g, '_')}`;
      d.exec(`ALTER TABLE monthly_stats RENAME TO "${bakName}"`);
      d.exec(`CREATE TABLE IF NOT EXISTS monthly_stats (
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        sales_count INTEGER NOT NULL DEFAULT 0,
        cash_amount REAL NOT NULL DEFAULT 0
      )`);
      console.log(`[API] monthly_stats con forma vieja: resguardada como ${bakName}`);
    }
  } catch (e) {
    console.warn('[API] Migración de esquema omitida:', e.message);
  }
}
migrateLegacySchema();


// ============ PRODUCTS ============
function cleanStr(v, max) {
  return String(v || '').slice(0, max);
}
function hasNegative(...vs) {
  return vs.some(v => {
    if (v === undefined || v === null || v === '') return false;
    const n = Number(v);
    return Number.isFinite(n) && n < 0;
  });
}
function escapeLike(s) {
  return String(s || '').replace(/[\\%_]/g, c => '\\' + c);
}
function checkSaleItems(items) {
  if (!Array.isArray(items)) return 'Ítems inválidos';
  for (const it of items) {
    if (!it || typeof it !== 'object') return 'Ítem inválido';
    const q = Number(it.quantity);
    if (!Number.isFinite(q) || q <= 0) return 'Cantidad inválida en un ítem';
    if (hasNegative(it.price, it.cost)) return 'Precio inválido en un ítem';
    if (it.productId !== undefined && typeof it.productId !== 'string') return 'Ítem inválido';
  }
  return null;
}

app.get('/api/products', (req, res) => {
  try {
    const rows = getDb().prepare('SELECT * FROM products ORDER BY name').all();
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.post('/api/products', (req, res) => {
  try {
    const p = req.body || {};
    if (p.id !== undefined && (typeof p.id !== 'string' || p.id.length > 100)) return res.status(400).json({ error: 'ID inválido' });
    const id = p.id || Date.now().toString();
    if (hasNegative(p.price, p.cost, p.stock, p.ofertaPrice, p.price_mayorista)) return res.status(400).json({ error: 'Precio, costo o stock inválido' });
    getDb().prepare(`INSERT OR REPLACE INTO products (id, code, name, price, cost, stock, category, source, description, image, oferta, nuevo, webDesc, ofertaPrice, price_mayorista, fichaTecnica, fichaTecnicaFile) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, cleanStr(p.code, 100), cleanStr(p.name, 300), Number(p.price) || 0, Number(p.cost) || 0, Number(p.stock) || 0,
      cleanStr(p.category, 100), p.source === 'web' ? 'web' : 'local', cleanStr(p.desc, 5000), cleanStr(p.image, 2000),
      p.oferta ? 1 : 0, p.nuevo ? 1 : 0, cleanStr(p.webDesc, 5000), Number(p.ofertaPrice) || 0, Number(p.price_mayorista) || 0,
      cleanStr(p.fichaTecnica, 2000), cleanStr(p.fichaTecnicaFile, 2000)
    );
    res.json({ success: true, id });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.put('/api/products/:id', (req, res) => {
  try {
    if (!req.params.id || req.params.id.length > 100) return res.status(400).json({ error: 'ID inválido' });
    const p = req.body || {};
    if (hasNegative(p.price, p.cost, p.stock, p.ofertaPrice, p.price_mayorista)) return res.status(400).json({ error: 'Precio, costo o stock inválido' });
    const existing = getDb().prepare('SELECT source, price_mayorista FROM products WHERE id=?').get(req.params.id);
    const source = p.source === 'web' ? 'web' : p.source === 'local' ? 'local' : (existing ? existing.source : 'web');
    const mayorista = p.price_mayorista !== undefined ? (Number(p.price_mayorista) || 0) : (existing ? Number(existing.price_mayorista) || 0 : 0);
    getDb().prepare(`UPDATE products SET code=?, name=?, price=?, cost=?, stock=?, category=?, source=?, description=?, image=?, oferta=?, nuevo=?, webDesc=?, ofertaPrice=?, price_mayorista=?, fichaTecnica=?, fichaTecnicaFile=? WHERE id=?`).run(
      cleanStr(p.code, 100), cleanStr(p.name, 300), Number(p.price) || 0, Number(p.cost) || 0, Number(p.stock) || 0,
      cleanStr(p.category, 100), source, cleanStr(p.desc, 5000), cleanStr(p.image, 2000),
      p.oferta ? 1 : 0, p.nuevo ? 1 : 0, cleanStr(p.webDesc, 5000), Number(p.ofertaPrice) || 0, mayorista,
      cleanStr(p.fichaTecnica, 2000), cleanStr(p.fichaTecnicaFile, 2000), req.params.id
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.delete('/api/products/:id', (req, res) => {
  try {
    if (!req.params.id || req.params.id.length > 100) return res.status(400).json({ error: 'ID inválido' });
    const d = getDb();
    const usedSale = d.prepare('SELECT 1 FROM sale_items WHERE productId = ? LIMIT 1').get(req.params.id);
    const usedBuy = d.prepare('SELECT 1 FROM purchase_items WHERE productId = ? LIMIT 1').get(req.params.id);
    const usedPend = d.prepare('SELECT 1 FROM restock_pending WHERE productId = ? LIMIT 1').get(req.params.id);
    if (usedSale || usedBuy || usedPend) {
      return res.status(409).json({ error: 'No se puede borrar: el producto tiene movimientos. Cambialo a otra categoría o editalo.' });
    }
    d.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.post('/api/products/bulk-price-update', (req, res) => {
  try {
    const pct = Number(req.body.percentage) || 0;
    if (!isFinite(pct) || pct === 0) return res.status(400).json({ error: 'Porcentaje inválido' });
    const target = req.body.target === 'mayorista' ? 'mayorista' : req.body.target === 'ambas' ? 'ambas' : 'minorista';
    const factor = 1 + pct / 100;
    const d = getDb();
    let count = 0;
    d.transaction(() => {
      const rows = d.prepare('SELECT id, price, price_mayorista FROM products').all();
      const updMin = d.prepare('UPDATE products SET price = ? WHERE id = ?');
      const updMay = d.prepare('UPDATE products SET price_mayorista = ? WHERE id = ?');
      for (const r of rows) {
        if (target === 'minorista' || target === 'ambas') updMin.run(Math.round(r.price * factor), r.id);
        if (target === 'mayorista' || target === 'ambas') updMay.run(Math.round((Number(r.price_mayorista) || 0) * factor), r.id);
        count++;
      }
    })();
    res.json({ success: true, count });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

// ============ WEB DATA ============
app.get('/api/web-data', (req, res) => {
  try {
    const d = getDb();
    const local = isLocalRequest(req);
    const dbProducts = d.prepare("SELECT * FROM products WHERE source = 'web'").all();
    // Datos sensibles (clientes/reparaciones) solo para peticiones locales; nunca a visitantes de la LAN.
    const clients = local ? d.prepare('SELECT * FROM clients').all() : [];
    const repairs = local ? d.prepare('SELECT * FROM repairs ORDER BY date DESC').all() : [];
    const services = d.prepare('SELECT * FROM web_services ORDER BY name').all();
    const config = getConfig('webConfig', {});
    const companyCfg = getConfig('companyConfig', {});
    const categories = d.prepare('SELECT * FROM web_categories ORDER BY name').all();
    const products = dbProducts.map(p => ({
      ...p,
      desc: p.description || p.webDesc || '',
      oferta: !!p.oferta,
      nuevo: !!p.nuevo,
      oldPrice: p.oferta && p.ofertaPrice ? p.ofertaPrice : undefined,
    }));
    const WEB_CONFIG_KEYS = ['companyName', 'address', 'phone', 'whatsapp', 'email', 'hours', 'instagram', 'facebook', 'popupActive', 'popupImage', 'popupDuration', 'popupText', 'popupDelay', 'popupAlways', 'homeProductLimit', 'homeRandomOrder', 'googleAnalyticsId', 'gtmId', 'siteTitle', 'siteDescription', 'banners', 'priceListsEnabled', 'currency'];
    const pickCfg = (src) => Object.fromEntries(WEB_CONFIG_KEYS.filter(k => src && src[k] !== undefined).map(k => [k, src[k]]));
    const cfgOut = { ...pickCfg(companyCfg), ...pickCfg(config) };
    cfgOut.priceListsEnabled = !!(companyCfg.priceListsEnabled || config.priceListsEnabled);
    if ((!Array.isArray(cfgOut.banners) || cfgOut.banners.length === 0) && Array.isArray(companyCfg.banners) && companyCfg.banners.length) {
      cfgOut.banners = companyCfg.banners;
    }
    cfgOut.gtmId = cfgOut.gtmId || companyCfg.gtmId || '';
    cfgOut.googleAnalyticsId = cfgOut.googleAnalyticsId || companyCfg.googleAnalyticsId || '';

    res.json({ products, clients, repairs, services, config: cfgOut, categories });
  } catch { res.json({ products: [], clients: [], repairs: [], services: [], config: {}, categories: [] }); }
});

// Guardado desde el panel admin de la web (bundle completo, upserts por id)
app.post('/api/save', (req, res) => {
  try {
    const data = req.body || {};
    const d = getDb();
    d.transaction(() => {
      const getProduct = d.prepare('SELECT * FROM products WHERE id = ?');
      const updProduct = d.prepare(`UPDATE products SET code=?, name=?, price=?, category=?, description=?, image=?, oferta=?, nuevo=?, webDesc=?, ofertaPrice=? WHERE id=?`);
      const insProduct = d.prepare(`INSERT INTO products (id, code, name, price, cost, stock, category, source, description, image, oferta, nuevo, webDesc, ofertaPrice, fichaTecnica, fichaTecnicaFile) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      for (const p of (data.products || [])) {
        if (p.id === undefined || p.id === null) continue;
        const descStr = String(p.desc ?? p.description ?? p.webDesc ?? '');
        const existing = getProduct.get(String(p.id));
        if (existing) {
          const descOut = p.desc !== undefined || p.description !== undefined || p.webDesc !== undefined ? descStr : (existing.description ?? '');
          updProduct.run(
            p.code ?? existing.code,
            p.name ?? existing.name,
            Number(p.price ?? existing.price) || 0,
            p.category ?? existing.category,
            descOut,
            p.image ?? existing.image,
            p.oferta !== undefined ? (p.oferta ? 1 : 0) : existing.oferta,
            p.nuevo !== undefined ? (p.nuevo ? 1 : 0) : existing.nuevo,
            descOut,
            p.oldPrice !== undefined ? (Number(p.oldPrice) || 0) : (p.ofertaPrice !== undefined ? (Number(p.ofertaPrice) || 0) : existing.ofertaPrice),
            String(p.id)
          );
        } else {
          insProduct.run(String(p.id), p.code || String(p.id), p.name || '', Number(p.price) || 0, Number(p.cost) || 0, Number(p.stock) || 0, p.category || 'Varios', 'web', descStr, p.image || '', p.oferta ? 1 : 0, p.nuevo ? 1 : 0, descStr, Number(p.oldPrice ?? p.ofertaPrice) || 0, p.fichaTecnica || '', p.fichaTecnicaFile || '');
        }
      }

      // No borrar categorías/servicios si el bundle no los incluye.
      if (Array.isArray(data.categories)) {
        const delCats = d.prepare('DELETE FROM web_categories');
        const insCat = d.prepare('INSERT INTO web_categories (id, name) VALUES (?,?)');
        delCats.run();
        for (const c of data.categories) { insCat.run(c.id, c.name || ''); }
      }

      if (Array.isArray(data.services)) {
        const delSvcs = d.prepare('DELETE FROM web_services');
        const insSvc = d.prepare('INSERT INTO web_services (id, name, desc, icon, price) VALUES (?,?,?,?,?)');
        delSvcs.run();
        for (const s of data.services) { insSvc.run(s.id, s.name || '', s.desc || s.description || '', s.icon || '', Number(s.price) || 0); }
      }

      const getClient = d.prepare('SELECT * FROM clients WHERE id = ?');
      const updClient = d.prepare('UPDATE clients SET document=?, name=?, phone=?, email=? WHERE id=?');
      const insClient = d.prepare('INSERT INTO clients (id, document, name, phone, email) VALUES (?,?,?,?,?)');
      for (const c of (data.clients || [])) {
        if (!c.id) continue;
        const ex = getClient.get(c.id);
        if (ex) updClient.run(c.document ?? ex.document, c.name ?? ex.name, c.phone ?? ex.phone, c.email ?? ex.email, c.id);
        else insClient.run(c.id, c.document || '', c.name || '', c.phone || '-', c.email || '-');
      }

      const getRepair = d.prepare('SELECT * FROM repairs WHERE id = ?');
      const updRepair = d.prepare('UPDATE repairs SET code=?, clientId=?, clientName=?, clientPhone=?, equipment=?, marca=?, modelo=?, status=?, problem=?, notes=?, price=?, date=?, updatedAt=? WHERE id=?');
      const insRepair = d.prepare('INSERT INTO repairs (id, code, clientId, clientName, clientPhone, equipment, marca, modelo, status, problem, notes, price, date, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
      for (const r of (data.repairs || [])) {
        if (!r.id) continue;
        const ex = getRepair.get(r.id);
        if (ex) updRepair.run(r.code ?? ex.code, r.clientId ?? ex.clientId, r.clientName ?? ex.clientName, r.clientPhone ?? ex.clientPhone, r.equipment ?? ex.equipment, r.marca ?? ex.marca, r.modelo ?? ex.modelo, r.status ?? ex.status, r.problem ?? ex.problem, r.notes ?? ex.notes, Number(r.price ?? ex.price) || 0, r.date ?? ex.date, r.updatedAt ?? new Date().toISOString(), r.id);
        else insRepair.run(r.id, r.code || '', r.clientId || '', r.clientName || '', r.clientPhone || '', r.equipment || '', r.marca || '', r.modelo || '', r.status || 'recibido', r.problem || '', r.notes || '', Number(r.price) || 0, r.date || new Date().toISOString(), r.updatedAt || new Date().toISOString());
      }

      if (data.config) setConfig('webConfig', data.config);
    })();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: 'Error interno del servidor' }); }
});

app.post('/api/web-save', (req, res) => {
  try {
    const data = req.body;
    const d = getDb();
    const getProduct = d.prepare('SELECT * FROM products WHERE id = ?');
    const updProduct = d.prepare(`UPDATE products SET code=?, name=?, price=?, category=?, description=?, image=?, oferta=?, nuevo=?, webDesc=?, ofertaPrice=?, price_mayorista=? WHERE id=?`);
    const insProduct = d.prepare(`INSERT INTO products (id, code, name, price, cost, stock, category, source, description, image, oferta, nuevo, webDesc, ofertaPrice, price_mayorista, fichaTecnica, fichaTecnicaFile) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    d.transaction(() => {
      for (const p of (data.products || [])) {
        if (p.id === undefined || p.id === null) continue;
        const descStr = String(p.desc ?? p.description ?? p.webDesc ?? '');
        const existing = getProduct.get(String(p.id));
        if (existing) {
          const descOut = p.desc !== undefined || p.description !== undefined || p.webDesc !== undefined ? descStr : (existing.description ?? '');
          updProduct.run(
            p.code ?? existing.code,
            p.name ?? existing.name,
            Number(p.price ?? existing.price) || 0,
            p.category ?? existing.category,
            descOut,
            p.image ?? existing.image,
            p.oferta !== undefined ? (p.oferta ? 1 : 0) : existing.oferta,
            p.nuevo !== undefined ? (p.nuevo ? 1 : 0) : existing.nuevo,
            descOut,
            p.oldPrice !== undefined ? (Number(p.oldPrice) || 0) : (p.ofertaPrice !== undefined ? (Number(p.ofertaPrice) || 0) : existing.ofertaPrice),
            p.price_mayorista !== undefined ? (Number(p.price_mayorista) || 0) : (Number(existing.price_mayorista) || 0),
            String(p.id)
          );
        } else {
          insProduct.run(String(p.id), p.code || String(p.id), p.name || '', Number(p.price) || 0, Number(p.cost) || 0, Number(p.stock) || 0, p.category || 'Varios', 'web', descStr, p.image || '', p.oferta ? 1 : 0, p.nuevo ? 1 : 0, descStr, Number(p.oldPrice ?? p.ofertaPrice) || 0, Number(p.price_mayorista) || 0, p.fichaTecnica || '', p.fichaTecnicaFile || '');
        }
      }
      if (Array.isArray(data.categories)) {
        d.prepare('DELETE FROM web_categories').run();
        const insCat = d.prepare('INSERT INTO web_categories (id, name) VALUES (?,?)');
        for (const c of data.categories) { insCat.run(c.id, c.name || ''); }
      }
      if (Array.isArray(data.services)) {
        d.prepare('DELETE FROM web_services').run();
        const insSvc = d.prepare('INSERT INTO web_services (id, name, desc, icon, price) VALUES (?,?,?,?,?)');
        for (const s of data.services) { insSvc.run(s.id, s.name || '', s.desc || s.description || '', s.icon || '', Number(s.price) || 0); }
      }
      if (data.config) setConfig('webConfig', data.config);
    })();
    res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: 'Error interno del servidor' }); }
});

// ============ NOTES ============
app.get('/api/notes', (req, res) => {
  try {
    const rows = getDb().prepare('SELECT * FROM notes ORDER BY date DESC').all();
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

// ============ WEB CONFIG ONLY (Empresa) ============
app.post('/api/web-config', (req, res) => {
  try {
    const config = req.body || {};
    setConfig('webConfig', config);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: 'Error interno del servidor' }); }
});

app.post('/api/notes', (req, res) => {
  try {
    const n = req.body;
    const id = Date.now().toString();
    getDb().prepare('INSERT INTO notes (id, title, content, date, category) VALUES (?,?,?,?,?)').run(
      id, n.title || '', n.content || '', new Date().toISOString(), n.category || 'General'
    );
    res.json({ success: true, id });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.put('/api/notes/:id', (req, res) => {
  try {
    const n = req.body;
    getDb().prepare('UPDATE notes SET title=?, content=?, category=? WHERE id=?').run(
      n.title || '', n.content || '', n.category || 'General', req.params.id
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.delete('/api/notes/:id', (req, res) => {
  try {
    getDb().prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

// ============ BACKUPS ============
app.get('/api/backups', (req, res) => {
  try {
    const backupsDir = BACKUPS_DIR;
    if (!fs.existsSync(backupsDir)) { fs.mkdirSync(backupsDir, { recursive: true }); return res.json([]); }
    const files = fs.readdirSync(backupsDir).filter(f => f.endsWith('.db') || f.endsWith('.json')).map(f => {
      const stat = fs.statSync(path.join(backupsDir, f));
      const ext = path.extname(f);
      const base = f.replace(ext, '');
      return {
        base,
        date: stat.birthtime.toISOString().replace('T', ' ').slice(0, 19),
        hasJson: ext === '.json',
        hasDb: ext === '.db',
      };
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    // Deduplicate by base name
    const seen = new Set();
    const deduped = files.filter((f) => {
      if (seen.has(f.base)) return false;
      seen.add(f.base);
      return true;
    });
    res.json(deduped);
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

function snapshotTables() {
  const d = getDb();
  const tables = ['products', 'clients', 'providers', 'payment_methods', 'sales', 'sale_items', 'purchases', 'purchase_items', 'expenses', 'repairs', 'web_categories', 'web_services', 'notes', 'orders', 'app_config', 'restock_pending', 'monthly_stats', 'exchanges', 'site_visits'];
  const data = {};
  d.exec('BEGIN IMMEDIATE');
  try {
    for (const t of tables) {
      try { data[t] = d.prepare(`SELECT * FROM ${t}`).all(); } catch { data[t] = []; }
    }
    d.exec('COMMIT');
  } catch (e) {
    try { d.exec('ROLLBACK'); } catch {}
    throw e;
  }
  return data;
}

app.post('/api/backups/create', (req, res) => {
  try {
    const data = snapshotTables();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    const backupFile = path.join(BACKUPS_DIR, `backup-${timestamp}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(data));
    getDb().backup(path.join(BACKUPS_DIR, `backup-${timestamp}.db`));
    console.log(`[API] Backup creado: ${backupFile} + .db`);
    res.json({ success: true, file: `backup-${timestamp}.json` });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.post('/api/backups/restore', rateLimit({ windowMs: 60000, max: 5 }), (req, res) => {
  try {
    const { base } = req.body;
    const safeBase = path.basename(String(base || ''));
    if (!safeBase || !/^[\w.\-]+$/.test(safeBase)) return res.status(400).json({ error: 'Nombre de backup inválido' });
    const dbFile = path.join(BACKUPS_DIR, safeBase + '.db');
    const jsonFile = path.join(BACKUPS_DIR, safeBase + '.json');
    if (fs.existsSync(dbFile)) {
      const probe = openDbReadOnly(dbFile);
      let ok = false;
      try { ok = checkIntegrity(probe); } finally { try { probe.close(); } catch {} }
      if (!ok) return res.status(400).json({ error: 'El backup está corrupto. No se tocó nada.' });
      if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
      getDb().backup(path.join(BACKUPS_DIR, `pre-restore-${backupTimestamp()}.db`));
      try { getDb().exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch {}
      getDb().close();
      db = null;
      for (const suffix of ['-wal', '-shm', '-journal']) {
        try { fs.rmSync(DB_FILE + suffix, { force: true }); } catch {}
      }
      fs.copyFileSync(dbFile, DB_FILE);
      if (!checkIntegrity(getDb())) {
        return res.status(500).json({ error: 'El backup no pasó la verificación al copiar. Se guardó pre-restore.' });
      }
      try { seedDefaults(); } catch {}
      res.json({ success: true });
    } else if (fs.existsSync(jsonFile)) {
      const data = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'));
      try {
        if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
        getDb().backup(path.join(BACKUPS_DIR, `pre-restore-${backupTimestamp()}.db`));
        let payload = data;
        let legacy = null;
        if (isLegacyBackup(payload)) {
          const n = normalizarBackupLegacy(payload);
          payload = n.data;
          legacy = n.report;
        }
        const r = restoreFromJson(payload);
        res.json({ success: true, restored: r.restored, legacy });
      } catch (err) {
        return res.status(400).json({ error: err.message || 'Backup inválido. No se tocó nada.' });
      }
    } else {
      res.status(404).json({ error: 'Backup no encontrado' });
    }
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

// ============ COMPANY CONFIG ============
function maskSecret(s) {
  if (!s || typeof s !== 'string') return s;
  if (s.length <= 8) return '****';
  return '****' + s.slice(-4);
}

function isMasked(v) {
  return typeof v === 'string' && v.startsWith('****');
}

app.get('/api/company-config', (req, res) => {
  try {
    const config = getConfig('companyConfig', {});
    const out = { ...config };
    if (out.githubToken) out.githubToken = maskSecret(out.githubToken);
    if (out.backupPassword) out.backupPassword = maskSecret(out.backupPassword);
    res.json(Object.keys(out).length > 0 ? out : null);
  } catch { res.json(null); }
});

app.put('/api/company-config', rateLimit({ windowMs: 60000, max: 20 }), (req, res) => {
  try {
    const existing = getConfig('companyConfig', {});
    const updated = { ...existing, ...req.body };
    if (isMasked(updated.githubToken)) delete updated.githubToken;
    if (isMasked(updated.backupPassword)) delete updated.backupPassword;
    setConfig('companyConfig', updated);
    const out = { ...updated };
    if (out.githubToken) out.githubToken = maskSecret(out.githubToken);
    if (out.backupPassword) out.backupPassword = maskSecret(out.backupPassword);
    res.json(out);
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

// ============ CASH REGISTER ============
app.get('/api/cash-register', (req, res) => {
  try {
    const cr = getConfig('cashRegister', { cash: 0, bank: 0 });
    res.json(cr);
  } catch { res.json({ cash: 0, bank: 0 }); }
});

app.put('/api/cash-register', (req, res) => {
  try {
    setConfig('cashRegister', req.body);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

// ============ SYNC STATUS & MISC ============
app.get('/api/auto-sync-status', (req, res) => {
  res.json({ pending: false, syncing: false, lastSync: null, error: null });
});

app.get('/api/demo-status', (req, res) => {
  if (!DEMO_MODE) return res.json({ demo: false });
  res.json(demoState());
});

app.get('/api/status', (req, res) => {
  try {
    const d = getDb();
    const counts = {};
    const tables = ['products', 'clients', 'providers', 'payment_methods', 'sales', 'purchases', 'expenses', 'repairs', 'web_categories', 'web_services', 'notes', 'orders'];
    for (const t of tables) {
      try { counts[t] = (d.prepare(`SELECT COUNT(*) as c FROM ${t}`).get()).c; } catch { counts[t] = 0; }
    }
    res.json({
      pid: process.pid,
      ppid: process.ppid,
      uptime: formatUptime(process.uptime()),
      uptimeSeconds: process.uptime(),
      memory: {
        rss: formatBytes(process.memoryUsage().rss),
        heapTotal: formatBytes(process.memoryUsage().heapTotal),
        heapUsed: formatBytes(process.memoryUsage().heapUsed),
      },
      nodeVersion: process.version,
      platform: process.platform,
      dbSize: fs.existsSync(DB_FILE) ? formatBytes(fs.statSync(DB_FILE).size) : '0 B',
      dbSizeBytes: fs.existsSync(DB_FILE) ? fs.statSync(DB_FILE).size : 0,
      counts,
      children: [],
      gitRemote: 'local',
      lastSync: null,
    });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.get('/api/backup', (req, res) => {
  try {
    const data = snapshotTables();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="backup-${Date.now()}.json"`);
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.post('/api/restore', rateLimit({ windowMs: 60000, max: 5 }), (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Datos inválidos' });
    }
    try {
      if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
      getDb().backup(path.join(BACKUPS_DIR, `pre-restore-${backupTimestamp()}.db`));
      let payload = req.body;
      let legacy = null;
      if (isLegacyBackup(payload)) {
        const n = normalizarBackupLegacy(payload);
        payload = n.data;
        legacy = n.report;
      }
      const r = restoreFromJson(payload);
      res.json({ success: true, restored: r.restored, legacy });
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Backup inválido. No se tocó nada.' });
    }
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.get('/api/backups/encrypted', (req, res) => {
  res.json([]);
});

app.post('/api/backups/restore-encrypted', (req, res) => {
  res.status(400).json({ error: 'No hay backups encriptados disponibles' });
});

app.post('/api/backups/restore-last', (req, res) => {
  res.status(400).json({ error: 'No hay backups disponibles' });
});

app.post('/api/sync-full', (req, res) => {
  res.json({ success: true, message: 'Sync no disponible en modo Lite' });
});

app.get('/api/download-app', (req, res) => {
  res.json({ success: false, error: 'Descarga no disponible en modo Lite' });
});

app.post('/api/deploy-ghpages', rateLimit({ windowMs: 60000, max: 5 }), async (req, res) => {
  try {
    const { token, repo } = req.body;
    if (!repo) return res.status(400).json({ success: false, error: 'Repositorio requerido' });
    const stored = getConfig('companyConfig', {});
    const effectiveToken = (token && token.startsWith('****')) ? (stored.githubToken || '') : (token || '');
    if (!effectiveToken) return res.status(400).json({ success: false, error: 'Token de GitHub requerido' });

    const api = 'https://api.github.com';
    const headers = { Authorization: `Bearer ${effectiveToken}`, Accept: 'application/vnd.github+json', 'User-Agent': 'nexus-full' };

    // 0. Validate token permissions
    const userResp = await fetch(`${api}/user`, { headers });
    if (!userResp.ok) return res.status(400).json({ success: false, error: 'Token inválido. Generá un nuevo token en GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens, con permisos de "Contents: write" sobre el repositorio.' });
    const userData = await userResp.json();
    console.log('[deploy] Authenticated as:', userData.login);

    // 1. Get repo and verify write access
    const repoResp = await fetch(`${api}/repos/${repo}`, { headers });
    if (repoResp.status === 403) return res.status(400).json({ success: false, error: 'El token no tiene acceso al repositorio. Necesitás un Fine-grained token con permisos "Contents: write" sobre "' + repo + '".' });
    if (!repoResp.ok) return res.status(400).json({ success: false, error: 'Repositorio no encontrado: ' + repo });
    const repoData = await repoResp.json();
    const defaultBranch = repoData.default_branch;

    const refResp = await fetch(`${api}/repos/${repo}/git/ref/heads/${defaultBranch}`, { headers });
    if (!refResp.ok) return res.status(400).json({ success: false, error: 'No se pudo obtener la rama por defecto' });
    const refData = await refResp.json();
    const baseSha = refData.object.sha;

    // 2. Build tree from web/ directory + admin/ (dist/)
    const BINARY_EXTS = new Set(['.jpeg', '.jpg', '.png', '.gif', '.ico', '.webp', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.pdf']);
    const files = [];
    function walkDir(dir, prefix) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        const rel = prefix ? prefix + '/' + entry.name : entry.name;
        if (entry.isDirectory()) walkDir(full, rel);
        else {
          const ext = path.extname(entry.name).toLowerCase();
          const isBinary = BINARY_EXTS.has(ext);
          files.push({
            path: rel,
            content: isBinary ? fs.readFileSync(full).toString('base64') : fs.readFileSync(full, 'utf-8'),
            ...(isBinary ? { encoding: 'base64' } : {}),
          });
        }
      }
    }
    if (!fs.existsSync(WEB_DIR)) return res.status(400).json({ success: false, error: 'No se encontró el directorio web/' });
    walkDir(WEB_DIR, '');
    if (fs.existsSync(DIST_DIR)) walkDir(DIST_DIR, 'admin');

    // Generate data.json with current web data
    try {
      const d = getDb();
      const dbProducts = d.prepare("SELECT * FROM products WHERE source = 'web'").all();
      const categories = d.prepare('SELECT * FROM web_categories ORDER BY name').all();
      const services = d.prepare('SELECT * FROM web_services ORDER BY name').all();
      const config = getConfig('webConfig', {});
      const companyCfg = getConfig('companyConfig', {});
      const webData = { products: dbProducts, categories, services, config, whatsapp: companyCfg.whatsapp || '' };
      files.push({ path: 'data.json', content: JSON.stringify(webData) });
    } catch (e) {
      console.error('[deploy] Error generating data.json:', e.message);
    }

    const treeItems = files.map(f => ({
      path: f.path,
      mode: '100644',
      type: 'blob',
      content: f.content,
      ...(f.encoding ? { encoding: f.encoding } : {}),
    }));

    const treeResp = await fetch(`${api}/repos/${repo}/git/trees`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tree: treeItems }),
    });
    if (!treeResp.ok) {
      const treeErr = await treeResp.text().catch(() => '');
      console.error('[deploy] Tree error:', treeResp.status, treeErr);
      const msg = treeResp.status === 403
        ? 'El token no tiene permisos de escritura. Necesitás un Fine-grained token con "Contents: write" sobre el repositorio. Creá uno en GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens, Repository access: ' + repo + ', Permissions: Contents: write.'
        : 'Error al crear el tree: ' + (treeErr || treeResp.statusText);
      return res.status(500).json({ success: false, error: msg });
    }
    const treeData = await treeResp.json();
    const treeSha = treeData.sha;

    // 3. Create commit (orphan, no parent)
    const commitResp = await fetch(`${api}/repos/${repo}/git/commits`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Deploy Nexus Full Web', tree: treeSha, parents: [] }),
    });
    if (!commitResp.ok) return res.status(500).json({ success: false, error: 'Error al crear el commit' });
    const commitData = await commitResp.json();
    const commitSha = commitData.sha;

    // 4. Update gh-pages branch
    const ghResp = await fetch(`${api}/repos/${repo}/git/refs/heads/gh-pages`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: commitSha, force: true }),
    });
    if (!ghResp.ok) {
      // Try creating the branch if it doesn't exist
      const createResp = await fetch(`${api}/repos/${repo}/git/refs`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: 'refs/heads/gh-pages', sha: commitSha }),
      });
      if (!createResp.ok) return res.status(500).json({ success: false, error: 'Error al crear la rama gh-pages' });
    }

    // 5. Enable GitHub Pages (optional)
    await fetch(`${api}/repos/${repo}/pages`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: { branch: 'gh-pages', path: '/' } }),
    }).catch(() => {});

    res.json({ success: true, url: `https://${repo.toLowerCase().replace('/', '.github.io/')}/` });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

app.post('/api/import-from-web', (req, res) => {
  res.json({ success: true, imported: 0, updated: 0, message: 'Importación no disponible en modo Lite' });
});

function visitStats() {
  const today = new Date().toISOString().slice(0, 10);
  const total = getDb().prepare('SELECT COALESCE(SUM(count),0) t FROM site_visits').get().t;
  const row = getDb().prepare('SELECT count FROM site_visits WHERE date = ?').get(today);
  const lastDays = getDb().prepare('SELECT date, count FROM site_visits ORDER BY date DESC LIMIT 30').all().reverse();
  return { total, today: row ? row.count : 0, lastDays };
}

app.post('/api/visits/increment', rateLimit({ windowMs: 60000, max: 60 }), (_req, res) => {
  try {
    const d = getDb();
    const today = new Date().toISOString().slice(0, 10);
    const upd = d.prepare('UPDATE site_visits SET count = count + 1 WHERE date = ?').run(today);
    if (upd.changes === 0) d.prepare('INSERT INTO site_visits (date, count) VALUES (?, 1)').run(today);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.get('/api/visits/stats', (_req, res) => {
  try { res.json(visitStats()); } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.post('/api/generate-catalog-csv', (_req, res) => {
  try {
    const rows = getDb().prepare("SELECT id, code, name, price, price_mayorista, category, description, image FROM products WHERE source = 'web' ORDER BY name").all();
    const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const lines = ['id,name,price,price_mayorista,category,description,image'];
    for (const r of rows) {
      lines.push([esc(r.code || r.id), esc(r.name), Number(r.price) || 0, Number(r.price_mayorista) || 0, esc(r.category || ''), esc(r.description || ''), esc(r.image || '')].join(','));
    }
    fs.writeFileSync(path.join(WEB_DIR, 'catalog.csv'), '\uFEFF' + lines.join('\n'), 'utf-8');
    res.json({ success: true, count: rows.length });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.get('/api/visits', (_req, res) => {
  try { res.json(visitStats()); } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

// ============ WEB STORE (static files) ============
// Caché de la tienda web: HTML siempre fresco; imágenes 30d (los uploads usan nombres
// únicos que nunca se pisan); css/js 1h (se versionan con ?v= al cambiar).
app.use('/web', express.static(WEB_DIR, {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    } else if (/\.(png|jpe?g|webp|gif|svg|ico|woff2?)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=2592000');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
}));
app.get('/web/*', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(WEB_DIR, 'index.html'));
});

// ============ ORDERS ============
try {
  getDb().prepare(`CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    items TEXT NOT NULL DEFAULT '[]',
    total REAL NOT NULL DEFAULT 0,
    clientName TEXT DEFAULT '',
    clientPhone TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pendiente',
    deliveryType TEXT DEFAULT ''
  )`).run();
  try { getDb().prepare("ALTER TABLE orders ADD COLUMN deliveryType TEXT DEFAULT ''").run(); } catch {}
} catch (e) { console.error('[API] Error creating orders table:', e.message); }

app.get('/api/orders/subscribe', (req, res) => {
  if (sseClients.length >= 50) {
    res.status(503).json({ error: 'Demasiadas conexiones' });
    return;
  }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('event: connected\ndata: {}\n\n');
  sseClients.push(res);
  const keepAlive = setInterval(() => {
    try { res.write(':keepalive\n\n'); } catch { clearInterval(keepAlive); }
  }, 15000);
  req.on('close', () => {
    clearInterval(keepAlive);
    const idx = sseClients.indexOf(res);
    if (idx !== -1) sseClients.splice(idx, 1);
  });
});

app.get('/api/orders', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  try {
    const rows = getDb().prepare('SELECT * FROM orders ORDER BY date DESC').all();
    res.json(rows.map(r => {
      let items = [];
      try { items = JSON.parse(r.items || '[]'); } catch {}
      return { ...r, items: Array.isArray(items) ? items : [] };
    }));
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

// Genera el próximo número de pedido correlativo y ascendente (PED-XXXXXX).
// El número inicial se configura en Panel Web > Maestros (webConfig.orderStartNumber).
function nextOrderId() {
  const d = getDb();
  const cfg = getConfig('webConfig', {});
  let start = parseInt(cfg.orderStartNumber, 10);
  if (!(start >= 1)) start = 1;
  const state = getConfig('orderSequence', null);
  let last = state && Number.isFinite(state.last) ? state.last : start - 1;
  const maxExisting = d.prepare("SELECT id FROM orders WHERE id LIKE 'PED-%'").all()
    .reduce((m, r) => {
      const n = parseInt(String(r.id).replace('PED-', ''), 10);
      return Number.isFinite(n) ? Math.max(m, n) : m;
    }, start - 1);
  const next = Math.max(start, last + 1, maxExisting + 1);
  if (next < 0 || next > 999999999) return 'PED-' + Date.now().toString().slice(-9);
  setConfig('orderSequence', { last: next });
  return 'PED-' + String(next).padStart(6, '0');
}

app.post('/api/orders', rateLimit({ windowMs: 60000, max: 30 }), (req, res) => {
  try {
    const body = req.body || {};
    const items = Array.isArray(body.items) ? body.items.slice(0, 500) : [];
    const total = Number(body.total) || 0;
    const clientName = String(body.clientName || '').slice(0, 200);
    const clientPhone = String(body.clientPhone || '').slice(0, 60);
    const notes = String(body.notes || '').slice(0, 2000);
    const deliveryType = String(body.deliveryType || '').slice(0, 20);
    const date = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const d = getDb();
    const id = d.transaction(() => {
      const oid = takeOrderIdInTxn(d);
      d.prepare('INSERT INTO orders (id, date, items, total, clientName, clientPhone, notes, status, deliveryType) VALUES (?,?,?,?,?,?,?,?,?)').run(
        oid, date, JSON.stringify(items), total, clientName, clientPhone, notes, 'pendiente', deliveryType
      );
      return oid;
    })();
    const newOrder = { id, date, items, total, clientName, clientPhone, notes, status: 'pendiente', deliveryType };
    broadcastSSE('new-order', newOrder);
    res.status(201).json(newOrder);
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

// ============ TENANT (tienda online Cloudflare) ============
function getMachineFingerprint() {
  try {
    const macs = [];
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const it of ifaces[name] || []) {
        if (it && it.mac && it.mac !== '00:00:00:00:00:00' && !it.internal) macs.push(it.mac);
      }
    }
    macs.sort();
    const raw = [
      os.hostname(), os.platform(), os.arch(),
      (os.userInfo && os.userInfo().username) || '',
      (os.cpus() || []).map((c) => c.model).join('|'),
      macs.join('|'),
    ].join('::');
    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
  } catch { return ''; }
}

function importPendingLink() {
  try {
    getDb().prepare('CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT)').run();
    const dirs = [ROOT];
    try {
      const home = os.homedir();
      if (home) { dirs.push(path.join(home, 'Desktop'), path.join(home, 'Downloads')); }
    } catch {}
    for (const dir of dirs) {
      let files = [];
      try { files = fs.readdirSync(dir).filter((f) => /^vincular-.*\.json$/i.test(f)); } catch { continue; }
      for (const f of files) {
        const full = path.join(dir, f);
        try {
          const data = JSON.parse(fs.readFileSync(full, 'utf8'));
          const slug = String(data.slug || '').toLowerCase().trim();
          const worker = String(data.worker || '').replace(/\/+$/, '');
          const token = String(data.token || '');
          if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) throw new Error('slug inválido');
          if (!/^https?:\/\//.test(worker)) throw new Error('worker inválido');
          if (!/^[0-9a-f]{32,128}$/i.test(token)) throw new Error('token inválido');
          const cfg = getConfig('companyConfig', {});
          setConfig('companyConfig', { ...cfg, tenantSlug: slug, tenantWorker: worker, tenantToken: token });
          fs.rmSync(full, { force: true });
          console.log('[API] Tienda vinculada desde ' + f + ' (slug: ' + slug + ')');
          return true;
        } catch (e) {
          console.error('[API] Vincular ignorado (' + f + '): ' + e.message);
        }
      }
    }
  } catch (e) { console.error('[API] importPendingLink:', e.message); }
  return false;
}

function tenantCfg() {
  const cfg = getConfig('companyConfig', {});
  return {
    slug: String(cfg.tenantSlug || ''),
    worker: String(cfg.tenantWorker || '').replace(/\/+$/, ''),
    token: String(cfg.tenantToken || ''),
  };
}

app.get('/api/tenant/status', (req, res) => {
  const t = tenantCfg();
  res.json({ configured: !!(t.slug && t.worker && t.token), slug: t.slug || null });
});

app.post('/api/tenant/sync', async (req, res) => {
  try {
    const t = tenantCfg();
    if (!t.slug || !t.worker || !t.token) {
      return res.status(400).json({ ok: false, reason: 'tienda no configurada (slug/worker/token)' });
    }
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20000);
    let r;
    try {
      r = await fetch(`${t.worker}/inbox?slug=${encodeURIComponent(t.slug)}`, {
        headers: { Authorization: 'Bearer ' + t.token, 'X-Machine-Fp': getMachineFingerprint() },
        signal: ctl.signal,
      });
    } finally { clearTimeout(timer); }
    if (!r.ok) {
      let reason = 'buzón no disponible (HTTP ' + r.status + ')';
      try {
        const ej = await r.json();
        if (ej && ej.error === 'tenant en uso en otra PC') reason = 'Tienda en uso en otra PC, contactá soporte';
        else if (ej && ej.error) reason = String(ej.error);
      } catch {}
      return res.status(400).json({ ok: false, reason });
    }
    const remote = await r.json();
    const list = Array.isArray(remote) ? remote : [];
    const d = getDb();
    const ids = [];
    let imported = 0;
    d.transaction(() => {
      for (const o of list) {
        if (!o || typeof o !== 'object') continue;
        const items = Array.isArray(o.items) ? o.items.slice(0, 200) : [];
        if (items.length === 0) continue;
        const oid = takeOrderIdInTxn(d);
        d.prepare('INSERT INTO orders (id, date, items, total, clientName, clientPhone, notes, status, deliveryType) VALUES (?,?,?,?,?,?,?,?,?)').run(
          oid,
          new Date().toISOString().slice(0, 19).replace('T', ' '),
          JSON.stringify(items.map((it) => ({
            productId: String(it.productId || it.id || ''),
            productName: String(it.productName || it.name || ''),
            quantity: Number(it.quantity) || 0,
            price: Number(it.price) || 0,
          }))),
          Number(o.total) || 0,
          String(o.clientName || '').slice(0, 200),
          String(o.clientPhone || '').slice(0, 60),
          String(o.notes || '').slice(0, 2000),
          'pendiente',
          String(o.deliveryType || '').slice(0, 20)
        );
        ids.push(String(o.id));
        imported++;
      }
    })();
    if (ids.length) {
      try {
        await fetch(`${t.worker}/ack?slug=${encodeURIComponent(t.slug)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t.token },
          body: JSON.stringify({ ids }),
        });
      } catch {}
    }
    broadcastSSE('new-order', { id: 'sync', total: imported });
    res.json({ ok: true, imported });
  } catch (e) {
    return res.status(500).json({ ok: false, reason: 'sin conexión con la tienda' });
  }
});

app.put('/api/orders/:id', (req, res) => {
  try {
    const existing = getDb().prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Order not found' });
    const { status, clientName, clientPhone, notes, deliveryType } = req.body;
    getDb().prepare('UPDATE orders SET status=?, clientName=?, clientPhone=?, notes=?, deliveryType=? WHERE id=?').run(
      status || existing.status,
      clientName !== undefined ? clientName : existing.clientName,
      clientPhone !== undefined ? clientPhone : existing.clientPhone,
      notes !== undefined ? notes : existing.notes,
      deliveryType !== undefined ? deliveryType : (existing.deliveryType || ''),
      req.params.id
    );
    const row = getDb().prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    res.json({ ...row, items: JSON.parse(row.items || '[]') });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.delete('/api/orders/:id', (req, res) => {
  try {
    const r = getDb().prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);
    res.json({ success: r.changes > 0 });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

// ============ POS HELPER FUNCTIONS ============
function rowToPaymentMethod(row) {
  return {
    id: row.id,
    name: row.name,
    requiresCash: row.requiresCash === 1,
    icon: row.icon || '',
    adjustment: row.adjustment || 0,
  };
}

function getRepairCounter() {
  const existing = getConfig('repairCounter', null);
  if (existing !== null) return existing;
  const row = getDb().prepare("SELECT MAX(CAST(SUBSTR(id, 5) AS INTEGER)) m FROM repairs WHERE id LIKE 'REP-%'").get();
  return ((row && row.m) || 0) + 1;
}

function getSaleCounter() {
  const existing = getConfig('saleCounter', null);
  if (existing !== null) return existing;
  const row = getDb().prepare("SELECT MAX(CAST(SUBSTR(id, 5) AS INTEGER)) m FROM sales WHERE id LIKE 'VEN-%'").get();
  return ((row && row.m) || 0) + 1;
}

function getPurchaseCounter() {
  const existing = getConfig('purchaseCounter', null);
  if (existing !== null) return existing;
  const row = getDb().prepare("SELECT MAX(CAST(SUBSTR(id, 5) AS INTEGER)) m FROM purchases WHERE id LIKE 'COM-%'").get();
  return ((row && row.m) || 0) + 1;
}

// Reserva el próximo número DENTRO de la transacción del llamador (misma
// conexión): leer+incrementar juntos elimina duplicados por doble clic,
// dos terminales o reinicios entre el insert y el incremento.
function takeCounterInTxn(d, key, table, likePattern, prefixLen) {
  let n = null;
  try {
    const row = d.prepare('SELECT value FROM app_config WHERE key = ?').get(key);
    if (row) { const v = JSON.parse(row.value); if (Number.isFinite(v)) n = v; }
  } catch {}
  if (n === null) {
    const m = d.prepare(`SELECT MAX(CAST(SUBSTR(id, ${prefixLen + 1}) AS INTEGER)) m FROM ${table} WHERE id LIKE '${likePattern}'`).get();
    n = ((m && m.m) || 0) + 1;
  }
  d.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?,?)').run(key, JSON.stringify(n + 1));
  return n;
}

function takeOrderIdInTxn(d) {
  let start = 1;
  try {
    const cfgRow = d.prepare("SELECT value FROM app_config WHERE key='webConfig'").get();
    const s = parseInt(JSON.parse(cfgRow.value).orderStartNumber, 10);
    if (s >= 1) start = s;
  } catch {}
  let last = null;
  try {
    const stRow = d.prepare("SELECT value FROM app_config WHERE key='orderSequence'").get();
    const v = JSON.parse(stRow.value).last;
    if (Number.isFinite(v)) last = v;
  } catch {}
  if (last === null) last = start - 1;
  const maxExisting = d.prepare("SELECT id FROM orders WHERE id LIKE 'PED-%'").all()
    .reduce((m, r) => {
      const n = parseInt(String(r.id).replace('PED-', ''), 10);
      return Number.isFinite(n) ? Math.max(m, n) : m;
    }, start - 1);
  const next = Math.max(start, last + 1, maxExisting + 1);
  if (next < 0 || next > 999999999) return 'PED-' + Date.now().toString().slice(-9);
  d.prepare("INSERT OR REPLACE INTO app_config (key, value) VALUES ('orderSequence', ?)").run(JSON.stringify({ last: next }));
  return 'PED-' + String(next).padStart(6, '0');
}

function getSalesWithItems() {
  // Una sola consulta con JOIN en lugar de una query por venta (N+1).
  const sales = getDb().prepare('SELECT * FROM sales ORDER BY date DESC').all();
  const items = getDb().prepare('SELECT * FROM sale_items').all();
  const bySale = new Map();
  for (const it of items) {
    if (!bySale.has(it.saleId)) bySale.set(it.saleId, []);
    bySale.get(it.saleId).push(it);
  }
  for (const s of sales) s.items = bySale.get(s.id) || [];
  return sales;
}

function getPurchasesWithItems() {
  const purchases = getDb().prepare('SELECT * FROM purchases ORDER BY date DESC').all();
  const getItems = getDb().prepare('SELECT * FROM purchase_items WHERE purchaseId = ?');
  for (const p of purchases) p.items = getItems.all(p.id);
  return purchases;
}

// ============ CLIENTS ============
app.get('/api/clients', (req, res) => {
  try {
    res.json(getDb().prepare('SELECT * FROM clients ORDER BY name').all());
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.post('/api/clients', (req, res) => {
  try {
    const { document, name, phone, email } = req.body;
    const id = Date.now().toString();
    getDb().prepare('INSERT INTO clients (id, document, name, phone, email) VALUES (?,?,?,?,?)').run(id, document || '', name || '', phone || '-', email || '-');
    res.status(201).json(getDb().prepare('SELECT * FROM clients WHERE id = ?').get(id));
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.put('/api/clients/:id', (req, res) => {
  try {
    const existing = getDb().prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Client not found' });
    const { document, name, phone, email } = req.body;
    getDb().prepare('UPDATE clients SET document=?, name=?, phone=?, email=? WHERE id=?').run(
      document !== undefined ? document : existing.document,
      name !== undefined ? name : existing.name,
      phone !== undefined ? phone : existing.phone,
      email !== undefined ? email : existing.email,
      req.params.id
    );
    res.json(getDb().prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id));
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.delete('/api/clients/:id', (req, res) => {
  try {
    if (req.params.id === 'c1') return res.status(409).json({ error: 'No se puede borrar el Cliente General' });
    const d = getDb();
    const usedSale = d.prepare('SELECT 1 FROM sales WHERE clientId = ? LIMIT 1').get(req.params.id);
    const usedRep = d.prepare('SELECT 1 FROM repairs WHERE clientId = ? LIMIT 1').get(req.params.id);
    if (usedSale || usedRep) {
      return res.status(409).json({ error: 'No se puede borrar: el cliente tiene ventas o reparaciones.' });
    }
    const r = d.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
    res.json({ success: r.changes > 0 });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.post('/api/import-web-clients', (req, res) => {
  try {
    res.json({ imported: 0, total: 0 });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

// ============ PROVIDERS ============
app.get('/api/providers', (req, res) => {
  try {
    res.json(getDb().prepare('SELECT * FROM providers ORDER BY name').all());
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.post('/api/providers', (req, res) => {
  try {
    const { ruc, name, phone, email } = req.body;
    const id = Date.now().toString();
    getDb().prepare('INSERT INTO providers (id, ruc, name, phone, email) VALUES (?,?,?,?,?)').run(id, ruc || '', name || '', phone || '-', email || '-');
    res.status(201).json(getDb().prepare('SELECT * FROM providers WHERE id = ?').get(id));
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.put('/api/providers/:id', (req, res) => {
  try {
    const existing = getDb().prepare('SELECT * FROM providers WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Provider not found' });
    const { ruc, name, phone, email } = req.body;
    getDb().prepare('UPDATE providers SET ruc=?, name=?, phone=?, email=? WHERE id=?').run(
      ruc !== undefined ? ruc : existing.ruc,
      name !== undefined ? name : existing.name,
      phone !== undefined ? phone : existing.phone,
      email !== undefined ? email : existing.email,
      req.params.id
    );
    res.json(getDb().prepare('SELECT * FROM providers WHERE id = ?').get(req.params.id));
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.delete('/api/providers/:id', (req, res) => {
  try {
    const d = getDb();
    const used = d.prepare('SELECT 1 FROM purchases WHERE providerId = ? LIMIT 1').get(req.params.id);
    if (used) {
      return res.status(409).json({ error: 'No se puede borrar: el proveedor tiene compras.' });
    }
    const r = d.prepare('DELETE FROM providers WHERE id = ?').run(req.params.id);
    res.json({ success: r.changes > 0 });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

// ============ PAYMENT METHODS ============
app.get('/api/payment-methods', (req, res) => {
  try {
    const rows = getDb().prepare('SELECT * FROM payment_methods').all();
    res.json(rows.map(rowToPaymentMethod));
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.post('/api/payment-methods', (req, res) => {
  try {
    const { name, requiresCash, icon, adjustment } = req.body;
    const id = Date.now().toString();
    getDb().prepare('INSERT INTO payment_methods (id, name, requiresCash, icon, adjustment) VALUES (?,?,?,?,?)').run(
      id, name || '', requiresCash === true ? 1 : 0, icon || '', Number(adjustment) || 0
    );
    const row = getDb().prepare('SELECT * FROM payment_methods WHERE id = ?').get(id);
    res.status(201).json(rowToPaymentMethod(row));
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.put('/api/payment-methods/:id', (req, res) => {
  try {
    const existing = getDb().prepare('SELECT * FROM payment_methods WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Payment method not found' });
    const { name, requiresCash, icon, adjustment } = req.body;
    getDb().prepare('UPDATE payment_methods SET name=?, requiresCash=?, icon=?, adjustment=? WHERE id=?').run(
      name !== undefined ? name : existing.name,
      requiresCash !== undefined ? (requiresCash === true ? 1 : 0) : existing.requiresCash,
      icon !== undefined ? icon : existing.icon,
      adjustment !== undefined ? Number(adjustment) : existing.adjustment,
      req.params.id
    );
    const row = getDb().prepare('SELECT * FROM payment_methods WHERE id = ?').get(req.params.id);
    res.json(rowToPaymentMethod(row));
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.delete('/api/payment-methods/:id', (req, res) => {
  try {
    const r = getDb().prepare('DELETE FROM payment_methods WHERE id = ?').run(req.params.id);
    if (r.changes > 0) res.json({ success: true });
    else res.status(404).json({ error: 'Payment method not found' });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

// ============ SALES ============
app.get('/api/sales', (req, res) => {
  try {
    res.json(getSalesWithItems());
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.get('/api/sales/export', (req, res) => {
  try {
    const q = req.query || {};
    const from = String(q.from || '').slice(0, 10);
    const to = String(q.to || '').slice(0, 10);
    const method = String(q.method || '').slice(0, 100);
    const search = String(q.q || '').slice(0, 200).toLowerCase();
    const hideCash = q.hideCash === '1' || q.hideCash === 'true';
    const sort = q.sort === 'asc' ? 'asc' : 'desc';
    if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) {
      return res.status(400).json({ error: 'Fechas inválidas' });
    }
    const fromDate = from ? new Date(from) : null;
    const toEnd = to ? new Date(to) : null;
    if (toEnd) toEnd.setDate(toEnd.getDate() + 1);
    if ((fromDate && !Number.isFinite(fromDate.getTime())) || (toEnd && !Number.isFinite(toEnd.getTime()))) {
      return res.status(400).json({ error: 'Fechas inválidas' });
    }
    const sales = getSalesWithItems().filter(s => {
      if (search && !(s.id.toLowerCase().includes(search) ||
        (s.clientName || '').toLowerCase().includes(search) ||
        (s.paymentMethod || '').toLowerCase().includes(search))) return false;
      if (method && s.paymentMethod !== method) return false;
      if (hideCash && (s.paymentMethod || '').toLowerCase() === 'efectivo') return false;
      const saleDate = new Date(s.date);
      if (fromDate && saleDate < fromDate) return false;
      if (toEnd && saleDate >= toEnd) return false;
      return true;
    }).sort((a, b) => {
      const diff = new Date(a.date).getTime() - new Date(b.date).getTime();
      return sort === 'asc' ? diff : -diff;
    });
    const esc = (v) => {
      const s = String(v ?? '');
      if (s.includes(';') || s.includes('"') || s.includes('\n') || s.includes('\r')) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const header = 'CODIGO TICKET;FECHA Y HORA;CLIENTE;Producto;Importe;metodo de Pago';
    const rows = sales.flatMap(s =>
      (s.items || []).map(item => [
        esc(s.id), esc(new Date(s.date).toLocaleString()), esc(s.clientName || 'Cliente General'),
        esc(item.productName), (Number(item.price) * Number(item.quantity)).toFixed(0), esc(s.paymentMethod)
      ].join(';'))
    );
    const total = sales.reduce((sum, s) => sum + Number(s.total || 0), 0);
    rows.push(['TOTAL', '', '', '', total.toFixed(0), ''].join(';'));
    const csv = '﻿' + header + '\n' + rows.join('\n');
    const safeMethod = method.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const fname = (from || to || method)
      ? `ventas-${from || 'inicio'}_a_${to || 'hoy'}${safeMethod ? '-' + safeMethod : ''}.csv`
      : `historial-ventas-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${fname}`);
    res.send(csv);
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.delete('/api/sales/:id', (req, res) => {
  try {
    const d = getDb();
    let restored = 0;
    const doDelete = d.transaction(() => {
      const items = d.prepare('SELECT productId, quantity FROM sale_items WHERE saleId = ?').all(req.params.id);
      const upd = d.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
      for (const it of items) {
        if (it.productId) { upd.run(it.quantity, it.productId); restored++; }
      }
      d.prepare('DELETE FROM sale_items WHERE saleId = ?').run(req.params.id);
      d.prepare('DELETE FROM sales WHERE id = ?').run(req.params.id);
    });
    doDelete();
    res.json({ success: true, stockRestored: restored });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.post('/api/sales', (req, res) => {
  try {
    const { items, total, paymentMethod, clientId, clientName, cashReceived, change, date } = req.body;
    if (hasNegative(total, cashReceived, change)) return res.status(400).json({ error: 'Montos inválidos' });
    const itemsErr = checkSaleItems(items || []);
    if (itemsErr) return res.status(400).json({ error: itemsErr });
    const saleDate = date || new Date().toISOString();
    const d = getDb();
    const doSale = d.transaction(() => {
      const n = takeCounterInTxn(d, 'saleCounter', 'sales', 'VEN-%', 4);
      const saleId = 'VEN-' + n.toString().padStart(6, '0');
      d.prepare('INSERT INTO sales (id, date, total, paymentMethod, clientId, clientName, cashReceived, change) VALUES (?,?,?,?,?,?,?,?)').run(
        saleId, saleDate, Number(total) || 0, paymentMethod || 'Efectivo',
        clientId || '', clientName || 'Cliente General', Number(cashReceived) || total, Number(change) || 0
      );
      for (const item of (items || [])) {
        d.prepare('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?').run(item.quantity, item.productId);
        d.prepare('INSERT INTO sale_items (saleId, productId, productName, quantity, price) VALUES (?,?,?,?,?)').run(
          saleId, item.productId || '', item.productName || '', item.quantity || 0, item.price || 0
        );
      }
      return saleId;
    });
    const saleId = doSale();
    const sale = d.prepare('SELECT * FROM sales WHERE id = ?').get(saleId);
    sale.items = d.prepare('SELECT * FROM sale_items WHERE saleId = ?').all(saleId);
    res.status(201).json(sale);
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

// ============ PURCHASES ============
app.get('/api/purchases', (req, res) => {
  try {
    res.json(getPurchasesWithItems());
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.post('/api/purchases', (req, res) => {
  try {
    const { providerId, providerName, items, total, paymentMethod } = req.body;
    if (hasNegative(total)) return res.status(400).json({ error: 'Monto inválido' });
    const itemsErr = checkSaleItems(items || []);
    if (itemsErr) return res.status(400).json({ error: itemsErr });
    const now = new Date().toISOString();
    const pm = paymentMethod || 'Efectivo';
    const d = getDb();
    const doPurchase = d.transaction(() => {
      const n = takeCounterInTxn(d, 'purchaseCounter', 'purchases', 'COM-%', 4);
      const purchaseId = 'COM-' + n.toString().padStart(6, '0');
      d.prepare('INSERT INTO purchases (id, date, providerId, providerName, paymentMethod, total) VALUES (?,?,?,?,?,?)').run(
        purchaseId, now, providerId || '', providerName || '', pm, Number(total) || 0
      );
      for (const item of (items || [])) {
        d.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(item.quantity, item.productId);
        d.prepare('INSERT INTO purchase_items (purchaseId, productId, productName, quantity, cost) VALUES (?,?,?,?,?)').run(
          purchaseId, item.productId || '', item.productName || '', item.quantity || 0, item.cost || 0
        );
      }
      d.prepare('INSERT INTO expenses (id, date, type, description, amount) VALUES (?,?,?,?,?)').run(
        'EGR-' + Date.now().toString().slice(-6), now, pm.toLowerCase(), `Compra ${purchaseId} - ${providerName || 'proveedor'}`, Number(total) || 0
      );
      return purchaseId;
    });
    const purchaseId = doPurchase();
    const purchase = d.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId);
    purchase.items = d.prepare('SELECT * FROM purchase_items WHERE purchaseId = ?').all(purchaseId);
    res.status(201).json(purchase);
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.get('/api/purchases/:id', (req, res) => {
  try {
    const purchase = getDb().prepare('SELECT * FROM purchases WHERE id = ?').get(req.params.id);
    if (!purchase) return res.status(404).json({ error: 'Compra no encontrada' });
    purchase.items = getDb().prepare('SELECT * FROM purchase_items WHERE purchaseId = ?').all(req.params.id);
    res.json(purchase);
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.delete('/api/purchases/:id', (req, res) => {
  try {
    const d = getDb();
    const purchase = d.prepare('SELECT * FROM purchases WHERE id = ?').get(req.params.id);
    if (!purchase) return res.status(404).json({ error: 'Compra no encontrada' });
    const items = d.prepare('SELECT * FROM purchase_items WHERE purchaseId = ?').all(req.params.id);
    const doDelete = d.transaction(() => {
      for (const item of items) {
        d.prepare('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?').run(item.quantity, item.productId);
      }
      d.prepare('DELETE FROM purchase_items WHERE purchaseId = ?').run(req.params.id);
      d.prepare('DELETE FROM purchases WHERE id = ?').run(req.params.id);
      d.prepare("DELETE FROM expenses WHERE description LIKE ? ESCAPE '\\'").run(`Compra ${escapeLike(req.params.id)} -%`);
    });
    doDelete();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

// ============ REPAIRS (REP- + historial + contador) ============
app.get('/api/repair-counter', (req, res) => {
  try {
    res.json({ counter: getRepairCounter() });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.put('/api/repair-counter', (req, res) => {
  try {
    const { counter } = req.body;
    if (typeof counter !== 'number' || counter < 1) {
      return res.status(400).json({ error: 'Counter must be a number >= 1' });
    }
    setConfig('repairCounter', counter);
    res.json({ counter });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.get('/api/counters', (req, res) => {
  try {
    res.json({ sale: getSaleCounter(), purchase: getPurchaseCounter(), repair: getRepairCounter() });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.put('/api/counters', (req, res) => {
  try {
    const { sale, purchase, repair } = req.body;
    if (typeof sale === 'number' && sale >= 1) setConfig('saleCounter', sale);
    if (typeof purchase === 'number' && purchase >= 1) setConfig('purchaseCounter', purchase);
    if (typeof repair === 'number' && repair >= 1) setConfig('repairCounter', repair);
    res.json({ sale: getSaleCounter(), purchase: getPurchaseCounter(), repair: getRepairCounter() });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.get('/api/repairs', (req, res) => {
  try {
    res.json(getDb().prepare('SELECT * FROM repairs ORDER BY date DESC').all());
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.post('/api/repairs', (req, res) => {
  try {
    const { clientId, clientName, clientPhone, equipment, marca, modelo, status, problem, notes, price } = req.body;
    if (hasNegative(price)) return res.status(400).json({ error: 'Precio inválido' });
    const existingCodes = getDb().prepare('SELECT code FROM repairs').all().map(r => r.code);
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    do {
      code = '';
      for (let i = 0; i < 5; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    } while (existingCodes.includes(code));
    const date = new Date().toISOString().split('T')[0];
    const d = getDb();
    const id = d.transaction(() => {
      const n = takeCounterInTxn(d, 'repairCounter', 'repairs', 'REP-%', 4);
      const rid = 'REP-' + n.toString().padStart(4, '0');
      d.prepare(`INSERT INTO repairs (id, code, clientId, clientName, clientPhone, equipment, marca, modelo, status, problem, notes, price, date, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        rid, code, clientId || '', clientName || '', clientPhone || '',
        equipment || '', marca || '', modelo || '', status || 'Recibida',
        problem || '', notes || '', Number(price) || 0, date, date
      );
      return rid;
    })();
    res.status(201).json(getDb().prepare('SELECT * FROM repairs WHERE id = ?').get(id));
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.put('/api/repairs/:id', (req, res) => {
  try {
    const existing = getDb().prepare('SELECT * FROM repairs WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Repair not found' });
    const { equipment, marca, modelo, status, problem, notes, price } = req.body;
    const now = new Date().toISOString();
    if (hasNegative(price)) return res.status(400).json({ error: 'Precio inválido' });
    getDb().prepare('UPDATE repairs SET equipment=?, marca=?, modelo=?, status=?, problem=?, notes=?, price=?, updatedAt=? WHERE id=?').run(
      equipment ?? existing.equipment, marca ?? existing.marca, modelo ?? existing.modelo,
      status ?? existing.status, problem ?? existing.problem,
      notes ?? existing.notes, price !== undefined ? Number(price) : existing.price,
      now, req.params.id
    );
    res.json(getDb().prepare('SELECT * FROM repairs WHERE id = ?').get(req.params.id));
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.get('/api/repairs/history', (req, res) => {
  try {
    res.json(getDb().prepare("SELECT * FROM repairs WHERE status = 'Entregada' ORDER BY updatedAt DESC, date DESC").all());
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.get('/api/repairs/export', (req, res) => {
  try {
    const search = String((req.query || {}).q || '').slice(0, 200).toLowerCase();
    const rows = getDb().prepare("SELECT * FROM repairs WHERE status = 'Entregada'").all()
      .filter(r => !search ||
        (r.code || '').toLowerCase().includes(search) ||
        (r.id || '').toLowerCase().includes(search) ||
        (r.clientName || '').toLowerCase().includes(search) ||
        (r.equipment || '').toLowerCase().includes(search))
      .sort((a, b) => {
        const ad = a.updatedAt || a.date || '';
        const bd = b.updatedAt || b.date || '';
        return String(bd).localeCompare(String(ad));
      });
    const esc = (v) => {
      const s = String(v ?? '');
      if (s.includes(';') || s.includes('"') || s.includes('\n') || s.includes('\r')) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const header = 'CLAVE;ORDEN;FECHA INGRESO;ULTIMA ACTUALIZACION;CLIENTE;TELEFONO;EQUIPO;MARCA;MODELO;PROBLEMA;ESTADO;PRECIO';
    const lines = rows.map(r => [
      esc(r.code), esc(r.id), esc(r.date),
      esc(r.updatedAt ? new Date(r.updatedAt).toLocaleString() : ''),
      esc(r.clientName || ''), esc(r.clientPhone || ''),
      esc(r.equipment || ''), esc(r.marca || ''), esc(r.modelo || ''),
      esc(r.problem || ''), esc(r.status || ''), Number(r.price || 0).toFixed(0)
    ].join(';'));
    const total = rows.reduce((sum, r) => sum + Number(r.price || 0), 0);
    lines.push(['TOTAL', '', '', '', '', '', '', '', '', '', '', total.toFixed(0)].join(';'));
    const csv = '﻿' + header + '\n' + lines.join('\n');
    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=reparaciones-${dateStr}.csv`);
    res.send(csv);
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.get('/api/repairs/lookup/:code', rateLimit({ windowMs: 60000, max: 20 }), (req, res) => {
  try {
    const repair = getDb().prepare('SELECT * FROM repairs WHERE code = ?').get(String(req.params.code || '').toUpperCase());
    if (!repair) return res.status(404).json({ found: false, message: 'No se encontr\u00f3 ninguna orden con esa clave.' });
    res.json({ found: true, repair });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.delete('/api/repairs/:id', (req, res) => {
  try {
    const r = getDb().prepare('DELETE FROM repairs WHERE id = ?').run(req.params.id);
    if (r.changes > 0) res.json({ success: true });
    else res.status(404).json({ error: 'Repair not found' });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

// ============ EXPENSES ============
app.get('/api/expenses', (req, res) => {
  try {
    res.json(getDb().prepare('SELECT id, date, type, description, amount FROM expenses ORDER BY date DESC').all());
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.post('/api/expenses', (req, res) => {
  try {
    if (hasNegative(req.body.amount)) return res.status(400).json({ error: 'Monto inválido' });
    const id = 'EGR-' + Date.now().toString().slice(-6);
    getDb().prepare('INSERT INTO expenses (id, date, type, description, amount) VALUES (?,?,?,?,?)').run(
      id, req.body.date || new Date().toISOString(), req.body.type || 'efectivo', req.body.description || '', Number(req.body.amount) || 0
    );
    res.status(201).json(getDb().prepare('SELECT id, date, type, description, amount FROM expenses WHERE id = ?').get(id));
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.delete('/api/expenses/:id', (req, res) => {
  try {
    const r = getDb().prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
    if (r.changes > 0) res.json({ success: true });
    else res.status(404).json({ error: 'Egreso no encontrado' });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

// ============ PENDIENTES (recordatorios de reposición) ============
app.get('/api/pendientes', (req, res) => {
  try {
    res.json(getDb().prepare('SELECT * FROM restock_pending ORDER BY createdAt DESC').all());
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.post('/api/pendientes', (req, res) => {
  try {
    const { productId, productName, productCode, quantity } = req.body;
    if (!productId || !quantity) return res.status(400).json({ error: 'Faltan datos' });
    const id = 'PEND-' + Date.now().toString().slice(-6);
    const now = new Date().toISOString();
    getDb().prepare('INSERT INTO restock_pending (id, productId, productName, productCode, quantity, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?)')
      .run(id, productId, productName || '', productCode || '', Number(quantity) || 1, now, now);
    res.status(201).json(getDb().prepare('SELECT * FROM restock_pending WHERE id = ?').get(id));
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.put('/api/pendientes/:id', (req, res) => {
  try {
    const { quantity } = req.body;
    if (quantity === undefined) return res.status(400).json({ error: 'Falta cantidad' });
    const now = new Date().toISOString();
    getDb().prepare('UPDATE restock_pending SET quantity = ?, updatedAt = ? WHERE id = ?').run(Number(quantity), now, req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.delete('/api/pendientes/:id', (req, res) => {
  try {
    getDb().prepare('DELETE FROM restock_pending WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

// ============ EXCHANGES (Cambios) ============
app.get('/api/exchanges', (req, res) => {
  try {
    res.json(getDb().prepare('SELECT * FROM exchanges ORDER BY date DESC').all());
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.post('/api/exchanges', (req, res) => {
  try {
    const { clientId, clientName, productId, productName, status, notes } = req.body;
    const id = Date.now().toString();
    const date = new Date().toISOString().slice(0, 19).replace('T', ' ');
    getDb().prepare('INSERT INTO exchanges (id, clientId, clientName, productId, productName, status, date, notes) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, clientId || '', clientName || '', productId || '', productName || '', status || 'recibido', date, notes || '');
    res.status(201).json({ id, clientId, clientName, productId, productName, status, date, notes });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.put('/api/exchanges/:id', (req, res) => {
  try {
    const existing = getDb().prepare('SELECT * FROM exchanges WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Exchange not found' });
    const { clientId, clientName, productId, productName, status, notes } = req.body;
    getDb().prepare('UPDATE exchanges SET clientId=?, clientName=?, productId=?, productName=?, status=?, notes=? WHERE id=?').run(
      clientId !== undefined ? clientId : existing.clientId,
      clientName !== undefined ? clientName : existing.clientName,
      productId !== undefined ? productId : existing.productId,
      productName !== undefined ? productName : existing.productName,
      status !== undefined ? status : existing.status,
      notes !== undefined ? notes : existing.notes,
      req.params.id
    );
    res.json(getDb().prepare('SELECT * FROM exchanges WHERE id = ?').get(req.params.id));
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.delete('/api/exchanges/:id', (req, res) => {
  try {
    const r = getDb().prepare('DELETE FROM exchanges WHERE id = ?').run(req.params.id);
    res.json({ success: r.changes > 0 });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

// ============ STOCK WARNING ============
app.get('/api/stock-warning', (req, res) => {
  try {
    res.json({ enabled: getConfig('stockWarningEnabled', true) });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

app.post('/api/stock-warning', (req, res) => {
  try {
    const enabled = req.body.enabled === true;
    setConfig('stockWarningEnabled', enabled);
    res.json({ enabled });
  } catch (e) { res.status(500).json({ error: 'Error interno del servidor' }); }
});

// ============ ESTADISTICAS ============
app.get('/api/stats', (req, res) => {
  try {
    const rows = getDb().prepare('SELECT year, month, sales_count, cash_amount FROM monthly_stats ORDER BY year, month').all();
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Recalcula la tabla desde las ventas reales (sin datos de demostración)
app.post('/api/stats/sync-sales', (req, res) => {
  try {
    const d = getDb();
    const rows = d.prepare(`
      SELECT CAST(strftime('%Y', date) AS INTEGER) as year,
             CAST(strftime('%m', date) AS INTEGER) as month,
             COUNT(*) as sales_count
      FROM sales
      GROUP BY year, month
      ORDER BY year, month
    `).all();
    const upsert = d.prepare('INSERT OR REPLACE INTO monthly_stats (year, month, sales_count, cash_amount) VALUES (?,?,?,COALESCE((SELECT cash_amount FROM monthly_stats WHERE year=? AND month=?),0))');
    const doSync = d.transaction(() => {
      for (const r of rows) upsert.run(r.year, r.month, r.sales_count, r.year, r.month);
    });
    doSync();
    res.json({ success: true, message: 'Ventas sincronizadas correctamente.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Mantiene compatibilidad con el botón "Cargar Iniciales" pero calcula desde ventas reales
app.post('/api/stats/seed', (req, res) => {
  try {
    const d = getDb();
    const rows = d.prepare(`
      SELECT CAST(strftime('%Y', date) AS INTEGER) as year,
             CAST(strftime('%m', date) AS INTEGER) as month,
             COUNT(*) as sales_count
      FROM sales
      GROUP BY year, month
      ORDER BY year, month
    `).all();
    const ins = d.prepare('INSERT OR REPLACE INTO monthly_stats (year, month, sales_count, cash_amount) VALUES (?,?,?,COALESCE((SELECT cash_amount FROM monthly_stats WHERE year=? AND month=?),0))');
    const doSeed = d.transaction(() => {
      for (const r of rows) ins.run(r.year, r.month, r.sales_count, r.year, r.month);
    });
    doSeed();
    res.json({ success: true, message: 'Datos de estadísticas cargados desde las ventas reales.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/stats/update', (req, res) => {
  try {
    const { year, month, field, value } = req.body;
    if (!year || !month || !field || value === undefined) return res.status(400).json({ error: 'Faltan parámetros' });
    if (!['sales_count', 'cash_amount'].includes(field)) return res.status(400).json({ error: 'Campo inválido' });
    const num = Number(value);
    if (isNaN(num)) return res.status(400).json({ error: 'Valor inválido' });
    const existing = getDb().prepare('SELECT * FROM monthly_stats WHERE year=? AND month=?').get(year, month);
    if (existing) {
      getDb().prepare(`UPDATE monthly_stats SET ${field}=? WHERE year=? AND month=?`).run(num, year, month);
    } else {
      const sales = field === 'sales_count' ? num : 0;
      const cash = field === 'cash_amount' ? num : 0;
      getDb().prepare('INSERT INTO monthly_stats (year, month, sales_count, cash_amount) VALUES (?,?,?,?)').run(year, month, sales, cash);
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/stats/add-year', (req, res) => {
  try {
    const { year } = req.body;
    if (!year) return res.status(400).json({ error: 'Falta año' });
    const insert = getDb().prepare('INSERT OR IGNORE INTO monthly_stats (year, month, sales_count, cash_amount) VALUES (?,?,0,0)');
    const doAdd = getDb().transaction(() => {
      for (let m = 1; m <= 12; m++) insert.run(year, m);
    });
    doAdd();
    res.json({ success: true, message: `Año ${year} agregado correctamente.` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/stats/daily', (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const month = parseInt(req.query.month) || (new Date().getMonth() + 1);
    const yearStr = year.toString();
    const monthStr = month.toString().padStart(2, '0');
    const d = getDb();
    const sales = d.prepare(`
      SELECT CAST(strftime('%d', date) AS INTEGER) as day,
             COUNT(*) as count,
             COALESCE(SUM(total), 0) as income
      FROM sales
      WHERE strftime('%Y', date) = ? AND strftime('%m', date) = ?
      GROUP BY day ORDER BY day
    `).all(yearStr, monthStr);
    const expenses = d.prepare(`
      SELECT CAST(strftime('%d', date) AS INTEGER) as day,
             COALESCE(SUM(amount), 0) as total
      FROM expenses
      WHERE strftime('%Y', date) = ? AND strftime('%m', date) = ?
      GROUP BY day ORDER BY day
    `).all(yearStr, monthStr);
    const daysInMonth = new Date(year, month, 0).getDate();
    const dailyMap = {};
    for (let dd = 1; dd <= daysInMonth; dd++) dailyMap[dd] = { day: dd, salesCount: 0, income: 0, expenses: 0 };
    for (const s of sales) { if (dailyMap[s.day]) { dailyMap[s.day].salesCount = s.count; dailyMap[s.day].income = s.income; } }
    for (const e of expenses) { if (dailyMap[e.day]) { dailyMap[e.day].expenses = e.total; } }
    res.json(Object.values(dailyMap));
  } catch (e) { res.status(500).json({ error: e.message }); }
});



// ============ SPA (built files) ============
if (IS_STANDALONE && fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR, {
    maxAge: '30d',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
    }
  }));
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
  console.log(`[API] Sirviendo SPA desde ${DIST_DIR}`);
}

// ============ HELPERS ============
const SCHEMA_COLUMNS = {
  products: ['id', 'code', 'name', 'price', 'cost', 'stock', 'category', 'source', 'description', 'image', 'oferta', 'nuevo', 'webDesc', 'ofertaPrice', 'price_mayorista', 'fichaTecnica', 'fichaTecnicaFile'],
  clients: ['id', 'document', 'name', 'phone', 'email'],
  providers: ['id', 'ruc', 'name', 'phone', 'email'],
  payment_methods: ['id', 'name', 'requiresCash', 'icon', 'adjustment'],
  sales: ['id', 'date', 'total', 'paymentMethod', 'clientId', 'clientName', 'cashReceived', 'change'],
  sale_items: ['id', 'saleId', 'productId', 'productName', 'quantity', 'price'],
  purchases: ['id', 'date', 'providerId', 'providerName', 'paymentMethod', 'total'],
  purchase_items: ['id', 'purchaseId', 'productId', 'productName', 'quantity', 'cost'],
  expenses: ['id', 'date', 'type', 'description', 'amount'],
  repairs: ['id', 'code', 'clientId', 'clientName', 'clientPhone', 'equipment', 'marca', 'modelo', 'status', 'price', 'problem', 'notes', 'date', 'updatedAt'],
  web_categories: ['id', 'name'],
  web_services: ['id', 'name', 'desc', 'icon', 'price'],
  notes: ['id', 'title', 'content', 'date', 'category'],
  orders: ['id', 'date', 'items', 'total', 'clientName', 'clientPhone', 'notes', 'status', 'deliveryType'],
  app_config: ['key', 'value'],
  restock_pending: ['id', 'productId', 'productName', 'productCode', 'quantity', 'createdAt', 'updatedAt', 'notes'],
  monthly_stats: ['year', 'month', 'sales_count', 'cash_amount'],
  exchanges: ['id', 'clientId', 'clientName', 'productId', 'productName', 'status', 'date', 'notes'],
  site_visits: ['id', 'date', 'count'],
};

function getConfig(key, def = null) {
  try {
    const row = getDb().prepare('SELECT value FROM app_config WHERE key = ?').get(key);
    return row ? JSON.parse(row.value) : def;
  } catch { return def; }
}

function setConfig(key, value) {
  getDb().prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?,?)').run(key, JSON.stringify(value));
}

const NUMERIC_COLS = {
  products: ['price', 'cost', 'stock', 'ofertaPrice', 'price_mayorista', 'oferta', 'nuevo'],
  sales: ['total', 'cashReceived', 'change'],
  sale_items: ['quantity', 'price'],
  purchases: ['total'],
  purchase_items: ['quantity', 'cost'],
  expenses: ['amount'],
  repairs: ['price'],
  payment_methods: ['requiresCash', 'adjustment'],
  monthly_stats: ['year', 'month', 'sales_count', 'cash_amount'],
  site_visits: ['count'],
  orders: ['total'],
  web_services: ['price'],
};
const RECOMPUTE_COUNTERS = ['saleCounter', 'purchaseCounter', 'repairCounter', 'orderSequence'];

function checkRow(t, row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`Fila inválida en ${t}`);
  const allowed = SCHEMA_COLUMNS[t];
  const keys = Object.keys(row).filter(k => allowed.indexOf(k) !== -1);
  if (keys.length === 0) throw new Error(`Fila vacía en ${t}`);
  if (t === 'app_config') {
    if (typeof row.key !== 'string' || row.key.length === 0 || row.key.length > 200) throw new Error('Clave inválida en app_config');
    if (typeof row.value !== 'string') throw new Error('Valor inválido en app_config');
    try { JSON.parse(row.value); } catch { throw new Error('Valor no-JSON en app_config'); }
    return keys;
  }
  const numerics = NUMERIC_COLS[t] || [];
  for (const k of keys) {
    const v = row[k];
    if (v === null || v === undefined || v === '') continue;
    if (numerics.indexOf(k) !== -1) {
      const n = Number(v);
      if (!Number.isFinite(n)) throw new Error(`Dato inválido en ${t}.${k}`);
    } else if (typeof v === 'string' && v.length > 20000) {
      throw new Error(`Texto demasiado largo en ${t}.${k}`);
    }
  }
  return keys;
}

// ============ BACKUP LEGACY (formato camelCase de versiones anteriores) ============
const LEGACY_KEYMAP = {
  paymentMethods: 'payment_methods',
  categories: 'web_categories',
  services: 'web_services',
  monthlyStats: 'monthly_stats',
  restockPending: 'restock_pending',
  siteVisits: 'site_visits',
};
const LEGACY_SECRETS = ['gitToken', 'githubToken', 'gitRepo', 'githubRepo', 'backupPassword'];
function isLegacyBackup(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  if (Object.keys(LEGACY_KEYMAP).some(k => Array.isArray(data[k]))) return true;
  if (Array.isArray(data.sales) && data.sales.some(s => s && typeof s === 'object' && Array.isArray(s.items))) return true;
  if (Array.isArray(data.products) && data.products.some(p => p && typeof p === 'object' && !Array.isArray(p) && p.desc !== undefined && p.description === undefined)) return true;
  if (data.companyConfig && typeof data.companyConfig === 'object' && !Array.isArray(data.companyConfig)) return true;
  return false;
}
function normalizarBackupLegacy(data) {
  const report = { legacy: true, tablas: {}, configs: [], secretosEliminados: [], advertencias: [] };
  const out = {};
  const direct = ['products', 'clients', 'providers', 'sales', 'purchases', 'expenses', 'repairs'];
  for (const t of direct) if (Array.isArray(data[t])) out[t] = data[t];
  if (out.products) {
    out.products = out.products.map(p => {
      if (p && typeof p === 'object' && !Array.isArray(p) && p.desc !== undefined && p.description === undefined) {
        const { desc, ...rest } = p;
        return { ...rest, description: desc };
      }
      return p;
    });
  }
  const items = [];
  if (Array.isArray(out.sales)) {
    out.sales = out.sales.map(s => {
      if (s && typeof s === 'object' && Array.isArray(s.items)) {
        for (const it of s.items) if (it && typeof it === 'object') items.push(it);
        const { items: _drop, ...rest } = s;
        return rest;
      }
      return s;
    });
    if (items.length) out.sale_items = (Array.isArray(data.sale_items) ? data.sale_items : []).concat(items);
  } else if (Array.isArray(data.sale_items)) {
    out.sale_items = data.sale_items;
  }
  for (const oldK of Object.keys(LEGACY_KEYMAP)) {
    if (Array.isArray(data[oldK])) out[LEGACY_KEYMAP[oldK]] = data[oldK];
  }
  for (const t of [...direct, 'sale_items', ...Object.values(LEGACY_KEYMAP)]) {
    if (Array.isArray(out[t])) report.tablas[t] = out[t].length;
  }
  const cfgRows = [];
  const pushCfg = (key, val) => {
    if (val !== undefined && val !== null) cfgRows.push({ key, value: JSON.stringify(val) });
  };
  if (data.companyConfig && typeof data.companyConfig === 'object' && !Array.isArray(data.companyConfig)) {
    const cc = { ...data.companyConfig };
    for (const s of LEGACY_SECRETS) {
      if (cc[s] !== undefined) { delete cc[s]; report.secretosEliminados.push('companyConfig.' + s); }
    }
    pushCfg('companyConfig', cc);
    report.configs.push('companyConfig');
  }
  if (data.webConfig && typeof data.webConfig === 'object' && !Array.isArray(data.webConfig)) {
    pushCfg('webConfig', data.webConfig);
    report.configs.push('webConfig');
  }
  if (data.cashRegister !== undefined && data.cashRegister !== null) {
    pushCfg('cashRegister', data.cashRegister);
    report.configs.push('cashRegister');
  }
  if (data.stockWarningEnabled !== undefined && data.stockWarningEnabled !== null) {
    pushCfg('stockWarningEnabled', !!data.stockWarningEnabled);
    report.configs.push('stockWarningEnabled');
  }
  if (cfgRows.length) out.app_config = cfgRows;
  try {
    const NC = typeof NUMERIC_COLS !== 'undefined' ? NUMERIC_COLS : {};
    for (const t of Object.keys(out)) {
      const nums = NC[t] || [];
      if (!nums.length || !Array.isArray(out[t])) continue;
      for (const row of out[t]) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
        for (const k of nums) {
          const v = row[k];
          if (typeof v === 'boolean') row[k] = v ? 1 : 0;
          else if (typeof v === 'string' && v !== '' && Number.isFinite(Number(v))) row[k] = Number(v);
        }
      }
    }
  } catch {}
  if (!Object.keys(report.tablas).length && !cfgRows.length) {
    report.advertencias.push('No se reconoció ninguna tabla ni configuración');
  }
  return { data: out, report };
}

function restoreFromJson(data) {
  const d = getDb();
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Formato de backup inválido');
  }
  const tables = Object.keys(SCHEMA_COLUMNS);
  // Sólo vaciar tablas que el backup realmente contiene (evita borrar sin reemplazo).
  const presentTables = tables.filter(t => Array.isArray(data[t]));
  if (presentTables.length === 0) throw new Error('El backup no trae ninguna tabla válida');
  // Validar TODO antes de tocar nada: cualquier error aborta sin cambios.
  // Coerción mínima: SQLite no bindea booleanos (algunos backups los traen en flags numéricos).
  const plan = presentTables.map(t => ({
    t,
    rows: data[t].map(row => {
      const keys = checkRow(t, row);
      const nums = NUMERIC_COLS[t] || [];
      for (const k of keys) {
        if (nums.indexOf(k) !== -1 && typeof row[k] === 'boolean') row[k] = row[k] ? 1 : 0;
      }
      return { row, keys };
    }),
  }));
  // Recalcular contadores desde los datos restaurados.
  let restored = 0;
  d.transaction(() => {
    for (const { t } of plan) {
      d.prepare(`DELETE FROM ${t}`).run();
    }
    for (const { t, rows } of plan) {
      for (const { row, keys } of rows) {
        const vals = keys.map(k => row[k]);
        d.prepare(`INSERT INTO ${t} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...vals);
        restored++;
      }
    }
    for (const k of RECOMPUTE_COUNTERS) {
      d.prepare('DELETE FROM app_config WHERE key = ?').run(k);
    }
  })();
  console.log(`[API] Restore: ${restored} filas restauradas`);
  return { restored };
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${d}d ${h}h ${m}m ${s}s`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}



function githubToken() {
  const t = String(process.env.GITHUB_TOKEN || process.env.NEXUS_GITHUB_TOKEN || '').trim();
  if (t) return t;
  try {
    const p = path.join(APP_ROOT, 'herramientas', '.github-token');
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim();
  } catch {}
  try {
    const p = path.join(APP_ROOT, 'herramientas', '.panel-token');
    if (fs.existsSync(p)) {
      const v = fs.readFileSync(p, 'utf8').trim();
      if (/^gh[op]_[A-Za-z0-9_]+$/.test(v) || /^[0-9a-f]{40}$/i.test(v)) return v;
    }
  } catch {}
  return '';
}

async function githubCreateRepo(org, repo, token) {
  const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' };
  let r = await fetch(`https://api.github.com/orgs/${org}/repos`, { method: 'POST', headers, body: JSON.stringify({ name: repo, private: false, auto_init: false }) });
  let j = await r.json().catch(() => ({}));
  if (r.ok) return j;
  if (r.status === 422 && /already exists/i.test(j.message || '')) return { alreadyExists: true };
  if (r.status === 404) {
    r = await fetch(`https://api.github.com/user/repos`, { method: 'POST', headers, body: JSON.stringify({ name: repo, private: false }) });
    j = await r.json().catch(() => ({}));
    if (r.ok) return j;
    if (r.status === 422 && /already exists/i.test(j.message || '')) return { alreadyExists: true };
  }
  throw new Error(j.message || `GitHub create repo ${r.status}`);
}

async function githubEnablePages(org, repo, token, customDomain) {
  const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' };
  const body = customDomain ? { source: { branch: 'main', path: '/' }, cname: customDomain } : { source: { branch: 'main', path: '/' } };
  let r = await fetch(`https://api.github.com/repos/${org}/${repo}/pages`, { method: 'POST', headers, body: JSON.stringify(body) });
  let j = await r.json().catch(() => ({}));
  if (r.ok) return j;
  if (r.status === 409 && /already exists/i.test(j.message || '')) {
    r = await fetch(`https://api.github.com/repos/${org}/${repo}/pages`, { method: 'PUT', headers, body: JSON.stringify(body) });
    j = await r.json().catch(() => ({}));
    if (r.ok) return j;
  }
  throw new Error(j.message || `GitHub pages ${r.status}`);
}

async function runCreateOrgRepo(p, onStep) {
  const emit = (id, status, detail) => { try { if (typeof onStep === 'function') onStep(id, status, detail); } catch {} };
  const fail = (id, e) => { emit(id, 'fail', (e && e.message) || 'Fallo'); throw e; };
  const ORG = 'lucianodzienciol-hue';
  const CENTRAL = 'NexusGiga';
  const token = githubToken();
  if (!token) {
    const e = new Error('Falta GITHUB_TOKEN (herramientas/.github-token o env GITHUB_TOKEN) con permiso repo');
    e.statusCode = 400; fail('create-repo', e);
  }
  emit('validate', 'done');
  const useCentral = !p.customDomain;
  const targetRepo = useCentral ? CENTRAL : p.slug;
  emit('create-repo', 'run');
  if (useCentral) {
    try {
      const r = await fetch(`https://api.github.com/repos/${ORG}/${CENTRAL}`, { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json' } });
      if (!r.ok) throw new Error(`Central repo no accesible ${r.status}`);
    } catch (e) { fail('create-repo', e); }
  } else {
    try {
      await githubCreateRepo(ORG, targetRepo, token);
    } catch (e) {
      if (/already exists/i.test(e.message||'')) { /* ok */ }
      else if (/Resource not accessible|403/.test(e.message||'')) {
        const ee = new Error('Token sin permiso para crear repo dedicado. Para dominio propio usa token Classic con repo o fine-grained con All repositories');
        ee.statusCode = 403; fail('create-repo', ee);
      } else fail('create-repo', e);
    }
  }
  emit('create-repo', 'ok');
  emit('build', 'run');
  let outDir;
  try {
    const { lib } = await vendorLibs();
    const db = getDbOrThrow();
    const products = db.prepare("SELECT * FROM products WHERE source='web'").all();
    const categories = db.prepare("SELECT * FROM web_categories").all();
    const services = db.prepare("SELECT * FROM web_services").all();
    const companyConfig = getConfig('companyConfig', {});
    const webConfig = getConfig('webConfig', {});
    const store = { products, categories, services, config: { ...companyConfig, ...webConfig } };
    if (p.comercio) store.config.companyName = p.comercio;
    outDir = path.join(APP_ROOT, 'tenant', 'dist', p.slug);
    fs.mkdirSync(outDir, { recursive: true });
    lib.writeStaticFiles(path.join(APP_ROOT, 'web'), outDir, store);
  } catch (e) { fail('build', e); }
  emit('build', 'ok');
  emit('push', 'run');
  try {
    if (useCentral) await gitPushCentral(ORG, CENTRAL, p.slug, outDir, token);
    else await gitPush(outDir, ORG, p.slug, token);
  } catch (e) { fail('push', e); }
  emit('push', 'ok');
  emit('pages', 'run');
  try {
    if (useCentral) await githubEnablePages(ORG, CENTRAL, token, undefined);
    else await githubEnablePages(ORG, p.slug, token, p.customDomain);
  } catch (e) {
    if (!/already exists/i.test(e.message||'')) {
      console.warn('[A1] Pages central warning:', e.message);
    }
  }
  emit('pages', 'ok');
  const finalUrl = p.customDomain ? `https://${p.customDomain}/` : `https://${ORG}.github.io/${CENTRAL}/${p.slug}/`;
  return { ok: true, slug: p.slug, url: finalUrl, central: useCentral };
}

const LISTEN_HOST = process.env.NEXUS_LOOPBACK === '1' ? '127.0.0.1' : '0.0.0.0';
function startServer(port, cb) {
  const srv = app.listen(port, LISTEN_HOST, cb);
  srv.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      if (process.env.NEXUS_NO_KILL === '1') {
        console.log(`[API] Puerto ${port} ocupado, usando puerto ${port + 1}`);
        startServer(port + 1, cb);
        return;
      }
      console.log(`[API] Puerto ${port} ocupado, liberando...`);
      exec(`netstat -ano | findstr :${port} | findstr LISTENING`, (e, stdout) => {
        if (stdout) {
          const parts = stdout.trim().split(/\s+/);
          const pid = parseInt(parts[parts.length - 1]);
          if (pid && !isNaN(pid)) {
            // Sólo matar si es un proceso node (evita cerrar aplicaciones ajenas).
            exec(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, (te, tout) => {
              const isNode = tout && tout.toLowerCase().includes('node.exe');
              if (isNode) {
                try { process.kill(pid); } catch {}
                setTimeout(() => startServer(port, cb), 1000);
                return;
              }
              console.log(`[API] Puerto ${port} ocupado por otro proceso (PID ${pid}), usando puerto ${port + 1}`);
              startServer(port + 1, cb);
            });
            return;
          }
        }
        console.log(`[API] No se pudo liberar el puerto ${port}, usando puerto ${port + 1}`);
        startServer(port + 1, cb);
      });
    } else {
      console.error('[API] Error al iniciar servidor:', err.message);
      process.exit(1);
    }
  });
}

// Error handler al final: captura errores de todas las rutas registradas arriba.
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  console.error('[API] Error:', err.message);
  res.status(500).json({ error: 'Error interno del servidor' });
});

startServer(PORT, () => {
  migrateLegacyDb();
  importPendingLink();
  console.log(`=========================================`);
  console.log(`  Nexus Full - API Server`);
  console.log(`  Puerto: ${PORT}`);
  console.log(`  Base de datos: ${DB_FILE}`);
  console.log(`  Tienda Web: http://localhost:${PORT}/web/`);
  console.log(`=========================================`);
  if (IS_STANDALONE && process.env.BROWSER !== 'none') {
    setTimeout(() => {
      exec(`start http://localhost:${PORT}`, (err) => {
        if (err) console.log('[API] No se pudo abrir el navegador:', err.message);
      });
    }, 1000);
  }
});