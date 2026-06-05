import React, { useState, useEffect } from 'react';
import { Calendar, Search, Printer, FileText, ChevronDown, ChevronUp, Landmark, ShieldCheck, Filter, Trash2, Download, Wrench } from 'lucide-react';
import { Sale, PaymentMethod, CompanyConfig, WebRepair } from '../types';
import ticketTemplate from '../ticketTemplate';

interface HistorialesProps {
  sales: Sale[];
  paymentMethods: PaymentMethod[];
  companyConfig: CompanyConfig | null;
  onRefresh: () => void;
  repairs: WebRepair[];
}

export default function Historiales({ sales, paymentMethods, companyConfig, onRefresh, repairs }: HistorialesProps) {
  const [tab, setTab] = useState<'ventas' | 'reparaciones'>(() => {
    const saved = localStorage.getItem('nexus_h_tab');
    return saved === 'reparaciones' ? 'reparaciones' : 'ventas';
  });
  const [search, setSearch] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [methodFilter, setMethodFilter] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
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
  const todayStr = new Date().toISOString().slice(0, 10);
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
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Por favor permita las ventanas emergentes para imprimir el ticket.');
      return;
    }
    printWindow.document.write(ticketTemplate(sale, true, companyConfig || undefined));
    printWindow.document.close();
  };

  const handleFullScreen = (s: Sale) => {
    const w = window.open('', '_blank');
    if (!w) { alert('Permita popups para ver la venta en pantalla completa.'); return; }
    const c = companyConfig || {} as CompanyConfig;
    const itemsHtml = s.items.map(it => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #1f242e;color:#e2e8f0">${it.productName}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #1f242e;color:#94a3b8;text-align:center">${it.quantity}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #1f242e;color:#fbbf24;text-align:right;font-weight:bold">$${(it.price * it.quantity).toFixed(0)}</td>
      </tr>
    `).join('');
    w.document.write(`
<html><head><title>Venta ${s.id}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#0d0e12;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;display:flex;justify-content:center;padding:40px 20px;min-height:100vh}
  .receipt{background:#111318;border:1px solid #1f242e;border-radius:12px;padding:32px;max-width:520px;width:100%}
  .header{text-align:center;border-bottom:2px solid #1f242e;padding-bottom:16px;margin-bottom:16px}
  .header h1{font-size:20px;font-weight:700;color:#f1f5f9}
  .header p{font-size:11px;color:#64748b;margin-top:4px}
  .meta{display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;margin-bottom:12px;padding-bottom:8px;border-bottom:1px dashed #1f242e}
  .client{font-size:12px;color:#e2e8f0;margin-bottom:12px;padding-bottom:8px;border-bottom:1px dashed #1f242e}
  table{width:100%;border-collapse:collapse;margin:8px 0}
  th{font-size:10px;text-transform:uppercase;color:#64748b;padding:6px 8px;border-bottom:2px solid #1f242e;text-align:left;letter-spacing:0.5px}
  th:last-child{text-align:right}
  th:nth-child(2){text-align:center}
  .total-box{background:#181a20;border:1px solid #2d3444;border-radius:8px;padding:12px 16px;margin:12px 0}
  .total-row{display:flex;justify-content:space-between;font-size:18px;font-weight:700;color:#fbbf24}
  .pay-row{display:flex;justify-content:space-between;font-size:12px;color:#94a3b8;margin:4px 0}
  .footer{text-align:center;padding-top:16px;border-top:1px solid #1f242e;margin-top:16px;font-size:11px;color:#475569}
  .footer .thanks{font-size:14px;color:#fbbf24;font-weight:600;margin-bottom:4px}
</style></head><body>
<div class="receipt">
  <div class="header">
    <h1>${c.companyName || 'NEXUS POS'}</h1>
    ${c.address ? '<p>'+c.address+(c.phone?' · '+c.phone:'')+'</p>' : ''}
  </div>
  <div class="meta">
    <span><strong style="color:#e2e8f0">Venta:</strong> ${s.id}</span>
    <span>${new Date(s.date).toLocaleString('es-AR',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</span>
  </div>
  <div class="client"><strong style="color:#e2e8f0">Cliente:</strong> ${s.clientName || 'Cliente General'}</div>
  <table><thead><tr><th>Producto</th><th style="text-align:center">Cant</th><th style="text-align:right">Total</th></tr></thead><tbody>${itemsHtml}</tbody></table>
  <div class="total-box">
    <div class="total-row"><span>TOTAL A PAGAR</span><span>$${s.total.toFixed(0)}</span></div>
  </div>
  <div class="pay-row"><span>Método de pago</span><span><strong style="color:#e2e8f0">${s.paymentMethod}</strong></span></div>
  <div class="pay-row"><span>Recibido</span><span>$${Number(s.cashReceived || s.total).toFixed(0)}</span></div>
  <div class="pay-row"><span>Cambio</span><span style="color:#fbbf24">$${Number(s.change || 0).toFixed(0)}</span></div>
  <div class="footer"><div class="thanks">✦ Gracias por su compra ✦</div><div>${c.companyName || 'NEXUS POS'} · ${new Date().getFullYear()}</div></div>
</div></body></html>
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
                ${totalRevenue.toFixed(0)}
              </div>
              <span className="text-[10px] text-slate-500 font-mono mt-1">Suma acumulativa de transacciones</span>
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
                  ${byMethod[pm.name].toFixed(0)}
                </div>
                <span className="text-[10px] text-slate-500 font-mono mt-1">{todayStr}</span>
              </div>
            ))}

            {Object.keys(byMethod).length === 0 && (
              <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-4 flex items-center justify-center text-slate-500 text-xs italic">Sin ventas hoy</div>
            )}
          </div>

          {/* Main Table */}
          <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-white">Historial de Ventas</h2>
                <p className="text-[11px] text-slate-500">Listado interactivo de auditoría de transacciones salientes</p>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href="/api/sales/export"
                  className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg py-1.5 px-3 text-xs font-semibold transition-colors"
                  title="Exportar ventas a Excel (CSV)"
                >
                  <Download size={13} />
                  Exportar
                </a>
                <div className="relative w-full sm:w-56">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <Search size={14} />
                  </span>
                  <input
                    type="text"
                    className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:outline-none"
                    placeholder="Buscar por ID, Cliente o Método de Pago..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Filters row */}
            <div className="flex flex-wrap items-center gap-3 pb-2">
              <div className="flex items-center gap-2">
                <Calendar size={13} className="text-slate-500" />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white font-mono focus:outline-none"
                  title="Desde"
                />
                <span className="text-[10px] text-slate-500">→</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white font-mono focus:outline-none"
                  title="Hasta"
                />
                <button
                  onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                  className="flex items-center gap-1 bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-2.5 text-[11px] text-slate-400 hover:text-white font-mono focus:outline-none transition-colors"
                  title={sortOrder === 'asc' ? 'Más antiguos primero' : 'Más recientes primero'}
                >
                  <ChevronUp size={12} className={sortOrder === 'asc' ? 'text-white' : 'text-slate-500'} />
                  <ChevronDown size={12} className={sortOrder === 'desc' ? 'text-white' : 'text-slate-500'} />
                  <span className="ml-0.5">{sortOrder === 'asc' ? 'ASC' : 'DESC'}</span>
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <Filter size={12} className="text-slate-500" />
                <select
                  value={methodFilter}
                  onChange={(e) => setMethodFilter(e.target.value)}
                  className="bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-2.5 text-[11px] text-white font-mono focus:outline-none"
                >
                  <option value="">Todos los métodos</option>
                  {(paymentMethods.length > 0 ? paymentMethods : []).map(pm => (
                    <option key={pm.id} value={pm.name}>{pm.name}</option>
                  ))}
                </select>
              </div>
              {(dateFrom || dateTo || methodFilter) && (
                <button
                  onClick={() => { setDateFrom(''); setDateTo(''); setMethodFilter(''); }}
                  className="text-[10px] text-slate-400 hover:text-white font-mono px-2 py-1 rounded border border-[#2d3444] hover:bg-[#1a1d24] transition-all"
                >
                  Limpiar filtros
                </button>
              )}
            </div>

            {/* Master table list */}
            <div className="overflow-hidden rounded-lg border border-[#1b1e26] bg-[#0d0e12]">
              {filtered.length === 0 ? (
                <div className="p-12 text-slate-500 italic text-center text-xs">
                  No hay ventas registradas que coincidan con la búsqueda.
                </div>
              ) : (
                <div className="divide-y divide-[#1b1e26]">
                  {/* Header row mock */}
                  <div className="grid grid-cols-12 bg-[#181a20] px-4 py-3 text-[10px] tracking-wider text-slate-400 font-mono uppercase font-bold text-left">
                    <div className="col-span-2">CÓDIGO TICKET</div>
                    <div className="col-span-3">FECHA Y HORA</div>
                    <div className="col-span-3">CLIENTE</div>
                    <div className="col-span-2 text-center">MÉTODO</div>
                    <div className="col-span-2 text-right">TOTAL</div>
                  </div>

                  {filtered.map(s => {
                    const isExpanded = expandedSaleId === s.id;
                    return (
                      <div key={s.id} className="transition-all">
                        {/* Collapsible main row info */}
                        <button
                          onClick={() => toggleExpand(s.id)}
                          className="w-full grid grid-cols-12 px-4 py-3 text-xs text-left text-slate-300 hover:bg-[#14171e] items-center transition-colors"
                        >
                          <div className="col-span-2 font-mono font-bold text-white flex items-center gap-1.5">
                            <FileText size={12} className="text-slate-500" />
                            {s.id}
                          </div>
                          <div className="col-span-3 font-mono text-slate-400">
                            {new Date(s.date).toLocaleString()}
                          </div>
                          <div className="col-span-3 font-medium truncate text-white">
                            {s.clientName}
                          </div>
                          <div className="col-span-2 text-center">
                            <span className="font-mono bg-[#1a1d24] border border-[#2d3444] rounded px-1.5 py-0.5 text-[9px] uppercase">
                              {s.paymentMethod}
                            </span>
                          </div>
                          <div className="col-span-2 text-right font-mono font-bold text-[#5aa6ec] flex items-center justify-end gap-2">
                            ${s.total.toFixed(0)}
                            {isExpanded ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                          </div>
                        </button>

                        {/* Detailed block */}
                        {isExpanded && (
                          <div className="bg-[#151820] border-t border-b border-[#2d3444] px-6 py-4 space-y-3">
                            <div className="flex justify-between items-center">
                              <h4 className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono">Artículos Comprados:</h4>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleDeleteSale(s.id)}
                                  className="bg-red-900/30 hover:bg-red-800/50 text-red-400 border border-red-800/40 rounded px-2.5 py-1 text-[10px] flex items-center gap-1.5 transition-all font-semibold"
                                >
                                  <Trash2 size={12} />
                                  Eliminar
                                </button>
                                <button
                                  onClick={() => handleFullScreen(s)}
                                  className="bg-[#1c222d] hover:bg-[#252e3d] text-slate-300 border border-[#2d3444] rounded px-2.5 py-1 text-[10px] flex items-center gap-1.5 transition-all font-semibold"
                                >
                                  <FileText size={12} />
                                  Pantalla Completa
                                </button>
                                <button
                                  onClick={() => handlePrintTicket(s)}
                                  className="bg-[#1c222d] hover:bg-[#252e3d] text-slate-300 border border-[#2d3444] rounded px-2.5 py-1 text-[10px] flex items-center gap-1.5 transition-all font-semibold"
                                >
                                  <Printer size={12} />
                                  Reimprimir Ticket
                                </button>
                              </div>
                            </div>

                            {/* List of products inside sale */}
                            <div className="space-y-1.5">
                              {s.items.map((it, index) => (
                                <div key={index} className="flex justify-between text-xs font-mono py-1 border-b border-[#1f242e] last:border-0">
                                  <span className="text-slate-300">{it.productName} <span className="text-slate-500">x{it.quantity}</span></span>
                                  <span className="text-[#5aa6ec] font-semibold">${(it.price * it.quantity).toFixed(0)}</span>
                                </div>
                              ))}
                            </div>

                            {/* Payment metadata */}
                            <div className="grid grid-cols-2 gap-4 text-[10px] text-slate-400 font-mono pt-2 border-t border-[#1f242e]/50">
                              <div>
                                <span>Metodo Pago: {s.paymentMethod}</span><br/>
                                <span>Recibido: ${Number(s.cashReceived || s.total).toFixed(0)}</span><br/>
                                <span>Cambio: ${Number(s.change || 0).toFixed(0)}</span>
                              </div>
                              <div className="text-right">
                                <span>Sincronizado Localmente: Sí</span><br/>
                                <span>ID de Venta: {s.id}</span>
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
        </>
      ) : (
        <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">Historial de Reparaciones</h2>
              <p className="text-[11px] text-slate-500">Órdenes de reparación finalizadas</p>
            </div>
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
                        <div className="col-span-2 text-right font-mono font-bold text-[#5aa6ec] flex items-center justify-end gap-2">
                          ${Number(r.price).toFixed(0)}
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
                              <span className="text-slate-500 block text-[10px] uppercase tracking-wider">Última Actualización</span>
                              <span className="text-white">{r.updatedAt ? new Date(r.updatedAt).toLocaleString() : '-'}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[10px] uppercase tracking-wider">Precio</span>
                              <span className="text-emerald-400 font-bold">${Number(r.price).toFixed(0)}</span>
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
