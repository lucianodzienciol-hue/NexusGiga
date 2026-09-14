// build-exe.cjs — Genera NexusFull.exe (SEA, Node 22+). Requiere red (npx) una vez.
// Uso: node herramientas/build-exe.cjs
// Salida: NexusFull.exe + native/better-sqlite3 en la raíz (usa dist/ y web/ existentes).
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-exe-'));
const run = (cmd, cwd) => execSync(cmd, { cwd: cwd || ROOT, stdio: 'inherit', shell: true });

if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
  console.log('[build-exe] Compilando frontend...');
  run('npm run build');
}
for (const d of ['web', 'node_modules/better-sqlite3/prebuilds']) {
  if (!fs.existsSync(path.join(ROOT, d))) throw new Error('Falta ' + d);
}

console.log('[build-exe] Empaquetando servidor...');
run(`npx -y esbuild@0.25.10 "${path.join(ROOT, 'api-server.js')}" --bundle --platform=node --format=cjs --external:better-sqlite3 --outfile="${path.join(TMP, 'server.cjs')}" --log-level=warning`);

fs.writeFileSync(path.join(TMP, 'sea-config.json'), JSON.stringify({
  main: 'server.cjs', output: 'sea-prep.blob',
  disableExperimentalSEAWarning: true, useSnapshot: false,
}));
run(`node --experimental-sea-config sea-config.json`, TMP);

const nodeExe = process.execPath;
if (!/^node(\.exe)?$/i.test(path.basename(nodeExe))) throw new Error('Corré con node: node herramientas/build-exe.cjs');
const outExe = path.join(ROOT, 'NexusFull.exe');
fs.copyFileSync(nodeExe, outExe);

const bin = fs.readFileSync(outExe).toString('latin1');
const i = bin.indexOf('NODE_SEA_FUSE_');
if (i === -1) throw new Error('Este node.exe no trae soporte SEA.');
const fuse = bin.substring(i, i + 'NODE_SEA_FUSE_'.length + 32);
if (!/^NODE_SEA_FUSE_[0-9a-f]{32}$/.test(fuse)) throw new Error('Fuse no reconocido: ' + fuse);
console.log('[build-exe] Fuse: ' + fuse);
run(`npx -y postject@1.0.0-alpha.6 "${outExe}" NODE_SEA_BLOB "${path.join(TMP, 'sea-prep.blob')}" --sentinel-fuse ${fuse}`);

const nat = path.join(ROOT, 'native', 'better-sqlite3');
const src = path.join(ROOT, 'node_modules', 'better-sqlite3');
fs.rmSync(path.join(ROOT, 'native'), { recursive: true, force: true });
fs.mkdirSync(path.join(nat, 'prebuilds'), { recursive: true });
fs.copyFileSync(path.join(src, 'package.json'), path.join(nat, 'package.json'));
fs.cpSync(path.join(src, 'lib'), path.join(nat, 'lib'), { recursive: true });
for (const f of ['win32-x64.node', 'win32-arm64.node']) {
  const s = path.join(src, 'prebuilds', f);
  if (fs.existsSync(s)) fs.copyFileSync(s, path.join(nat, 'prebuilds', f));
}
fs.rmSync(TMP, { recursive: true, force: true });

const mb = (p) => (fs.statSync(p).size / 1048576).toFixed(1) + ' MB';
console.log('[build-exe] OK: NexusFull.exe (' + mb(outExe) + ') + native/ — corre con doble clic o iniciar-full.vbs');
