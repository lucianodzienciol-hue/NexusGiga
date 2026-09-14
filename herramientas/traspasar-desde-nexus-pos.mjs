import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DB_FILE = path.join(ROOT, 'database.db');
const SRC_FILE = process.argv[2] || 'F:\\Nexus\\Nexus 4-6\\nexus-pos-completo\\database.db';

if (!fs.existsSync(SRC_FILE)) {
  console.error('No se encontró la base de origen:', SRC_FILE);
  process.exit(1);
}

const src = new Database(SRC_FILE, { readonly: true });
const dst = new Database(DB_FILE);
dst.pragma('foreign_keys = OFF');

const count = (db, t) => { try { return db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c; } catch { return '?'; } };

const TABLES = ['products', 'clients', 'providers', 'payment_methods', 'sales', 'sale_items', 'purchases', 'purchase_items', 'expenses', 'repairs', 'web_categories', 'web_services', 'restock_pending', 'monthly_stats', 'site_visits', 'notes', 'exchanges'];

console.log('Origen:', SRC_FILE);
console.log('Destino:', DB_FILE);
console.log('\nConteos origen:');
for (const t of [...TABLES, 'app_config']) console.log(`  ${t}: ${count(src, t)}`);

const transfer = dst.transaction(() => {
  for (const t of TABLES) {
    try { dst.prepare(`DELETE FROM ${t}`).run(); } catch {}
  }
  try { dst.prepare('DELETE FROM app_config').run(); } catch {}

  const ins = (table, cols) => {
    const st = dst.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
    return (row) => st.run(...cols.map(c => row[c] !== undefined ? row[c] : null));
  };

  const runProducts = ins('products', ['id','code','name','price','cost','stock','category','source','description','image','oferta','nuevo','webDesc','ofertaPrice','fichaTecnica','fichaTecnicaFile']);
  for (const r of src.prepare('SELECT * FROM products').all()) runProducts(r);

  const runClients = ins('clients', ['id','document','name','phone','email']);
  for (const r of src.prepare('SELECT * FROM clients').all()) runClients(r);

  const runProviders = ins('providers', ['id','ruc','name','phone','email']);
  for (const r of src.prepare('SELECT * FROM providers').all()) runProviders(r);

  const runPayments = ins('payment_methods', ['id','name','requiresCash','icon','adjustment']);
  for (const r of src.prepare('SELECT * FROM payment_methods').all()) runPayments(r);

  const runSales = ins('sales', ['id','date','total','paymentMethod','clientId','clientName','cashReceived','change']);
  for (const r of src.prepare('SELECT * FROM sales').all()) runSales(r);

  const runSaleItems = ins('sale_items', ['saleId','productId','productName','quantity','price']);
  for (const r of src.prepare('SELECT * FROM sale_items').all()) runSaleItems(r);

  // Origen no tiene paymentMethod en purchases -> default
  const runPurchases = dst.prepare(`INSERT INTO purchases (id,date,providerId,providerName,paymentMethod,total) VALUES (?,?,?,?,?,?)`);
  for (const r of src.prepare('SELECT * FROM purchases').all()) runPurchases.run(r.id, r.date, r.providerId, r.providerName, r.paymentMethod || 'Efectivo', r.total);

  const runPurchaseItems = ins('purchase_items', ['purchaseId','productId','productName','quantity','cost']);
  for (const r of src.prepare('SELECT * FROM purchase_items').all()) runPurchaseItems(r);

  // Origen usa descriptionText -> description
  const runExpenses = dst.prepare(`INSERT INTO expenses (id,date,type,description,amount) VALUES (?,?,?,?,?)`);
  for (const r of src.prepare('SELECT * FROM expenses').all()) runExpenses.run(r.id, r.date, r.type, r.descriptionText ?? r.description ?? '', r.amount);

  const runRepairs = ins('repairs', ['id','code','clientId','clientName','clientPhone','equipment','marca','modelo','status','price','problem','notes','date','updatedAt']);
  for (const r of src.prepare('SELECT * FROM repairs').all()) runRepairs(r);

  const runCats = ins('web_categories', ['id','name']);
  for (const r of src.prepare('SELECT * FROM web_categories').all()) runCats(r);

  const runServices = ins('web_services', ['id','name','desc','icon','price']);
  for (const r of src.prepare('SELECT * FROM web_services').all()) runServices(r);

  // Destino tiene columna extra notes (DEFAULT '')
  const runRestock = ins('restock_pending', ['id','productId','productName','productCode','quantity','createdAt','updatedAt']);
  for (const r of src.prepare('SELECT * FROM restock_pending').all()) runRestock(r);

  const runMonthly = ins('monthly_stats', ['year','month','sales_count','cash_amount']);
  for (const r of src.prepare('SELECT * FROM monthly_stats').all()) runMonthly(r);

  const runVisits = ins('site_visits', ['date','count']);
  for (const r of src.prepare('SELECT * FROM site_visits').all()) runVisits(r);

  // Origen tiene updatedAt extra -> omitir
  const runNotes = ins('notes', ['id','title','content','date','category']);
  for (const r of src.prepare('SELECT * FROM notes').all()) runNotes(r);

  const runExchanges = ins('exchanges', ['id','clientId','clientName','productId','productName','status','date','notes']);
  for (const r of src.prepare('SELECT * FROM exchanges').all()) runExchanges(r);

  // Config completa del origen + contadores recalculados
  const insConfig = dst.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?,?)');
  for (const r of src.prepare('SELECT key, value FROM app_config').all()) insConfig.run(r.key, r.value);

  const maxSuffix = (rows, prefix) => {
    let max = 0;
    for (const r of rows) {
      if (typeof r.id !== 'string' || !r.id.startsWith(prefix)) continue;
      const n = parseInt(r.id.slice(prefix.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
    return max;
  };
  let saleCounter = Math.max(1, maxSuffix(src.prepare("SELECT id FROM sales").all(), 'VEN-') + 1);
  let purchaseCounter = Math.max(1, maxSuffix(src.prepare("SELECT id FROM purchases").all(), 'COM-') + 1);
  let repairCounter = Math.max(1, maxSuffix(src.prepare("SELECT id FROM repairs").all(), 'REP-') + 1);
  insConfig.run('saleCounter', JSON.stringify(saleCounter));
  insConfig.run('purchaseCounter', JSON.stringify(purchaseCounter));
  insConfig.run('repairCounter', JSON.stringify(repairCounter));
});

transfer();

console.log('\nTraspaso completado. Conteos destino:');
let ok = true;
for (const t of [...TABLES]) {
  const s = count(src, t), d = count(dst, t);
  const match = String(s) === String(d);
  if (!match) ok = false;
  console.log(`  ${t}: ${d}${match ? '' : `  (origen: ${s})  <-- DIFERENTE`}`);
}
const cfgKeys = dst.prepare('SELECT COUNT(*) c FROM app_config').get().c;
console.log(`  app_config: ${cfgKeys} claves`);
const counters = {};
for (const k of ['saleCounter', 'purchaseCounter', 'repairCounter']) {
  counters[k] = JSON.parse(dst.prepare('SELECT value FROM app_config WHERE key=?').get(k).value);
}
console.log('Contadores:', JSON.stringify(counters));
const expDesc = dst.prepare("SELECT COUNT(*) c FROM expenses WHERE description != ''").get().c;
console.log(`Gastos con descripción: ${expDesc}`);
src.close();
dst.close();
console.log(ok ? '\nOK: todos los conteos coinciden con el origen.' : '\nATENCION: hay diferencias de conteo.');
process.exit(ok ? 0 : 1);