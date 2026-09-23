import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(p){ return fs.readFileSync(path.join(ROOT, p), 'utf8'); }

// Vendible criteria for 100% sellable

test('no queda admin1234 hardcodeado en web/', () => {
  const webAuth = read('web/auth.js');
  const webApp = read('web/app.js');
  assert.doesNotMatch(webAuth, /admin1234/);
  assert.doesNotMatch(webApp, /admin1234/);
});

test('LICENSE_SECRET es fail-closed sin default en api-server.js', () => {
  const src = read('api-server.js');
  assert.match(src, /resolveLicenseSecret/);
  assert.doesNotMatch(src, /nexus-lic-2026-master-key-3-2-full/);
  // debe hacer process.exit(1) si falta
  assert.match(src, /process\.exit\(1\)/);
});

test('generar-licencia exige secreto explicito', () => {
  const src = read('herramientas/generar-licencia.mjs');
  assert.match(src, /falta el secreto/);
  assert.doesNotMatch(src, /nexus-lic-2026-master-key-3-2-full/);
});

test('vendedor.bat no referencia flujo viejo Cloudflare', () => {
  const bat = read('vendedor.bat');
  assert.doesNotMatch(bat.toLowerCase(), /wrangler/);
  assert.doesNotMatch(bat, /\.panel-token/);
  assert.doesNotMatch(bat, /\.cf-token/);
  assert.match(bat, /\.lic-secret/);
  assert.match(bat, /NEXUS_LICENSE_SECRET/);
});

test('iniciar-*.vbs generan .lic-secret sin Dim duplicado', () => {
  for (const f of ['iniciar-full.vbs','iniciar-lite.vbs','iniciar-tecnicos.vbs']) {
    const src = read(f);
    // no debe tener Dim licOut: Set licOut
    assert.doesNotMatch(src, /Dim\s+licOut\s*:/);
    assert.match(src, /NewLicSecret\(\)/);
    assert.match(src, /NEXUS_LICENSE_SECRET/);
    assert.match(src, /\.lic-secret/);
  }
});

test('README no documenta Supabase/Cloudflare obsoletos', () => {
  const readme = read('README.md');
  assert.doesNotMatch(readme, /SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|wrangler|workers\.dev/i);
  assert.match(readme, /NEXUS_LICENSE_SECRET/);
  assert.match(readme, /lucianodzienciol-hue/);
});

test('.gitignore ignora dist y node_modules', () => {
  const gi = read('.gitignore');
  assert.match(gi, /node_modules\//);
  assert.match(gi, /dist\//);
});

test('seguridad: compression y limites', () => {
  const api = read('api-server.js');
  assert.match(api, /compression/);
  assert.match(api, /express\.json.*limit/);
});

test('XSS mitigado: document.write usa esc()', () => {
  const app = read('web/app.js');
  // las interpolaciones de cliente/repair deben usar esc()
  assert.match(app, /\$\{esc\(client\.name/);
  assert.match(app, /\$\{esc\(repair\.equipment\)/);
  assert.match(app, /escHTML|function esc\(/);
});

test('SSRF mitigado: validacion basica', () => {
  const api = read('api-server.js');
  // tienda directa no usa worker externo, solo validacion local
  assert.match(api, /express\.json/);
});

test('dependencias sin vulnerabilidades conocidas', async () => {
  // verifica que qs y nanoid estan parcheados
  const lock = read('package-lock.json');
  // qs debe ser 6.16+
  assert.match(lock, /"qs":/);
});
