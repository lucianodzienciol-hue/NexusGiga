# Plan: Sistema de Reparaciones Integrado (sin SGTaller)

## Cambios a realizar

### 1. server.ts — Agregar tabla, endpoints, migración

#### 1a. Agregar tabla `repairs` al SCHEMA_SQL

Después de la tabla `app_config`, agregar:

```sql
CREATE TABLE IF NOT EXISTS repairs (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  clientId TEXT NOT NULL,
  clientName TEXT DEFAULT '',
  clientPhone TEXT DEFAULT '',
  equipment TEXT NOT NULL,
  marca TEXT DEFAULT '',
  modelo TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Recibida',
  problem TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  price REAL DEFAULT 0,
  date TEXT NOT NULL
);
```

#### 1b. Agregar endpoints de Repairs (después de EXPENSES, antes de download-app)

```typescript
// ===== REPAIRS =====
function generateRepairCode(existingCodes: string[]): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code: string;
  do {
    code = '';
    for (let i = 0; i < 5; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  } while (existingCodes.includes(code));
  return code;
}

app.get('/api/repairs', (req, res) => {
  res.json(db.prepare('SELECT * FROM repairs ORDER BY date DESC').all());
});

app.post('/api/repairs', (req, res) => {
  const { clientId, clientName, clientPhone, equipment, marca, modelo, status, problem, notes, price } = req.body;
  const existingCodes = (db.prepare('SELECT code FROM repairs').all() as any[]).map(r => r.code);
  const code = generateRepairCode(existingCodes);
  const id = 'REP-' + Date.now().toString().slice(-6);
  const date = new Date().toISOString().split('T')[0];

  db.prepare(`INSERT INTO repairs (id, code, clientId, clientName, clientPhone, equipment, marca, modelo, status, problem, notes, price, date)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, code, clientId || '', clientName || '', clientPhone || '',
    equipment || '', marca || '', modelo || '', status || 'Recibida',
    problem || '', notes || '', Number(price) || 0, date
  );
  lastPOSWrite = Date.now(); pendingSync = true;
  res.status(201).json(db.prepare('SELECT * FROM repairs WHERE id = ?').get(id));
});

app.put('/api/repairs/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM repairs WHERE id = ?').get(req.params.id) as any;
  if (!existing) return res.status(404).json({ error: 'Repair not found' });
  const { equipment, marca, modelo, status, problem, notes, price } = req.body;
  db.prepare('UPDATE repairs SET equipment=?, marca=?, modelo=?, status=?, problem=?, notes=?, price=? WHERE id=?').run(
    equipment ?? existing.equipment, marca ?? existing.marca, modelo ?? existing.modelo,
    status ?? existing.status, problem ?? existing.problem,
    notes ?? existing.notes, price !== undefined ? Number(price) : existing.price,
    req.params.id
  );
  lastPOSWrite = Date.now(); pendingSync = true;
  res.json(db.prepare('SELECT * FROM repairs WHERE id = ?').get(req.params.id));
});

app.delete('/api/repairs/:id', (req, res) => {
  const r = db.prepare('DELETE FROM repairs WHERE id = ?').run(req.params.id);
  if (r.changes > 0) { lastPOSWrite = Date.now(); pendingSync = true; res.json({ success: true }); }
  else res.status(404).json({ error: 'Repair not found' });
});

