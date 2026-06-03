import React, { useState } from 'react';
import { Calendar, Search, Printer, FileText, ChevronDown, ChevronUp, Landmark, ShieldCheck, Filter, Trash2, Download } from 'lucide-react';
import { Sale, PaymentMethod, CompanyConfig } from '../types';
import ticketTemplate from '../ticketTemplate';

interface HistorialesProps {
  sales: Sale[];
  paymentMethods: PaymentMethod[];
  companyConfig: CompanyConfig | null;
  onRefresh: () => void;
}

export default function Historiales({ sales, paymentMethods, companyConfig, onRefresh }: HistorialesProps) {
  const [search, setSearch] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [methodFilter, setMethodFilter] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);

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

  return (
    <div className="space-y-6">
      {/* Banner / KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-5 flex flex-col justify-between">
          <span className="text-[10px] tracking-widest text-slate-400 font-mono block uppercase">Ingresos Totales (Caja)</span>
          <div className="text-3xl font-extrabold font-display text-emerald-400 mt-2">
            ${totalRevenue.toFixed(0)}
          </div>
          <span className="text-[10px] text-slate-500 font-mono mt-1">Suma acumulativa de transacciones</span>
        </div>

        <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-5 flex flex-col justify-between">
          <span className="text-[10px] tracking-widest text-slate-400 font-mono block uppercase">Ventas Realizadas</span>
          <div className="text-3xl font-extrabold font-display text-white mt-2">
            {filtered.length}
          </div>
          <span className="text-[10px] text-slate-500 font-mono mt-1">Tickets de venta guardados en base local</span>
        </div>
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
                <div className="col-span-2 text-center">NÉTODO</div>
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
    </div>
  );
}
