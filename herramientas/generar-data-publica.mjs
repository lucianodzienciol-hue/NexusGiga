#!/usr/bin/env node
// generar-data-publica.mjs — Genera web/data.json PÚBLICO (sin PII) desde la DB local.
// Uso: node herramientas/generar-data-publica.mjs [--out <ruta>]
// Incluye: productos con source='web' + categorías + servicios + config.
// Excluye SIEMPRE: clientes, reparaciones (datos personales, no van al repo público).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(path.join(ROOT, 'package.json'));
const Database = require('better-sqlite3');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  return def;
}

const dbPath = arg('db', path.join(ROOT, 'database.db'));
const outPath = path.resolve(arg('out', path.join(ROOT, 'web', 'data.json')));

const D = new Database(dbPath, { readonly: true });
const products = D.prepare("SELECT * FROM products WHERE source = 'web' ORDER BY name").all().map((p) => ({
  ...p,
  desc: p.description || p.webDesc || '',
  oferta: p.oferta ? 1 : 0,
  nuevo: p.nuevo ? 1 : 0,
  oldPrice: p.oferta && p.ofertaPrice ? p.ofertaPrice : undefined,
}));
const categories = D.prepare('SELECT * FROM web_categories ORDER BY name').all();
const services = D.prepare('SELECT * FROM web_services ORDER BY name').all();
const w = D.prepare("SELECT value FROM app_config WHERE key = 'webConfig'").get();
const ccRow = D.prepare("SELECT value FROM app_config WHERE key = 'companyConfig'").get();
const cc = ccRow ? JSON.parse(ccRow.value) : {};
const config = { ...(w ? JSON.parse(w.value) : {}) };
if ((!Array.isArray(config.banners) || config.banners.length === 0) && Array.isArray(cc.banners) && cc.banners.length) {
  config.banners = cc.banners;
}
for (const k of ['currency', 'priceListsEnabled']) {
  if (config[k] === undefined && cc[k] !== undefined) config[k] = cc[k];
}
if (!config.currency) config.currency = 'ARS';
D.close();

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ products, clients: [], repairs: [], services, categories, config }, null, 2), 'utf-8');
console.log(`[publica] ${products.length} productos, ${categories.length} categorías, ${services.length} servicios -> ${outPath}`);
console.log(`[publica] tienda: ${config.companyName || '(sin nombre)'} | moneda: ${config.currency}`);