// Public lookup (CORS enabled for web consult)
app.get('/api/repairs/lookup/:code', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const repair = db.prepare('SELECT * FROM repairs WHERE code = ?').get(req.params.code.toUpperCase());
  if (!repair) return res.status(404).json({ found: false, message: 'No se encontr\u00f3 ninguna orden con esa clave.' });
  res.json({ found: true, repair });
});
```

#### 1c. Agregar migración de reparaciones desde data.json (al inicio, después de initDatabase)

Dentro de `startServer()`, después de `db = initDatabase();`:

```typescript
// Migrar reparaciones desde data.json si existen
try {
  const webDataPath = path.join(WEB_MAIN_DIR, 'data.json');
  if (fs.existsSync(webDataPath)) {
    const webData = JSON.parse(fs.readFileSync(webDataPath, 'utf8'));
    const repairsCount = (db.prepare('SELECT COUNT(*) as c FROM repairs').get() as any).c;
    if (repairsCount === 0 && webData.repairs && webData.repairs.length > 0) {
      const manualRepairs = webData.repairs.filter((r: any) => !r.id.startsWith('REP-SGT-'));
      if (manualRepairs.length > 0) {
        console.log(`[MIGRATE] Migrando ${manualRepairs.length} reparaciones desde data.json a SQLite...`);
        const ins = db.prepare(`INSERT OR REPLACE INTO repairs (id, code, clientId, clientName, clientPhone, equipment, marca, modelo, status, problem, notes, price, date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
        const migrate = db.transaction(() => {
          for (const r of manualRepairs) {
            const client = (webData.clients || []).find((c: any) => c.id === r.clientId);
            ins.run(
              r.id, r.code || '', r.clientId || '', client?.name || '', client?.phone || '',
              r.equipment || '', r.marca || '', r.modelo || '',
              r.status || 'Recibida', r.problem || '', r.notes || '', Number(r.price) || 0, r.date || ''
            );
          }
        });
        migrate();
        console.log(`[MIGRATE] Migración completada.`);
      }
    }
  }
} catch (e) { console.warn('[MIGRATE] No se pudieron migrar reparaciones:', e); }
```

#### 1d. Eliminar endpoint `/api/check-sgtaller-update`

Buscar y eliminar el bloque completo de `app.get('/api/check-sgtaller-update', ...)`.

---

### 2. src/types.ts — Agregar campos marca/modelo a WebRepair

Agregar al final de la interfaz WebRepair (después de `equipment`):

```typescript
  marca?: string;
  modelo?: string;
```

---

### 3. src/components/Reparaciones.tsx — Reescribir para usar /api/repairs

Cambios principales:

**Props**: Eliminar `repairs` y `clients` de la interfaz. Agregar fetch interno.

```typescript
interface ReparacionesProps {
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyWhatsapp?: string;
  onRefresh: () => void;
}
```

**State**: Reemplazar props con fetch interno:

```typescript
const [repairs, setRepairs] = useState<WebRepair[]>([]);
const [clients, setClients] = useState<WebClient[]>([]);
const [loading, setLoading] = useState(true);
```

**Fetch de datos**:

```typescript
const fetchRepairsData = useCallback(async () => {
  try {
    const [repRes, cliRes] = await Promise.all([
      fetch('/api/repairs'),
      fetch('/api/clients')
    ]);
    if (repRes.ok) setRepairs(await repRes.json());
    if (cliRes.ok) setClients(await cliRes.json());
  } catch {} finally { setLoading(false); }
}, []);

useEffect(() => { fetchRepairsData(); }, [fetchRepairsData]);
```

**handleSave** — Cambiar de /api/web-data a /api/repairs:

```typescript
const handleSave = async () => {
  if (!equipment.trim() || !problem.trim()) { alert('Equipo y problema son obligatorios'); return; }
  if (!editingId) {
    if (!selectedClient && clientMode === 'search') { alert('Seleccione un cliente'); return; }
    if (clientMode === 'create' && (!newClientName.trim() || !newClientPhone.trim())) { alert('Complete nombre y tel\u00e9fono'); return; }
  }
  try {
    if (editingId) {
      const res = await fetch(`/api/repairs/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ equipment: equipment.trim(), status, price: Number(price) || 0, problem: problem.trim(), notes: notes.trim() })
      });
      if (!res.ok) { alert('Error al actualizar'); return; }
      setShowModal(false);
      fetchRepairsData();
    } else {
      let clientId = '';
      let clientName = '';
      let clientPhone = '';
      if (clientMode === 'create') {
        const cliRes = await fetch('/api/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newClientName.trim(), phone: newClientPhone.trim(), email: '', document: newClientPhone.replace(/[^0-9]/g, '').slice(0, 11) || '00000000' })
        });
        if (!cliRes.ok) { alert('Error al crear cliente'); return; }
        const newClient = await cliRes.json();
        clientId = newClient.id;
        clientName = newClient.name;
        clientPhone = newClient.phone || '';
      } else if (selectedClient) {
        clientId = selectedClient.id;
        clientName = selectedClient.name;
        clientPhone = selectedClient.phone || '';
      }

      const res = await fetch('/api/repairs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientName, clientPhone, equipment: equipment.trim(), status, price: Number(price) || 0, problem: problem.trim(), notes: notes.trim() })
      });
      if (!res.ok) { alert('Error al crear orden'); return; }
      const newRepair = await res.json();
      setShowModal(false);
      fetchRepairsData();

      setSuccessData({
        code: newRepair.code,
        id: newRepair.id,
        clientName,
        clientPhone,
        equipment: equipment.trim(),
      });
      setTimeout(() => setShowSuccess(true), 150);
    }
  } catch { alert('Error al guardar'); }
};
```

**handleDelete** — Cambiar de /api/web-data a /api/repairs:

```typescript
const handleDelete = async (id: string) => {
  if (!window.confirm('\u00bfEst\u00e1 seguro de eliminar esta orden de reparaci\u00f3n?')) return;
  try {
    const res = await fetch(`/api/repairs/${id}`, { method: 'DELETE' });
    if (res.ok) fetchRepairsData();
    else alert('Error al eliminar');
  } catch { alert('Error al eliminar'); }
};
```

**openEdit** — Cambiar getClient a buscar en clients local:

```typescript
const openEdit = (r: WebRepair) => {
  setEditingId(r.id);
  setClientMode('search');
  setClientSearch('');
  const c = clients.find(c => c.id === r.clientId);
  setSelectedClient(c || null);
  // ...
  setMarca(r.marca || '');   // nuevo
  setModelo(r.modelo || ''); // nuevo
  // ...
};
```

**Agregar state para marca/modelo**:

```typescript
const [marca, setMarca] = useState('');
const [modelo, setModelo] = useState('');
```

**Agregar campos en el formulario** (después del campo "Equipo"):

```tsx
<div>
  <label className="text-[10px] text-slate-500 font-mono uppercase font-bold block mb-1">Marca</label>
  <input type="text" className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" value={marca} onChange={e => setMarca(e.target.value)} />
