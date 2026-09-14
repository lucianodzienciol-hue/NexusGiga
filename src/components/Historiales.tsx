import React, { useState, useEffect } from 'react';
import { Calendar, Search, Printer, FileText, ChevronDown, ChevronUp, Landmark, ShieldCheck, Filter, Trash2, Download, Wrench, X } from 'lucide-react';
import { Sale, PaymentMethod, CompanyConfig, WebRepair, Product } from '../types';
import { formatMoney, currencyCodeOf } from '../lib/currency';
import { printSale } from '../lib/print';

interface HistorialesProps {
  sales: Sale[];
  paymentMethods: PaymentMethod[];
  companyConfig: CompanyConfig | null;
  onRefresh: () => void;
  repairs: WebRepair[];
  products?: Product[];
}

export default function Historiales({ sales, paymentMethods, companyConfig, onRefresh, repairs, products = [] }: HistorialesProps) {
  const cur = currencyCodeOf(companyConfig?.currency);
  const [tab, setTab] = useState<'ventas' | 'reparaciones'>(() => {
    const saved = localStorage.getItem('nexus_h_tab');
    return saved === 'reparaciones' ? 'reparaciones' : 'ventas';
  });
  const [search, setSearch] = useState('');
  const today = new Date().toLocaleDateString('sv-SE');
const escapeHtml = (v: any): string => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [methodFilter, setMethodFilter] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [hideCash, setHideCash] = useState(false);
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);

  // Repairs state
  const [repSearch, setRepSearch] = useState('');
  const [expandedRepairId, setExpandedRepairId] = useState<string | null>(null);

  useEffect(() => { localStorage.setItem('nexus_h_tab', tab); }, [tab]);

  const filtered = [...sales].filter(s => {
    const matchesSearch = s.id.toLowerCase().includes(search.toLowerCase()) ||
      s.clientName?.toLowerCase().includes(search.toLowerCase()) ||
      s.paymentMethod.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (methodFilter && s.paymentMethod !== methodFilter) return false;
    if (hideCash && s.paymentMethod.toLowerCase() === 'efectivo') return false;
    const saleDate = new Date(s.date);
    if (dateFrom && saleDate < new Date(dateFrom)) return false;
    if (dateTo) {
      const endDate = new Date(dateTo);
      endDate.setDate(endDate.getDate() + 1);
      if (saleDate >= endDate) return false;
    }
    return true;
  }).sort((a, b) => {
    const diff = new Date(a.date).getTime() - new Date(b.date).getTime();
    return sortOrder === 'asc' ? diff : -diff;
  });

  const totalRevenue = filtered.reduce((sum, s) => sum + s.total, 0);
  const costByProduct = new Map(products.map(p => [p.id, Number(p.cost) || 0]));
  const profitOf = (s: Sale) => (s.items || []).reduce((sum, it) => {
    const cost = costByProduct.has(it.productId) ? (costByProduct.get(it.productId) as number) : 0;
    return sum + ((Number(it.price) || 0) - cost) * (Number(it.quantity) || 0);
  }, 0);
  const totalProfit = filtered.reduce((sum, s) => sum + profitOf(s), 0);
  const rangeLabel = (dateFrom || dateTo)
    ? `${dateFrom ? dateFrom.split('-').reverse().join('/') : '…'} – ${dateTo ? dateTo.split('-').reverse().join('/') : '…'}`
    : 'todo el historial';
  const todayStr = new Date().toLocaleDateString('sv-SE');
  const todaySales = sales.filter(s => s.date.startsWith(todayStr));
  const byMethod = todaySales.reduce<Record<string, number>>((acc, s) => {
    acc[s.paymentMethod] = (acc[s.paymentMethod] || 0) + s.total;
    return acc;
  }, {});

  const toggleExpand = (id: string) => {
    setExpandedSaleId(prev => prev === id ? null : id);
  };

  const handleDeleteSale = async (saleId: string) => {
    if (!window.confirm(`¿Estás seguro de eliminar la venta ${saleId}?`)) return;
    try {
      const res = await fetch(`/api/sales/${saleId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al eliminar');
      onRefresh();
    } catch (err) {
      alert('Error al eliminar la venta');
    }
  };

  const handlePrintTicket = (sale: Sale) => {
    printSale(sale, true, companyConfig);
  };

  const handleFullScreen = (s: Sale) => {
    const w = window.open('', '_blank');
    if (!w) { alert('Permita popups para ver la venta en pantalla completa.'); return; }
    const c = companyConfig || {} as CompanyConfig;
    const name = c.companyName || 'NEXUS FULL';
    const addr = c.address || '';
    const phone = c.phone || '';
    const email = c.email || '';
    w.document.write(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Factura - ${s.id}</title>
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
    .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 1.5rem; }
    .details-section h3 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--primary); font-weight: 700; border-bottom: 2px solid var(--gray-100); padding-bottom: 0.5rem; margin-bottom: 0.75rem; }
    .detail-row { display: flex; padding: 0.35rem 0; border-bottom: 1px solid var(--gray-100); font-size: 0.85rem; }
    .detail-label { color: var(--gray-500); font-weight: 600; width: 120px; flex-shrink: 0; }
    .detail-value { color: var(--dark); font-weight: 500; }
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
    .stamp { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-15deg); font-size: 4rem; font-weight: 900; color: rgba(26, 35, 126, 0.06); text-transform: uppercase; pointer-events: none; white-space: nowrap; border: 4px solid rgba(26, 35, 126, 0.1); border-radius: 2rem; padding: 1rem 3rem; }
    .footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--gray-200); display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--gray-500); }
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
        <div class="order-number"># ${s.id}</div>
      </div>
    </div>

    <div class="details-grid">
      <div class="details-section">
        <h3>Datos del Cliente</h3>
        <div class="detail-row"><span class="detail-label">Nombre</span><span class="detail-value">${s.clientName || 'Cliente General'}</span></div>
        <div class="detail-row"><span class="detail-label">Fecha</span><span class="detail-value">${new Date(s.date).toLocaleString()}</span></div>
      </div>
      <div class="details-section">
        <h3>Información de Pago</h3>
        <div class="detail-row"><span class="detail-label">Método</span><span class="detail-value">${s.paymentMethod}</span></div>
        <div class="detail-row"><span class="detail-label">Recibido</span><span class="detail-value">${formatMoney(Number(s.cashReceived || s.total), cur)}</span></div>
        <div class="detail-row"><span class="detail-label">Cambio</span><span class="detail-value">${formatMoney(Number(s.change || 0), cur)}</span></div>
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
        ${s.items.map((it: any) => `
          <tr>
            <td>${escapeHtml(it.productName)}</td>
            <td>${it.quantity}</td>
            <td>${formatMoney(it.price * it.quantity, cur)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="total-box">
      <span class="label">Total a Pagar</span>
      <span class="amount">${formatMoney(s.total, cur)}</span>
    </div>

    <div class="stamp">PAGADO</div>

    <div class="footer">
      <span>Conserve esta factura como comprobante de pago.</span>
      <span>${new Date(s.date).toLocaleDateString()} &mdash; ${name}</span>
    </div>
  </div>
</body>
</html>
    `);
    w.document.close();
  };

  const delivered = repairs.filter(r => r.status === 'Entregada');
  const repFiltered = delivered.filter(r =>
    !repSearch ||
    r.code.toLowerCase().includes(repSearch.toLowerCase()) ||
    r.id.toLowerCase().includes(repSearch.toLowerCase()) ||
    r.clientName?.toLowerCase().includes(repSearch.toLowerCase()) ||
    r.equipment.toLowerCase().includes(repSearch.toLowerCase())
  ).sort((a, b) => {
    const aDate = a.updatedAt || a.date;
    const bDate = b.updatedAt || b.date;
    return bDate.localeCompare(aDate);
  });

  return (
    <div className="space-y-6">
      {/* Tab Toggle */}
      <div className="flex gap-2 border-b border-[#1f242e] pb-2">
        <button
          onClick={() => setTab('ventas')}
          className={`text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-t-lg transition-all ${tab === 'ventas' ? 'text-white bg-[#1b1f28] border border-b-0 border-[#2d3444]' : 'text-slate-400 hover:text-white'}`}
        >
          <FileText size={13} className="inline mr-1.5" />
          Ventas
        </button>
        <button
          onClick={() => setTab('reparaciones')}
          className={`text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-t-lg transition-all ${tab === 'reparaciones' ? 'text-white bg-[#1b1f28] border border-b-0 border-[#2d3444]' : 'text-slate-400 hover:text-white'}`}
        >
          <Wrench size={13} className="inline mr-1.5" />
          Reparaciones
        </button>
      </div>

      {tab === 'ventas' ? (
        <>
          {/* Banner / KPIs + Resumen por método */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-4 flex flex-col justify-between">
              <span className="text-[10px] tracking-widest text-slate-400 font-mono block uppercase">Ingresos Totales (Caja)</span>
              <div className="text-2xl font-extrabold font-display text-emerald-400 mt-1">
                {formatMoney(totalRevenue, cur)}
              </div>
              <span className="text-[10px] text-slate-500 font-mono mt-1">Suma acumulativa de transacciones</span>
            </div>

            <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-4 flex flex-col justify-between">
              <span className="text-[10px] tracking-widest text-slate-400 font-mono block uppercase">Ganancia aprox. ({rangeLabel})</span>
              <div className="text-2xl font-extrabold font-display text-cyan-400 mt-1">
                {formatMoney(totalProfit, cur)}
              </div>
              <span className="text-[10px] text-slate-500 font-mono mt-1">{totalRevenue > 0 ? `Margen ${(totalProfit / totalRevenue * 100).toFixed(1)}%` : 'Sin ingresos en el rango'}</span>
            </div>

            <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-4 flex flex-col justify-between">
              <span className="text-[10px] tracking-widest text-slate-400 font-mono block uppercase">Ventas Realizadas</span>
              <div className="text-2xl font-extrabold font-display text-white mt-1">
                {filtered.length}
              </div>
              <span className="text-[10px] text-slate-500 font-mono mt-1">Tickets de venta guardados</span>
            </div>

            {paymentMethods.filter(pm => byMethod[pm.name]).map(pm => (
              <div key={pm.id} className="bg-[#111318] border border-[#1f242e] rounded-xl p-4 flex flex-col justify-between">
                <span className="text-[10px] tracking-widest text-slate-400 font-mono block uppercase">{pm.name}</span>
                <div className="text-2xl font-extrabold font-display text-white mt-1">
                  {formatMoney(byMethod[pm.name], cur)}
                </div>
                <span className="text-[10px] text-slate-500 font-mono mt-1">{todayStr}</span>
              </div>
            ))}

            {Object.keys(byMethod).length === 0 && (
              <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-4 flex items-center justify-center text-slate-500 text-xs italic">Sin ventas hoy</div>
            )}
          </div>

          {/* Filters */}
          <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Calendar size={13} className="text-slate-500" />
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white font-mono focus:outline-none" title="Desde" />
                <span className="text-[10px] text-slate-500">â†’</span>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white font-mono focus:outline-none" title="Hasta" />
                <button onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')} className="flex items-center gap-1 bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-2.5 text-[11px] text-slate-400 hover:text-white font-mono transition-colors" title={sortOrder === 'asc' ? 'Más antiguos primero' : 'Más recientes primero'}>
                  <ChevronUp size={12} className={sortOrder === 'asc' ? 'text-white' : 'text-slate-500'} />
                  <ChevronDown size={12} className={sortOrder === 'desc' ? 'text-white' : 'text-slate-500'} />
                  <span className="ml-0.5">{sortOrder === 'asc' ? 'ASC' : 'DESC'}</span>
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <Filter size={12} className="text-slate-500" />
                <select value={methodFilter} onChange={e => setMethodFilter(e.target.value)} className="bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-2.5 text-[11px] text-white font-mono focus:outline-none">
                  <option value="">Todos los métodos</option>
                  {(paymentMethods.length > 0 ? paymentMethods : []).map(pm => <option key={pm.id} value={pm.name}>{pm.name}</option>)}
                </select>
              </div>
              <button onClick={() => setHideCash(!hideCash)} className={`flex items-center gap-1.5 rounded-lg py-1.5 px-2.5 text-[11px] font-mono transition-all ${hideCash ? 'bg-red-700 text-white border border-red-600' : 'bg-[#181a20] border border-[#2d3444] text-slate-400 hover:text-white'}`} title={hideCash ? 'Mostrar todas las ventas' : 'Ocultar ventas en efectivo'}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                {hideCash ? 'Mostrando solo otros' : 'Ocultar Efectivo'}
              </button>
              {(dateFrom || dateTo || methodFilter || hideCash) && (
                <button onClick={() => { setDateFrom(''); setDateTo(''); setMethodFilter(''); setHideCash(false); }} className="text-[10px] text-slate-400 hover:text-white font-mono px-2 py-1 rounded border border-[#2d3444] hover:bg-[#1a1d24] transition-all">
                  Limpiar filtros
                </button>
              )}
              <div className="relative ml-auto">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500"><Search size={14} /></span>
                <input type="text" className="bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:outline-none w-56" placeholder="Buscar por ID, Cliente o Método..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <a href={`/api/sales/export?from=${dateFrom}&to=${dateTo}&method=${encodeURIComponent(methodFilter)}&q=${encodeURIComponent(search)}${hideCash ? '&hideCash=1' : ''}&sort=${sortOrder}`} className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg py-1.5 px-3 text-xs font-semibold transition-colors" title="Exportar lo filtrado a Excel (CSV)">
                <Download size={13} /> Exportar
              </a>
            </div>
          </div>

          {/* Today's Sales (diseño Reparaciones) */}
          {(() => {
            const todaySalesFiltered = filtered.filter(s => s.date.startsWith(todayStr));
            const earlierSales = filtered.filter(s => !s.date.startsWith(todayStr));
            return (<>
              {todaySalesFiltered.length > 0 && (
                <div className="bg-[#111318] border border-[#1f242e] rounded-xl overflow-hidden">
                  <div className="px-5 pt-4 pb-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5"><FileText size={14} /> Facturas de Hoy</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[#181a20] text-[10px] tracking-wider text-slate-400 font-mono uppercase font-bold text-left">
                          <th className="px-4 py-2.5">Ticket</th>
                          <th className="px-4 py-2.5">Fecha y Hora</th>
                          <th className="px-4 py-2.5">Cliente</th>
                          <th className="px-4 py-2.5">Método</th>
                           <th className="px-4 py-2.5 text-right">Total</th>
                           <th className="px-4 py-2.5 text-right">Ganancia</th>
                           <th className="px-4 py-2.5 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {todaySalesFiltered.map(s => (
                          <tr key={s.id} className="border-t border-[#1b1e26] hover:bg-[#14171e] transition-colors cursor-pointer" onDoubleClick={() => toggleExpand(s.id)}>
                            <td className="px-4 py-2.5 font-semibold text-white font-mono">{s.id}</td>
                            <td className="px-4 py-2.5 text-slate-400 font-mono">{new Date(s.date).toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-slate-300 truncate max-w-[160px]">{s.clientName || 'General'}</td>
                            <td className="px-4 py-2.5"><span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold border bg-slate-700/20 text-slate-300 border-slate-600/30">{s.paymentMethod}</span></td>
                            <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-400">{formatMoney(s.total, cur)}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-cyan-300">{formatMoney(profitOf(s), cur)}</td>
                            <td className="px-4 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={e => { e.stopPropagation(); handlePrintTicket(s); }} className="text-slate-500 hover:text-white transition-colors p-1.5 rounded hover:bg-[#1f242e]" title="Reimprimir ticket"><Printer size={12} /></button>
                                <button onClick={e => { e.stopPropagation(); handleFullScreen(s); }} className="text-slate-500 hover:text-white transition-colors p-1.5 rounded hover:bg-[#1f242e]" title="Ver en pantalla completa"><FileText size={12} /></button>
                                <button onClick={e => { e.stopPropagation(); handleDeleteSale(s.id); }} className="text-slate-500 hover:text-red-400 transition-colors p-1.5 rounded hover:bg-[#1f242e]" title="Eliminar"><Trash2 size={12} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {earlierSales.length > 0 && (
                <div className="bg-[#111318] border border-[#1f242e] rounded-xl overflow-hidden">
                  <div className="px-5 pt-4 pb-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5"><Calendar size={14} /> Facturas Anteriores</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[#181a20] text-[10px] tracking-wider text-slate-400 font-mono uppercase font-bold text-left">
                          <th className="px-4 py-2.5">Ticket</th>
                          <th className="px-4 py-2.5">Fecha y Hora</th>
                          <th className="px-4 py-2.5">Cliente</th>
                          <th className="px-4 py-2.5">Método</th>
                           <th className="px-4 py-2.5 text-right">Total</th>
                           <th className="px-4 py-2.5 text-right">Ganancia</th>
                           <th className="px-4 py-2.5 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {earlierSales.map(s => (
                          <tr key={s.id} className="border-t border-[#1b1e26] hover:bg-[#14171e] transition-colors cursor-pointer" onDoubleClick={() => toggleExpand(s.id)}>
                            <td className="px-4 py-2.5 font-semibold text-white font-mono">{s.id}</td>
                            <td className="px-4 py-2.5 text-slate-400 font-mono">{new Date(s.date).toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-slate-300 truncate max-w-[160px]">{s.clientName || 'General'}</td>
                            <td className="px-4 py-2.5"><span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold border bg-slate-700/20 text-slate-300 border-slate-600/30">{s.paymentMethod}</span></td>
                            <td className="px-4 py-2.5 text-right font-mono font-bold text-cyan-400">{formatMoney(s.total, cur)}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-cyan-300">{formatMoney(profitOf(s), cur)}</td>
                            <td className="px-4 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={e => { e.stopPropagation(); handlePrintTicket(s); }} className="text-slate-500 hover:text-white transition-colors p-1.5 rounded hover:bg-[#1f242e]" title="Reimprimir ticket"><Printer size={12} /></button>
                                <button onClick={e => { e.stopPropagation(); handleFullScreen(s); }} className="text-slate-500 hover:text-white transition-colors p-1.5 rounded hover:bg-[#1f242e]" title="Ver en pantalla completa"><FileText size={12} /></button>
                                <button onClick={e => { e.stopPropagation(); handleDeleteSale(s.id); }} className="text-slate-500 hover:text-red-400 transition-colors p-1.5 rounded hover:bg-[#1f242e]" title="Eliminar"><Trash2 size={12} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {todaySalesFiltered.length === 0 && earlierSales.length === 0 && (
                <div className="bg-[#111318] border border-[#1f242e] rounded-xl overflow-hidden">
                  <div className="p-12 text-slate-500 italic text-center text-xs">No hay ventas registradas que coincidan con la búsqueda.</div>
                </div>
              )}
            </>);
          })()}

          {/* Expandable detail modal (same toggle, rendered outside tables for simplicity) */}
          {expandedSaleId && (() => {
            const s = filtered.find(x => x.id === expandedSaleId);
            if (!s) return null;
            return (
              <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setExpandedSaleId(null)}>
                <div className="bg-[#111318] border border-[#2d3444] rounded-xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
                  <div className="flex justify-between items-center border-b border-[#2d3444] pb-3 mb-4">
                    <span className="font-semibold text-white font-display text-sm">Factura {s.id}</span>
                    <button onClick={() => setExpandedSaleId(null)} className="text-slate-400 hover:text-white transition-colors"><X size={16} /></button>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>{new Date(s.date).toLocaleString()}</span>
                      <span className="text-white font-semibold">{s.clientName || 'Cliente General'}</span>
                    </div>
                    <div className="bg-[#0d0e12] border border-[#1f242e] rounded-lg overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-[#181a20] text-[10px] tracking-wider text-slate-400 font-mono uppercase font-bold text-left">
                            <th className="px-3 py-2">Producto</th>
                            <th className="px-3 py-2 text-center">Cant</th>
                            <th className="px-3 py-2 text-right">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.items.map((it, i) => (
                            <tr key={i} className="border-t border-[#1b1e26]">
                              <td className="px-3 py-2 text-slate-300">{it.productName}</td>
                              <td className="px-3 py-2 text-center text-slate-400">{it.quantity}</td>
                              <td className="px-3 py-2 text-right text-white font-semibold">{formatMoney(it.price * it.quantity, cur)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex justify-between items-center bg-[#181a20] border border-[#2d3444] rounded-lg px-4 py-3">
                      <span className="text-xs text-slate-400 font-mono uppercase">Total</span>
                      <span className="text-lg font-bold text-emerald-400">{formatMoney(s.total, cur)}</span>
                    </div>
                    <div className="flex justify-between items-center px-4 py-1">
                      <span className="text-[11px] text-slate-500 font-mono uppercase">Ganancia aprox.</span>
                      <span className="text-sm font-bold text-cyan-300">{formatMoney(profitOf(s), cur)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-[11px] text-slate-400 font-mono">
                      <div><span className="text-slate-500">Método:</span> {s.paymentMethod}</div>
                      <div className="text-right"><span className="text-slate-500">Recibido:</span> {formatMoney(Number(s.cashReceived || s.total), cur)}</div>
                      <div><span className="text-slate-500">Cambio:</span> {formatMoney(Number(s.change || 0), cur)}</div>
                      <div className="text-right"><span className="text-slate-500">ID:</span> {s.id}</div>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button onClick={() => { handlePrintTicket(s); setExpandedSaleId(null); }} className="flex-1 bg-red-700 hover:bg-red-600 text-white font-bold py-2 px-3 rounded-lg text-xs transition-all flex items-center justify-center gap-1.5"><Printer size={13} /> Reimprimir</button>
                      <button onClick={() => { handleFullScreen(s); setExpandedSaleId(null); }} className="flex-1 bg-[#1c222d] hover:bg-[#252e3d] text-slate-300 border border-[#2d3444] font-bold py-2 px-3 rounded-lg text-xs transition-all flex items-center justify-center gap-1.5"><FileText size={13} /> Pantalla Completa</button>
                      <button onClick={() => { handleDeleteSale(s.id); setExpandedSaleId(null); }} className="flex-shrink-0 bg-red-900/30 hover:bg-red-800/50 text-red-400 border border-red-800/40 font-bold py-2 px-3 rounded-lg text-xs transition-all flex items-center justify-center gap-1.5"><Trash2 size={13} /></button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      ) : (
        <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">Historial de Reparaciones</h2>
              <p className="text-[11px] text-slate-500">Ã“rdenes de reparación finalizadas</p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-56">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Search size={14} />
                </span>
                <input
                  type="text"
                  className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:outline-none"
                  placeholder="Buscar por clave, cliente o equipo..."
                  value={repSearch}
                  onChange={(e) => setRepSearch(e.target.value)}
                />
              </div>
              <a href={`/api/repairs/export?q=${encodeURIComponent(repSearch)}`} className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg py-1.5 px-3 text-xs font-semibold transition-colors shrink-0" title="Exportar lo filtrado a Excel (CSV)">
                <Download size={13} /> Exportar
              </a>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-[#1b1e26] bg-[#0d0e12]">
            {repFiltered.length === 0 ? (
              <div className="p-12 text-slate-500 italic text-center text-xs">
                No hay reparaciones entregadas que coincidan con la búsqueda.
              </div>
            ) : (
              <div className="divide-y divide-[#1b1e26]">
                <div className="grid grid-cols-12 bg-[#181a20] px-4 py-3 text-[10px] tracking-wider text-slate-400 font-mono uppercase font-bold text-left">
                  <div className="col-span-2">CLAVE</div>
                  <div className="col-span-3">FECHA</div>
                  <div className="col-span-3">CLIENTE / EQUIPO</div>
                  <div className="col-span-2 text-center">ESTADO</div>
                  <div className="col-span-2 text-right">PRECIO</div>
                </div>

                {repFiltered.map(r => {
                  const isExpanded = expandedRepairId === r.id;
                  return (
                    <div key={r.id} className="transition-all">
                      <button
                        onClick={() => setExpandedRepairId(isExpanded ? null : r.id)}
                        className="w-full grid grid-cols-12 px-4 py-3 text-xs text-left text-slate-300 hover:bg-[#14171e] items-center transition-colors"
                      >
                        <div className="col-span-2 font-mono font-bold text-white flex items-center gap-1.5">
                          <Wrench size={12} className="text-slate-500" />
                          {r.code}
                        </div>
                        <div className="col-span-3 font-mono text-slate-400">
                          {new Date(r.updatedAt || r.date).toLocaleDateString()}
                        </div>
                        <div className="col-span-3 truncate">
                          <span className="text-white font-medium">{r.clientName}</span>
                          <span className="text-slate-500 ml-1">- {r.equipment}</span>
                        </div>
                        <div className="col-span-2 text-center">
                          <span className="font-mono bg-emerald-900/30 border border-emerald-700/40 text-emerald-400 rounded px-1.5 py-0.5 text-[9px] uppercase">
                            {r.status}
                          </span>
                        </div>
                        <div className="col-span-2 text-right font-mono font-bold text-[#A63A42] flex items-center justify-end gap-2">
                          {formatMoney(Number(r.price), cur)}
                          {isExpanded ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="bg-[#151820] border-t border-b border-[#2d3444] px-6 py-4 space-y-3">
                          <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                            <div>
                              <span className="text-slate-500 block text-[10px] uppercase tracking-wider">Orden</span>
                              <span className="text-white">{r.id}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[10px] uppercase tracking-wider">Clave</span>
                              <span className="text-white font-bold">{r.code}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[10px] uppercase tracking-wider">Cliente</span>
                              <span className="text-white">{r.clientName || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[10px] uppercase tracking-wider">Teléfono</span>
                              <span className="text-white">{r.clientPhone || '-'}</span>
                            </div>
                            <div className="col-span-2">
                              <span className="text-slate-500 block text-[10px] uppercase tracking-wider">Equipo</span>
                              <span className="text-white">{r.equipment}{r.marca ? ` (${r.marca})` : ''}{r.modelo ? ` - ${r.modelo}` : ''}</span>
                            </div>
                            <div className="col-span-2">
                              <span className="text-slate-500 block text-[10px] uppercase tracking-wider">Problema</span>
                              <span className="text-white">{r.problem}</span>
                            </div>
                            {r.notes && (
                              <div className="col-span-2">
                                <span className="text-slate-500 block text-[10px] uppercase tracking-wider">Notas</span>
                                <span className="text-white">{r.notes}</span>
                              </div>
                            )}
                            <div>
                              <span className="text-slate-500 block text-[10px] uppercase tracking-wider">Fecha Ingreso</span>
                              <span className="text-white">{r.date}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[10px] uppercase tracking-wider">Ãšltima Actualización</span>
                              <span className="text-white">{r.updatedAt ? new Date(r.updatedAt).toLocaleString() : '-'}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[10px] uppercase tracking-wider">Precio</span>
                              <span className="text-emerald-400 font-bold">{formatMoney(Number(r.price), cur)}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[10px] uppercase tracking-wider">Estado</span>
                              <span className="font-mono bg-emerald-900/30 border border-emerald-700/40 text-emerald-400 rounded px-1.5 py-0.5 text-[9px] uppercase">{r.status}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
