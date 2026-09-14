import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DB_FILE = path.join(ROOT, 'database.db');
const BACKUP_FILE = process.argv[2] || path.join(ROOT, 'nexus-pos-backup-2026-08-20.json');
const BACKUPS_DIR = path.join(ROOT, 'backups');

if (!fs.existsSync(BACKUP_FILE)) {
  console.error('No se encontró el backup:', BACKUP_FILE);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf-8'));

if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
const safety = path.join(BACKUPS_DIR, `pre-restore-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.db`);
fs.copyFileSync(DB_FILE, safety);
console.log('Copia de seguridad previa:', safety);

const db = new Database(DB_FILE);
db.pragma('foreign_keys = ON');

const toInt = (v) => (v ? 1 : 0);
const toNum = (v) => (v === undefined || v === null || v === '' ? 0 : Number(v) || 0);

const restore = db.transaction(() => {
  const tables = ['site_visits', 'exchange_items', 'purchase_items', 'sale_items', 'notes', 'exchanges', 'orders', 'restock_pending', 'monthly_stats', 'expenses', 'repairs', 'web_services', 'web_categories', 'app_config', 'purchases', 'sales', 'providers', 'clients', 'payment_methods', 'products'];
  for (const t of tables) {
    try { db.prepare(`DELETE FROM ${t}`).run(); } catch {}
  }

  const insProduct = db.prepare(`INSERT INTO products (id, code, name, price, cost, stock, category, source, description, image, oferta, nuevo, webDesc, ofertaPrice, fichaTecnica, fichaTecnicaFile) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const p of data.products || []) {
    insProduct.run(p.id, p.code || '', p.name || '', toNum(p.price), toNum(p.cost), toNum(p.stock), p.category || 'Varios', p.source || 'local', p.desc ?? p.description ?? '', p.image || '', toInt(p.oferta), toInt(p.nuevo), p.webDesc ?? p.desc ?? '', toNum(p.ofertaPrice), p.fichaTecnica || '', p.fichaTecnicaFile || '');
  }

  const insClient = db.prepare(`INSERT INTO clients (id, document, name, phone, email) VALUES (?,?,?,?,?)`);
  for (const c of data.clients || []) {
    insClient.run(c.id, c.document || '', c.name || '', c.phone || '-', c.email || '-');
  }

  const insProvider = db.prepare(`INSERT INTO providers (id, ruc, name, phone, email) VALUES (?,?,?,?,?)`);
  for (const p of data.providers || []) {
    insProvider.run(p.id, p.ruc || '', p.name || '', p.phone || '-', p.email || '-');
  }

  const insPayment = db.prepare(`INSERT INTO payment_methods (id, name, requiresCash, icon, adjustment) VALUES (?,?,?,?,?)`);
  for (const pm of data.paymentMethods || []) {
    insPayment.run(pm.id, pm.name || '', toInt(pm.requiresCash), pm.icon || '', toNum(pm.adjustment));
  }

  const insSale = db.prepare(`INSERT INTO sales (id, date, total, paymentMethod, clientId, clientName, cashReceived, change) VALUES (?,?,?,?,?,?,?,?)`);
  const insSaleItem = db.prepare(`INSERT INTO sale_items (saleId, productId, productName, quantity, price) VALUES (?,?,?,?,?)`);
  for (const s of data.sales || []) {
    insSale.run(s.id, s.date || '', toNum(s.total), s.paymentMethod || 'Efectivo', s.clientId || '', s.clientName || 'Cliente General', toNum(s.cashReceived ?? s.total), toNum(s.change));
    for (const it of s.items || []) {
      insSaleItem.run(s.id, it.productId || '', it.productName || '', toNum(it.quantity), toNum(it.price));
    }
  }

  const insPurchase = db.prepare(`INSERT INTO purchases (id, date, providerId, providerName, paymentMethod, total) VALUES (?,?,?,?,?,?)`);
  const insPurchaseItem = db.prepare(`INSERT INTO purchase_items (purchaseId, productId, productName, quantity, cost) VALUES (?,?,?,?,?)`);
  for (const p of data.purchases || []) {
    insPurchase.run(p.id, p.date || '', p.providerId || '', p.providerName || '', p.paymentMethod || 'Efectivo', toNum(p.total));
    for (const it of p.items || []) {
      insPurchaseItem.run(p.id, it.productId || '', it.productName || '', toNum(it.quantity), toNum(it.cost));
    }
  }

  const insExpense = db.prepare(`INSERT INTO expenses (id, date, type, description, amount) VALUES (?,?,?,?,?)`);
  for (const e of data.expenses || []) {
    insExpense.run(e.id, e.date || '', e.type || 'transferencia', e.description ?? e.descriptionText ?? '', toNum(e.amount));
  }

  const insRepair = db.prepare(`INSERT INTO repairs (id, code, clientId, clientName, clientPhone, equipment, marca, modelo, status, problem, notes, price, date, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const r of data.repairs || []) {
    insRepair.run(r.id, r.code || '', r.clientId || '', r.clientName || '', r.clientPhone || '', r.equipment || '', r.marca || '', r.modelo || '', r.status || 'Recibida', r.problem || '', r.notes || '', toNum(r.price), r.date || '', r.updatedAt || r.date || '');
  }

  const insCat = db.prepare(`INSERT INTO web_categories (id, name) VALUES (?,?)`);
  for (const c of data.categories || []) {
    insCat.run(c.id, c.name || '');
  }

  const insSvc = db.prepare(`INSERT INTO web_services (id, name, desc, icon, price) VALUES (?,?,?,?,?)`);
  for (const s of data.services || []) {
    insSvc.run(s.id, s.name || '', s.desc || '', s.icon || '', toNum(s.price));
  }

  const insRestock = db.prepare(`INSERT INTO restock_pending (id, productId, productName, productCode, quantity, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?)`);
  for (const r of data.restockPending || []) {
    insRestock.run(r.id, r.productId || '', r.productName || '', r.productCode || '', toNum(r.quantity), r.createdAt || '', r.updatedAt || '');
  }

  const insMonthly = db.prepare(`INSERT INTO monthly_stats (year, month, sales_count, cash_amount) VALUES (?,?,?,?)`);
  for (const m of data.monthlyStats || []) {
    insMonthly.run(toNum(m.year), toNum(m.month), toNum(m.sales_count), toNum(m.cash_amount));
  }

  const insVisit = db.prepare(`INSERT INTO site_visits (date, count) VALUES (?,?)`);
  for (const v of data.siteVisits || []) {
    insVisit.run(v.date || '', toNum(v.count));
  }

  const insConfig = db.prepare(`INSERT OR REPLACE INTO app_config (key, value) VALUES (?,?)`);
  if (data.companyConfig) insConfig.run('companyConfig', JSON.stringify(data.companyConfig));
  insConfig.run('stockWarningEnabled', JSON.stringify(data.stockWarningEnabled !== false));
  if (data.cashRegister) insConfig.run('cashRegister', JSON.stringify(data.cashRegister));
  if (data.webConfig) insConfig.run('webConfig', JSON.stringify(data.webConfig));

  const maxSuffix = (rows, prefix) => {
    let max = 0;
    for (const r of rows) {
      if (typeof r.id !== 'string' || !r.id.startsWith(prefix)) continue;
      const n = parseInt(r.id.slice(prefix.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
    return max;
  };
  let saleCounter = maxSuffix(data.sales || [], 'VEN-') + 1;
  let purchaseCounter = maxSuffix(data.purchases || [], 'COM-') + 1;
  let repairCounter = maxSuffix(data.repairs || [], 'REP-') + 1;
  if (saleCounter < 1) saleCounter = 1;
  if (purchaseCounter < 1) purchaseCounter = 1;
  if (repairCounter < 1) repairCounter = 1;
  insConfig.run('saleCounter', JSON.stringify(saleCounter));
  insConfig.run('purchaseCounter', JSON.stringify(purchaseCounter));
  insConfig.run('repairCounter', JSON.stringify(repairCounter));
});

restore();

const count = (t) => { try { return db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c; } catch { return 0; } };
console.log('Restauración completada:');
for (const t of ['products', 'clients', 'providers', 'payment_methods', 'sales', 'sale_items', 'purchases', 'purchase_items', 'expenses', 'repairs', 'web_categories', 'web_services', 'restock_pending', 'monthly_stats', 'site_visits', 'app_config']) {
  console.log(`  ${t}: ${count(t)}`);
}
db.close();
console.log('Listo.');