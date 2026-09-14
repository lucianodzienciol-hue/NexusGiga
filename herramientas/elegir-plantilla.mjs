import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PLANTILLAS = path.join(ROOT, 'plantillas');
const WEB = path.join(ROOT, 'web');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

const id = process.argv[2];
if (!id) {
  console.log('Uso: node herramientas/elegir-plantilla.mjs <id>');
  console.log('\nPlantillas disponibles:');
  for (const d of fs.readdirSync(PLANTILLAS, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('core'))) {
    const meta = JSON.parse(fs.readFileSync(path.join(PLANTILLAS, d.name, 'template.json'), 'utf8'));
    console.log(`  ${meta.id.padEnd(18)} — ${meta.name} (${meta.rubro})`);
  }
  process.exit(0);
}

const src = path.join(PLANTILLAS, id);
if (!fs.existsSync(src)) {
  console.error(`Plantilla no encontrada: ${id}`);
  process.exit(1);
}

const meta = JSON.parse(fs.readFileSync(path.join(src, 'template.json'), 'utf8'));
console.log(`Aplicando plantilla: ${meta.name} (${meta.id}) — ${meta.rubro}`);

// Backup web actual por si acaso
const backup = path.join(ROOT, 'web - respaldo - ' + new Date().toISOString().slice(0,10));
if (!fs.existsSync(backup)) {
  console.log('Respaldando web actual...');
  copyDir(WEB, backup);
}

// Limpiar web (excepto plantillas si estuviera dentro, pero está fuera)
for (const e of fs.readdirSync(WEB, { withFileTypes: true })) {
  const p = path.join(WEB, e.name);
  if (e.isDirectory()) fs.rmSync(p, { recursive: true, force: true });
  else fs.unlinkSync(p);
}
copyDir(src, WEB);
console.log(`✓ Plantilla ${id} aplicada a web/`);
console.log(`  Reiniciá el servidor para ver los cambios.`);