</div>
<div>
  <label className="text-[10px] text-slate-500 font-mono uppercase font-bold block mb-1">Modelo</label>
  <input type="text" className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" value={modelo} onChange={e => setModelo(e.target.value)} />
</div>
```

**Nota**: En la tabla de reparaciones, agregar columnas opcionales para Marca y Modelo.

---

### 4. src/App.tsx — Limpiar SGTaller y actualizar render

#### 4a. Eliminar sgtallerTime state (línea ~46)

```typescript
// ELIMINAR esta línea:
const [sgtallerTime, setSgtallerTime] = useState<string | null>(null);
```

#### 4b. Eliminar SGTaller polling (líneas ~86-101)

```typescript
// ELIMINAR todo este useEffect:
useEffect(() => {
  const check = async () => {
    try {
      const res = await fetch('/api/check-sgtaller-update');
      ...
    }
  };
  const id = setInterval(check, 10000);
  return () => clearInterval(id);
}, []);
```

#### 4c. Actualizar render de Reparaciones (línea ~399-401)

**Antes:**
```tsx
{activeTab === 'Reparaciones' && (
  <Reparaciones repairs={webData?.repairs || []} clients={webData?.clients || []} companyName={webData?.config?.companyName} companyAddress={webData?.config?.address} companyPhone={webData?.config?.phone} companyEmail={webData?.config?.email} companyWhatsapp={webData?.config?.whatsapp} onRefresh={fetchAllData} />
)}
```

**Después:**
```tsx
{activeTab === 'Reparaciones' && (
  <Reparaciones companyName={companyConfig?.companyName} companyAddress={companyConfig?.address} companyPhone={companyConfig?.phone} companyEmail={companyConfig?.email} companyWhatsapp={companyConfig?.whatsapp} onRefresh={fetchAllData} />
)}
```

#### 4d. Eliminar SGTaller toast (líneas ~834-850)

```tsx
// ELIMINAR todo el bloque:
{/* SGTaller update toast */}
<AnimatePresence>
  {sgtallerTime && (
    ...
  )}
