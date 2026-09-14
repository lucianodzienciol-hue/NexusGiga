import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const WEB_SRC = path.join(ROOT, 'web');
const PLANTILLAS_DIR = path.join(ROOT, 'plantillas');

const templates = [
  {
    id: '01-default',
    name: 'Clásico TechStore',
    rubro: 'Computación / Electrónica general',
    desc: 'Plantilla original: carrusel, grilla 5→2 cols, categorías laterales. Equilibrada y probada.',
    css: `/* 01-default: sin overrides, base intacta */`,
    html: null
  },
  {
    id: '02-minimal-list',
    name: 'Minimal Lista',
    rubro: 'Librería / Papelería / Ferretería chica',
    desc: 'Lista vertical limpia, sin hero, tipografía serif, tarjetas con borde sutil. Ideal para catálogos con muchos títulos.',
    css: `
/* 02-minimal-list: lista, serif, sin hero */
.promotional-carousel { display: none !important; }
.product-grid { grid-template-columns: 1fr !important; gap: 0.75rem !important; }
.product-card { flex-direction: row !important; align-items: center; padding: 0.75rem; }
.product-img-container { width: 80px !important; height: 80px !important; flex-shrink: 0; }
.catalog-layout { gap: 1rem; }
.catalog-sidebar { width: 200px; }
body { font-family: 'Georgia', serif; }
:root { --accent-blue: #2c2c2c; --accent-blue-hover: #000; --bg-main: #fefefe; --bg-secondary: #ffffff; }
`,
    html: null
  },
  {
    id: '03-compact-grid',
    name: 'Compact Grid',
    rubro: 'Almacén / Kiosco / Productos masivos',
    desc: 'Grilla densa 6 columnas, cards pequeñas, precio grande. Para muchos productos a la vista.',
    css: `
/* 03-compact-grid: grilla densa */
.product-grid { grid-template-columns: repeat(6, 1fr) !important; gap: 0.5rem !important; }
@media (max-width: 1400px) { .product-grid { grid-template-columns: repeat(5, 1fr) !important; } }
@media (max-width: 1100px) { .product-grid { grid-template-columns: repeat(4, 1fr) !important; } }
@media (max-width: 768px) { .product-grid { grid-template-columns: repeat(3, 1fr) !important; } }
.product-card { border-radius: 0.5rem !important; }
.product-img-container { height: 110px !important; }
.product-title { font-size: 0.85rem !important; }
.product-price { font-size: 1.1rem !important; }
.promotional-carousel { height: 220px !important; }
`,
    html: null
  },
  {
    id: '04-editorial',
    name: 'Editorial Magazine',
    rubro: 'Ropa / Boutique / Lookbook',
    desc: 'Estilo revista: tipografía display grande, cards con imagen 4:3 y overlay, hero editorial.',
    css: `
/* 04-editorial: magazine */
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap');
.product-grid { grid-template-columns: repeat(3, 1fr) !important; gap: 1.5rem !important; }
.product-card { border: none !important; background: transparent !important; box-shadow: none !important; }
.product-img-container { height: 280px !important; border-radius: 0 !important; }
.product-title { font-family: 'Playfair Display', serif; font-size: 1.4rem !important; text-transform: uppercase; letter-spacing: 0.02em; }
.promotional-carousel { height: 420px !important; }
.catalog-sidebar { border: 1px solid var(--glass-border); }
`,
    html: null
  },
  {
    id: '05-dark-premium',
    name: 'Dark Premium',
    rubro: 'Joyería / Relojería / Premium',
    desc: 'Fondo oscuro con acentos dorados, cards con borde fino, hero full-bleed. Para productos premium.',
    css: `
/* 05-dark-premium: oscuro + dorado */
:root { --bg-main: #0a0a0b; --bg-secondary: #141416; --bg-card: #1c1c1e; --text-main: #f5f5f0; --text-muted: #a1a1aa; --accent-blue: #d4af37; --accent-blue-hover: #b8962e; --accent-cyan: #d4af37; --glass-border: rgba(212,175,55,0.15); }
body { background: var(--bg-main); color: var(--text-main); }
.navbar { background: rgba(10,10,11,0.9) !important; border-bottom: 1px solid rgba(212,175,55,0.2) !important; }
.product-card { border: 1px solid rgba(212,175,55,0.2) !important; background: var(--bg-card) !important; }
.product-badge { background: var(--accent-blue) !important; color: #000 !important; }
.footer { background: #050507 !important; }
.promotional-carousel { height: 400px !important; }
`,
    html: null
  },
  {
    id: '06-hardware-pro',
    name: 'Hardware Pro',
    rubro: 'Ferretería / Construcción / Técnico',
    desc: 'Ficha técnica visible en card, categorías como acordeón, tabla de specs. Para productos técnicos.',
    css: `
/* 06-hardware-pro: técnico */
.product-grid { grid-template-columns: repeat(4, 1fr) !important; }
.product-card { border-left: 3px solid var(--accent-blue) !important; }
.product-title { font-family: 'JetBrains Mono', monospace; font-size: 0.95rem !important; }
.product-desc { display: block !important; font-size: 0.75rem !important; color: var(--text-muted); margin-top: 0.25rem; }
.catalog-sidebar .category-item { font-family: monospace; font-size: 0.8rem; }
.promotional-carousel { height: 260px !important; }
`,
    html: null
  },
  {
    id: '07-service-focus',
    name: 'Service Focus',
    rubro: 'Taller / Servicios',
    desc: 'Servicios hero arriba, consulta de reparaciones destacada, productos debajo. Para negocios de servicios.',
    css: `
/* 07-service-focus: servicios primero */
.promotional-carousel { height: 320px !important; }
.services-grid { grid-template-columns: repeat(2, 1fr) !important; }
.product-grid { grid-template-columns: repeat(4, 1fr) !important; }
#repair-result { border: 2px solid var(--accent-blue); border-radius: 1rem; padding: 1rem; }
.catalog-layout { flex-direction: column !important; }
.catalog-sidebar { width: 100% !important; position: static !important; }
.category-list { flex-direction: row !important; flex-wrap: wrap; }
`,
    html: null
  },
  {
    id: '08-offer-spotlight',
    name: 'Offer Spotlight',
    rubro: 'Supermercado / Ofertas',
    desc: 'Ofertas primero con badges grandes y contador, luego resto. Para destacar descuentos.',
    css: `
/* 08-offer-spotlight: ofertas grandes */
.product-badge { font-size: 0.9rem !important; padding: 0.4rem 1rem !important; background: #ef4444 !important; animation: pulse 2s infinite; }
@keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }
.product-price.oferta { font-size: 1.7rem !important; color: #ef4444 !important; }
.product-price-old { display: inline !important; }
.promotional-carousel { height: 380px !important; border: 3px solid #ef4444; }
.product-grid { gap: 1rem !important; }
`,
    html: null
  },
  {
    id: '09-search-first',
    name: 'Search First',
    rubro: 'Farmacia / Perfumería',
    desc: 'Buscador gigante arriba, sin hero, filtros por marca/categoría prominentes. Para búsqueda rápida.',
    css: `
/* 09-search-first: búsqueda protagonista */
.promotional-carousel { display: none !important; }
.filter-bar { background: var(--bg-card) !important; border: 2px solid var(--accent-blue) !important; border-radius: 1rem !important; padding: 1.25rem !important; margin-bottom: 1.5rem !important; }
.search-input { font-size: 1.25rem !important; padding: 1rem 1rem 1rem 2.5rem !important; border-radius: 2rem !important; }
.product-grid { grid-template-columns: repeat(4, 1fr) !important; }
.catalog-sidebar { background: var(--bg-card); border-radius: 1rem; padding: 1rem; }
`,
    html: null
  },
  {
    id: '10-visual-feed',
    name: 'Visual Feed',
    rubro: 'Bazar / Decoración / Imagen grande',
    desc: 'Masonry tipo Instagram, imagen 1:1 grande con overlay precio. Para productos visuales.',
    css: `
/* 10-visual-feed: masonry Instagram */
.product-grid { display: block !important; column-count: 3; column-gap: 1rem; }
@media (max-width: 1100px) { .product-grid { column-count: 2 !important; } }
@media (max-width: 768px) { .product-grid { column-count: 2 !important; } }
@media (max-width: 480px) { .product-grid { column-count: 1 !important; } }
.product-card { break-inside: avoid; margin-bottom: 1rem; border-radius: 0 !important; overflow: hidden; }
.product-img-container { height: 260px !important; }
.product-img-container img { object-fit: cover; }
.product-content { position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(transparent, rgba(0,0,0,0.85)); color: white !important; padding: 1rem !important; }
.product-title { color: white !important; }
.product-price { color: white !important; }
.promotional-carousel { height: 300px !important; border-radius: 0 !important; }
`,
    html: null
  }
];

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

for (const tpl of templates) {
  const dest = path.join(PLANTILLAS_DIR, tpl.id);
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
  copyDir(WEB_SRC, dest);
  if (tpl.css) {
    const cssPath = path.join(dest, 'style.css');
    fs.appendFileSync(cssPath, '\n' + tpl.css, 'utf8');
  }
  const meta = {
    id: tpl.id,
    name: tpl.name,
    rubro: tpl.rubro,
    descripcion: tpl.desc,
    version: '1.0.0',
    base: 'web actual con carrito + banner fix',
    branch: 'Full y Lite compatibles'
  };
  fs.writeFileSync(path.join(dest, 'template.json'), JSON.stringify(meta, null, 2), 'utf8');
  console.log(`✓ ${tpl.id} — ${tpl.name} (${tpl.rubro})`);
}
console.log(`\nTotal plantillas: ${templates.length} en ${PLANTILLAS_DIR}`);
