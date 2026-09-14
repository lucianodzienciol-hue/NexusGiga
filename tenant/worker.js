// nexus-tenants — Worker multi-tenant para tiendas Nexus 3.1.
// Un solo Worker + un KV (binding NEXUS_TENANTS) atienden a todos los clientes.
// Tenant por subdominio (<slug>.nexuspos.com.ar) o dominio propio (mapa d:<host>).
// Auth: token por tenant (syncToken) en query ?token= o header Authorization Bearer.
// Sin dependencias. Compatible con Node 18+ para pruebas locales.

const MAX_BODY = 1024 * 1024;
const MAX_ORDERS = 500;
const RATE_WINDOW_MS = 60000;
const RATE_MAX = 60;

const hits = new Map();

function checkRate(ip, slug) {
  const now = Date.now();
  const key = ip + '|' + slug;
  let arr = hits.get(key) || [];
  arr = arr.filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) return false;
  arr.push(now);
  if (hits.size > 5000) hits.clear();
  hits.set(key, arr);
  return true;
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization',
  'access-control-max-age': '86400',
};
function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ 'content-type': 'application/json', 'cache-control': 'no-store' }, CORS),
  });
}

function clientIp(req) {
  return req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || 'unknown';
}

function bearerToken(req, url) {
  const q = url.searchParams.get('token');
  if (q) return q;
  const h = req.headers.get('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

async function readMeta(env, slug) {
  try {
    const raw = await env.NEXUS_TENANTS.get('t:' + slug + ':meta');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function resolveSlug(env, host, url) {
  const h = String(host || '').toLowerCase().split(':')[0];
  if (!h) return null;
  try {
    const mapped = await env.NEXUS_TENANTS.get('d:' + h);
    if (mapped) return { slug: mapped, via: 'domain' };
  } catch {}
  try {
    const qs = url && url.searchParams ? url.searchParams.get('slug') : null;
    if (qs && /^[a-z0-9][a-z0-9-]{0,62}$/.test(qs)) return { slug: qs, via: 'query' };
  } catch {}
  const suffix = '.nexuspos.com.ar';
  if (h === 'nexuspos.com.ar' || h === 'www.nexuspos.com.ar') return null;
  if (h.endsWith(suffix)) {
    const slug = h.slice(0, -suffix.length);
    if (/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) return { slug, via: 'subdomain' };
  }
  return null;
}

const VALID_CURRENCIES = ['ARS', 'USD', 'MXN', 'CLP', 'COP', 'PEN', 'UYU', 'PYG', 'BOB', 'BRL'];
function validCurrency(code) {
  if (code == null || code === '') return null;
  const c = String(code).toUpperCase();
  return VALID_CURRENCIES.includes(c) ? null : 'moneda inválida (usar: ' + VALID_CURRENCIES.join(', ') + ')';
}
function validOrder(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return 'pedido inválido';
  const items = Array.isArray(o.items) ? o.items : [];
  if (items.length === 0) return 'el pedido no tiene ítems';
  if (items.length > 200) return 'demasiados ítems';
  const total = Number(o.total);
  if (!Number.isFinite(total) || total < 0) return 'total inválido';
  if (String(o.clientName || '').length > 200) return 'nombre inválido';
  if (String(o.clientPhone || '').length > 60) return 'teléfono inválido';
  return null;
}

async function readJson(req) {
  const text = await req.text();
  if (text.length > MAX_BODY) return { tooBig: true };
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { invalid: true }; }
}

async function audit(env, slug, action, detail) {
  try {
    const key = 'log:' + slug;
    let arr = [];
    try { arr = JSON.parse((await env.NEXUS_TENANTS.get(key)) || '[]'); } catch {}
    if (!Array.isArray(arr)) arr = [];
    arr.push({ t: new Date().toISOString(), action, detail: String(detail || '').slice(0, 300) });
    if (arr.length > 50) arr = arr.slice(-50);
    await env.NEXUS_TENANTS.put(key, JSON.stringify(arr), { expirationTtl: 60 * 60 * 24 * 365 });
  } catch {}
}

async function touchSync(env, slug, meta) {
  try {
    meta.lastSync = new Date().toISOString();
    await env.NEXUS_TENANTS.put('t:' + slug + ':meta', JSON.stringify(meta));
  } catch {}
}

const vendorHits = new Map();
function checkVendorRate(ip) {
  const now = Date.now();
  let arr = vendorHits.get(ip) || [];
  arr = arr.filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= 30) return false;
  arr.push(now);
  if (vendorHits.size > 1000) vendorHits.clear();
  vendorHits.set(ip, arr);
  return true;
}
function vendorAuth(env, req) {
  const h = req.headers.get('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  const token = m ? m[1].trim() : '';
  return !!env.PANEL_TOKEN && !!token && token === env.PANEL_TOKEN;
}

async function readIdx(env) {
  try {
    const raw = await env.NEXUS_TENANTS.get('idx:clients');
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
async function writeIdx(env, idx) {
  await env.NEXUS_TENANTS.put('idx:clients', JSON.stringify(idx));
}
function newToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function vendorClients(env, req) {
  if (!vendorAuth(env, req)) return json({ error: 'no autorizado' }, 401);
  if (!checkVendorRate(clientIp(req))) return json({ error: 'demasiadas solicitudes' }, 429);
  const idx = await readIdx(env);
  const out = [];
  for (const c of idx) {
    const slug = c.slug;
    let pendientes = 0;
    let estado = c.estado || 'activo';
    let lastSync = c.lastSync || null;
    try {
      const mraw = await env.NEXUS_TENANTS.get('t:' + slug + ':meta');
      if (mraw) {
        const meta = JSON.parse(mraw);
        if (meta.estado) estado = meta.estado;
        if (meta.lastSync) lastSync = meta.lastSync;
      }
      const oraw = await env.NEXUS_TENANTS.get('t:' + slug + ':orders');
      const arr = oraw ? JSON.parse(oraw) : [];
      if (Array.isArray(arr)) pendientes = arr.length;
    } catch {}
    out.push({
      slug, comercio: c.comercio || '', contacto: c.contacto || '', email: c.email || '',
      estado, lastSync, pendientes, dominio: c.dominio || null, alta: c.alta || null,
      health: 'ok',
    });
  }
  return json(out);
}

async function vendorAction(env, req) {
  if (!vendorAuth(env, req)) return json({ error: 'no autorizado' }, 401);
  if (!checkVendorRate(clientIp(req))) return json({ error: 'demasiadas solicitudes' }, 429);
  const body = await readJson(req);
  if (!body || body.tooBig || body.invalid) return json({ error: 'pedido inválido' }, 400);
  const slug = String(body.slug || '').toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) return json({ error: 'slug inválido' }, 400);
  const action = String(body.action || '');
  const meta = await readMeta(env, slug);
  if (!meta && action !== 'verificar' && action !== 'alta') return json({ error: 'tenant desconocido' }, 404);

  if (action === 'verificar') {
    let catalog = false;
    try {
      const raw = await env.NEXUS_TENANTS.get('t:' + slug + ':store');
      catalog = !!raw;
    } catch {}
    return json({ ok: true, slug, existe: !!meta, catalogo: catalog, estado: (meta && meta.estado) || 'inexistente' });
  }
  if (action === 'desvincular') {
    delete meta.fp;
    await env.NEXUS_TENANTS.put('t:' + slug + ':meta', JSON.stringify(meta));
    await audit(env, slug, 'desvincular-pc', '');
    return json({ ok: true, desvinculado: true });
  }
  if (action === 'dominio') {
    const dom = String(body.dominio == null ? '' : body.dominio).toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (dom && !/^(?=.{1,253}$)[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/.test(dom)) {
      return json({ error: 'dominio inválido (solo hostname, ej. tienda.cliente.com)' }, 400);
    }
    try {
      const names = await env.NEXUS_TENANTS.list({ prefix: 'd:' });
      for (const key of names.keys || []) {
        try {
          if ((await env.NEXUS_TENANTS.get(key.name)) === slug) await env.NEXUS_TENANTS.delete(key.name);
        } catch {}
      }
    } catch {}
    meta.dominio = dom || null;
    if (dom) {
      try {
        const other = await env.NEXUS_TENANTS.get('d:' + dom);
        if (other && other !== slug) return json({ error: 'ese dominio ya apunta a ' + other }, 409);
      } catch {}
      await env.NEXUS_TENANTS.put('d:' + dom, slug);
    }
    await env.NEXUS_TENANTS.put('t:' + slug + ':meta', JSON.stringify(meta));
    const didx = await readIdx(env);
    const dix = didx.findIndex((c) => c.slug === slug);
    if (dix !== -1) { didx[dix].dominio = meta.dominio; await writeIdx(env, didx); }
    await audit(env, slug, 'dominio', meta.dominio || '(quitado)');
    return json({ ok: true, slug, dominio: meta.dominio });
  }
  if (action === 'suspender' || action === 'reactivar') {
    meta.estado = action === 'suspender' ? 'suspendido' : 'activo';
    await env.NEXUS_TENANTS.put('t:' + slug + ':meta', JSON.stringify(meta));
    const idx = await readIdx(env);
    const ix = idx.findIndex((c) => c.slug === slug);
    if (ix !== -1) { idx[ix].estado = meta.estado; await writeIdx(env, idx); }
    await audit(env, slug, action, '');
    return json({ ok: true, estado: meta.estado });
  }
  if (action === 'alta') {
    if (meta) return json({ error: 'el slug ya existe' }, 409);
    const store = body.store && typeof body.store === 'object' ? body.store : null;
    if (!store) return json({ error: 'falta store (products/categories/services/config)' }, 400);
    const curErr = store.config ? validCurrency(store.config.currency) : null;
    if (curErr) return json({ error: curErr }, 400);
    const now = new Date().toISOString();
    const fresh = {
      slug,
      syncToken: newToken(),
      estado: 'activo',
      comercio: String(body.comercio || '').slice(0, 200),
      contacto: String(body.contacto || '').slice(0, 200),
      email: String(body.email || '').slice(0, 200),
      dominio: body.dominio ? String(body.dominio).toLowerCase() : null,
      alta: now,
      lastSync: null,
    };
    await env.NEXUS_TENANTS.put('t:' + slug + ':meta', JSON.stringify(fresh));
    await env.NEXUS_TENANTS.put('t:' + slug + ':store', JSON.stringify({
      products: Array.isArray(store.products) ? store.products.slice(0, 2000) : [],
      categories: Array.isArray(store.categories) ? store.categories.slice(0, 500) : [],
      services: Array.isArray(store.services) ? store.services.slice(0, 500) : [],
      config: store.config && typeof store.config === 'object' ? store.config : {},
      publishedAt: now,
    }));
    await env.NEXUS_TENANTS.put('t:' + slug + ':orders', '[]', { expirationTtl: 60 * 60 * 24 * 90 });
    if (fresh.dominio) {
      await env.NEXUS_TENANTS.put('d:' + fresh.dominio, slug);
    }
    const idx = await readIdx(env);
    const ix = idx.findIndex((c) => c.slug === slug);
    const entry = { slug, comercio: fresh.comercio, contacto: fresh.contacto, email: fresh.email, estado: 'activo', alta: now, dominio: fresh.dominio, lastSync: null };
    if (ix === -1) idx.push(entry); else idx[ix] = entry;
    await writeIdx(env, idx);
    await audit(env, slug, 'alta', fresh.comercio);
    return json({ ok: true, slug, syncToken: fresh.syncToken });
  }
  if (action === 'rotar') {
    meta.syncToken = newToken();
    await env.NEXUS_TENANTS.put('t:' + slug + ':meta', JSON.stringify(meta));
    await audit(env, slug, 'rotar-token', '');
    return json({ ok: true, syncToken: meta.syncToken });
  }
  if (action === 'baja') {
    meta.estado = 'suspendido';
    await env.NEXUS_TENANTS.put('t:' + slug + ':meta', JSON.stringify(meta));
    let borrado = false;
    if (body.borrar === true) {
      for (const k of ['meta', 'store', 'orders', 'log']) {
        try { await env.NEXUS_TENANTS.delete('t:' + slug + ':' + k); } catch {}
      }
      try {
        const names = await env.NEXUS_TENANTS.list({ prefix: 'd:' });
        for (const key of names.keys || []) {
          try {
            if ((await env.NEXUS_TENANTS.get(key.name)) === slug) await env.NEXUS_TENANTS.delete(key.name);
          } catch {}
        }
      } catch {}
      borrado = true;
    }
    if (borrado) {
      const idx = await readIdx(env);
      await writeIdx(env, idx.filter((c) => c.slug !== slug));
    } else {
      const idx = await readIdx(env);
      const ix = idx.findIndex((c) => c.slug === slug);
      if (ix !== -1) { idx[ix].estado = 'suspendido'; await writeIdx(env, idx); }
    }
    await audit(env, slug, 'baja', borrado ? 'con borrado' : 'suspendido');
    return json({ ok: true, estado: 'suspendido', borrado });
  }
  return json({ error: 'acción inválida' }, 400);
}

function maintenancePage(name) {
  const safe = String(name || 'esta tienda').replace(/[<>&"]/g, '');
  return new Response(
    '<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Tienda en mantenimiento</title></head><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0c10;color:#e6e9ef;font-family:system-ui,sans-serif">' +
    '<div style="text-align:center"><h1>' + safe + '</h1><p style="color:#98a1b3">Tienda temporalmente en mantenimiento. Volvé pronto.</p></div></body></html>',
    { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }
  );
}

async function handleTenant(env, slug, meta, req, url, parts, method) {
  const sub = parts[0] || '';

  if (sub === 'health' && method === 'GET') {
    return json({ ok: true, tenant: slug, time: new Date().toISOString() });
  }

  if (meta && meta.estado === 'suspendido') {
    if (sub === 'catalog' && method === 'GET') {
      return maintenancePage(meta.comercio || slug);
    }
    return json({ error: 'tienda suspendida' }, 403);
  }

  if (sub === 'catalog' && method === 'GET') {
    const raw = await env.NEXUS_TENANTS.get('t:' + slug + ':store');
    if (!raw) return json({ error: 'tienda no publicada' }, 404);
    return new Response(raw, { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' } });
  }

  if (sub === 'order' && method === 'POST') {
    if (!checkRate(clientIp(req), slug)) return json({ error: 'demasiadas solicitudes' }, 429);
    const body = await readJson(req);
    if (!body || body.tooBig || body.invalid) return json({ error: 'pedido inválido' }, 400);
    const err = validOrder(body);
    if (err) return json({ error: err }, 400);
    const key = 't:' + slug + ':orders';
    let orders = [];
    try { orders = JSON.parse((await env.NEXUS_TENANTS.get(key)) || '[]'); } catch {}
    if (!Array.isArray(orders)) orders = [];
    const now = new Date().toISOString();
    const row = {
      id: 'WEB-' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 1296).toString(36).toUpperCase(),
      date: now,
      items: body.items,
      total: Number(body.total),
      clientName: String(body.clientName || ''),
      clientPhone: String(body.clientPhone || ''),
      notes: String(body.notes || '').slice(0, 2000),
      status: 'pendiente',
      deliveryType: String(body.deliveryType || '').slice(0, 20),
    };
    orders.push(row);
    if (orders.length > MAX_ORDERS) orders = orders.slice(-MAX_ORDERS);
    await env.NEXUS_TENANTS.put(key, JSON.stringify(orders), { expirationTtl: 60 * 60 * 24 * 90 });
    return json({ ok: true, id: row.id }, 201);
  }

  // Rutas autenticadas con syncToken del tenant
  const token = bearerToken(req, url);
  if (!meta || !meta.syncToken || token !== meta.syncToken) {
    return json({ error: 'no autorizado' }, 401);
  }

  // Amarre a una sola PC: el primer sync vincula la huella; otra PC se rechaza.
  const fp = String(req.headers.get('x-machine-fp') || '').trim().slice(0, 64);
  if (sub === 'inbox' || sub === 'ack') {
    if (!/^[0-9a-f]{16,64}$/i.test(fp)) {
      return json({ error: 'falta huella de PC' }, 400);
    }
    if (!meta.fp) {
      meta.fp = fp.toLowerCase();
      await env.NEXUS_TENANTS.put('t:' + slug + ':meta', JSON.stringify(meta));
      await audit(env, slug, 'activar-pc', fp.slice(0, 12) + '…');
    } else if (meta.fp !== fp.toLowerCase()) {
      return json({ error: 'tenant en uso en otra PC' }, 403);
    }
  }

  if (sub === 'inbox' && method === 'GET') {
    let orders = [];
    try { orders = JSON.parse((await env.NEXUS_TENANTS.get('t:' + slug + ':orders')) || '[]'); } catch {}
    await touchSync(env, slug, meta);
    return json(Array.isArray(orders) ? orders : []);
  }

  if (sub === 'ack' && method === 'POST') {
    const body = await readJson(req);
    const ids = new Set(Array.isArray(body && body.ids) ? body.ids.map(String) : []);
    if (ids.size === 0) return json({ ok: true, removed: 0 });
    const key = 't:' + slug + ':orders';
    let orders = [];
    try { orders = JSON.parse((await env.NEXUS_TENANTS.get(key)) || '[]'); } catch {}
    if (!Array.isArray(orders)) orders = [];
    const rest = orders.filter((o) => !ids.has(String(o.id)));
    await env.NEXUS_TENANTS.put(key, JSON.stringify(rest), { expirationTtl: 60 * 60 * 24 * 90 });
    return json({ ok: true, removed: orders.length - rest.length });
  }

  if (sub === 'publish' && method === 'POST') {
    const body = await readJson(req);
    if (!body || body.tooBig || body.invalid || typeof body !== 'object') {
      return json({ error: 'contenido inválido' }, 400);
    }
    const pubCurErr = body.config ? validCurrency(body.config.currency) : null;
    if (pubCurErr) return json({ error: pubCurErr }, 400);
    const store = {
      products: Array.isArray(body.products) ? body.products.slice(0, 2000) : [],
      categories: Array.isArray(body.categories) ? body.categories.slice(0, 500) : [],
      services: Array.isArray(body.services) ? body.services.slice(0, 500) : [],
      config: body.config && typeof body.config === 'object' ? body.config : {},
      publishedAt: new Date().toISOString(),
    };
    await env.NEXUS_TENANTS.put('t:' + slug + ':store', JSON.stringify(store));
    return json({ ok: true, products: store.products.length });
  }

  return json({ error: 'ruta no soportada' }, 404);
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const method = request.method.toUpperCase();
      if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

      if (url.pathname === '/vendor/clients' && method === 'GET') {
        return await vendorClients(env, request);
      }
      if (url.pathname === '/vendor/action' && method === 'POST') {
        return await vendorAction(env, request);
      }

      const resolved = await resolveSlug(env, url.hostname, url);
      if (!resolved) {
        return json({
          ok: true,
          service: 'nexus-tenants',
          usage: 'https://<slug>.nexuspos.com.ar/{health,catalog,order,inbox,ack,publish}',
        });
      }
      const meta = await readMeta(env, resolved.slug);
      if (!meta && url.pathname !== '/health') {
        return json({ error: 'tenant desconocido' }, 404);
      }
      const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
      return await handleTenant(env, resolved.slug, meta, request, url, parts, method);
    } catch (e) {
      return json({ error: 'error interno' }, 500);
    }
  },
};
