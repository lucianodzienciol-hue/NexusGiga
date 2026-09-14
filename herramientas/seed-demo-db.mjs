#!/usr/bin/env node
// seed-demo-db.mjs — Genera electron/demo-database.db con catálogo de muestra.
// Uso: node herramientas/seed-demo-db.mjs
// Arranca api-server con datos temporales (crea esquema + métodos de pago +
// Cliente General), lo detiene, inserta la muestra, consolida el WAL y copia la DB.
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(path.join(ROOT, 'package.json'));
const Database = require('better-sqlite3');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-seed-'));
const PORT = '4199';
const OUT = path.join(ROOT, 'electron', 'demo-database.db');

const PRODUCTS = [
  ['p1', 'YERB001', 'Yerba mate 1kg', 4500, 3200, 48, 'Almacén'],
  ['p2', 'CAFE001', 'Café molido 500g', 6800, 4900, 32, 'Almacén'],
  ['p3', 'AZUC001', 'Azúcar 1kg', 1900, 1300, 60, 'Almacén'],
  ['p4', 'GASE001', 'Gaseosa cola 2L', 3200, 2100, 40, 'Bebidas'],
  ['p5', 'AGUA001', 'Agua mineral 2L', 1800, 1100, 55, 'Bebidas'],
  ['p6', 'GALL001', 'Galletitas dulces 400g', 2400, 1600, 36, 'Almacén'],
  ['p7', 'FIDE001', 'Fideos tallarín 500g', 1600, 1000, 44, 'Almacén'],
  ['p8', 'JABO001', 'Jabón de tocador', 1500, 900, 50, 'Limpieza'],
];

function waitFor(url, tries = 40) {
  return new Promise((resolve, reject) => {
    const tick = async (n) => {
      try {
        const r = await fetch(url);
        if (r.ok) return resolve();
      } catch {}
      if (n <= 1) return reject(new Error('timeout esperando servidor'));
      setTimeout(() => tick(n - 1), 500);
    };
    tick(tries);
  });
}

async function main() {
  const child = spawn(process.execPath, ['api-server.js'], {
    cwd: ROOT,
    windowsHide: true,
    env: { ...process.env, PORT, STANDALONE: 'true', BROWSER: 'none', NEXUS_DATA_DIR: TMP, APP_EDITION: 'full' },
  });
  let failed = null;
  child.on('error', (e) => { failed = e; });
  try {
    await waitFor(`http://127.0.0.1:${PORT}/api/web-data`);
    await new Promise((r) => setTimeout(r, 1000));
    try { child.kill(); } catch {}
    await new Promise((r) => setTimeout(r, 1500));
    const dbPath = path.join(TMP, 'database.db');
    const db = new Database(dbPath);
    const insP = db.prepare('INSERT OR REPLACE INTO products (id, code, name, price, cost, stock, category) VALUES (?,?,?,?,?,?,?)');
    const insC = db.prepare('INSERT OR REPLACE INTO web_categories (id, name) VALUES (?,?)');
    const t = db.transaction(() => {
      for (const p of PRODUCTS) insP.run(...p);
      insC.run('c1', 'Almacén');
      insC.run('c2', 'Bebidas');
      insC.run('c3', 'Limpieza');
    });
    t();
    const n = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
    if (n === 0) throw new Error('semilla vacía, algo falló');
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
    fs.copyFileSync(dbPath, OUT);
    console.log(`[seed] OK: ${OUT} (${n} productos, 3 categorías)`);
  } finally {
    try { child.kill(); } catch {}
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
  }
  if (failed) throw failed;
}

main().catch((e) => { console.error('[seed] Fallo:', e.message); process.exit(1); });
