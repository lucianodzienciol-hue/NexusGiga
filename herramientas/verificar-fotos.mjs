#!/usr/bin/env node
// verificar-fotos.mjs — Anti-regresión fotos: solo advierte, no bloquea push
// Verifica que web/data.json no tenga web/assets y que todo p.image exista en web/assets/products
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const dataPath = path.join(ROOT, 'web', 'data.json');
const assetsDir = path.join(ROOT, 'web', 'assets', 'products');

let warned = false;

try {
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const withWeb = data.products.filter(p => String(p.image || '').startsWith('web/')).length;
  if (withWeb > 0) {
    console.warn(`⚠️  Advertencia: ${withWeb} productos en web/data.json tienen image con "web/" prefix (debería ser "assets/..."): ` + data.products.filter(p=>String(p.image).startsWith('web/')).slice(0,3).map(p=>p.image).join(', '));
    warned = true;
  } else {
    console.log('✓ web/data.json sin web/ prefix');
  }

  const files = new Set(fs.readdirSync(assetsDir));
  const missing = data.products.filter(p => p.image && !files.has(String(p.image).split('/').pop()));
  if (missing.length > 0) {
    console.warn(`⚠️  Advertencia: ${missing.length} productos referencian fotos que no existen en web/assets/products: ` + missing.slice(0,3).map(p=>p.image).join(', '));
    warned = true;
  } else {
    console.log('✓ Todas las fotos referenciadas existen en web/assets/products');
  }

  const empty = data.products.filter(p => !p.image).length;
  console.log(`ℹ️  Productos con imagen vacía (fallback Unsplash): ${empty}`);

  if (warned) {
    console.warn('⚠️  Revisa las advertencias arriba, pero el push/deploy continúa (solo advierte, no bloquea).');
  } else {
    console.log('✓ Verificación fotos OK');
  }
  process.exit(0);
} catch (e) {
  console.error('Error verificando fotos:', e.message);
  process.exit(0);
}