</AnimatePresence>
```

---

### 5. Web-main/Web-main/app.js — Actualizar consulta pública

En `Pages.renderRepairsPublic()` (~línea 773-814), cambiar la búsqueda de repairs de localStorage a API:

**Antes:**
```javascript
document.getElementById('btn-search-repair').addEventListener('click', () => {
  const query = document.getElementById('repair-search').value.trim();
  const repairs = DB.get('repairs');
  const clients = DB.get('clients');
  const repair = repairs.find(r => r.code === query.toUpperCase());
  ...
});
```

**Después:**
```javascript
document.getElementById('btn-search-repair').addEventListener('click', async () => {
  const query = document.getElementById('repair-search').value.trim().toUpperCase();
  const resultDiv = document.getElementById('repair-result');
  try {
    const res = await fetch('http://localhost:3010/api/repairs/lookup/' + query);
    if (!res.ok) throw new Error('Not found');
    const data = await res.json();
    if (data.found) {
      const repair = data.repair;
      const statusClass = `status-${repair.status.replace(/\s+/g, '')}`;
      resultDiv.innerHTML = `
        <div class="glass" style="padding: 1.5rem; border-radius: 1rem; text-align: left;">
          <div style="background: var(--accent-blue); color: white; padding: 1rem; border-radius: 0.5rem; text-align: center; margin-bottom: 1.5rem;">
            <div style="font-size: 0.8rem; opacity: 0.85;">CLAVE DE ORDEN</div>
            <div style="font-size: 2.5rem; font-weight: 900; letter-spacing: 0.5rem;">${repair.code}</div>
          </div>
          <div class="flex justify-between items-center mb-4" style="margin-bottom: 1rem;">
            <span style="color: var(--text-muted); font-size: 0.85rem;">Orden Interna: ${repair.id}</span>
            <span class="status-badge ${statusClass}">${repair.status}</span>
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 0.95rem;">
            <tr><td style="padding: 0.5rem 0; color: var(--text-muted); width: 40%;">Cliente</td><td style="font-weight: 600;">${repair.clientName || 'N/A'}</td></tr>
            <tr><td style="padding: 0.5rem 0; color: var(--text-muted);">Equipo</td><td style="font-weight: 600;">${repair.equipment}${repair.marca ? ' (' + repair.marca + ')' : ''}${repair.modelo ? ' - ' + repair.modelo : ''}</td></tr>
            <tr><td style="padding: 0.5rem 0; color: var(--text-muted);">Problema</td><td>${repair.problem}</td></tr>
            <tr><td style="padding: 0.5rem 0; color: var(--text-muted);">Fecha Ingreso</td><td>${repair.date}</td></tr>
            ${repair.notes ? `<tr><td style="padding: 0.5rem 0; color: var(--text-muted);">Notas</td><td>${repair.notes}</td></tr>` : ''}
            <tr><td style="padding: 0.5rem 0; color: var(--text-muted); font-weight: 600;">Costo de Reparaci\u00f3n</td><td style="font-weight: 700; color: var(--success); font-size: 1.1rem;">${repair.price && repair.price > 0 ? '$' + Number(repair.price).toLocaleString('es-AR', { minimumFractionDigits: 2 }) : 'A Confirmar'}</td></tr>
          </table>
        </div>
      `;
    } else {
      resultDiv.innerHTML = '<div class="glass" style="padding: 1.5rem; border-radius: 1rem; color: var(--danger); text-align: center;">No se encontr\u00f3 ninguna orden con esa clave.</div>';
    }
  } catch {
    resultDiv.innerHTML = '<div class="glass" style="padding: 1.5rem; border-radius: 1rem; color: var(--danger); text-align: center;">Error al consultar el servidor. Verifique que Nexus POS est\u00e9 ejecut\u00e1ndose.</div>';
  }
});
```

---

### 6. Web-main/Web-main/server.js — Desactivar bridge

Buscar y comentar o eliminar el bloque (~líneas 207-243):

```javascript
// COMENTAR o ELIMINAR:
// try {
//     console.log("-> Iniciando Puente con SGTaller 3...");
//     const bridge = require('./sgtaller_bridge.js');
//     ...
// } catch (e) {
//     console.error("-> Error al iniciar el Puente de SGTaller 3:", e.message);
// }
```

---

## Orden de implementación sugerido

1. server.ts (schema + endpoints + migración + eliminar check-sgtaller)
2. types.ts (agregar marca/modelo)
3. Reparaciones.tsx (reescribir fetch y CRUD)
4. App.tsx (limpiar SGTaller, actualizar render)
5. Web-main app.js (consulta pública)
6. Web-main server.js (desactivar bridge)
7. Probar todo
