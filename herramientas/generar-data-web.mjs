import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const db = new Database(path.join(ROOT, 'database.db'));

const products = db.prepare("SELECT * FROM products WHERE source = 'web' ORDER BY name").all().map(p => ({
  ...p,
  desc: p.description || p.webDesc || '',
  oferta: !!p.oferta,
  nuevo: !!p.nuevo,
  oldPrice: p.oferta && p.ofertaPrice ? p.ofertaPrice : undefined,
}));
const clients = db.prepare('SELECT * FROM clients').all();
const repairs = db.prepare('SELECT * FROM repairs ORDER BY date DESC').all();
const services = db.prepare('SELECT * FROM web_services ORDER BY name').all();
const categories = db.prepare('SELECT * FROM web_categories ORDER BY name').all();
const cfgRow = db.prepare("SELECT value FROM app_config WHERE key = 'webConfig'").get();
const config = cfgRow ? JSON.parse(cfgRow.value) : {};
try {
  const ccRow = db.prepare("SELECT value FROM app_config WHERE key = 'companyConfig'").get();
  const cc = ccRow ? JSON.parse(ccRow.value) : {};
  config.priceListsEnabled = !!(cc.priceListsEnabled || config.priceListsEnabled);
} catch {}

fs.writeFileSync(
  path.join(ROOT, 'web', 'data.json'),
  JSON.stringify({ products, clients, repairs, services, categories, config }, null, 2),
  'utf-8'
);
console.log(`data.json generado: ${products.length} productos, ${clients.length} clientes, ${repairs.length} reparaciones, ${services.length} servicios, ${categories.length} categorias`);
db.close();