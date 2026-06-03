import React, { useState } from 'react';
import { Plus, Trash2, Search, Calendar, Filter, ArrowUpFromLine, ArrowDownToLine, Landmark, Banknote } from 'lucide-react';
import { Expense, CashRegister } from '../types';

interface EgresosProps {
  expenses: Expense[];
  cashRegister: CashRegister;
  onRefresh: () => void;
}

export default function Egresos({ expenses, cashRegister, onRefresh }: EgresosProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [type, setType] = useState<'efectivo' | 'transferencia'>('efectivo');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [typeFilter, setTypeFilter] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) { alert('Ingrese una descripción.'); return; }
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) { alert('Ingrese un monto válido.'); return; }
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, description: description.trim(), amount: amountNum, date: new Date(date).toISOString() })
      });
      if (!res.ok) throw new Error('Error al registrar egreso');
      setDescription('');
      setAmount('');
      setDate(today);
      onRefresh();
    } catch (err) {
      alert('Error al registrar egreso');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Eliminar este egreso?')) return;
    try {
      const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al eliminar');
      onRefresh();
    } catch {
      alert('Error al eliminar el egreso');
    }
  };

  const filtered = expenses.filter(e => {
    if (search && !e.description.toLowerCase().includes(search.toLowerCase()) && !e.id.toLowerCase().includes(search.toLowerCase())) return false;
    if (typeFilter && e.type !== typeFilter) return false;
    const d = new Date(e.date);
    if (dateFrom && d < new Date(dateFrom)) return false;
    if (dateTo) {
      const end = new Date(dateTo);
      end.setDate(end.getDate() + 1);
      if (d >= end) return false;
    }
    return true;
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalEgresos = filtered.reduce((sum, e) => sum + e.amount, 0);
  const cashExpenses = expenses.filter(e => e.type === 'efectivo').reduce((s, e) => s + e.amount, 0);
  const bankExpenses = expenses.filter(e => e.type === 'transferencia').reduce((s, e) => s + e.amount, 0);
  const effectiveCash = cashRegister.cash - cashExpenses;
  const effectiveBank = cashRegister.bank - bankExpenses;

  return (
    <div className="space-y-6">
      {/* Cash Register Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-5 flex flex-col justify-between">
          <span className="text-[10px] tracking-widest text-slate-400 font-mono block uppercase flex items-center gap-1.5">
            <Banknote size={13} /> Efectivo en Caja
          </span>
          <div className={`text-3xl font-extrabold font-display mt-2 ${effectiveCash >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            ${effectiveCash.toFixed(0)}
          </div>
          <span className="text-[10px] text-slate-500 font-mono mt-1">
            ${cashRegister.cash.toFixed(0)} inicial - ${cashExpenses.toFixed(0)} egresos
          </span>
        </div>
        <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-5 flex flex-col justify-between">
          <span className="text-[10px] tracking-widest text-slate-400 font-mono block uppercase flex items-center gap-1.5">
            <Landmark size={13} /> Saldo en Banco
          </span>
          <div className={`text-3xl font-extrabold font-display mt-2 ${effectiveBank >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            ${effectiveBank.toFixed(0)}
          </div>
          <span className="text-[10px] text-slate-500 font-mono mt-1">
            ${cashRegister.bank.toFixed(0)} inicial - ${bankExpenses.toFixed(0)} transferencias
          </span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-5 flex flex-col justify-between">
          <span className="text-[10px] tracking-widest text-slate-400 font-mono block uppercase">Total Egresos (Filtro)</span>
          <div className="text-3xl font-extrabold font-display text-red-400 mt-2">
            -${totalEgresos.toFixed(0)}
          </div>
          <span className="text-[10px] text-slate-500 font-mono mt-1">Suma de egresos en pantalla</span>
        </div>
        <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-5 flex flex-col justify-between">
          <span className="text-[10px] tracking-widest text-slate-400 font-mono block uppercase">Total General</span>
          <div className="text-3xl font-extrabold font-display text-white mt-2">
            {expenses.length}
          </div>
          <span className="text-[10px] text-slate-500 font-mono mt-1">Egresos registrados</span>
        </div>
      </div>

      {/* Form */}
      <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-white mb-4">Registrar Egreso</h2>
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-slate-500 font-mono uppercase">Tipo</label>
            <div className="flex gap-1">
              <button type="button" onClick={() => setType('efectivo')} className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${type === 'efectivo' ? 'bg-red-700 text-white' : 'bg-[#181a20] border border-[#2d3444] text-slate-400 hover:text-white'}`}>
                <ArrowUpFromLine size={12} className="inline mr-1" />Efectivo
              </button>
              <button type="button" onClick={() => setType('transferencia')} className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${type === 'transferencia' ? 'bg-blue-700 text-white' : 'bg-[#181a20] border border-[#2d3444] text-slate-400 hover:text-white'}`}>
                <ArrowDownToLine size={12} className="inline mr-1" />Transferencia
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
            <label className="text-[10px] text-slate-500 font-mono uppercase">Descripción</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Ej: Pago de luz, retiro bancario..." className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white placeholder-slate-500 focus:outline-none" />
          </div>
          <div className="flex flex-col gap-1 w-28">
            <label className="text-[10px] text-slate-500 font-mono uppercase">Monto ($)</label>
            <input type="number" step="0.01" min="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white font-mono placeholder-slate-500 focus:outline-none" />
          </div>
          <div className="flex flex-col gap-1 w-40">
            <label className="text-[10px] text-slate-500 font-mono uppercase">Fecha</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white font-mono focus:outline-none" />
          </div>
          <button type="submit" className="bg-red-700 hover:bg-red-600 text-white rounded-lg py-1.5 px-4 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 h-[34px]">
            <Plus size={13} />
            Registrar
          </button>
        </form>
      </div>

      {/* List */}
      <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">Historial de Egresos</h2>
            <p className="text-[11px] text-slate-500">Salidas de efectivo y transferencias realizadas</p>
          </div>
          <div className="relative w-full sm:w-56">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
              <Search size={14} />
            </span>
            <input type="text" className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:outline-none" placeholder="Buscar por descripción o ID..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pb-2">
          <div className="flex items-center gap-2">
            <Calendar size={13} className="text-slate-500" />
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white font-mono focus:outline-none" title="Desde" />
            <span className="text-[10px] text-slate-500">→</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white font-mono focus:outline-none" title="Hasta" />
          </div>
          <div className="flex items-center gap-1.5">
            <Filter size={12} className="text-slate-500" />
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-2.5 text-[11px] text-white font-mono focus:outline-none">
              <option value="">Todos</option>
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
            </select>
          </div>
          {(dateFrom || dateTo || typeFilter || search) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); setTypeFilter(''); setSearch(''); }} className="text-[10px] text-slate-400 hover:text-white font-mono px-2 py-1 rounded border border-[#2d3444] hover:bg-[#1a1d24] transition-all">
              Limpiar filtros
            </button>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border border-[#1b1e26] bg-[#0d0e12]">
          {filtered.length === 0 ? (
            <div className="p-12 text-slate-500 italic text-center text-xs">No hay egresos registrados.</div>
          ) : (
            <div className="divide-y divide-[#1b1e26]">
              <div className="grid grid-cols-12 bg-[#181a20] px-4 py-3 text-[10px] tracking-wider text-slate-400 font-mono uppercase font-bold text-left">
                <div className="col-span-2">CÓDIGO</div>
                <div className="col-span-3">FECHA</div>
                <div className="col-span-4">DESCRIPCIÓN</div>
                <div className="col-span-1 text-center">TIPO</div>
                <div className="col-span-2 text-right">MONTO</div>
              </div>
              {filtered.map(e => (
                <div key={e.id} className="grid grid-cols-12 px-4 py-3 text-xs text-slate-300 hover:bg-[#14171e] items-center transition-colors">
                  <div className="col-span-2 font-mono font-bold text-white flex items-center gap-1.5">
                    {e.id}
                  </div>
                  <div className="col-span-3 font-mono text-slate-400">
                    {new Date(e.date).toLocaleString()}
                  </div>
                  <div className="col-span-4 font-medium truncate text-white">
                    {e.description}
                  </div>
                  <div className="col-span-1 text-center">
                    <span className={`font-mono border rounded px-1.5 py-0.5 text-[9px] uppercase inline-flex items-center gap-1 ${e.type === 'efectivo' ? 'bg-red-900/30 border-red-800/40 text-red-400' : 'bg-blue-900/30 border-blue-800/40 text-blue-400'}`}>
                      {e.type === 'efectivo' ? <ArrowUpFromLine size={10} /> : <ArrowDownToLine size={10} />}
                      {e.type === 'efectivo' ? 'EFE' : 'TRANSF'}
                    </span>
                  </div>
                  <div className="col-span-2 text-right font-mono font-bold text-red-400 flex items-center justify-end gap-2">
                    -${e.amount.toFixed(0)}
                    <button onClick={() => handleDelete(e.id)} className="text-slate-500 hover:text-red-400 transition-colors cursor-pointer" title="Eliminar">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
