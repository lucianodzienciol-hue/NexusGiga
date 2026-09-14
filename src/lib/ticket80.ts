import { formatMoney, currencyCodeOf } from './currency';

interface ThermalCompany {
  companyName?: string;
  address?: string;
  phone?: string;
  email?: string;
  currency?: string;
}

export interface ThermalSale {
  id: string;
  date: string;
  clientName?: string;
  items: { productName: string; quantity: number; price: number }[];
  total: number;
  paymentMethod: string;
  cashReceived?: number;
  change?: number;
}

const escapeHtml = (v: any): string =>
  String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));

const ticket80 = (
  sale: ThermalSale,
  reprint = false,
  company?: ThermalCompany
) => {
  const c = company || {};
  const cur = currencyCodeOf((c as ThermalCompany).currency);
  const money = (n: any) => formatMoney(Number(n) || 0, cur);
  const items = (sale.items || []).map((it: any) => `
    <div class="row"><span>${escapeHtml(it.productName)} x${it.quantity}</span><span>${money((Number(it.price) || 0) * (Number(it.quantity) || 0))}</span></div>`
  ).join('');

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Ticket - ${escapeHtml(sale.id)}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Courier New', monospace; font-size: 12px; color: #000; background: #fff; width: 80mm; padding: 4mm 3mm; }
    .center { text-align: center; }
    .name { font-size: 15px; font-weight: bold; }
    .meta { font-size: 11px; }
    hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
    .row { display: flex; justify-content: space-between; gap: 6px; }
    .row span:first-child { word-break: break-word; }
    .total { display: flex; justify-content: space-between; font-size: 16px; font-weight: bold; margin: 4px 0; }
    .thanks { margin-top: 8px; font-size: 11px; }
  </style>
</head>
<body>
  <div class="center">
    <div class="name">${escapeHtml(c.companyName || 'NEXUS')}</div>
    ${c.address ? `<div class="meta">${escapeHtml(c.address)}</div>` : ''}
    ${c.phone ? `<div class="meta">Tel: ${escapeHtml(c.phone)}</div>` : ''}
  </div>
  <hr>
  <div class="meta">Ticket: ${escapeHtml(sale.id)}${reprint ? ' (DUPLICADO)' : ''}</div>
  <div class="meta">Fecha: ${new Date(sale.date).toLocaleString()}</div>
  <div class="meta">Cliente: ${escapeHtml(sale.clientName || 'Cliente General')}</div>
  <hr>
  ${items}
  <hr>
  <div class="total"><span>TOTAL</span><span>${money(sale.total)}</span></div>
  <div class="meta">Pago: ${escapeHtml(sale.paymentMethod)}</div>
  <div class="meta">Recibido: ${money(sale.cashReceived ?? sale.total)}</div>
  <div class="meta">Cambio: ${money(sale.change ?? 0)}</div>
  <hr>
  <div class="center thanks">Gracias por su compra</div>
  <script>window.onload = function() { window.print(); window.close(); }</script>
</body>
</html>
`;
};

export interface ThermalRepair {
  id: string;
  code: string;
  date: string;
  status: string;
  price?: number;
  equipment?: string;
  problem?: string;
  clientName?: string;
  clientPhone?: string;
}

export const repair80 = (
  repair: ThermalRepair,
  company?: ThermalCompany
) => {
  const c = company || {};
  const cur = currencyCodeOf((c as ThermalCompany).currency);
  const money = (n: any) => formatMoney(Number(n) || 0, cur);
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Reparación - ${escapeHtml(repair.code)}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Courier New', monospace; font-size: 12px; color: #000; background: #fff; width: 80mm; padding: 4mm 3mm; }
    .center { text-align: center; }
    .name { font-size: 15px; font-weight: bold; }
    .meta { font-size: 11px; }
    hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
    .code { font-size: 20px; font-weight: bold; letter-spacing: 4px; }
    .total { display: flex; justify-content: space-between; font-size: 15px; font-weight: bold; margin: 4px 0; }
    .thanks { margin-top: 8px; font-size: 11px; }
  </style>
</head>
<body>
  <div class="center">
    <div class="name">${escapeHtml(c.companyName || 'NEXUS')}</div>
    ${c.phone ? `<div class="meta">Tel: ${escapeHtml(c.phone)}</div>` : ''}
    <div class="meta">ORDEN DE SERVICIO</div>
    <div class="code">${escapeHtml(repair.code)}</div>
  </div>
  <hr>
  <div class="meta">Orden: ${escapeHtml(repair.id)}</div>
  <div class="meta">Fecha: ${escapeHtml(repair.date)}</div>
  <div class="meta">Cliente: ${escapeHtml(repair.clientName || '-')}</div>
  <div class="meta">Tel: ${escapeHtml(repair.clientPhone || '-')}</div>
  <div class="meta">Equipo: ${escapeHtml(repair.equipment || '-')}</div>
  <div class="meta">Estado: ${escapeHtml(repair.status)}</div>
  <div class="meta">Problema: ${escapeHtml(repair.problem || '-')}</div>
  <hr>
  <div class="total"><span>COSTO</span><span>${money(repair.price)}</span></div>
  <hr>
  <div class="center thanks">Conserve este comprobante para retirar su equipo</div>
  <script>window.onload = function() { window.print(); window.close(); }</script>
</body>
</html>
`;
};

export default ticket80;
