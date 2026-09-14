#!/usr/bin/env node
// tenant-setup.mjs — Alta de tenant delegada en el Worker (usa PANEL_TOKEN, no CF API token).
// Uso:
//   node herramientas/tenant-setup.mjs --slug <slug> --worker <URL worker>
//     --comercio "..." --contacto "..." --email "..." [--dominio host] [--db ...] [--out ...]
//     [--panel-token ...] [--deploy] [--kit-out <dir>]
// Env: NEXUS_WORKER, NEXUS_PANEL_TOKEN
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import {
  validSlug, readStoreStatic, writeStaticFiles, upsertLocal, loadRegistry,
} from '../tenant/clientes-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  return def;
}
const flag = (name) => process.argv.includes('--' + name);

const slug = (arg('slug', '') || '').toLowerCase().trim();
if (!validSlug(slug)) {
  console.error('Slug inválido. Uso: --slug <minusculas-numeros-guiones> (ej. --slug kiosco-don-pepe)');
  process.exit(2);
}
const workerBase = (arg('worker', process.env.NEXUS_WORKER || '') || '').replace(/\/+$/, '');
if (!/^https?:\/\//.test(workerBase)) {
  console.error('Falta --worker <URL del Worker nexus-tenants>');
  process.exit(2);
}
let panelToken = arg('panel-token', process.env.NEXUS_PANEL_TOKEN || '');
if (!panelToken) {
  try {
    panelToken = fs.readFileSync(path.join(__dirname, '.panel-token'), 'utf8').trim();
  } catch {}
}
if (!panelToken) {
  console.error('Falta --panel-token <PANEL_TOKEN del Worker>');
  process.exit(2);
}
const dbPath = path.resolve(arg('db', path.join(ROOT, 'database.db')));
const outDir = path.resolve(arg('out', path.join(ROOT, 'tenant', 'dist', slug)));

async function api(apiPath, method, body) {
  const r = await fetch(workerBase + apiPath, {
    method: method || 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + panelToken },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j && j.error) || ('HTTP ' + r.status));
  return j;
}

async function main() {
  console.log(`= Alta de tenant "${slug}" =`);
  const store = readStoreStatic(dbPath);
  console.log(`  tienda: ${store.products.length} productos, ${store.categories.length} categorías`);

  const created = await api('/vendor/action', 'POST', {
    action: 'alta',
    slug,
    comercio: arg('comercio', ''),
    contacto: arg('contacto', ''),
    email: arg('email', ''),
    dominio: arg('dominio', '') || undefined,
    store,
  });
  console.log('  tenant creado en KV.');

  const out = writeStaticFiles(path.join(ROOT, 'web'), outDir, store);
  console.log('  estáticos en: ' + out);

  const reg = loadRegistry();
  upsertLocal(reg, {
    slug,
    comercio: arg('comercio', ''),
    contacto: arg('contacto', ''),
    email: arg('email', ''),
    worker: workerBase,
    syncToken: created.syncToken,
    estado: 'activo',
    alta: new Date().toISOString().slice(0, 10),
    dominio: arg('dominio', '') || null,
    lastSync: null,
  });
  console.log('  registrado en herramientas/clientes.json.');

  const pagesProject = 'nexus-t-' + slug;
  if (flag('deploy')) {
    console.log('  desplegando a Pages (' + pagesProject + ')...');
    execSync(`npx -y wrangler@latest pages project create ${pagesProject} --production-branch main`, { cwd: ROOT, stdio: 'inherit', shell: true });
    execSync(`npx -y wrangler@latest pages deploy "${out}" --project-name=${pagesProject}`, { cwd: ROOT, stdio: 'inherit', shell: true });
    console.log('  luego en el dashboard: Pages → ' + pagesProject + ' → Custom domains → ' + slug + '.nexuspos.com.ar');
  } else {
    console.log('  para publicar: npx wrangler pages project create ' + pagesProject + ' --production-branch main');
    console.log('  npx wrangler pages deploy "' + out + '" --project-name=' + pagesProject);
  }

  const kitDir = arg('kit-out', '');
  if (kitDir) {
    fs.mkdirSync(path.resolve(kitDir), { recursive: true });
    const kitPath = path.join(path.resolve(kitDir), `vincular-${slug}.json`);
    fs.writeFileSync(kitPath, JSON.stringify({ slug, worker: workerBase, token: created.syncToken }, null, 2));
    console.log('  kit para el cliente en: ' + kitPath + ' (enviar por WhatsApp)');
  }

  console.log('');
  console.log('Tenant listo:');
  console.log('  tienda:  https://' + slug + '.nexuspos.com.ar/  (tras el deploy + wildcard DNS)');
  console.log('  syncToken (cargar en la PC del cliente): ' + created.syncToken);
}

main().catch((e) => { console.error('Fallo:', e.message); process.exit(1); });
