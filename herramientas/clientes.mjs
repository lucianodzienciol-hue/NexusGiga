#!/usr/bin/env node
// clientes.mjs — Gestión de tenants (usa PANEL_TOKEN, no CF API token).
// Uso: node herramientas/clientes.mjs <comando> [opciones]
//   nuevo --slug X --comercio "..." [--contacto ...] [--email ...] [--dominio host]
//   listar [--estado activo|suspendido]
//   rotar --slug X | suspender --slug X | reactivar --slug X | desvincular --slug X
//   verificar [--slug X] | baja --slug X [--borrar-datos]
//   dominio --slug X --dominio tienda.cliente.com | dominio --slug X --quitar
// Env: NEXUS_WORKER, NEXUS_PANEL_TOKEN
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  validSlug, loadRegistry, upsertLocal, removeLocal, vendorList, vendorAction,
} from '../tenant/clientes-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  return def;
}
const flag = (name) => process.argv.includes('--' + name);

const cmd = (process.argv[2] || '').toLowerCase();
const workerBase = (arg('worker', process.env.NEXUS_WORKER || '') || '').replace(/\/+$/, '');
let panelToken = arg('panel-token', process.env.NEXUS_PANEL_TOKEN || '');
if (!panelToken) {
  try {
    panelToken = fs.readFileSync(path.join(__dirname, '.panel-token'), 'utf8').trim();
  } catch {}
}
if (!/^https?:\/\//.test(workerBase) || !panelToken) {
  console.error('Falta --worker <URL> o --panel-token <token> (o env NEXUS_WORKER / NEXUS_PANEL_TOKEN).');
  process.exit(2);
}

const api = (p, m, b) => vendorActionRaw(p, m, b);
async function vendorActionRaw(apiPath, method, body) {
  const { workerApi } = await import('../tenant/clientes-lib.mjs');
  return workerApi(workerBase, panelToken, apiPath, method, body);
}

function needSlug() {
  const slug = (arg('slug', '') || '').toLowerCase().trim();
  if (!validSlug(slug)) { console.error('Falta --slug válido.'); process.exit(2); }
  return slug;
}

function fmtDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : '-';
}

async function main() {
  if (cmd === 'listar') {
    const estado = (arg('estado', '') || '').toLowerCase();
    const list = await vendorList(workerBase, panelToken);
    const rows = list.filter((c) => !estado || (c.estado || '') === estado);
    if (!rows.length) { console.log('Sin tiendas.'); return; }
    console.log('slug | comercio | estado | lastSync | pendientes | alta');
    for (const c of rows) {
      console.log(`${c.slug} | ${c.comercio || '-'} | ${c.estado} | ${fmtDate(c.lastSync)} | ${c.pendientes} | ${c.alta || '-'}`);
    }
    return;
  }

  if (cmd === 'nuevo') {
    const slug = needSlug();
    const r = await api('/vendor/action', 'POST', {
      action: 'alta',
      slug,
      comercio: arg('comercio', ''),
      contacto: arg('contacto', ''),
      email: arg('email', ''),
      dominio: arg('dominio', '') || undefined,
      store: { products: [], categories: [], services: [], config: {} },
    });
    const reg = loadRegistry();
    upsertLocal(reg, {
      slug, comercio: arg('comercio', ''), contacto: arg('contacto', ''), email: arg('email', ''),
      worker: workerBase, syncToken: r.syncToken, estado: 'activo',
      alta: new Date().toISOString().slice(0, 10), dominio: arg('dominio', '') || null, lastSync: null,
    });
    console.log('Alta OK: ' + slug);
    console.log('syncToken (cargar en la PC del cliente): ' + r.syncToken);
    console.log('(Para tienda con catálogo, usar tenant-setup.mjs que publica el store.)');
    return;
  }

  if (cmd === 'rotar') {
    const slug = needSlug();
    const r = await api('/vendor/action', 'POST', { action: 'rotar', slug });
    const reg = loadRegistry();
    upsertLocal(reg, { slug, syncToken: r.syncToken });
    console.log('Token nuevo para ' + slug + ': ' + r.syncToken);
    console.log('Cargalo en la PC del cliente (el anterior ya no funciona).');
    return;
  }

  if (cmd === 'suspender' || cmd === 'reactivar') {
    const slug = needSlug();
    const r = await api('/vendor/action', 'POST', { action: cmd, slug });
    const reg = loadRegistry();
    upsertLocal(reg, { slug, estado: r.estado });
    console.log(slug + ' -> ' + r.estado);
    return;
  }

  if (cmd === 'desvincular') {
    const slug = needSlug();
    await api('/vendor/action', 'POST', { action: 'desvincular', slug });
    console.log(slug + ': PC desvinculada. El próximo sync vinculará la PC que sincronice.');
    return;
  }

  if (cmd === 'verificar') {
    const slug = arg('slug', '');
    const list = slug ? [{ slug }] : await vendorList(workerBase, panelToken);
    for (const c of list) {
      try {
        const r = await api('/vendor/action', 'POST', { action: 'verificar', slug: c.slug });
        console.log(`${c.slug}: existe=${r.existe} catalogo=${r.catalogo} estado=${r.estado}`);
      } catch (e) { console.log(`${c.slug}: ERROR ${e.message}`); }
    }
    return;
  }

  if (cmd === 'baja') {
    const slug = needSlug();
    const borrar = flag('borrar-datos');
    const r = await api('/vendor/action', 'POST', { action: 'baja', slug, borrar });
    const reg = loadRegistry();
    if (borrar) removeLocal(reg, slug);
    else upsertLocal(reg, { slug, estado: 'suspendido' });
    console.log(slug + ' dado de baja' + (borrar ? ' CON BORRADO de datos.' : ' (suspendido, datos intactos).'));
    return;
  }

  if (cmd === 'dominio') {
    const slug = needSlug();
    const dom = flag('quitar') ? '' : (arg('dominio', '') || '').toLowerCase().trim();
    if (!dom && !flag('quitar')) { console.error('Falta --dominio <host> o --quitar.'); process.exit(2); }
    const r = await api('/vendor/action', 'POST', { action: 'dominio', slug, dominio: dom });
    console.log(r.dominio ? slug + ' -> dominio: ' + r.dominio : slug + ': dominio quitado.');
    return;
  }

  console.error('Comandos: nuevo | listar | rotar | suspender | reactivar | desvincular | verificar | baja | dominio');
  process.exit(2);
}

main().catch((e) => { console.error('Fallo:', e.message); process.exit(1); });
