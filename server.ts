import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { execSync } from 'child_process';
import https from 'https';
import AdmZip from 'adm-zip';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import QRCode from 'qrcode';
import { Product, Client, Sale, Provider, Purchase, PaymentMethod, CompanyConfig, Expense, CashRegister, WebRepair } from './src/types';

const DB_FILE = path.join(process.cwd(), 'database.db');
const SEC_DB_FILE = path.join(process.cwd(), 'database.json');
const BACKUP_DIR = path.join(process.cwd(), 'backups');
const WEB_MAIN_DIR = path.join(process.cwd(), 'web');
const MAX_BACKUPS = 30;
const BACKUP_INTERVAL_MS = 60 * 60 * 1000;
const SECONDARY_BACKUP_DIR = path.join(process.cwd(), 'Backup Secundario');
const ENCRYPTED_BACKUP_DIR = path.join(process.cwd(), 'Backups Encriptados');

interface WebDataConfig {
  [key: string]: any;
}

interface DatabaseSchema {
  products: Product[];
  clients: Client[];
  providers: Provider[];
  sales: Sale[];
  purchases: Purchase[];
  paymentMethods: PaymentMethod[];
  companyConfig: CompanyConfig | null;
  stockWarningEnabled: boolean;
  expenses: Expense[];
  cashRegister: CashRegister | null;
  categories?: { id: string; name: string }[];
  services?: { id: string; name: string; desc?: string; icon?: string; price?: number }[];
  webConfig?: WebDataConfig;
  repairs?: WebRepair[];
  restockPending?: { id: string; productId: string; productName: string; productCode: string; quantity: number; createdAt: string; updatedAt: string }[];
  monthlyStats?: { year: number; month: number; sales_count: number; cash_amount: number }[];
  siteVisits?: { date: string; count: number }[];
}

interface WebProduct {
  name: string;
  category: string;
  price: number;
  desc?: string;
  image?: string;
  id: string;
  oferta?: boolean;
  nuevo?: boolean;
  webDesc?: string;
  ofertaPrice?: number;
  fichaTecnica?: string;
  fichaTecnicaFile?: string;
  source?: string;
}

const INITIAL_DB: DatabaseSchema = {
  products: [
    { id: '1', code: '1001', name: 'Coca Cola 500ml', price: 2.50, cost: 1.50, stock: 50, category: 'Bebidas' },
    { id: '2', code: '1002', name: 'Agua Mineral 1L', price: 1.80, cost: 1.00, stock: 40, category: 'Bebidas' },
    { id: '3', code: '2001', name: 'Galletas Oreo', price: 1.20, cost: 0.70, stock: 35, category: 'Snacks' },
    { id: '4', code: '2002', name: 'Papas Fritas Lays Clásicas', price: 2.20, cost: 1.30, stock: 25, category: 'Snacks' },
    { id: '5', code: '2003', name: 'Chocolate Snickers', price: 2.00, cost: 1.10, stock: 30, category: 'Snacks' },
    { id: '6', code: '3001', name: 'Detergente Ala 1kg', price: 5.50, cost: 3.50, stock: 15, category: 'Limpieza' },
    { id: '7', code: '3002', name: 'Jabón Rexona', price: 1.50, cost: 0.90, stock: 20, category: 'Limpieza' },
    { id: '8', code: '4001', name: 'Arroz Premium 1kg', price: 3.80, cost: 2.50, stock: 60, category: 'Abarrotes' },
    { id: '9', code: '4002', name: 'Fideos Don Vittorio 500g', price: 2.40, cost: 1.50, stock: 45, category: 'Abarrotes' }
  ],
  clients: [
    { id: 'c1', document: '99999999', name: 'Cliente General', phone: '-', email: 'general@nexuspos.com' },
    { id: 'c2', document: '12345678', name: 'Juan Pérez', phone: '987654321', email: 'juan.perez@email.com' },
    { id: 'c3', document: '20456789123', name: 'Empresa Servis S.A.C.', phone: '014455667', email: 'contacto@servis.com' }
  ],
  providers: [
    { id: 'p1', ruc: '20112233445', name: 'Distribuidora Bebidas S.A.', phone: '944888333', email: 'ventas@distbebidas.com' },
    { id: 'p2', ruc: '20556677889', name: 'Snacks del Valle', phone: '955111222', email: 'pedidos@valleysnacks.com' },
    { id: 'p3', ruc: '20998877665', name: 'Arrocería del Norte', phone: '966222888', email: 'arroz@elnorte.com' }
  ],
  sales: [],
  purchases: [],
  paymentMethods: [
    { id: 'pm1', name: 'Efectivo', requiresCash: true, adjustment: 0 },
    { id: 'pm2', name: 'Tarjeta', requiresCash: false, adjustment: 0 },
    { id: 'pm3', name: 'Transferencia', requiresCash: false, adjustment: 0 }
  ],
  companyConfig: null,
  stockWarningEnabled: true,
  expenses: [],
  cashRegister: null,
  repairs: [],
  restockPending: [],
  monthlyStats: [],
  siteVisits: [],
  categories: [],
  services: []
};

const SCHEMA_SQL = `
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
  nuevo INTEGER DEFAULT 0
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
  type TEXT NOT NULL DEFAULT 'efectivo',
  descriptionText TEXT DEFAULT '',
  amount REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS repairs (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  clientId TEXT NOT NULL,
  clientName TEXT DEFAULT '',
  clientPhone TEXT DEFAULT '',
  equipment TEXT NOT NULL,
  marca TEXT DEFAULT '',
  modelo TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Recibida',
  problem TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  price REAL DEFAULT 0,
  date TEXT NOT NULL,
  updatedAt TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS site_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT UNIQUE NOT NULL,
  count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS web_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS web_services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  desc TEXT DEFAULT '',
  icon TEXT DEFAULT '',
  price REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS restock_pending (
  id TEXT PRIMARY KEY,
  productId TEXT NOT NULL,
  productName TEXT NOT NULL DEFAULT '',
  productCode TEXT DEFAULT '',
  quantity INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS monthly_stats (
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  sales_count INTEGER DEFAULT 0,
  cash_amount REAL DEFAULT 0,
  PRIMARY KEY (year, month)
);
`;

let db: Database.Database;

function isSqliteFile(filePath: string): boolean {
  try {
    if (!fs.existsSync(filePath)) return false;
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(16);
    fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);
    return buffer.toString('utf8') === 'SQLite format 3\u0000';
  } catch {
    return false;
  }
}

function setupSchema(database: Database.Database): void {
  database.exec(SCHEMA_SQL);
  // Add web-specific product columns if missing (safe to re-run)
  for (const col of ['webDesc', 'ofertaPrice', 'fichaTecnica', 'fichaTecnicaFile']) {
    try { database.exec(`ALTER TABLE products ADD COLUMN ${col} TEXT DEFAULT ''`); } catch {}
  }
  try { database.exec(`ALTER TABLE repairs ADD COLUMN updatedAt TEXT DEFAULT ''`); } catch {}
  database.pragma('journal_mode = WAL');
  database.pragma('synchronous = NORMAL');
  database.pragma('foreign_keys = ON');
}

function rowToProduct(row: any): Product {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    price: row.price,
    cost: row.cost,
    stock: row.stock,
    category: row.category,
    source: row.source || 'local',
    desc: row.description || '',
    image: row.image || '',
    oferta: row.oferta === 1,
    nuevo: row.nuevo === 1,
    webDesc: row.webDesc || '',
    ofertaPrice: row.ofertaPrice || 0,
    fichaTecnica: row.fichaTecnica || '',
    fichaTecnicaFile: row.fichaTecnicaFile || '',
  };
}

function productToRow(p: Partial<Product>): any {
  return {
    id: p.id,
    code: p.code || '',
    name: p.name || '',
    price: Number(p.price) || 0,
    cost: Number(p.cost) || 0,
    stock: Number(p.stock) || 0,
    category: p.category || 'Varios',
    source: p.source || 'local',
    description: p.desc || '',
    image: p.image || '',
    oferta: p.oferta === true ? 1 : 0,
    nuevo: p.nuevo === true ? 1 : 0,
    webDesc: p.webDesc || '',
    ofertaPrice: p.ofertaPrice || 0,
    fichaTecnica: p.fichaTecnica || '',
    fichaTecnicaFile: p.fichaTecnicaFile || '',
  };
}

function rowToPaymentMethod(row: any): PaymentMethod {
  return {
    id: row.id,
    name: row.name,
    requiresCash: row.requiresCash === 1,
    icon: row.icon || '',
    adjustment: row.adjustment || 0,
  };
}

function getConfig<T>(key: string, defaultValue: T): T {
  try {
    const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get(key) as any;
    if (row) return JSON.parse(row.value);
  } catch {}
  return defaultValue;
}

function setConfig(key: string, value: any): void {
  db.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
}

function getSalesWithItems(): Sale[] {
  const sales = db.prepare('SELECT * FROM sales ORDER BY date DESC').all() as any[];
  const getItems = db.prepare('SELECT * FROM sale_items WHERE saleId = ?');
  for (const s of sales) {
    s.items = getItems.all(s.id);
  }
  return sales;
}

function getPurchasesWithItems(): Purchase[] {
  const purchases = db.prepare('SELECT * FROM purchases ORDER BY date DESC').all() as any[];
  const getItems = db.prepare('SELECT * FROM purchase_items WHERE purchaseId = ?');
  for (const p of purchases) {
    p.items = getItems.all(p.id);
  }
  return purchases;
}

function getFullDatabaseSchema(): DatabaseSchema {
  return {
    products: (db.prepare('SELECT * FROM products').all() as any[]).map(rowToProduct),
    clients: db.prepare('SELECT * FROM clients').all() as Client[],
    providers: db.prepare('SELECT * FROM providers').all() as Provider[],
    sales: getSalesWithItems(),
    purchases: getPurchasesWithItems(),
    paymentMethods: (db.prepare('SELECT * FROM payment_methods').all() as any[]).map(rowToPaymentMethod),
    companyConfig: getConfig<CompanyConfig | null>('companyConfig', null),
    stockWarningEnabled: getConfig<boolean>('stockWarningEnabled', true),
    expenses: db.prepare('SELECT * FROM expenses').all() as Expense[],
    cashRegister: getConfig<CashRegister | null>('cashRegister', null),
    categories: db.prepare('SELECT * FROM web_categories ORDER BY name').all() as { id: string; name: string }[],
    services: db.prepare('SELECT * FROM web_services ORDER BY name').all() as { id: string; name: string; desc?: string; icon?: string; price?: number }[],
    webConfig: getConfig<WebDataConfig | null>('webConfig', null),
    repairs: db.prepare('SELECT * FROM repairs ORDER BY date DESC').all() as WebRepair[],
    restockPending: db.prepare('SELECT * FROM restock_pending ORDER BY createdAt DESC').all(),
    monthlyStats: db.prepare('SELECT * FROM monthly_stats ORDER BY year, month').all(),
    siteVisits: db.prepare('SELECT * FROM site_visits ORDER BY date').all(),
  };
}

