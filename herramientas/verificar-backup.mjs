#!/usr/bin/env node
// verificar-backup.mjs — Dry-run: inspecciona un backup sin escribir nada.
// Uso: node herramientas/verificar-backup.mjs <archivo.json>
// Reporta tablas, valores no-bindeables en SQLite y si parece formato legacy.
import fs from 'fs';

const file = process.argv[2];
if (!file) { console.error('Uso: node herramientas/verificar-backup.mjs <archivo.json>'); process.exit(2); }
const data = JSON.parse(fs.readFileSync(file, 'utf-8'));

const LEGACY_KEYS = ['paymentMethods', 'categories', 'services', 'monthlyStats', 'restockPending', 'siteVisits'];
const keys = Object.keys(data);
console.log('claves raíz:', keys.join(', '));
console.log('parece legacy:', LEGACY_KEYS.some((k) => Array.isArray(data[k])));

const bad = [];
const counts = {};
for (const k of keys) {
  const v = data[k];
  if (!Array.isArray(v)) {
    counts[k] = typeof v;
    continue;
  }
  counts[k] = v.length;
  v.slice(0, 200000).forEach((row, i) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) { bad.push(`${k}[${i}]: fila no-objeto`); return; }
    for (const [col, val] of Object.entries(row)) {
      const t = typeof val;
      if (val !== null && (t === 'object' || t === 'boolean' || t === 'undefined' || t === 'function' || t === 'symbol')) {
        if (bad.length < 30) bad.push(`${k}[${i}].${col} (${Array.isArray(val) ? 'array' : t})`);
      }
    }
  });
}
console.log('conteos:', JSON.stringify(counts));
console.log('valores problemáticos:', bad.length);
for (const b of bad) console.log('  -', b);
