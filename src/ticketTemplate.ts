interface TicketCompany {
  companyName?: string;
  address?: string;
  phone?: string;
  email?: string;
  hours?: string;
}

const ticketTemplate = (
  sale: { id: string; date: string; clientName?: string; items: { productName: string; quantity: number; price: number }[]; total: number; paymentMethod: string; cashReceived?: number; change?: number },
  reprint = false,
  company?: TicketCompany
) => {
  const c = company || {};
  const name = c.companyName || 'NEXUS POS';
  const addr = c.address || '';
  const phone = c.phone || '';
  const email = c.email || '';
  const tagline = c.companyName ? '' : '★ SISTEMA DE FACTURACIÓN MODERNA ★';

  return `
<html>
  <head>
    <title>Ticket - ${sale.id}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; width: 300px; margin: 20px auto; color: #222; background: #fafafa; }
      .header-bar { background: #1a237e; color: #fff; padding: 16px 20px 14px; text-align: center; }
      .header-bar h1 { font-size: 16px; font-weight: 800; letter-spacing: 1.5px; margin-bottom: 2px; }
      .header-bar .sub { font-size: 9px; opacity: 0.8; letter-spacing: 1px; margin-top: 4px; }
      .header-bar .contact { font-size: 7.5px; opacity: 0.7; margin-top: 4px; line-height: 1.4; }
      .body { padding: 12px 16px; }
      .meta { display: flex; justify-content: space-between; font-size: 9px; color: #555; margin-bottom: 10px; border-bottom: 1px solid #e0e0e0; padding-bottom: 8px; }
      .reprint-badge { background: #c62828; color: #fff; font-size: 8px; padding: 2px 8px; text-align: center; letter-spacing: 1px; font-weight: bold; margin-bottom: 8px; }
      .client-row { font-size: 10px; color: #333; margin-bottom: 8px; padding: 4px 0; border-bottom: 1px dashed #ddd; }
      .col-headers { display: grid; grid-template-columns: 2.5fr 0.7fr 1fr; gap: 4px; font-size: 8px; font-weight: bold; color: #1a237e; letter-spacing: 0.5px; border-bottom: 2px solid #1a237e; padding-bottom: 4px; margin-bottom: 4px; text-transform: uppercase; }
      .col-headers > span:last-child { text-align: right; }
      .col-headers > span:nth-child(2) { text-align: center; }
      .item-row { display: grid; grid-template-columns: 2.5fr 0.7fr 1fr; gap: 4px; font-size: 9px; color: #333; padding: 3px 0; }
      .item-row:nth-child(even) { background: #f0f0f5; border-radius: 2px; }
      .item-row > span:last-child { text-align: right; }
      .item-row > span:nth-child(2) { text-align: center; }
      .divider-dash { border-top: 1px dashed #ccc; margin: 8px 0; }
      .divider-thin { border-top: 1px solid #e0e0e0; margin: 6px 0; }
      .total-box { background: #e8eaf6; border: 1px solid #c5cae9; border-radius: 4px; padding: 8px 12px; margin: 6px 0; }
      .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; color: #1a237e; }
      .payment-row { display: flex; justify-content: space-between; font-size: 9px; color: #555; margin: 3px 0; }
      .footer { text-align: center; padding: 12px 16px; font-size: 8px; color: #888; }
      .footer .thanks { font-size: 10px; color: #1a237e; font-weight: bold; margin-bottom: 4px; }
      .qr-ascii { font-family: monospace; font-size: 6px; line-height: 1; color: #999; margin: 6px 0; letter-spacing: 1px; }
      .serial { font-size: 7px; color: #aaa; margin-top: 4px; }
    </style>
  </head>
  <body>
    <div class="header-bar">
      <h1>${name}</h1>
      ${tagline ? `<p class="sub">${tagline}</p>` : ''}
      ${addr ? `<div class="contact">${addr}${phone ? ` · ${phone}` : ''}${email ? `<br>${email}` : ''}</div>` : ''}
    </div>
    <div class="body">
      ${reprint ? '<div class="reprint-badge">◆ DUPLICADO — REIMPRESIÓN ◆</div>' : ''}
      <div class="meta">
        <span>FACTURA: ${sale.id}</span>
        <span>${new Date(sale.date).toLocaleString('es-PE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <div class="client-row">
        <strong>Cliente:</strong> ${sale.clientName || 'Cliente General'}
      </div>
      <div class="col-headers">
        <span>Descripción</span>
        <span>Cant</span>
        <span>Total</span>
      </div>
      ${sale.items.map((item: any) => `
        <div class="item-row">
          <span>${item.productName}</span>
          <span>${item.quantity}</span>
          <span>$${(item.price * item.quantity).toFixed(0)}</span>
        </div>
      `).join('')}
      <div class="divider-dash"></div>
      <div class="total-box">
        <div class="total-row">
          <span>TOTAL A PAGAR</span>
          <span>$${sale.total.toFixed(0)}</span>
        </div>
      </div>
      <div class="divider-thin"></div>
      <div style="font-size:9px;color:#555;">
        <div class="payment-row">
          <span>Método de pago</span>
          <span><strong>${sale.paymentMethod}</strong></span>
        </div>
        <div class="payment-row">
          <span>Recibido</span>
          <span>$${Number(sale.cashReceived || sale.total).toFixed(0)}</span>
        </div>
        <div class="payment-row">
          <span>Cambio</span>
          <span>$${Number(sale.change || 0).toFixed(0)}</span>
        </div>
      </div>
    </div>
    <div class="footer">
      <div class="thanks">✦ ¡Gracias por su preferencia! ✦</div>
      <div class="qr-ascii">
        ██ ▄▄▄▄ █ ▄▄▄▄ ██<br>
        ▄ █ █▄▀ █ ▀█▄▄ ▄ █<br>
        ▄▀ ▄▀▄▀ ▄█▀▀▄ █▄ ▀<br>
        ▀▄▀▄▀▄▀▄ ▄▀▄ █▄ ▄█<br>
        █ ▄▄▄▄ █ ▄▀▄▀█ █ ▀█
      </div>
      <div>${name} · ${new Date().getFullYear()}</div>
      <div class="serial">Serie: ${sale.id}-${Date.now().toString().slice(-6)}</div>
    </div>
    <script>
      window.onload = function() { window.print(); window.close(); }
    </script>
  </body>
</html>
`;
};

export default ticketTemplate;
