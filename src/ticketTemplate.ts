import { formatMoney, currencyCodeOf } from './lib/currency';

interface TicketCompany {
  companyName?: string;
  address?: string;
  phone?: string;
  email?: string;
  hours?: string;
  currency?: string;
}

const escapeHtml = (v: any): string =>
  String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));

const ticketTemplate = (
  sale: { id: string; date: string; clientName?: string; items: { productName: string; quantity: number; price: number }[]; total: number; paymentMethod: string; cashReceived?: number; change?: number },
  reprint = false,
  company?: TicketCompany
) => {
  const c = company || {};
  const cur = currencyCodeOf((c as TicketCompany).currency);
  const name = c.companyName || 'NEXUS FULL';
  const addr = c.address || '';
  const phone = c.phone || '';
  const email = c.email || '';

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Factura - ${sale.id}</title>
  <style>
    :root { --primary: #1a237e; --dark: #111827; --gray-50: #f9fafb; --gray-100: #f3f4f6; --gray-200: #e5e7eb; --gray-500: #6b7280; --gray-700: #374151; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', -apple-system, sans-serif; padding: 0; color: var(--dark); line-height: 1.5; background: white; }
    .page { width: 210mm; padding: 15mm; margin: auto; background: white; position: relative; }
    @page { size: A4; margin: 0; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid var(--primary); padding-bottom: 1rem; margin-bottom: 1.5rem; }
    .company-name { font-size: 1.75rem; font-weight: 800; color: var(--primary); text-transform: uppercase; letter-spacing: -0.025em; }
    .company-info { font-size: 0.85rem; color: var(--gray-500); margin-top: 0.2rem; font-weight: 500; }
    .order-meta { text-align: right; display: flex; flex-direction: column; justify-content: center; gap: 0.25rem; }
    .order-id { font-size: 0.8rem; color: var(--gray-500); text-transform: uppercase; letter-spacing: 0.05em; }
    .order-number { font-size: 1.5rem; font-weight: 700; color: var(--primary); }
    .badge-label { font-size: 0.7rem; color: var(--gray-500); font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 0.4rem; }
    .reprint-badge { text-align: center; margin-bottom: 1rem; }
    .reprint-badge span { background: #c62828; color: white; padding: 0.3rem 1.5rem; border-radius: 0.5rem; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.1em; display: inline-block; }
    .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 1.5rem; }
    .details-section h3 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--primary); font-weight: 700; border-bottom: 2px solid var(--gray-100); padding-bottom: 0.5rem; margin-bottom: 0.75rem; }
    .invoice-table { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; font-size: 0.85rem; }
    .invoice-table th { background: var(--gray-50); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--gray-500); font-weight: 700; padding: 0.6rem 0.75rem; text-align: left; border-bottom: 2px solid var(--gray-200); }
    .invoice-table th:last-child { text-align: right; }
    .invoice-table th:nth-child(2) { text-align: center; }
    .invoice-table td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--gray-100); }
    .invoice-table td:last-child { text-align: right; font-weight: 600; }
    .invoice-table td:nth-child(2) { text-align: center; color: var(--gray-500); }
    .invoice-table tbody tr:nth-child(even) { background: var(--gray-50); }
    .total-box { background: var(--gray-50); border: 1px solid var(--gray-200); border-radius: 0.75rem; padding: 1rem 1.5rem; margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center; }
    .total-box .label { font-size: 0.8rem; color: var(--gray-500); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
    .total-box .amount { font-size: 1.75rem; font-weight: 800; color: var(--primary); }
    .payment-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem; }
    .payment-item { padding: 0.5rem 0; border-bottom: 1px solid var(--gray-100); display: flex; justify-content: space-between; font-size: 0.85rem; }
    .payment-item .label { color: var(--gray-500); font-weight: 600; }
    .payment-item .value { color: var(--dark); font-weight: 500; }
    .footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--gray-200); display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--gray-500); }
    .stamp { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-15deg); font-size: 4rem; font-weight: 900; color: rgba(26, 35, 126, 0.06); text-transform: uppercase; pointer-events: none; white-space: nowrap; border: 4px solid rgba(26, 35, 126, 0.1); border-radius: 2rem; padding: 1rem 3rem; }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div>
        <div class="company-name">${name}</div>
        <div class="company-info">${addr ? addr + ' &bull; ' : ''}${phone ? phone + ' &bull; ' : ''}${email || ''}</div>
      </div>
      <div class="order-meta">
        <div class="order-id">Factura de Venta</div>
        <div class="order-number"># ${sale.id}</div>
      </div>
    </div>

    ${reprint ? '<div class="reprint-badge"><span>✦ DUPLICADO — REIMPRESIÓN ✦</span></div>' : ''}

    <div class="details-grid">
      <div class="details-section">
        <h3>Datos del Cliente</h3>
        <div class="payment-item"><span class="label">Nombre</span><span class="value">${escapeHtml(sale.clientName || 'Cliente General')}</span></div>
        <div class="payment-item"><span class="label">Fecha</span><span class="value">${new Date(sale.date).toLocaleString()}</span></div>
      </div>
      <div class="details-section">
        <h3>Información de Pago</h3>
        <div class="payment-item"><span class="label">Método</span><span class="value">${sale.paymentMethod}</span></div>
        <div class="payment-item"><span class="label">Recibido</span><span class="value">${formatMoney(Number(sale.cashReceived || sale.total), cur)}</span></div>
        <div class="payment-item"><span class="label">Cambio</span><span class="value">${formatMoney(Number(sale.change || 0), cur)}</span></div>
      </div>
    </div>

    <h3 style="font-size:0.8rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--primary);font-weight:700;border-bottom:2px solid var(--gray-100);padding-bottom:0.5rem;margin-bottom:0.75rem;">Productos Facturados</h3>
    <table class="invoice-table">
      <thead>
        <tr>
          <th>Producto</th>
          <th style="text-align:center">Cant</th>
          <th style="text-align:right">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        ${sale.items.map((item: any) => `
          <tr>
            <td>${escapeHtml(item.productName)}</td>
            <td>${item.quantity}</td>
            <td>${formatMoney(item.price * item.quantity, cur)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="total-box">
      <span class="label">Total a Pagar</span>
      <span class="amount">${formatMoney(sale.total, cur)}</span>
    </div>

    <div class="stamp">PAGADO</div>

    <div class="footer">
      <span>Conserve esta factura como comprobante de pago.</span>
      <span>${new Date(sale.date).toLocaleDateString()} &mdash; ${name}</span>
    </div>
  </div>
  <script>window.onload = function() { window.print(); window.close(); }</script>
</body>
</html>
`;
};

export default ticketTemplate;