function migrateData(database: Database.Database, data: DatabaseSchema): void {
  const insProduct = database.prepare(`INSERT OR REPLACE INTO products (id, code, name, price, cost, stock, category, source, description, image, oferta, nuevo, webDesc, ofertaPrice, fichaTecnica, fichaTecnicaFile) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insClient = database.prepare(`INSERT OR REPLACE INTO clients (id, document, name, phone, email) VALUES (?,?,?,?,?)`);
  const insProvider = database.prepare(`INSERT OR REPLACE INTO providers (id, ruc, name, phone, email) VALUES (?,?,?,?,?)`);
  const insPayment = database.prepare(`INSERT OR REPLACE INTO payment_methods (id, name, requiresCash, icon, adjustment) VALUES (?,?,?,?,?)`);
  const insExpense = database.prepare(`INSERT OR REPLACE INTO expenses (id, date, type, descriptionText, amount) VALUES (?,?,?,?,?)`);
  const insSale = database.prepare(`INSERT OR REPLACE INTO sales (id, date, total, paymentMethod, clientId, clientName, cashReceived, change) VALUES (?,?,?,?,?,?,?,?)`);
  const insSaleItem = database.prepare(`INSERT INTO sale_items (saleId, productId, productName, quantity, price) VALUES (?,?,?,?,?)`);
  const insPurchase = database.prepare(`INSERT OR REPLACE INTO purchases (id, date, providerId, providerName, total) VALUES (?,?,?,?,?)`);
  const insPurchaseItem = database.prepare(`INSERT INTO purchase_items (purchaseId, productId, productName, quantity, cost) VALUES (?,?,?,?,?)`);
  const insWebCat = database.prepare(`INSERT OR REPLACE INTO web_categories (id, name) VALUES (?,?)`);
  const insWebSvc = database.prepare(`INSERT OR REPLACE INTO web_services (id, name, desc, icon, price) VALUES (?,?,?,?,?)`);
  const insRepair = database.prepare(`INSERT OR REPLACE INTO repairs (id, code, clientId, clientName, clientPhone, equipment, marca, modelo, status, problem, notes, price, date, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insRestock = database.prepare(`INSERT OR REPLACE INTO restock_pending (id, productId, productName, productCode, quantity, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?)`);
  const insMonthly = database.prepare(`INSERT OR REPLACE INTO monthly_stats (year, month, sales_count, cash_amount) VALUES (?,?,?,?)`);
  const insVisit = database.prepare(`INSERT OR REPLACE INTO site_visits (date, count) VALUES (?,?)`);

  const migrate = database.transaction(() => {
    for (const p of data.products) {
      insProduct.run(p.id, p.code || '', p.name || '', p.price || 0, p.cost || 0, p.stock || 0, p.category || 'Varios', p.source || 'local', p.desc || '', p.image || '', p.oferta ? 1 : 0, p.nuevo ? 1 : 0, p.webDesc || p.desc || '', Number(p.ofertaPrice) || 0, p.fichaTecnica || '', p.fichaTecnicaFile || '');
    }
    for (const c of (data.categories || [])) {
      insWebCat.run(c.id, c.name || '');
    }
    for (const s of (data.services || [])) {
      insWebSvc.run(s.id, s.name || '', s.desc || '', s.icon || '', Number(s.price) || 0);
    }
    for (const c of data.clients) {
      insClient.run(c.id, c.document || '', c.name || '', c.phone || '-', c.email || '-');
    }
    for (const p of data.providers) {
      insProvider.run(p.id, p.ruc || '', p.name || '', p.phone || '-', p.email || '-');
    }
    for (const pm of (data.paymentMethods || [])) {
      insPayment.run(pm.id, pm.name || '', pm.requiresCash ? 1 : 0, pm.icon || '', pm.adjustment || 0);
    }
    for (const e of (data.expenses || [])) {
      insExpense.run(e.id, e.date || new Date().toISOString(), e.type || 'efectivo', e.description || '', e.amount || 0);
    }
    for (const s of (data.sales || [])) {
      insSale.run(s.id, s.date, s.total || 0, s.paymentMethod || 'Efectivo', s.clientId || '', s.clientName || 'Cliente General', s.cashReceived || s.total, s.change || 0);
      for (const item of (s.items || [])) {
        insSaleItem.run(s.id, item.productId || '', item.productName || '', item.quantity || 0, item.price || 0);
      }
    }
    for (const p of (data.purchases || [])) {
      insPurchase.run(p.id, p.date, p.providerId || '', p.providerName || '', p.total || 0);
      for (const item of (p.items || [])) {
        insPurchaseItem.run(p.id, item.productId || '', item.productName || '', item.quantity || 0, item.cost || 0);
      }
    }
    for (const r of (data.repairs || [])) {
      insRepair.run(r.id, r.code || '', r.clientId || '', r.clientName || '', r.clientPhone || '', r.equipment || '', r.marca || '', r.modelo || '', r.status || 'Recibida', r.problem || '', r.notes || '', Number(r.price) || 0, r.date || '', r.updatedAt || r.date || '');
    }
    for (const r of (data.restockPending || [])) {
      insRestock.run(r.id, r.productId || '', r.productName || '', r.productCode || '', Number(r.quantity) || 1, r.createdAt || '', r.updatedAt || '');
    }
    for (const m of (data.monthlyStats || [])) {
      insMonthly.run(m.year, m.month, m.sales_count || 0, m.cash_amount || 0);
    }
    for (const v of (data.siteVisits || [])) {
      insVisit.run(v.date || '', v.count || 0);
    }
    const insConfig = database.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)');
    if (data.companyConfig) insConfig.run('companyConfig', JSON.stringify(data.companyConfig));
    insConfig.run('stockWarningEnabled', JSON.stringify(data.stockWarningEnabled !== false));
    if (data.cashRegister) insConfig.run('cashRegister', JSON.stringify(data.cashRegister));
    if (data.webConfig) insConfig.run('webConfig', JSON.stringify(data.webConfig));
  });
  migrate();
}

function initDatabase(): Database.Database {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const dbPath = DB_FILE;

  if (!fs.existsSync(dbPath)) {
    if (fs.existsSync(SEC_DB_FILE)) {
      console.log('[DB] Migrando desde database.json a SQLite...');
      const jsonData = JSON.parse(fs.readFileSync(SEC_DB_FILE, 'utf-8'));
      const newDb = new Database(dbPath);
      setupSchema(newDb);
      migrateData(newDb, jsonData);
      const integrity = newDb.pragma('integrity_check') as string[];
      console.log('[DB] Integrity check:', integrity.join(', '));
      fs.renameSync(SEC_DB_FILE, SEC_DB_FILE + '.migrated');
      console.log('[DB] Migración completada. database.json → database.json.migrated');
      return newDb;
    }
    console.log('[DB] Creando nueva base de datos SQLite con datos iniciales...');
    const newDb = new Database(dbPath);
    setupSchema(newDb);
    migrateData(newDb, INITIAL_DB);
    return newDb;
  }

  if (!isSqliteFile(dbPath)) {
    console.log('[DB] database.db es JSON. Migrando a SQLite...');
    const jsonData = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    const backupPath = dbPath + '.pre-sqlite-backup';
    fs.copyFileSync(dbPath, backupPath);
    console.log('[DB] Backup pre-migración guardado:', backupPath);
    fs.unlinkSync(dbPath);
    const newDb = new Database(dbPath);
    setupSchema(newDb);
    migrateData(newDb, jsonData);
    const integrity = newDb.pragma('integrity_check') as string[];
    console.log('[DB] Integrity check:', integrity.join(', '));
    console.log('[DB] Migración completada exitosamente.');
    return newDb;
  }

  console.log('[DB] Abriendo base de datos SQLite existente...');
  const existingDb = new Database(dbPath);
  setupSchema(existingDb);
  const integrity = existingDb.pragma('integrity_check') as string[];
  console.log('[DB] Integrity check:', integrity.join(', '));
  return existingDb;
}

function createBackup(): void {
  try {
    const ts = new Date().toISOString().slice(0, 19).replace(/[:]/g, '-');
    const data = getFullDatabaseSchema();

    // Backup principal
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    fs.writeFileSync(path.join(BACKUP_DIR, `nexus-${ts}.json`), JSON.stringify(data, null, 2), 'utf-8');
    fs.copyFileSync(DB_FILE, path.join(BACKUP_DIR, `nexus-${ts}.db`));

    // Backup secundario
    if (!fs.existsSync(SECONDARY_BACKUP_DIR)) fs.mkdirSync(SECONDARY_BACKUP_DIR, { recursive: true });
    if (!fs.existsSync(path.join(SECONDARY_BACKUP_DIR, `nexus-${ts}.json`))) {
      fs.writeFileSync(path.join(SECONDARY_BACKUP_DIR, `nexus-${ts}.json`), JSON.stringify(data, null, 2), 'utf-8');
    }
    if (!fs.existsSync(path.join(SECONDARY_BACKUP_DIR, `nexus-${ts}.db`))) {
      fs.copyFileSync(DB_FILE, path.join(SECONDARY_BACKUP_DIR, `nexus-${ts}.db`));
    }

    // Rotación en carpeta principal
    const rotateDir = (dir: string) => {
      const files = fs.readdirSync(dir)
        .filter(f => f.startsWith('nexus-'))
        .sort();
      const seen = new Set<string>();
      const unique: string[] = [];
      for (const f of files) {
        const base = f.replace(/\.(json|db)$/, '');
        if (!seen.has(base)) { seen.add(base); unique.push(base); }
      }
      while (unique.length > MAX_BACKUPS) {
        const old = unique.shift()!;
        for (const ext of ['.json', '.db']) {
          const p = path.join(dir, old + ext);
          if (fs.existsSync(p)) fs.unlinkSync(p);
        }
      }
    };
    rotateDir(BACKUP_DIR);
    rotateDir(SECONDARY_BACKUP_DIR);

    console.log(`[BACKUP] Backup creado: nexus-${ts}`);

    createEncryptedBackup();
  } catch (err) {
    console.error('[BACKUP] Error:', err);
  }
}

function encryptBackup(data: string, password: string): Buffer {
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha512');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(data, 'utf-8'), cipher.final()]);
  return Buffer.concat([salt, iv, encrypted]);
}

function decryptBackup(encrypted: Buffer, password: string): string {
  const salt = encrypted.subarray(0, 16);
  const iv = encrypted.subarray(16, 32);
  const data = encrypted.subarray(32);
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha512');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return decipher.update(data) + decipher.final('utf-8');
}

function createEncryptedBackup(): void {
  try {
    const config = getConfig<CompanyConfig | null>('companyConfig', null);
    const password = config?.backupPassword;
    if (!password) return;

    const ts = new Date().toISOString().slice(0, 19).replace(/[:]/g, '-');
    const data = getFullDatabaseSchema();
    const jsonStr = JSON.stringify(data, null, 2);
    const encrypted = encryptBackup(jsonStr, password);

    if (!fs.existsSync(ENCRYPTED_BACKUP_DIR)) fs.mkdirSync(ENCRYPTED_BACKUP_DIR, { recursive: true });
    fs.writeFileSync(path.join(ENCRYPTED_BACKUP_DIR, `nexus-${ts}.json.enc`), encrypted);

    // Rotación
    const files = fs.readdirSync(ENCRYPTED_BACKUP_DIR)
      .filter(f => f.startsWith('nexus-') && f.endsWith('.json.enc'))
      .sort();
    while (files.length > MAX_BACKUPS) {
      const old = files.shift()!;
      const p = path.join(ENCRYPTED_BACKUP_DIR, old);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }

    console.log(`[BACKUP] Backup encriptado creado: nexus-${ts}.json.enc`);
  } catch (err) {
    console.error('[BACKUP] Error al encriptar:', err);
  }
}

let lastPOSWrite = Date.now();
let pendingSync = false;
let syncing = false;
let lastSyncTime: string | null = null;
let lastSyncError: string | null = null;
let lastBackupTime = 0;
let waClient: any = null;
let waReady = false;
let waQR: string | null = null;
let waInitializing = false;
const NEXUS_REPO_URL = 'https://github.com/gigacomputers2025-bot/Nexus.git';

async function importCompanyConfig(silent = false): Promise<boolean> {
  const WEB_URL = 'http://localhost:3000/api/config';
  try {
    const res = await fetch(WEB_URL);
    if (!res.ok) {
      if (!silent) console.log(`[CONFIG] Web-main no disponible (HTTP ${res.status})`);
      return false;
    }
    const config: CompanyConfig = await res.json();
    if (!config || !config.companyName) {
      if (!silent) console.log('[CONFIG] Web-main no tiene configuración de empresa');
      return false;
    }
    setConfig('companyConfig', config);
    if (!silent) console.log(`[CONFIG] Configuración de empresa importada: ${config.companyName}`);
    return true;
  } catch (err: any) {
    if (!silent) console.warn(`[CONFIG] No se pudo conectar con Web-main (${err?.message || err})`);
    return false;
  }
}

async function importFromWeb(silent = false): Promise<{ imported: number; updated: number }> {
  const WEB_URL = 'http://localhost:3000/api/products';
  try {
    const res = await fetch(WEB_URL);
    if (!res.ok) {
      if (!silent) console.log(`[IMPORT] Web-main no disponible (HTTP ${res.status})`);
      return { imported: 0, updated: 0 };
    }
    const webProducts: WebProduct[] = await res.json();
    if (!Array.isArray(webProducts) || webProducts.length === 0) {
      if (!silent) console.log('[IMPORT] Web-main no tiene productos para importar');
      return { imported: 0, updated: 0 };
    }
    let imported = 0;
    let updated = 0;

    const existingProducts = db.prepare('SELECT * FROM products').all() as any[];
    const findRow = db.prepare('UPDATE products SET source=?, code=?, price=?, cost=?, category=? WHERE id=?');
    const insertRow = db.prepare('INSERT INTO products (id, code, name, price, cost, stock, category, source) VALUES (?,?,?,?,?,?,?,?)');
    const updateWebRow = db.prepare('UPDATE products SET image=?, oferta=?, nuevo=?, webDesc=?, ofertaPrice=?, fichaTecnica=?, fichaTecnicaFile=? WHERE id=?');

    const doImport = db.transaction(() => {
      for (const wp of webProducts) {
        if (wp.source === 'local') continue; // no importar productos POS
        const existingIndex = existingProducts.findIndex(
          (p: any) => (p.source !== 'local' || !p.source) && p.name.toLowerCase().trim() === wp.name.toLowerCase().trim()
        );
        if (existingIndex !== -1) {
          const existing = existingProducts[existingIndex];
          findRow.run('web', wp.id, Number(wp.price) || 0, 0, wp.category || 'Varios', existing.id);
          // También actualizar campos web (image, oferta, etc.) si el producto origen los tiene
          if (wp.image || wp.oferta || wp.webDesc || wp.ofertaPrice) {
            updateWebRow.run(
              wp.image || existing.image || '', wp.oferta ? 1 : 0, wp.nuevo ? 1 : 0,
              wp.webDesc || wp.desc || '', Number(wp.ofertaPrice) || 0, wp.fichaTecnica || '', wp.fichaTecnicaFile || '',
              existing.id
            );
          }
          existingProducts[existingIndex] = { ...existing, source: 'web', code: wp.id, price: Number(wp.price) || 0, category: wp.category || 'Varios' };
          updated++;
        } else {
          const id = Date.now().toString() + Math.random().toString(36).substring(2, 6);
          insertRow.run(id, wp.id, wp.name, Number(wp.price) || 0, 0, 0, wp.category || 'Varios', 'web');
          existingProducts.push({ id, code: wp.id, name: wp.name, price: Number(wp.price) || 0, stock: 0, category: wp.category || 'Varios', source: 'web' });
          imported++;
        }
      }
    });
    doImport();

    if (!silent) console.log(`[IMPORT] Importación completada: ${imported} nuevos, ${updated} actualizados`);
    return { imported, updated };
  } catch (err: any) {
    if (!silent) console.warn(`[IMPORT] No se pudo conectar con Web-main (${err?.message || err})`);
    return { imported: 0, updated: 0 };
  }
}

// ─── WhatsApp ─────────────────────────────────────────────────────────────
async function initWhatsApp() {
  if (waClient) return;
  waInitializing = true;
  try {
    const { Client, LocalAuth } = (await import('whatsapp-web.js')).default;
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    waClient = new Client({
      authStrategy: new LocalAuth(),
      puppeteer: {
        headless: true,
        executablePath: chromePath,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      }
    });

    waClient.on('qr', async (qr: string) => {
      waQR = qr;
      waReady = false;
      console.log('[WA] QR generado. Escanea con WhatsApp.');
    });

    waClient.on('ready', () => {
      waReady = true;
      waQR = null;
      waInitializing = false;
      console.log('[WA] Cliente WhatsApp listo.');
    });

    waClient.on('disconnected', (reason: string) => {
      waReady = false;
      waQR = null;
      console.log('[WA] Desconectado:', reason);
    });

    await waClient.initialize();
  } catch (err: any) {
    console.warn('[WA] Error al inicializar WhatsApp:', err?.message || err);
    waClient = null;
    waReady = false;
    waQR = null;
    waInitializing = false;
  }
}

function getWAStatus() {
  return { ready: waReady, hasQR: !!waQR, initializing: waInitializing };
}

async function startServer() {
  db = initDatabase();
  console.log(`[DATABASE] Base de datos SQLite inicializada.`);

  createBackup();
  lastBackupTime = Date.now();

  importCompanyConfig(true).then(r => { if (r) console.log('[IMPORT] Configuración de empresa importada al inicio'); });
  importFromWeb(true).then(r => {
    if (r.imported > 0 || r.updated > 0) console.log(`[IMPORT] Auto-importación al inicio: ${r.imported} nuevos, ${r.updated} actualizados`);
  });

  // Migrar reparaciones desde data.json a SQLite
  try {
    const webDataPath = path.join(WEB_MAIN_DIR, 'data.json');
    if (fs.existsSync(webDataPath)) {
      const webData = JSON.parse(fs.readFileSync(webDataPath, 'utf8'));
      const repairsMigrated = getConfig<boolean>('repairsMigrated', false);
      const repairsCount = (db.prepare('SELECT COUNT(*) as c FROM repairs').get() as any).c;
      if (!repairsMigrated && repairsCount === 0 && webData.repairs && webData.repairs.length > 0) {
        const manualRepairs = webData.repairs.filter((r: any) => !r.id.startsWith('REP-SGT-'));
        if (manualRepairs.length > 0) {
          console.log(`[MIGRATE] Migrando ${manualRepairs.length} reparaciones desde data.json a SQLite...`);
          const ins = db.prepare(`INSERT OR REPLACE INTO repairs (id, code, clientId, clientName, clientPhone, equipment, marca, modelo, status, problem, notes, price, date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
          const doMigrate = db.transaction(() => {
            for (const r of manualRepairs) {
              const client = (webData.clients || []).find((c: any) => c.id === r.clientId);
              ins.run(
                r.id, r.code || '', r.clientId || '', client?.name || '', client?.phone || '',
                r.equipment || '', r.marca || '', r.modelo || '',
                r.status || 'Recibida', r.problem || '', r.notes || '', Number(r.price) || 0, r.date || ''
              );
            }
          });
          doMigrate();
          setConfig('repairsMigrated', true);
          console.log(`[MIGRATE] Migración completada: ${manualRepairs.length} reparaciones importadas.`);
        }
      }
    }
  } catch (e) { console.warn('[MIGRATE] No se pudieron migrar reparaciones:', e); }

  // Migrar web data (categorías, servicios, config) desde data.json a SQLite
  try {
    const webDataPath = path.join(WEB_MAIN_DIR, 'data.json');
    if (fs.existsSync(webDataPath)) {
      const webData = JSON.parse(fs.readFileSync(webDataPath, 'utf8'));
      const catsCount = (db.prepare('SELECT COUNT(*) as c FROM web_categories').get() as any).c;
      // Migrar categorías, servicios y config solo una vez
      if (catsCount === 0) {
        const cats = webData.categories || [];
        const svcs = webData.services || [];
        if (cats.length > 0 || svcs.length > 0 || webData.config) {
          console.log(`[MIGRATE] Migrando web data desde data.json a SQLite...`);
          const insCat = db.prepare('INSERT OR REPLACE INTO web_categories (id, name) VALUES (?,?)');
          const insSvc = db.prepare('INSERT OR REPLACE INTO web_services (id, name, desc, icon, price) VALUES (?,?,?,?,?)');
          const doMigrate = db.transaction(() => {
            for (const c of cats) insCat.run(c.id, c.name || '');
            for (const s of svcs) insSvc.run(s.id, s.name || '', s.desc || '', s.icon || '', Number(s.price) || 0);
            if (webData.config) setConfig('webConfig', webData.config);
          });
          doMigrate();
          console.log(`[MIGRATE] Web data migrada: ${cats.length} categorías, ${svcs.length} servicios`);
        }
      }
      // Migrar/actualizar imágenes de productos web (una sola vez, controlado por flag en config)
      const webImgMigrated = getConfig<boolean>('webImgMigrated', false);
      if (!webImgMigrated && webData.products && webData.products.length > 0) {
        let imgUpdated = 0; let imgInserted = 0;
        const updImg = db.prepare('UPDATE products SET image=?, webDesc=?, oferta=?, nuevo=?, ofertaPrice=?, fichaTecnica=?, fichaTecnicaFile=? WHERE id=?');
        const insProd = db.prepare(`INSERT OR REPLACE INTO products (id, code, name, price, cost, stock, category, source, description, image, oferta, nuevo, webDesc, ofertaPrice, fichaTecnica, fichaTecnicaFile) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
        const doImgMigrate = db.transaction(() => {
          for (const wp of webData.products) {
            if (!wp.image) continue;
            const existing = db.prepare('SELECT id, image FROM products WHERE id=?').get(wp.id) as any;
            if (existing) {
              if (!existing.image || existing.image === '') {
                updImg.run(wp.image || '', wp.desc || '', wp.oferta ? 1 : 0, wp.nuevo ? 1 : 0, Number(wp.ofertaPrice) || 0, wp.fichaTecnica || '', wp.fichaTecnicaFile || '', wp.id);
                imgUpdated++;
              }
            } else {
              insProd.run(wp.id, wp.id, wp.name || '', Number(wp.price) || 0, 0, 0, wp.category || 'Varios', 'web', wp.desc || '', wp.image || '', wp.oferta ? 1 : 0, wp.nuevo ? 1 : 0, wp.desc || '', Number(wp.ofertaPrice) || 0, wp.fichaTecnica || '', wp.fichaTecnicaFile || '');
              imgInserted++;
            }
          }
        });
        doImgMigrate();
        setConfig('webImgMigrated', true);
        if (imgUpdated > 0 || imgInserted > 0) console.log(`[MIGRATE] Imágenes web: ${imgInserted} insertadas, ${imgUpdated} actualizadas`);
      }
    }
  } catch (e) { console.warn('[MIGRATE] No se pudo migrar web data:', e); }

  const app = express();
  app.use(express.json({ limit: '50mb' }));

  // PRODUCTS
  app.get('/api/products', (req, res) => {
    const rows = db.prepare('SELECT * FROM products ORDER BY name').all() as any[];
    res.json(rows.map(rowToProduct));
  });

  app.post('/api/products', (req, res) => {
    const { code, name, price, cost, stock, category, desc, image, oferta, nuevo, source, webDesc, ofertaPrice, fichaTecnica, fichaTecnicaFile } = req.body;
    const id = Date.now().toString();
    db.prepare(`INSERT INTO products (id, code, name, price, cost, stock, category, source, description, image, oferta, nuevo, webDesc, ofertaPrice, fichaTecnica, fichaTecnicaFile) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, code || '', name || '', Number(price) || 0, Number(cost) || 0, Number(stock) || 0, category || 'Varios', source === 'web' ? 'web' : 'local', desc || '', image || '', oferta === true ? 1 : 0, nuevo === true ? 1 : 0, webDesc || desc || '', Number(ofertaPrice) || 0, fichaTecnica || '', fichaTecnicaFile || ''
    );
    lastPOSWrite = Date.now(); pendingSync = true; syncWebDataToFile();
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    res.status(201).json(rowToProduct(row));
  });

  app.put('/api/products/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: 'Product not found' });
    const { code, name, price, cost, stock, category, desc, image, oferta, nuevo, source, webDesc, ofertaPrice, fichaTecnica, fichaTecnicaFile } = req.body;
    const updated = {
      code: code !== undefined ? code : existing.code,
      name: name !== undefined ? name : existing.name,
      price: price !== undefined ? Number(price) : existing.price,
      cost: cost !== undefined ? Number(cost) : existing.cost,
      stock: stock !== undefined ? Number(stock) : existing.stock,
      category: category !== undefined ? category : existing.category,
      source: source !== undefined ? (source === 'web' ? 'web' : 'local') : existing.source,
      description: desc !== undefined ? desc : existing.description,
      image: image !== undefined ? image : existing.image,
      oferta: oferta !== undefined ? (oferta === true ? 1 : 0) : existing.oferta,
      nuevo: nuevo !== undefined ? (nuevo === true ? 1 : 0) : existing.nuevo,
      webDesc: webDesc !== undefined ? webDesc : (existing.webDesc || existing.description || ''),
      ofertaPrice: ofertaPrice !== undefined ? Number(ofertaPrice) : (existing.ofertaPrice || 0),
      fichaTecnica: fichaTecnica !== undefined ? fichaTecnica : (existing.fichaTecnica || ''),
      fichaTecnicaFile: fichaTecnicaFile !== undefined ? fichaTecnicaFile : (existing.fichaTecnicaFile || ''),
    };
    db.prepare(`UPDATE products SET code=?, name=?, price=?, cost=?, stock=?, category=?, source=?, description=?, image=?, oferta=?, nuevo=?, webDesc=?, ofertaPrice=?, fichaTecnica=?, fichaTecnicaFile=? WHERE id=?`).run(
      updated.code, updated.name, updated.price, updated.cost, updated.stock, updated.category, updated.source, updated.description, updated.image, updated.oferta, updated.nuevo, updated.webDesc, updated.ofertaPrice, updated.fichaTecnica, updated.fichaTecnicaFile, req.params.id
    );
    lastPOSWrite = Date.now(); pendingSync = true; syncWebDataToFile();
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    res.json(rowToProduct(row));
  });

  app.delete('/api/products/:id', (req, res) => {
    const r = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    if (r.changes > 0) { lastPOSWrite = Date.now(); pendingSync = true; syncWebDataToFile(); res.json({ success: true }); }
    else res.status(404).json({ error: 'Product not found' });
  });

  app.get('/api/stock-warning', (req, res) => {
    res.json({ enabled: getConfig<boolean>('stockWarningEnabled', true) });
  });

  app.post('/api/stock-warning', (req, res) => {
    const enabled = req.body.enabled === true;
    setConfig('stockWarningEnabled', enabled);
    lastPOSWrite = Date.now(); pendingSync = true;
    res.json({ enabled });
  });

  app.get('/api/company-config', (req, res) => {
    res.json(getConfig<CompanyConfig | null>('companyConfig', null) || {});
  });

  app.put('/api/company-config', (req, res) => {
    try {
      const existing = getConfig<CompanyConfig | null>('companyConfig', null) || {} as CompanyConfig;
      const updated = { ...existing, ...req.body };
      setConfig('companyConfig', updated);
      lastPOSWrite = Date.now(); pendingSync = true;
      res.json(updated);
    } catch { res.status(500).json({ error: 'Error al guardar configuración' }); }
  });

  app.post('/api/import-company-config', async (req, res) => {
    const result = await importCompanyConfig(false);
    res.json({ success: result, message: result ? 'Configuración de empresa importada correctamente' : 'No se pudo importar la configuración. Verifique que Web-main esté corriendo en localhost:3000.' });
  });

  app.get('/api/cash-register', (req, res) => {
    res.json(getConfig<CashRegister | null>('cashRegister', null) || { cash: 0, bank: 0 });
  });

  app.put('/api/cash-register', (req, res) => {
    const cr: CashRegister = { cash: Number(req.body.cash) || 0, bank: Number(req.body.bank) || 0 };
    setConfig('cashRegister', cr);
    lastPOSWrite = Date.now(); pendingSync = true;
    res.json(cr);
  });

  app.post('/api/import-from-web', async (req, res) => {
    const result = await importFromWeb(false);
    res.json({ success: true, ...result, message: `Importación completada: ${result.imported} nuevos, ${result.updated} actualizados` });
  });

  // ========== WEB-MAIN ROUTES (unchanged) ==========
  app.use('/assets', express.static(path.join(WEB_MAIN_DIR, 'assets')));
  app.use('/web', express.static(WEB_MAIN_DIR));
  app.get('/web/*', (req, res) => {
    res.sendFile(path.join(WEB_MAIN_DIR, 'index.html'));
  });

  app.get('/api/web-data', (req, res) => {
    try {
      const dbProducts = db.prepare('SELECT * FROM products WHERE source = ?').all('web') as any[];
      const webData = {
        products: dbProducts,
        clients: db.prepare('SELECT * FROM clients').all(),
        repairs: db.prepare('SELECT * FROM repairs ORDER BY date DESC').all(),
        services: db.prepare('SELECT * FROM web_services ORDER BY name').all(),
        config: getConfig<any>('webConfig', {}),
        categories: db.prepare('SELECT * FROM web_categories ORDER BY name').all(),
      };
      res.json(webData);
    } catch { res.json({ products: [], clients: [], repairs: [], services: [], config: {}, categories: [] }); }
  });

  app.post('/api/web-save', (req, res) => {
    try {
      const data = req.body;
      const upsertProduct = db.prepare(`INSERT OR REPLACE INTO products (id, code, name, price, cost, stock, category, source, description, image, oferta, nuevo, webDesc, ofertaPrice, fichaTecnica, fichaTecnicaFile) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      const delCats = db.prepare('DELETE FROM web_categories');
      const insCat = db.prepare('INSERT INTO web_categories (id, name) VALUES (?,?)');
      const delSvcs = db.prepare('DELETE FROM web_services');
      const insSvc = db.prepare('INSERT INTO web_services (id, name, desc, icon, price) VALUES (?,?,?,?,?)');

      const save = db.transaction(() => {
        for (const p of (data.products || [])) {
          upsertProduct.run(p.id, p.code || '', p.name || '', Number(p.price) || 0, Number(p.cost) || 0, Number(p.stock) || 0, p.category || 'Varios', 'web', p.desc || p.webDesc || '', p.image || '', p.oferta ? 1 : 0, p.nuevo ? 1 : 0, p.webDesc || p.desc || '', Number(p.ofertaPrice) || 0, p.fichaTecnica || '', p.fichaTecnicaFile || '');
        }
        delCats.run();
        for (const c of (data.categories || [])) { insCat.run(c.id, c.name || ''); }
        delSvcs.run();
        for (const s of (data.services || [])) { insSvc.run(s.id, s.name || '', s.desc || '', s.icon || '', Number(s.price) || 0); }
        if (data.config) setConfig('webConfig', data.config);
      });
      save();

      lastPOSWrite = Date.now(); pendingSync = true;
      syncWebDataToFile();
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Sync web data to data.json (real-time sync for Web-main static site)
  function syncWebDataToFile() {
    try {
      const data = {
        products: db.prepare('SELECT * FROM products WHERE source = ?').all('web'),
        repairs: db.prepare('SELECT * FROM repairs ORDER BY date DESC').all(),
        services: db.prepare('SELECT * FROM web_services ORDER BY name').all(),
        config: getConfig<any>('webConfig', {}),
        categories: db.prepare('SELECT * FROM web_categories ORDER BY name').all(),
      };
      fs.writeFileSync(path.join(WEB_MAIN_DIR, 'data.json'), JSON.stringify(data, null, 2));
      const products = data.products || [];
      const brand = (data.config && data.config.companyName) || 'GIGA Computers';
      const BASE_URL = 'https://gigacomputers.com.ar';
      const csvEsc = (v: any) => {
        if (v == null) return '';
        const s = String(v);
        if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) return '"' + s.replace(/"/g, '""') + '"';
        return s;
      };
      const header = 'id,title,description,availability,condition,price,link,image_link,brand,inventory,quantity_to_sell_on_facebook';
      const rows = products.map((p: any) => [
        csvEsc(p.id || ''),
        csvEsc((p.name || '').trim()),
        csvEsc((p.desc || p.name || '').trim()),
        'in stock', 'new',
        (p.price != null ? Number(p.price).toFixed(0) : '0.00') + ' ARS',
        csvEsc(BASE_URL + '/index.html?id=' + encodeURIComponent(p.id || '')),
        csvEsc(p.image ? (p.image.startsWith('http') ? p.image : BASE_URL + '/' + p.image.replace(/^\//, '')) : ''),
        csvEsc(brand), '99', '99'
      ].join(','));
      const csvContent = '\uFEFF' + header + '\n' + rows.join('\n');
      fs.writeFileSync(path.join(WEB_MAIN_DIR, 'catalog.csv'), csvContent, 'utf8');
    } catch (e) { console.error('[WebSync] Error:', e); }
    setTimeout(syncWebToGit, 0);
  }

  function syncWebToGit() {
    try {
      const config = getConfig<CompanyConfig | null>('companyConfig', null);
      const token = config?.gitToken;
      if (!token) { console.warn('[WebGit] No hay token, no se puede hacer push'); return; }
      const repoUrl = `https://${token}@github.com/gigacomputers2025-bot/Nexus.git`;
      try { execSync('git remote get-url origin', { cwd: process.cwd() }); }
      catch { execSync(`git remote add origin ${repoUrl}`, { cwd: process.cwd() }); }
      execSync(`git remote set-url origin ${repoUrl}`, { cwd: process.cwd() });
      execSync('git config user.name "Nexus AutoSync"', { cwd: process.cwd() });
      execSync('git config user.email "autosync@nexuspos.local"', { cwd: process.cwd() });
      try { execSync('git branch -M master', { cwd: process.cwd() }); } catch {}
      execSync('git add web/data.json web/catalog.csv', { cwd: process.cwd() });
      try { execSync('git diff --cached --quiet', { cwd: process.cwd() }); return; } catch {}
      try {
        const lastMsg = execSync('git log -1 --format=%s', { cwd: process.cwd() }).toString().trim();
        if (lastMsg.startsWith('AutoSync ')) execSync('git reset --soft HEAD~1', { cwd: process.cwd() });
      } catch {}
      const now = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
      execSync(`git commit -m "AutoSync ${now}"`, { cwd: process.cwd() });
      execSync('git push -u origin master --force', { cwd: process.cwd(), stdio: 'pipe' });
      console.log('[WebGit] Push completado');
    } catch (e: any) {
      console.error('[WebGit] Error:', String(e.stderr || e.message || e));
    }
  }

  // Alias for Web-main app.js sync — same logic as /api/web-save
  app.post('/api/save', (req, res) => {
    req.url = '/api/web-save';
    app._router.handle(req, res, () => {});
  });

  app.get('/api/auto-sync-status', (req, res) => {
    res.json({ pending: pendingSync, syncing, lastSync: lastSyncTime, error: lastSyncError });
  });

  async function doAutoSync() {
    if (syncing || !pendingSync) return;
    syncing = true; pendingSync = false;
    try {
      const config = getConfig<CompanyConfig | null>('companyConfig', null);
      if (!config?.gitToken) { lastSyncError = 'Token de GitHub no configurado'; syncing = false; return; }
      const token = config.gitToken;
      execSync('git add -A', { cwd: process.cwd() });
      try { execSync('git diff --cached --quiet', { cwd: process.cwd() }); syncing = false; return; } catch {}
      execSync('git config user.name "Nexus AutoSync"', { cwd: process.cwd() });
      execSync('git config user.email "autosync@nexuspos.local"', { cwd: process.cwd() });
      const authedUrl = `https://${token}@github.com/gigacomputers2025-bot/Nexus.git`;
      try { execSync('git remote get-url origin', { cwd: process.cwd() }); }
      catch { execSync(`git remote add origin ${authedUrl}`, { cwd: process.cwd() }); }
      execSync(`git remote set-url origin ${authedUrl}`, { cwd: process.cwd() });
      try {
        const lastMsg = execSync('git log -1 --format=%s', { cwd: process.cwd() }).toString().trim();
        if (lastMsg.startsWith('AutoSync ')) execSync('git reset --soft HEAD~1', { cwd: process.cwd() });
      } catch {}
      const now = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
      execSync(`git commit -m "AutoSync ${now}"`, { cwd: process.cwd() });
      try {
        execSync('git push -u origin master --force', { cwd: process.cwd(), stdio: 'pipe' });
      } catch (pushErr: any) {
        const errMsg = String(pushErr.stderr || '') + String(pushErr.message || '');
        if (errMsg.includes('Repository not found') || errMsg.includes('not found') || errMsg.includes('404')) {
          await new Promise<void>((resolve, reject) => {
            const postData = JSON.stringify({ name: 'Nexus', private: false, auto_init: false });
            const req = https.request({
              hostname: 'api.github.com', path: '/user/repos', method: 'POST',
              headers: { 'Authorization': `Bearer ${token}`, 'User-Agent': 'NexusPOS', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
            }, (resp: any) => { let body = ''; resp.on('data', (chunk: string) => body += chunk); resp.on('end', () => resolve()); });
            req.on('error', reject); req.write(postData); req.end();
          });
          execSync('git push -u origin master --force', { cwd: process.cwd(), stdio: 'pipe' });
        } else throw pushErr;
      }
      lastSyncTime = now; lastSyncError = null;
    } catch (e: any) {
      lastSyncError = String(Buffer.isBuffer(e.stderr) ? e.stderr.toString() : (e.stderr || e.message || e));
      pendingSync = true;
      console.error('[AutoSync] Error:', lastSyncError);
    }
    syncing = false;
  }

  async function doFullSync() {
    if (syncing) return;
    syncing = true;
    try {
      const config = getConfig<CompanyConfig | null>('companyConfig', null);
      if (!config?.gitToken) { lastSyncError = 'Token de GitHub no configurado'; syncing = false; return; }
      const token = config.gitToken;
      execSync('git add -A', { cwd: process.cwd() });
      execSync('git config user.name "Nexus FullSync"', { cwd: process.cwd() });
      execSync('git config user.email "fullsync@nexuspos.local"', { cwd: process.cwd() });
      const authedUrl = `https://${token}@github.com/gigacomputers2025-bot/Nexus.git`;
      try { execSync('git remote get-url origin', { cwd: process.cwd() }); }
      catch { execSync(`git remote add origin ${authedUrl}`, { cwd: process.cwd() }); }
      execSync(`git remote set-url origin ${authedUrl}`, { cwd: process.cwd() });
      try {
        const lastMsg = execSync('git log -1 --format=%s', { cwd: process.cwd() }).toString().trim();
        if (lastMsg.startsWith('AutoSync ') || lastMsg.startsWith('ManualSync ')) execSync('git reset --soft HEAD~1', { cwd: process.cwd() });
      } catch {}
      const now = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
      execSync(`git commit -m "ManualSync ${now}"`, { cwd: process.cwd() });
      try {
        execSync('git push -u origin master --force', { cwd: process.cwd(), stdio: 'pipe' });
      } catch (pushErr: any) {
        const errMsg = String(pushErr.stderr || '') + String(pushErr.message || '');
        if (errMsg.includes('Repository not found') || errMsg.includes('not found') || errMsg.includes('404')) {
          await new Promise<void>((resolve, reject) => {
            const postData = JSON.stringify({ name: 'Nexus', private: false, auto_init: false });
            const req = https.request({
              hostname: 'api.github.com', path: '/user/repos', method: 'POST',
              headers: { 'Authorization': `Bearer ${token}`, 'User-Agent': 'NexusPOS', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
            }, (resp: any) => { let body = ''; resp.on('data', (chunk: string) => body += chunk); resp.on('end', () => resolve()); });
            req.on('error', reject); req.write(postData); req.end();
          });
          execSync('git push -u origin master --force', { cwd: process.cwd(), stdio: 'pipe' });
        } else throw pushErr;
      }
      lastSyncTime = now; lastSyncError = null; pendingSync = false;
    } catch (e: any) {
      lastSyncError = String(Buffer.isBuffer(e.stderr) ? e.stderr.toString() : (e.stderr || e.message || e));
      console.error('[FullSync] Error:', lastSyncError);
    }
    syncing = false;
  }

  app.post('/api/sync-full', async (req, res) => {
    await doFullSync();
    res.json({ success: !lastSyncError, error: lastSyncError });
  });

  app.post('/api/web-sync-full', (req, res) => {
    doFullSync().then(() => res.json({ success: !lastSyncError, error: lastSyncError })).catch((e: any) => res.status(500).json({ success: false, error: e.message }));
  });

  app.post('/api/generate-catalog-csv', (req, res) => {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(WEB_MAIN_DIR, 'data.json'), 'utf8'));
      const products = data.products || [];
      const brand = (data.config && data.config.companyName) || 'GIGA Computers';
      const BASE_URL = 'https://gigacomputers.com.ar';
      const csvEsc = (v: any) => {
        if (v == null) return '';
        const s = String(v);
        if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) return '"' + s.replace(/"/g, '""') + '"';
        return s;
      };
      const header = 'id,title,description,availability,condition,price,link,image_link,brand,inventory,quantity_to_sell_on_facebook';
      const rows = products.map((p: any) => [
        csvEsc(p.id || ''), csvEsc((p.name || '').trim()), csvEsc((p.desc || p.name || '').trim()),
        'in stock', 'new',
        (p.price != null ? Number(p.price).toFixed(0) : '0.00') + ' ARS',
        csvEsc(BASE_URL + '/index.html?id=' + encodeURIComponent(p.id || '')),
        csvEsc(p.image ? (p.image.startsWith('http') ? p.image : BASE_URL + '/' + p.image.replace(/^\//, '')) : ''),
        csvEsc(brand), '99', '99'
      ].join(','));
      const csvContent = '\uFEFF' + header + '\n' + rows.join('\n');
      fs.writeFileSync(path.join(WEB_MAIN_DIR, 'catalog.csv'), csvContent, 'utf8');
      res.json({ success: true, count: products.length });
    } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
  });
  // ========== END WEB-MAIN ROUTES ==========

  // CLIENTS
  app.get('/api/clients', (req, res) => {
    res.json(db.prepare('SELECT * FROM clients ORDER BY name').all());
  });

  app.post('/api/clients', (req, res) => {
    const { document, name, phone, email } = req.body;
    const id = Date.now().toString();
    db.prepare('INSERT INTO clients (id, document, name, phone, email) VALUES (?,?,?,?,?)').run(id, document || '', name || '', phone || '-', email || '-');
    lastPOSWrite = Date.now(); pendingSync = true;
    res.status(201).json(db.prepare('SELECT * FROM clients WHERE id = ?').get(id));
  });

  app.put('/api/clients/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: 'Client not found' });
    const { document, name, phone, email } = req.body;
    db.prepare('UPDATE clients SET document=?, name=?, phone=?, email=? WHERE id=?').run(
      document !== undefined ? document : existing.document,
      name !== undefined ? name : existing.name,
      phone !== undefined ? phone : existing.phone,
      email !== undefined ? email : existing.email,
      req.params.id
    );
    lastPOSWrite = Date.now(); pendingSync = true;
    res.json(db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id));
  });

  app.delete('/api/clients/:id', (req, res) => {
    const r = db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
    lastPOSWrite = Date.now(); pendingSync = true;
    res.json({ success: r.changes > 0 });
  });

  app.post('/api/import-web-clients', (req, res) => {
    try {
      const webData = JSON.parse(fs.readFileSync(path.join(WEB_MAIN_DIR, 'data.json'), 'utf8'));
      const webClients = webData.clients || [];
      const existingClients = db.prepare('SELECT name, phone FROM clients').all() as any[];
      let imported = 0;
      const ins = db.prepare('INSERT INTO clients (id, document, name, phone, email) VALUES (?,?,?,?,?)');
      for (const wc of webClients) {
        const name = wc.name || ''; const phone = wc.phone || '';
        if (!name || !phone) continue;
        if (existingClients.some((c: any) => c.name.toLowerCase() === name.toLowerCase() && c.phone === phone)) continue;
        const id = Date.now().toString() + Math.random().toString(36).slice(2, 6);
        const doc = phone.replace(/[^0-9]/g, '').slice(0, 11) || '00000000';
        ins.run(id, doc, name, phone, wc.email || '-');
        imported++;
      }
      if (imported > 0) { lastPOSWrite = Date.now(); pendingSync = true; }
      res.json({ imported, total: webClients.length });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // PROVIDERS
  app.get('/api/providers', (req, res) => {
    res.json(db.prepare('SELECT * FROM providers ORDER BY name').all());
  });

  app.post('/api/providers', (req, res) => {
    const { ruc, name, phone, email } = req.body;
    const id = Date.now().toString();
    db.prepare('INSERT INTO providers (id, ruc, name, phone, email) VALUES (?,?,?,?,?)').run(id, ruc || '', name || '', phone || '-', email || '-');
    lastPOSWrite = Date.now(); pendingSync = true;
    res.status(201).json(db.prepare('SELECT * FROM providers WHERE id = ?').get(id));
  });

  // PAYMENT METHODS
  app.get('/api/payment-methods', (req, res) => {
    const rows = db.prepare('SELECT * FROM payment_methods').all() as any[];
    res.json(rows.map(rowToPaymentMethod));
  });

  app.post('/api/payment-methods', (req, res) => {
    const { name, requiresCash, icon, adjustment } = req.body;
    const id = Date.now().toString();
    db.prepare('INSERT INTO payment_methods (id, name, requiresCash, icon, adjustment) VALUES (?,?,?,?,?)').run(
      id, name || '', requiresCash === true ? 1 : 0, icon || '', Number(adjustment) || 0
    );
    lastPOSWrite = Date.now(); pendingSync = true;
    const row = db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(id);
    res.status(201).json(rowToPaymentMethod(row));
  });

  app.put('/api/payment-methods/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: 'Payment method not found' });
    const { name, requiresCash, icon, adjustment } = req.body;
    db.prepare('UPDATE payment_methods SET name=?, requiresCash=?, icon=?, adjustment=? WHERE id=?').run(
      name !== undefined ? name : existing.name,
      requiresCash !== undefined ? (requiresCash === true ? 1 : 0) : existing.requiresCash,
      icon !== undefined ? icon : existing.icon,
      adjustment !== undefined ? Number(adjustment) : existing.adjustment,
      req.params.id
    );
    lastPOSWrite = Date.now(); pendingSync = true;
    const row = db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(req.params.id);
    res.json(rowToPaymentMethod(row));
  });

  app.delete('/api/payment-methods/:id', (req, res) => {
    const r = db.prepare('DELETE FROM payment_methods WHERE id = ?').run(req.params.id);
    if (r.changes > 0) { lastPOSWrite = Date.now(); pendingSync = true; res.json({ success: true }); }
    else res.status(404).json({ error: 'Payment method not found' });
  });

  // SALES
  app.get('/api/sales', (req, res) => {
    res.json(getSalesWithItems());
  });

  app.get('/api/sales/export', (req, res) => {
    const sales = getSalesWithItems();
    const esc = (v: any) => {
      const s = String(v ?? '');
      if (s.includes(';') || s.includes('"') || s.includes('\n') || s.includes('\r')) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const header = 'CODIGO TICKET;FECHA Y HORA;CLIENTE;Producto;Importe;metodo de Pago';
    const rows = sales.flatMap(s =>
      s.items.map(item => [
        esc(s.id), esc(new Date(s.date).toLocaleString()), esc(s.clientName || 'Cliente General'),
        esc(item.productName), (item.price * item.quantity).toFixed(0), esc(s.paymentMethod)
      ].join(';'))
    );
    const csv = '\uFEFF' + header + '\n' + rows.join('\n');
    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=historial-ventas-${dateStr}.csv`);
    res.send(csv);
  });

  app.delete('/api/sales/:id', (req, res) => {
    const r = db.prepare('DELETE FROM sales WHERE id = ?').run(req.params.id);
    if (r.changes === 0) return res.status(404).json({ error: 'Venta no encontrada' });
    lastPOSWrite = Date.now(); pendingSync = true;
    res.json({ success: true });
  });

  app.post('/api/sales', (req, res) => {
    const { items, total, paymentMethod, clientId, clientName, cashReceived, change, date } = req.body;
    const saleDate = date || new Date().toISOString();
    const saleId = 'VEN-' + Date.now().toString().slice(-6);

    const doSale = db.transaction(() => {
      db.prepare('INSERT INTO sales (id, date, total, paymentMethod, clientId, clientName, cashReceived, change) VALUES (?,?,?,?,?,?,?,?)').run(
        saleId, saleDate, Number(total) || 0, paymentMethod || 'Efectivo',
        clientId || '', clientName || 'Cliente General', Number(cashReceived) || total, Number(change) || 0
      );
      for (const item of (items || [])) {
        db.prepare('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?').run(item.quantity, item.productId);
        db.prepare('INSERT INTO sale_items (saleId, productId, productName, quantity, price) VALUES (?,?,?,?,?)').run(
          saleId, item.productId || '', item.productName || '', item.quantity || 0, item.price || 0
        );
      }
    });
    doSale();

    lastPOSWrite = Date.now(); pendingSync = true;
    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId) as any;
    sale.items = db.prepare('SELECT * FROM sale_items WHERE saleId = ?').all(saleId);
    res.status(201).json(sale);
    try { createBackup(); } catch {}
  });

  // PURCHASES
  app.get('/api/purchases', (req, res) => {
    res.json(getPurchasesWithItems());
  });

  app.post('/api/purchases', (req, res) => {
    const { providerId, providerName, items, total } = req.body;
    const purchaseId = 'COM-' + Date.now().toString().slice(-6);

    const doPurchase = db.transaction(() => {
      db.prepare('INSERT INTO purchases (id, date, providerId, providerName, total) VALUES (?,?,?,?,?)').run(
        purchaseId, new Date().toISOString(), providerId || '', providerName || '', Number(total) || 0
      );
      for (const item of (items || [])) {
        db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(item.quantity, item.productId);
        db.prepare('INSERT INTO purchase_items (purchaseId, productId, productName, quantity, cost) VALUES (?,?,?,?,?)').run(
          purchaseId, item.productId || '', item.productName || '', item.quantity || 0, item.cost || 0
        );
      }
    });
    doPurchase();

    lastPOSWrite = Date.now(); pendingSync = true;
    const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId) as any;
    purchase.items = db.prepare('SELECT * FROM purchase_items WHERE purchaseId = ?').all(purchaseId);
    res.status(201).json(purchase);
    try { createBackup(); } catch {}
  });

  // ===== REPAIRS =====
  app.get('/api/repairs', (req, res) => {
    res.json(db.prepare('SELECT * FROM repairs ORDER BY date DESC').all());
  });

  app.post('/api/repairs', (req, res) => {
    const { clientId, clientName, clientPhone, equipment, marca, modelo, status, problem, notes, price } = req.body;
    const existingCodes = (db.prepare('SELECT code FROM repairs').all() as any[]).map(r => r.code);
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code: string;
    do {
      code = '';
      for (let i = 0; i < 5; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    } while (existingCodes.includes(code));
    const id = 'REP-' + Date.now().toString().slice(-6);
    const date = new Date().toISOString().split('T')[0];
    db.prepare(`INSERT INTO repairs (id, code, clientId, clientName, clientPhone, equipment, marca, modelo, status, problem, notes, price, date, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, code, clientId || '', clientName || '', clientPhone || '',
      equipment || '', marca || '', modelo || '', status || 'Recibida',
      problem || '', notes || '', Number(price) || 0, date, date
    );
    lastPOSWrite = Date.now(); pendingSync = true;
    syncWebDataToFile();
    res.status(201).json(db.prepare('SELECT * FROM repairs WHERE id = ?').get(id));
  });

  app.put('/api/repairs/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM repairs WHERE id = ?').get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: 'Repair not found' });
    const { equipment, marca, modelo, status, problem, notes, price } = req.body;
    const now = new Date().toISOString();
    db.prepare('UPDATE repairs SET equipment=?, marca=?, modelo=?, status=?, problem=?, notes=?, price=?, updatedAt=? WHERE id=?').run(
      equipment ?? existing.equipment, marca ?? existing.marca, modelo ?? existing.modelo,
      status ?? existing.status, problem ?? existing.problem,
      notes ?? existing.notes, price !== undefined ? Number(price) : existing.price,
      now, req.params.id
    );
    lastPOSWrite = Date.now(); pendingSync = true;
    syncWebDataToFile();
    res.json(db.prepare('SELECT * FROM repairs WHERE id = ?').get(req.params.id));
  });

  app.get('/api/repairs/history', (req, res) => {
    res.json(db.prepare("SELECT * FROM repairs WHERE status = 'Entregada' ORDER BY updatedAt DESC, date DESC").all());
  });

  app.delete('/api/repairs/:id', (req, res) => {
    const r = db.prepare('DELETE FROM repairs WHERE id = ?').run(req.params.id);
    if (r.changes > 0) { lastPOSWrite = Date.now(); pendingSync = true; syncWebDataToFile(); res.json({ success: true }); }
    else res.status(404).json({ error: 'Repair not found' });
  });

  // Public lookup (CORS)
  app.get('/api/repairs/lookup/:code', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const repair = db.prepare('SELECT * FROM repairs WHERE code = ?').get(req.params.code.toUpperCase());
    if (!repair) return res.status(404).json({ found: false, message: 'No se encontr\u00f3 ninguna orden con esa clave.' });
    res.json({ found: true, repair });
  });

  // Web-main API compatibility
  app.get('/api/web/config', (req, res) => {
    const webConfig = getConfig<any>('webConfig', {});
    res.json(webConfig);
  });

  app.get('/api/web/products', (req, res) => {
    const products = db.prepare("SELECT * FROM products WHERE source = 'web'").all() as any[];
    res.json(products);
  });

  // VISITS
  app.get('/api/visits', (req, res) => {
    const total = (db.prepare("SELECT COALESCE(SUM(count),0) as total FROM site_visits").get() as any).total;
    const today = (db.prepare("SELECT COALESCE(count,0) as count FROM site_visits WHERE date = ?").get(new Date().toISOString().slice(0,10)) as any)?.count || 0;
    const lastDays = db.prepare("SELECT date, count FROM site_visits ORDER BY date DESC LIMIT 7").all();
    res.json({ total, today, lastDays });
  });

  app.post('/api/visits', (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    db.prepare("INSERT INTO site_visits (date, count) VALUES (?, 1) ON CONFLICT(date) DO UPDATE SET count = count + 1").run(today);
    res.json({ success: true });
  });

  // EXPENSES
  app.get('/api/expenses', (req, res) => {
    res.json(db.prepare('SELECT * FROM expenses ORDER BY date DESC').all());
  });

  app.post('/api/expenses', (req, res) => {
    const id = 'EGR-' + Date.now().toString().slice(-6);
    db.prepare('INSERT INTO expenses (id, date, type, descriptionText, amount) VALUES (?,?,?,?,?)').run(
      id, req.body.date || new Date().toISOString(), req.body.type || 'efectivo', req.body.description || '', Number(req.body.amount) || 0
    );
    lastPOSWrite = Date.now(); pendingSync = true;
    res.status(201).json(db.prepare('SELECT * FROM expenses WHERE id = ?').get(id));
  });

  app.delete('/api/expenses/:id', (req, res) => {
    const r = db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
    if (r.changes > 0) { lastPOSWrite = Date.now(); pendingSync = true; res.json({ success: true }); }
    else res.status(404).json({ error: 'Egreso no encontrado' });
  });

  // Download app ZIP
  app.get('/api/download-app', (req, res) => {
    try {
      const zip = new AdmZip();
      const rootFiles = ['package.json', 'tsconfig.json', 'vite.config.ts', 'index.html', 'server.ts', 'database.db', 'start-nexus-pos.bat', '.env.example'];
      rootFiles.forEach(file => { const fp = path.join(process.cwd(), file); if (fs.existsSync(fp)) zip.addLocalFile(fp); });
      if (fs.existsSync(path.join(process.cwd(), 'dist'))) zip.addLocalFolder(path.join(process.cwd(), 'dist'), 'dist');
      if (fs.existsSync(path.join(process.cwd(), 'src'))) zip.addLocalFolder(path.join(process.cwd(), 'src'), 'src');
      if (fs.existsSync(path.join(process.cwd(), 'assets'))) zip.addLocalFolder(path.join(process.cwd(), 'assets'), 'assets');
      const buf = zip.toBuffer();
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename=nexus-pos-completo.zip');
      res.setHeader('Content-Length', buf.length);
      res.end(buf);
    } catch (error: any) { res.status(500).json({ error: 'Hubo un error al generar el archivo de descarga: ' + error.message }); }
  });

  // BACKUP
  app.get('/api/backup', (req, res) => {
    try {
      const data = getFullDatabaseSchema();
      const backupContent = JSON.stringify(data, null, 2);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=nexus-pos-backup-' + new Date().toISOString().slice(0, 10) + '.json');
      res.send(backupContent);
    } catch (error: any) { res.status(500).json({ error: 'Error al generar backup: ' + (error.message || error) }); }
  });

  // RESTORE from JSON backup
  app.post('/api/restore', (req, res) => {
    try {
      const backupData = req.body as DatabaseSchema;
      if (!backupData || !backupData.products || !backupData.clients) {
        return res.status(400).json({ error: 'El archivo de backup no es válido' });
      }
      const doRestore = db.transaction(() => {
        db.exec('DELETE FROM sale_items'); db.exec('DELETE FROM sales');
        db.exec('DELETE FROM purchase_items'); db.exec('DELETE FROM purchases');
        db.exec('DELETE FROM products'); db.exec('DELETE FROM clients');
        db.exec('DELETE FROM providers'); db.exec('DELETE FROM payment_methods');
        db.exec('DELETE FROM expenses'); db.exec('DELETE FROM app_config');
        if (backupData.repairs !== undefined) db.exec('DELETE FROM repairs');
        if (backupData.restockPending !== undefined) db.exec('DELETE FROM restock_pending');
        if (backupData.monthlyStats !== undefined) db.exec('DELETE FROM monthly_stats');
        if (backupData.siteVisits !== undefined) db.exec('DELETE FROM site_visits');
        if (backupData.categories !== undefined) db.exec('DELETE FROM web_categories');
        if (backupData.services !== undefined) db.exec('DELETE FROM web_services');
        migrateData(db, backupData);
      });
      doRestore();
      lastPOSWrite = Date.now(); pendingSync = true;
      res.json({ success: true, message: 'Backup restaurado correctamente.' });
    } catch (error: any) { res.status(500).json({ error: 'Error al restaurar backup: ' + (error.message || error) }); }
  });

  // RESTORE from SQLite .db file
  app.post('/api/restore-db', (req, res) => {
    try {
      if (!req.body || !req.body.file) return res.status(400).json({ error: 'No se proporcionó archivo' });
      // Expecting base64-encoded .db file in req.body.file
      const buffer = Buffer.from(req.body.file, 'base64');
      const tempPath = path.join(BACKUP_DIR, 'restore-temp.db');
      fs.writeFileSync(tempPath, buffer);
      const testDb = new Database(tempPath);
      const integrity = testDb.pragma('integrity_check') as string[];
      if (!integrity.every((r: string) => r === 'ok')) {
        testDb.close(); fs.unlinkSync(tempPath);
        return res.status(400).json({ error: 'El archivo de base de datos no es válido' });
      }
      testDb.close();
      // Backup current DB
      createBackup();
      // Close current connection and replace file
      db.close();
      fs.copyFileSync(tempPath, DB_FILE);
      fs.unlinkSync(tempPath);
      // Reopen
      db = new Database(DB_FILE);
      setupSchema(db);
      lastPOSWrite = Date.now(); pendingSync = true;
      res.json({ success: true, message: 'Base de datos restaurada desde archivo SQLite.' });
    } catch (error: any) { res.status(500).json({ error: 'Error al restaurar DB: ' + (error.message || error) }); }
  });

  // ROLLBACK to JSON (emergency recovery)
  app.post('/api/rollback-json', (req, res) => {
    try {
      const jsonBackupPath = DB_FILE + '.pre-sqlite-backup';
      const jsonMigratedPath = SEC_DB_FILE + '.migrated';
      let sourcePath = '';
      if (fs.existsSync(jsonBackupPath)) sourcePath = jsonBackupPath;
      else if (fs.existsSync(jsonMigratedPath)) sourcePath = jsonMigratedPath;
      if (!sourcePath) return res.status(404).json({ error: 'No hay backup JSON disponible para restaurar. Verifique que exista database.db.pre-sqlite-backup o database.json.migrated' });
      createBackup();
      db.close();
      const jsonData = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'));
      fs.unlinkSync(DB_FILE);
      fs.writeFileSync(DB_FILE, JSON.stringify(jsonData, null, 2), 'utf-8');
      // Restart as JSON-mode server - better-sqlite3 will fail, so we re-init
      db = initDatabase();
      res.json({ success: true, message: 'Rollback completado. Datos restaurados desde backup JSON.' });
    } catch (error: any) { res.status(500).json({ error: 'Error en rollback: ' + (error.message || error) }); }
  });

  // LIST BACKUPS
  app.get('/api/backups', (req, res) => {
    try {
      if (!fs.existsSync(BACKUP_DIR)) { fs.mkdirSync(BACKUP_DIR, { recursive: true }); }
      const files = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('nexus-') && (f.endsWith('.json') || f.endsWith('.db')))
        .sort()
        .reverse();
      const seen = new Set<string>();
      const backups: { base: string; date: string; hasJson: boolean; hasDb: boolean }[] = [];
      for (const f of files) {
        const base = f.replace(/\.(json|db)$/, '');
        if (seen.has(base)) continue;
        seen.add(base);
        const datePart = base.replace('nexus-', '').replace(/T/g, ' ').replace(/-/g, ':').replace(/:(?=\d{2}$)/, '');
        backups.push({
          base,
          date: datePart,
          hasJson: files.includes(base + '.json'),
          hasDb: files.includes(base + '.db')
        });
      }
      res.json(backups);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // RESTORE FROM BACKUP FILE
  app.post('/api/backups/restore', (req, res) => {
    try {
      const { base } = req.body;
      if (!base) return res.status(400).json({ error: 'No se especificó backup' });
      const jsonPath = path.join(BACKUP_DIR, base + '.json');
      const dbPath = path.join(BACKUP_DIR, base + '.db');

      if (fs.existsSync(dbPath)) {
        const buffer = fs.readFileSync(dbPath);
        const testDb = new Database(dbPath);
        const integrity = testDb.pragma('integrity_check') as string[];
        if (!integrity.every((r: string) => r === 'ok')) {
          testDb.close();
          return res.status(400).json({ error: 'El archivo de base de datos no es válido' });
        }
        testDb.close();
        createBackup();
        db.close();
        fs.copyFileSync(dbPath, DB_FILE);
        db = new Database(DB_FILE);
        setupSchema(db);
        lastPOSWrite = Date.now(); pendingSync = true;
        return res.json({ success: true, message: 'Base de datos restaurada desde backup SQLite.' });
      }

      if (fs.existsSync(jsonPath)) {
        const backupData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        if (!backupData.products || !backupData.clients) {
          return res.status(400).json({ error: 'El archivo de backup JSON no es válido' });
        }
        const doRestore = db.transaction(() => {
          db.exec('DELETE FROM sale_items'); db.exec('DELETE FROM sales');
          db.exec('DELETE FROM purchase_items'); db.exec('DELETE FROM purchases');
          db.exec('DELETE FROM products'); db.exec('DELETE FROM clients');
          db.exec('DELETE FROM providers'); db.exec('DELETE FROM payment_methods');
          db.exec('DELETE FROM expenses'); db.exec('DELETE FROM app_config');
          if (backupData.repairs !== undefined) db.exec('DELETE FROM repairs');
          if (backupData.restockPending !== undefined) db.exec('DELETE FROM restock_pending');
          if (backupData.monthlyStats !== undefined) db.exec('DELETE FROM monthly_stats');
          if (backupData.siteVisits !== undefined) db.exec('DELETE FROM site_visits');
          if (backupData.categories !== undefined) db.exec('DELETE FROM web_categories');
          if (backupData.services !== undefined) db.exec('DELETE FROM web_services');
          migrateData(db, backupData);
        });
        doRestore();
        lastPOSWrite = Date.now(); pendingSync = true;
        return res.json({ success: true, message: 'Backup JSON restaurado correctamente.' });
      }

      res.status(404).json({ error: 'Archivo de backup no encontrado' });
    } catch (e: any) { res.status(500).json({ error: 'Error al restaurar backup: ' + (e.message || e) }); }
  });

  // LIST ENCRYPTED BACKUPS
  app.get('/api/backups/encrypted', (req, res) => {
    try {
      if (!fs.existsSync(ENCRYPTED_BACKUP_DIR)) { fs.mkdirSync(ENCRYPTED_BACKUP_DIR, { recursive: true }); }
      // Pull encrypted backups from GitHub remote before listing
      try {
        const config = getConfig<CompanyConfig | null>('companyConfig', null);
        if (config?.gitToken) {
          execSync('git fetch origin 2>nul', { cwd: process.cwd(), stdio: 'pipe', windowsHide: true });
          execSync('git checkout origin/master -- "Backups Encriptados/" 2>nul', { cwd: process.cwd(), stdio: 'pipe', windowsHide: true });
        }
      } catch {}
      const files = fs.readdirSync(ENCRYPTED_BACKUP_DIR)
        .filter(f => f.startsWith('nexus-') && f.endsWith('.json.enc'))
        .sort()
        .reverse()
        .map(f => {
          const datePart = f.replace('nexus-', '').replace('.json.enc', '').replace(/T/g, ' ').replace(/-/g, ':').replace(/:(?=\d{2}$)/, '');
          const stat = fs.statSync(path.join(ENCRYPTED_BACKUP_DIR, f));
          return { file: f, date: datePart, size: stat.size };
        });
      res.json(files);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // RESTORE FROM ENCRYPTED BACKUP
  app.post('/api/backups/restore-encrypted', (req, res) => {
    try {
      const { file, password } = req.body;
      if (!file || !password) return res.status(400).json({ error: 'Faltan datos' });
      const filePath = path.join(ENCRYPTED_BACKUP_DIR, file);
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado. Sincronice con GitHub para descargar los backups remotos.' });
      const encrypted = fs.readFileSync(filePath);
      const jsonStr = decryptBackup(encrypted, password);
      const backupData = JSON.parse(jsonStr);
      if (!backupData.products || !backupData.clients) {
        return res.status(400).json({ error: 'El archivo de backup no es válido' });
      }
      const doRestore = db.transaction(() => {
        db.exec('DELETE FROM sale_items'); db.exec('DELETE FROM sales');
        db.exec('DELETE FROM purchase_items'); db.exec('DELETE FROM purchases');
        db.exec('DELETE FROM products'); db.exec('DELETE FROM clients');
        db.exec('DELETE FROM providers'); db.exec('DELETE FROM payment_methods');
        db.exec('DELETE FROM expenses'); db.exec('DELETE FROM app_config');
        if (backupData.repairs !== undefined) db.exec('DELETE FROM repairs');
        if (backupData.restockPending !== undefined) db.exec('DELETE FROM restock_pending');
        if (backupData.monthlyStats !== undefined) db.exec('DELETE FROM monthly_stats');
        if (backupData.siteVisits !== undefined) db.exec('DELETE FROM site_visits');
        if (backupData.categories !== undefined) db.exec('DELETE FROM web_categories');
        if (backupData.services !== undefined) db.exec('DELETE FROM web_services');
        migrateData(db, backupData);
      });
      doRestore();
      lastPOSWrite = Date.now(); pendingSync = true;
      res.json({ success: true, message: 'Backup encriptado restaurado correctamente.' });
    } catch (e: any) {
      res.status(400).json({ error: 'Error al restaurar: contraseña incorrecta o archivo inválido' });
    }
  });

  // STATS
  const STATS_SEED_DATA = [
    {year:2015,months:[472,953,1126,1072,1091,1077,1162,1130,1170,1112,984,1060]},
    {year:2016,months:[496,942,1152,1065,1052,864,1123,1130,944,910,835,850]},
    {year:2017,months:[379,873,1086,872,1066,1047,1130,1218,1066,1030,1051,1064]},
    {year:2018,months:[471,848,1069,902,1020,933,964,1012,831,956,847,1096]},
    {year:2019,months:[446,880,893,894,964,914,1106,893,896,922,811,869]},
    {year:2020,months:[385,699,683,471,1077,1318,881,1112,1013,857,787,827]},
    {year:2021,months:[356,716,986,914,798,582,802,796,653,605,712,765]},
    {year:2022,months:[290,750,758,670,671,688,598,709,626,488,598,608]},
    {year:2023,months:[205,532,633,549,558,585,539,583,541,467,467,454]},
    {year:2024,months:[193,441,532,569,625,481,579,589,527,622,482,673]},
    {year:2025,months:[334,565,639,627,591,589,695,658,644,587,497,596]},
    {year:2026,months:[324,470,584,549,505]},
  ];
  const CASH_SEED_DATA = [
    {year:2015,months:[96,161,191,223,200,222,246,226,233,220,215,245]},
    {year:2016,months:[107,178,245,219,232,222,254,260,232,207,217,203]},
    {year:2017,months:[88,224,268,234,273,240,295,330,311,302,293,375]},
    {year:2018,months:[155,261,338,309,373,323,340,417,330,397,373,511]},
    {year:2019,months:[191,354,413,481,467,478,604,583,517,610,540,658]},
    {year:2020,months:[230,510,628,444,979,1387,885,1340,1201,969,958,1040]},
    {year:2021,months:[455,794,1303,1146,977,788,979,1085,955,930,1104,1304]},
    {year:2022,months:[534,1070,1425,1132,1350,1453,1230,1862,1650,1215,1843,1859]},
    {year:2023,months:[623,1854,2425,2752,2341,3056,3372,3295,3938,3592,4176,4763]},
    {year:2024,months:[1828,4613,7273,6101,7440,5749,9359,10824,8514,10880,7834,10415]},
    {year:2025,months:[6060,11669,10029,13210,13358,9550,12172,13937,11732,12262,10750,13338]},
    {year:2026,months:[6973,12722,15650,15804,11707]},
  ];

  app.get('/api/stats', (req, res) => {
    try {
      const rows = db.prepare('SELECT year, month, sales_count, cash_amount FROM monthly_stats ORDER BY year, month').all();
      res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/stats/seed', (req, res) => {
    try {
      const insert = db.prepare('INSERT OR REPLACE INTO monthly_stats (year, month, sales_count, cash_amount) VALUES (?,?,?,?)');
      const doSeed = db.transaction(() => {
        for (const yr of STATS_SEED_DATA) {
          for (let m = 0; m < yr.months.length; m++) {
            const cashYr = CASH_SEED_DATA.find(c => c.year === yr.year);
            insert.run(yr.year, m + 1, yr.months[m], cashYr ? cashYr.months[m] || 0 : 0);
          }
        }
      });
      doSeed();
      res.json({ success: true, message: 'Datos de estadísticas cargados correctamente.' });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/stats/sync-sales', (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT CAST(strftime('%Y', date) AS INTEGER) as year,
               CAST(strftime('%m', date) AS INTEGER) as month,
               COUNT(*) as sales_count
        FROM sales
        GROUP BY year, month
        ORDER BY year, month
      `).all();
      const upsert = db.prepare('INSERT OR REPLACE INTO monthly_stats (year, month, sales_count, cash_amount) VALUES (?,?,?,COALESCE((SELECT cash_amount FROM monthly_stats WHERE year=? AND month=?),0))');
      const doSync = db.transaction(() => {
        for (const r of rows as any[]) {
          upsert.run(r.year, r.month, r.sales_count, r.year, r.month);
        }
      });
      doSync();
      res.json({ success: true, message: 'Ventas sincronizadas correctamente.' });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/stats/update', (req, res) => {
    try {
      const { year, month, field, value } = req.body;
      if (!year || !month || !field || value === undefined) return res.status(400).json({ error: 'Faltan parámetros' });
      const num = Number(value);
      if (isNaN(num)) return res.status(400).json({ error: 'Valor inválido' });
      const existing = db.prepare('SELECT * FROM monthly_stats WHERE year=? AND month=?').get(year, month);
      if (existing) {
        db.prepare(`UPDATE monthly_stats SET ${field}=? WHERE year=? AND month=?`).run(num, year, month);
      } else {
        const sales = field === 'sales_count' ? num : 0;
        const cash = field === 'cash_amount' ? num : 0;
        db.prepare('INSERT INTO monthly_stats (year, month, sales_count, cash_amount) VALUES (?,?,?,?)').run(year, month, sales, cash);
      }
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/stats/add-year', (req, res) => {
    try {
      const { year } = req.body;
      if (!year) return res.status(400).json({ error: 'Falta año' });
      const insert = db.prepare('INSERT OR IGNORE INTO monthly_stats (year, month, sales_count, cash_amount) VALUES (?,?,0,0)');
      const doAdd = db.transaction(() => {
        for (let m = 1; m <= 12; m++) insert.run(year, m);
      });
      doAdd();
      res.json({ success: true, message: `Año ${year} agregado correctamente.` });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // PENDIENTES (restock reminders)
  app.get('/api/pendientes', (req, res) => {
    try {
      const rows = db.prepare('SELECT * FROM restock_pending ORDER BY createdAt DESC').all();
      res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/pendientes', (req, res) => {
    try {
      const { productId, productName, productCode, quantity } = req.body;
      if (!productId || !quantity) return res.status(400).json({ error: 'Faltan datos' });
      const id = 'PEND-' + Date.now().toString().slice(-6);
      const now = new Date().toISOString();
      db.prepare('INSERT INTO restock_pending (id, productId, productName, productCode, quantity, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?)')
        .run(id, productId, productName || '', productCode || '', Number(quantity) || 1, now, now);
      const row = db.prepare('SELECT * FROM restock_pending WHERE id = ?').get(id);
      res.status(201).json(row);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/pendientes/:id', (req, res) => {
    try {
      const { quantity } = req.body;
      if (quantity === undefined) return res.status(400).json({ error: 'Falta cantidad' });
      const now = new Date().toISOString();
      db.prepare('UPDATE restock_pending SET quantity = ?, updatedAt = ? WHERE id = ?').run(Number(quantity), now, req.params.id);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/pendientes/:id', (req, res) => {
    try {
      db.prepare('DELETE FROM restock_pending WHERE id = ?').run(req.params.id);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // RESET
  app.post('/api/reset', (req, res) => {
    try {
      const doReset = db.transaction(() => {
        db.exec('DELETE FROM sale_items'); db.exec('DELETE FROM sales');
        db.exec('DELETE FROM purchase_items'); db.exec('DELETE FROM purchases');
        db.exec('DELETE FROM products'); db.exec('DELETE FROM clients');
        db.exec('DELETE FROM providers'); db.exec('DELETE FROM payment_methods');
        db.exec('DELETE FROM expenses'); db.exec('DELETE FROM app_config');
        if (INITIAL_DB.repairs !== undefined) db.exec('DELETE FROM repairs');
        if (INITIAL_DB.restockPending !== undefined) db.exec('DELETE FROM restock_pending');
        if (INITIAL_DB.monthlyStats !== undefined) db.exec('DELETE FROM monthly_stats');
        if (INITIAL_DB.siteVisits !== undefined) db.exec('DELETE FROM site_visits');
        if (INITIAL_DB.categories !== undefined) db.exec('DELETE FROM web_categories');
        if (INITIAL_DB.services !== undefined) db.exec('DELETE FROM web_services');
        migrateData(db, INITIAL_DB);
      });
      doReset();
      lastPOSWrite = Date.now(); pendingSync = true;
      res.json({ success: true, message: 'Base de datos reiniciada al estado inicial.' });
    } catch (error: any) { res.status(500).json({ error: 'Error al reiniciar: ' + (error.message || error) }); }
  });

  // SYSTEM STATUS
  app.get('/api/status', (req, res) => {
    try {
      const mb = (b: number) => (b / 1024 / 1024).toFixed(1);
      const uptime = process.uptime();
      const days = Math.floor(uptime / 86400);
      const hours = Math.floor((uptime % 86400) / 3600);
      const mins = Math.floor((uptime % 3600) / 60);
      const uptimeStr = days > 0 ? `${days}d ${hours}h ${mins}m` : `${hours}h ${mins}m`;
      let dbSize = 0;
      try { dbSize = fs.statSync(path.join(process.cwd(), 'database.db')).size; } catch {}
      const mem = process.memoryUsage();
      let children: { pid: number; name: string }[] = [];
      try {
        const out = execSync(`wmic process where "ParentProcessId=${process.pid}" get ProcessId,Name /format:csv 2>nul`, { encoding: 'utf8', windowsHide: true, timeout: 3000 });
        children = out.trim().split('\n').slice(1).filter(l => l.trim()).map(l => { const p = l.trim().split(','); return { name: p[2] || '', pid: parseInt(p[3]) || 0 }; }).filter(c => c.pid > 0);
      } catch {}
      const counts: Record<string, number> = {};
      for (const table of ['products','clients','providers','sales','purchases','expenses','repairs','web_categories','web_services','restock_pending']) {
        try { counts[table] = (db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as any).c; } catch { counts[table] = 0; }
      }
      const config = getConfig<CompanyConfig | null>('companyConfig', null);
      res.json({
        pid: process.pid,
        ppid: process.ppid,
        uptime: uptimeStr,
        uptimeSeconds: uptime,
        memory: { rss: mb(mem.rss) + ' MB', heapTotal: mb(mem.heapTotal) + ' MB', heapUsed: mb(mem.heapUsed) + ' MB' },
        nodeVersion: process.version,
        platform: process.platform,
        dbSize: mb(dbSize) + ' MB',
        dbSizeBytes: dbSize,
        counts,
        children,
        gitRemote: config?.gitRepo || 'No configurado',
        lastSync: lastSyncTime || null
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ─── WhatsApp API ─────────────────────────────────────────────────────
  app.get('/api/whatsapp/status', (req, res) => {
    res.json(getWAStatus());
  });

  app.get('/api/whatsapp/qr', async (req, res) => {
    if (!waQR) return res.status(400).json({ error: 'No hay QR disponible' });
    try {
      const dataUrl = await QRCode.toDataURL(waQR);
      res.json({ qr: dataUrl });
    } catch { res.status(500).json({ error: 'Error al generar QR' }); }
  });

  app.post('/api/whatsapp/init', async (req, res) => {
    if (waReady) return res.json({ ready: true });
    if (waClient) { waClient.destroy(); waClient = null; waReady = false; waQR = null; }
    initWhatsApp().catch(() => {});
    res.json({ initializing: true });
  });

  app.post('/api/whatsapp/logout', async (req, res) => {
    try {
      if (waClient) { await waClient.destroy(); }
    } catch {}
    waClient = null; waReady = false; waQR = null; waInitializing = false;
    const authDir = path.join(process.cwd(), '.wwebjs_auth');
    if (fs.existsSync(authDir)) fs.rmSync(authDir, { recursive: true, force: true });
    res.json({ success: true });
  });

  app.post('/api/whatsapp/send', async (req, res) => {
    if (!waReady) return res.status(400).json({ error: 'WhatsApp no conectado' });
    const { number, message } = req.body;
    if (!number || !message) return res.status(400).json({ error: 'Número y mensaje requeridos' });
    try {
      const chatId = number.includes('@c.us') ? number : `${number}@c.us`;
      await waClient.sendMessage(chatId, message);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Error al enviar mensaje' });
    }
  });

  // Vite / static serving
  if (process.env.NODE_ENV !== 'production' && process.env.DISABLE_HMR !== 'true') {
    const vite = await createViteServer({ server: { middlewareMode: true, watch: { ignored: ['**/.wwebjs_auth/**', '**/.wwebjs_cache/**'] } }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
    } else console.warn(`[WARN] dist folder not found at ${distPath}. Serving API routes only.`);
  }

  const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV || process.env.DISABLE_HMR === 'true';
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : (isDevelopment ? 3000 : 3010);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`=========================================`);
    console.log(`  Nexus POS Terminal Server`);
    console.log(`  Base de datos: SQLite (WAL mode)`);
    console.log(`  Listening on http://localhost:${PORT}`);
    console.log(`  AutoSync a GitHub cada 30s`);
    console.log(`  Backups automáticos cada 1h + post-venta`);
    console.log(`=========================================`);
    setInterval(doAutoSync, 30000);
    setTimeout(doAutoSync, 5000);
    setInterval(() => {
      if (Date.now() - lastBackupTime > BACKUP_INTERVAL_MS) { createBackup(); lastBackupTime = Date.now(); }
    }, 60000);

    // Inicializar WhatsApp después de que el servidor esté listo
    initWhatsApp();
  }).on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') console.error(`[FATAL] Puerto ${PORT} ya esta en uso.`);
    else console.error('[FATAL] Error al iniciar servidor:', err);
    process.exit(1);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
