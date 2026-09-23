#!/usr/bin/env node
// importar-github.mjs — Importa token/repo/contraseñas GitHub a Nexus GIGA.
// Uso: node herramientas/importar-github.mjs [--src <ruta.db>] [--validar]
// Fuente (solo lectura): por defecto F:/Nexus/Nexus 4-6/nexus-pos-completo/database.db (configurable via --src o NEXUS_IMPORT_SRC)
// Destino: app_config.companyConfig / webConfig de la DB local (merge, sin
// pisar currency/printMode/moneda ni otras claves existentes).
// NUNCA imprime valores de secretos (solo largos y máscara ****+4).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(path.join(ROOT, 'package.json'));
const Database = require('better-sqlite3');

const SRC = (() => {
  const idx = process.argv.indexOf('--src');
  if (idx !== -1 && process.argv[idx + 1]) return path.resolve(process.argv[idx + 1]);
  if (process.env.NEXUS_IMPORT_SRC) return path.resolve(process.env.NEXUS_IMPORT_SRC);
  return 'F:/Nexus/Nexus 4-6/nexus-pos-completo/database.db';
})();
const DST = path.join(ROOT, 'database.db');
const validar = process.argv.includes('--validar');

const mask = (s) => {
  if (!s || typeof s !== 'string') return '(ausente)';
  return s.length <= 8 ? '****' : '****' + s.slice(-4);
};

function normRepo(v) {
  let r = String(v || '').trim();
  const m = r.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  if (m) return `${m[1]}/${m[2]}`;
  return r.replace(/\.git$/, '');
}

async function main() {
  if (!fs.existsSync(SRC)) throw new Error('No se encontró la DB origen: ' + SRC);
  if (!fs.existsSync(DST)) throw new Error('No existe la DB de GIGA. Arrancá el servidor una vez primero.');
  const src = new Database(SRC, { readonly: true });
  const dst = new Database(DST);
  try {
    const row = src.prepare("SELECT value FROM app_config WHERE key='companyConfig'").get();
    if (!row) throw new Error('La DB origen no tiene companyConfig');
    const o = JSON.parse(row.value);
    const token = o.githubToken || o.gitToken || '';
    const repo = normRepo(o.githubRepo || o.gitRepo || '');
    const backupPassword = o.backupPassword || '';
    if (!token) throw new Error('La DB origen no tiene token');
    let web = null;
    try {
      const w = src.prepare("SELECT value FROM app_config WHERE key='webConfig'").get();
      if (w) web = JSON.parse(w.value);
    } catch {}
    const cur = dst.prepare("SELECT value FROM app_config WHERE key='companyConfig'").get();
    const merged = { ...(cur ? JSON.parse(cur.value) : {}), githubToken: token };
    if (repo) merged.githubRepo = repo;
    if (backupPassword) merged.backupPassword = backupPassword;
    const upsert = dst.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?,?)');
    const t = dst.transaction(() => {
      upsert.run('companyConfig', JSON.stringify(merged));
      if (web) {
        const curW = dst.prepare("SELECT value FROM app_config WHERE key='webConfig'").get();
        upsert.run('webConfig', JSON.stringify({ ...(curW ? JSON.parse(curW.value) : {}), ...web }));
      }
    });
    t();
    console.log('[importar] repo:', repo || '(vacío)');
    console.log('[importar] token:', mask(token), `(largo ${token.length})`);
    console.log('[importar] backupPassword:', backupPassword ? mask(backupPassword) : '(ausente, se omite)');
    console.log('[importar] webConfig:', web ? 'importada' : '(ausente en origen)');
    if (validar) {
      const r = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'nexus-giga' },
      });
      if (!r.ok) throw new Error('Token inválido ante GitHub (HTTP ' + r.status + ')');
      const u = await r.json();
      console.log('[importar] token válido. Usuario GitHub:', u.login);
    }
  } finally {
    src.close();
    dst.close();
  }
  console.log('[importar] OK');
}

main().catch((e) => { console.error('[importar] Fallo:', e.message); process.exit(1); });
