import React, { useState, useEffect, useRef } from 'react';
import { BarChart3, TrendingUp, TrendingDown, RefreshCw, Database, Download } from 'lucide-react';

interface MonthlyStat {
  year: number;
  month: number;
  sales_count: number;
  cash_amount: number;
}

export default function Estadisticas() {
  const [stats, setStats] = useState<MonthlyStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<'ventas' | 'caja'>(() => {
    const saved = localStorage.getItem('nexus_e_tab');
    return saved === 'caja' ? 'caja' : 'ventas';
  });
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
  const [chartYear, setChartYear] = useState<number>(2026);
  const [editingCell, setEditingCell] = useState<{ year: number; month: number } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showAddYear, setShowAddYear] = useState(false);
  const [newYear, setNewYear] = useState('');
  const seeded = useRef(false);

  useEffect(() => { localStorage.setItem('nexus_e_tab', selectedTab); }, [selectedTab]);

  const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  const loadStats = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/stats');
      if (r.ok) {
        const data: MonthlyStat[] = await r.json();
        setStats(data);
        if (data.length === 0 && !seeded.current) {
          seeded.current = true;
          await fetch('/api/stats/seed', { method: 'POST' });
          const r2 = await fetch('/api/stats');
          if (r2.ok) {
            const data2: MonthlyStat[] = await r2.json();
            setStats(data2);
            if (data2.length > 0) {
              const maxYear = Math.max(...data2.map(d => d.year));
              setSelectedYear(maxYear);
              setChartYear(maxYear);
            }
          }
        } else if (data.length > 0) {
          const maxYear = Math.max(...data.map(d => d.year));
          setSelectedYear(maxYear);
          setChartYear(maxYear);
        }
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadStats(); }, []);

  const handleSeed = async () => {
    setMessage(null);
    try {
      const r = await fetch('/api/stats/seed', { method: 'POST' });
      const d = await r.json();
      setMessage({ type: d.success ? 'success' : 'error', text: d.message || d.error });
      if (d.success) loadStats();
    } catch {
      setMessage({ type: 'error', text: 'Error de conexión' });
    }
  };

  const handleSyncSales = async () => {
    setMessage(null);
    try {
      const r = await fetch('/api/stats/sync-sales', { method: 'POST' });
      const d = await r.json();
      setMessage({ type: d.success ? 'success' : 'error', text: d.message || d.error });
      if (d.success) loadStats();
    } catch {
      setMessage({ type: 'error', text: 'Error de conexión' });
    }
  };

  const handleCellSave = async (year: number, month: number, field: 'sales_count' | 'cash_amount', value: string) => {
    const num = parseInt(value.replace(/\./g, ''));
    if (isNaN(num)) return;
    try {
      await fetch('/api/stats/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month, field, value: num })
      });
      setEditingCell(null);
      loadStats();
    } catch {}
  };

  const handleAddYear = async () => {
    const y = parseInt(newYear);
    if (isNaN(y) || y < 1900 || y > 2100) { alert('Ingrese un año válido (1900-2100)'); return; }
    try {
      const r = await fetch('/api/stats/add-year', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: y })
      });
      const d = await r.json();
      if (d.success) {
        setShowAddYear(false);
        setNewYear('');
        setSelectedYear(y);
        setChartYear(y);
        loadStats();
      } else { alert(d.error || 'Error'); }
    } catch { alert('Error de conexión'); }
  };

  const years = Array.from(new Set(stats.map(s => s.year))).sort((a: number, b: number) => b - a);
  const currentData = stats.filter(s => s.year === selectedYear).sort((a, b) => a.month - b.month);
  const chartData = stats.filter(s => s.year === chartYear).sort((a, b) => a.month - b.month);

  const getMaxValue = (data: MonthlyStat[], field: 'sales_count' | 'cash_amount') =>
    Math.max(...data.map(d => d[field]), 1);

  const getHeatColor = (val: number, max: number) => {
    if (max === 0) return 'bg-transparent';
    const ratio = val / max;
    if (selectedTab === 'ventas') {
      if (ratio > 0.9) return 'bg-emerald-900/50 text-emerald-300';
      if (ratio > 0.7) return 'bg-emerald-800/30 text-emerald-400';
      if (ratio > 0.5) return 'bg-emerald-700/20 text-emerald-400';
      if (ratio > 0.3) return 'bg-emerald-600/10 text-slate-300';
      return 'text-slate-400';
    } else {
      if (ratio > 0.9) return 'bg-blue-900/50 text-blue-300';
      if (ratio > 0.7) return 'bg-blue-800/30 text-blue-400';
      if (ratio > 0.5) return 'bg-blue-700/20 text-blue-400';
      if (ratio > 0.3) return 'bg-blue-600/10 text-slate-300';
      return 'text-slate-400';
    }
  };

  const getMonthlyTotal = (data: MonthlyStat[], field: 'sales_count' | 'cash_amount') =>
    data.reduce((sum, d) => sum + d[field], 0);

  const formatNumber = (n: number) => n.toLocaleString('es-AR');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
            <BarChart3 size={16} className="text-[#5aa6ec]" />
            Estadísticas de Ventas
          </h2>
          <p className="text-[11px] text-slate-500">Historial mensual de ventas y caja</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleSyncSales} className="flex items-center gap-1.5 bg-[#2d3444] hover:bg-[#3a4155] text-white rounded-lg py-1.5 px-3 text-[10px] font-semibold transition-colors">
            <RefreshCw size={12} /> Sync Ventas
          </button>
          <button onClick={handleSeed} className="flex items-center gap-1.5 bg-[#2d3444] hover:bg-[#3a4155] text-white rounded-lg py-1.5 px-3 text-[10px] font-semibold transition-colors">
            <Database size={12} /> Cargar Iniciales
          </button>
          <button onClick={loadStats} className="flex items-center gap-1.5 bg-[#1b1f28] hover:bg-[#252e3d] text-slate-400 rounded-lg py-1.5 px-3 text-[10px] font-semibold transition-colors">
            <RefreshCw size={12} /> Refrescar
          </button>
        </div>
      </div>

      {message && (
        <div className={`flex items-center gap-2 p-3 rounded-lg text-xs font-semibold ${
          message.type === 'success' ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800/40' : 'bg-red-900/30 text-red-400 border border-red-800/40'
        }`}>
          {message.text}
        </div>
      )}

      {/* Tabs: Ventas / Caja */}
      <div className="flex gap-1 bg-[#0d0e12] rounded-lg p-1 border border-[#1f242e] w-fit">
        <button onClick={() => setSelectedTab('ventas')} className={`py-1.5 px-4 rounded-md text-xs font-semibold transition-all ${selectedTab === 'ventas' ? 'bg-[#5aa6ec] text-slate-900' : 'text-slate-400 hover:text-white'}`}>
          Ventas
        </button>
        <button onClick={() => setSelectedTab('caja')} className={`py-1.5 px-4 rounded-md text-xs font-semibold transition-all ${selectedTab === 'caja' ? 'bg-[#5aa6ec] text-slate-900' : 'text-slate-400 hover:text-white'}`}>
          Caja ($)
        </button>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-500 text-xs">Cargando estadísticas...</div>
      ) : stats.length === 0 ? (
        <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-8 text-center">
          <Database size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">No hay datos estadísticos aún.</p>
          <p className="text-slate-500 text-xs mt-1">Haz clic en "Cargar Iniciales" para importar los datos históricos o "Sync Ventas" para calcular desde las ventas registradas.</p>
        </div>
      ) : (
        <>
          {/* Year Selector */}
          <div className="flex flex-wrap gap-1 items-center">
            {years.map(y => (
              <button key={y} onClick={() => setSelectedYear(y)} className={`py-1 px-3 rounded-lg text-xs font-semibold transition-all ${
                selectedYear === y ? 'bg-[#5aa6ec] text-slate-900' : 'bg-[#181a20] border border-[#2d3444] text-slate-400 hover:text-white'
              }`}>
                {y}
              </button>
            ))}
            {showAddYear ? (
              <div className="flex items-center gap-1 ml-2">
                <input
                  type="number"
                  value={newYear}
                  onChange={e => setNewYear(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddYear(); if (e.key === 'Escape') setShowAddYear(false); }}
                  className="w-20 bg-[#181a20] border border-[#2d3444] rounded-lg py-1 px-2 text-xs text-white font-mono focus:outline-none"
                  placeholder="2027"
                  autoFocus
                />
                <button onClick={handleAddYear} className="py-1 px-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-semibold transition-all">OK</button>
                <button onClick={() => setShowAddYear(false)} className="py-1 px-2 rounded-lg border border-[#2d3444] text-slate-400 hover:text-white text-[10px] transition-all">X</button>
              </div>
            ) : (
              <button onClick={() => setShowAddYear(true)} className="py-1 px-2 rounded-lg border border-dashed border-[#2d3444] text-slate-500 hover:text-white hover:border-slate-400 text-[10px] font-mono transition-all ml-1">
                + Año
              </button>
            )}
          </div>

          {/* Main Table */}
          <div className="bg-[#111318] border border-[#1f242e] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#181a20] border-b border-[#2d3444] text-[10px] tracking-wider text-slate-400 font-mono uppercase">
                    <th className="py-2.5 px-3 font-bold">Mes</th>
                    {years.map(y => (
                      <th key={y} className={`py-2.5 px-3 text-right font-bold ${selectedYear === y ? 'text-white' : ''}`}>{y}</th>
                    ))}
                    <th className="py-2.5 px-3 text-right font-bold text-emerald-400">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {MONTHS.map((monthName, mi) => {
                    const monthNum = mi + 1;
                    const rowData = years.map(y => stats.find(s => s.year === y && s.month === monthNum));
                    const allYearsMax = Math.max(...years.map(y => {
                      const d = stats.find(s => s.year === y && s.month === monthNum);
                      return d ? d[selectedTab === 'ventas' ? 'sales_count' : 'cash_amount'] : 0;
                    }), 1);
                    return (
                      <tr key={mi} className={`border-b border-[#1b1e26] hover:bg-[#14171e] text-xs transition-all ${monthNum === new Date().getMonth() + 1 && selectedYear === new Date().getFullYear() ? 'bg-[#1a1d24]' : ''}`}>
                        <td className="py-2 px-3 font-medium text-slate-300 whitespace-nowrap">{monthName}</td>
                        {rowData.map((d, yi) => {
                          const val = d ? d[selectedTab === 'ventas' ? 'sales_count' : 'cash_amount'] : 0;
                          const yearMax = Math.max(...stats.filter(s => s.year === years[yi]).map(s => s[selectedTab === 'ventas' ? 'sales_count' : 'cash_amount']), 1);
                          const isEditing = editingCell?.year === years[yi] && editingCell?.month === monthNum;
                          const isSelectedYear = years[yi] === selectedYear;
                          return (
                            <td key={yi}
                              className={`py-2 px-3 text-right font-mono font-semibold ${getHeatColor(val, yearMax)} ${isSelectedYear ? 'cursor-pointer' : ''}`}
                              onClick={() => {
                                if (!isSelectedYear || isEditing) return;
                                setEditingCell({ year: years[yi], month: monthNum });
                                setEditValue(String(val));
                              }}
                            >
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editValue}
                                  onChange={e => setEditValue(e.target.value)}
                                  onBlur={() => handleCellSave(years[yi], monthNum, selectedTab === 'ventas' ? 'sales_count' : 'cash_amount', editValue)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') handleCellSave(years[yi], monthNum, selectedTab === 'ventas' ? 'sales_count' : 'cash_amount', editValue);
                                    if (e.key === 'Escape') setEditingCell(null);
                                  }}
                                  className="w-full bg-[#0d0e12] border border-[#5aa6ec] rounded py-0.5 px-1 text-xs text-white font-mono text-right focus:outline-none"
                                  autoFocus
                                  onClick={e => e.stopPropagation()}
                                />
                              ) : formatNumber(val)}
                            </td>
                          );
                        })}
                        <td className="py-2 px-3 text-right font-mono font-bold text-emerald-400">
                          {formatNumber(currentData[mi]?.[selectedTab === 'ventas' ? 'sales_count' : 'cash_amount'] || 0)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-[#181a20] border-t-2 border-[#2d3444] text-xs font-bold font-mono">
                    <td className="py-2.5 px-3 text-slate-300 uppercase tracking-wider">Total</td>
                    {years.map(y => {
                      const total = stats.filter(s => s.year === y).reduce((sum, s) => sum + s[selectedTab === 'ventas' ? 'sales_count' : 'cash_amount'], 0);
                      return <td key={y} className="py-2.5 px-3 text-right text-white">{formatNumber(total)}</td>;
                    })}
                    <td className="py-2.5 px-3 text-right text-emerald-400">
                      {formatNumber(getMonthlyTotal(currentData, selectedTab === 'ventas' ? 'sales_count' : 'cash_amount'))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Chart Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Bar Chart */}
            <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                  <BarChart3 size={14} className="text-[#5aa6ec]" />
                  {selectedTab === 'ventas' ? 'Ventas' : 'Caja'} por Mes
                </h3>
                <div className="flex gap-1">
                  {years.slice(0, 5).map(y => (
                    <button key={y} onClick={() => setChartYear(y)} className={`py-0.5 px-2 rounded text-[10px] font-mono transition-all ${
                      chartYear === y ? 'bg-[#5aa6ec] text-slate-900 font-bold' : 'text-slate-500 hover:text-white'
                    }`}>{y}</button>
                  ))}
                </div>
              </div>
              <div className="flex items-end gap-1.5 h-40">
                {chartData.map((d, i) => {
                  const maxVal = getMaxValue(chartData, selectedTab === 'ventas' ? 'sales_count' : 'cash_amount');
                  const val = d[selectedTab === 'ventas' ? 'sales_count' : 'cash_amount'];
                  const pct = (val / maxVal) * 100;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                      <span className="text-[9px] font-mono text-slate-500">{formatNumber(val)}</span>
                      <div
                        className={`w-full rounded-t transition-all ${selectedTab === 'ventas' ? 'bg-emerald-500/80' : 'bg-blue-500/80'} hover:opacity-80`}
                        style={{ height: `${Math.max(pct, 2)}%` }}
                        title={`${MONTHS[i]}: ${formatNumber(val)}`}
                      />
                      <span className="text-[8px] font-mono text-slate-600">{MONTHS[i].slice(0, 3)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-5 flex flex-col justify-between">
                <span className="text-[10px] tracking-widest text-slate-400 font-mono uppercase flex items-center gap-1.5">
                  <TrendingUp size={13} className="text-emerald-400" /> Ventas {selectedYear}
                </span>
                <div className="text-3xl font-extrabold font-display text-emerald-400 mt-2">
                  {formatNumber(getMonthlyTotal(currentData, 'sales_count'))}
                </div>
                <span className="text-[10px] text-slate-500 font-mono mt-1">Transacciones en el año</span>
              </div>
              <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-5 flex flex-col justify-between">
                <span className="text-[10px] tracking-widest text-slate-400 font-mono uppercase flex items-center gap-1.5">
                  <Database size={13} className="text-blue-400" /> Caja {selectedYear}
                </span>
                <div className="text-3xl font-extrabold font-display text-blue-400 mt-2">
                  ${formatNumber(getMonthlyTotal(currentData, 'cash_amount'))}
                </div>
                <span className="text-[10px] text-slate-500 font-mono mt-1">Monto acumulado en el año</span>
              </div>
              <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-5 flex flex-col justify-between">
                <span className="text-[10px] tracking-widest text-slate-400 font-mono uppercase flex items-center gap-1.5">
                  <TrendingUp size={13} className="text-emerald-400" /> Promedio Mensual
                </span>
                <div className="text-xl font-extrabold font-display text-white mt-2">
                  {currentData.length > 0 ? formatNumber(Math.round(getMonthlyTotal(currentData, selectedTab === 'ventas' ? 'sales_count' : 'cash_amount') / currentData.length)) : '0'}
                </div>
                <span className="text-[10px] text-slate-500 font-mono mt-1">{selectedTab === 'ventas' ? 'Ventas' : 'Caja'} / mes</span>
              </div>
              <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-5 flex flex-col justify-between">
                <span className="text-[10px] tracking-widest text-slate-400 font-mono uppercase flex items-center gap-1.5">
                  <TrendingUp size={13} className="text-emerald-400" /> Mejor Mes
                </span>
                <div className="text-xl font-extrabold font-display text-amber-400 mt-2">
                  {currentData.length > 0 ? (() => {
                    const best = currentData.reduce((max, d) => d[selectedTab === 'ventas' ? 'sales_count' : 'cash_amount'] > max[selectedTab === 'ventas' ? 'sales_count' : 'cash_amount'] ? d : max);
                    return `${MONTHS[best.month - 1]} (${formatNumber(best[selectedTab === 'ventas' ? 'sales_count' : 'cash_amount'])})`;
                  })() : '-'}
                </div>
                <span className="text-[10px] text-slate-500 font-mono mt-1">Mayor registro del año</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}