import React, { useState } from 'react';
import { Plus, Edit2, Trash2, Search, DollarSign } from 'lucide-react';
import { PaymentMethod } from '../types';

interface PaymentMethodsProps {
  paymentMethods: PaymentMethod[];
  onRefresh: () => void;
}

export default function PaymentMethods({ paymentMethods, onRefresh }: PaymentMethodsProps) {
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [requiresCash, setRequiresCash] = useState(false);
  const [adjustment, setAdjustment] = useState(0);
  const [formOpen, setFormOpen] = useState(false);

  const filtered = paymentMethods.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const resetForm = () => {
    setName('');
    setRequiresCash(false);
    setAdjustment(0);
    setEditingId(null);
    setFormOpen(false);
  };

  const handleEdit = (method: PaymentMethod) => {
    setEditingId(method.id);
    setName(method.name);
    setRequiresCash(method.requiresCash || false);
    setAdjustment(method.adjustment || 0);
    setFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Ingrese un nombre para el método de pago.');
      return;
    }

    const payload = { name: name.trim(), requiresCash, adjustment: Number(adjustment) || 0 };
    const url = editingId ? `/api/payment-methods/${editingId}` : '/api/payment-methods';
    const method = editingId ? 'PUT' : 'POST';

    try {
      const resp = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (resp.ok) {
        onRefresh();
        resetForm();
      } else {
        alert('Error al guardar el método de pago.');
      }
    } catch (err) {
      alert('Error de red al guardar.');
    }
  };

  const handleDelete = async (id: string, methodName: string) => {
    if (!confirm(`¿Eliminar "${methodName}"?`)) return;
    try {
      const resp = await fetch(`/api/payment-methods/${id}`, { method: 'DELETE' });
      if (resp.ok) onRefresh();
      else alert('Error al eliminar.');
    } catch (err) {
      alert('Error de red.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#111318] border border-[#1f242e] rounded-xl p-6">
        <div>
          <h1 className="text-xl font-bold font-display text-white">Métodos de Pago</h1>
          <p className="text-xs text-slate-400 mt-1">Administre las opciones de pago disponibles al realizar una venta.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { resetForm(); setFormOpen(true); }}
            className="bg-[#A63A42] hover:bg-[#4691db] text-slate-900 font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
          >
            <Plus size={14} />
            Nuevo Método
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start">
        <div className={`bg-[#111318] border border-[#1f242e] rounded-xl p-5 ${formOpen ? 'xl:col-span-3' : 'xl:col-span-4'}`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div className="relative w-full sm:w-72">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Search size={14} />
              </span>
              <input
                type="text"
                className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:outline-none"
                placeholder="Buscar método de pago..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
              <DollarSign size={14} />
              <span>Total: {paymentMethods.length}</span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-[#1b1e26] bg-[#0d0e12]">
            {filtered.length === 0 ? (
              <div className="p-12 text-slate-500 italic text-center text-xs">No se encontraron métodos de pago.</div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#181a20] border-b border-[#2d3444] text-[10px] tracking-wider text-slate-400 font-mono uppercase">
                    <th className="py-3 px-4">NOMBRE</th>
                    <th className="py-3 px-4 text-center w-28">REQUIERE EFECTIVO</th>
                    <th className="py-3 px-4 text-center w-28">AJUSTE</th>
                    <th className="py-3 px-4 text-right w-24">ACCIONES</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.id} className="border-b border-[#1b1e26] hover:bg-[#14171e] text-xs transition-colors">
                      <td className="py-3 px-4 font-medium text-white flex items-center gap-2">
                        <DollarSign size={14} className="text-emerald-400" />
                        {p.name}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`font-mono text-[10px] font-semibold px-2 py-0.5 rounded ${
                          p.requiresCash
                            ? 'bg-amber-950/40 text-amber-400 border border-amber-900/50'
                            : 'bg-red-950/40 text-red-400 border border-red-900/50'
                        }`}>
                          {p.requiresCash ? 'Sí' : 'No'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`font-mono text-[10px] font-semibold px-2 py-0.5 rounded ${
                          (p.adjustment || 0) > 0
                            ? 'bg-red-950/40 text-red-400 border border-red-900/50'
                            : (p.adjustment || 0) < 0
                            ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/50'
                            : 'bg-slate-800/40 text-slate-400 border border-slate-700/50'
                        }`}>
                          {p.adjustment ? `${p.adjustment > 0 ? '+' : ''}${p.adjustment}%` : '0%'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleEdit(p)}
                            className="p-1 rounded text-slate-400 hover:text-[#A63A42] hover:bg-[#1f242e] transition-all"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => handleDelete(p.id, p.name)}
                            className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-[#251012] transition-all"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {formOpen && (
          <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#1f242e] pb-3 mb-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                {editingId ? 'Editar Método' : 'Nuevo Método'}
              </h3>
              <button onClick={resetForm} className="text-slate-500 hover:text-white text-xs">Cancelar</button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-slate-400 block">Nombre del Método *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Efectivo, Tarjeta, Transferencia..."
                  className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg p-2 text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-red-500"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 block">Ajuste de porcentaje</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.1"
                    placeholder="0"
                    className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg p-2 text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-red-500 font-mono"
                    value={adjustment}
                    onChange={(e) => setAdjustment(parseFloat(e.target.value) || 0)}
                  />
                  <span className="text-slate-400 text-xs font-mono">%</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Positivo = recargo, Negativo = descuento. Ej: +10 = 10% más, -5 = 5% menos.
                </p>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <input
                  type="checkbox"
                  id="requiresCash"
                  checked={requiresCash}
                  onChange={(e) => setRequiresCash(e.target.checked)}
                  className="h-4 w-4 bg-[#181a20] border-[#2d3444] rounded"
                />
                <label htmlFor="requiresCash" className="text-slate-300">
                  Requiere ingreso de efectivo (calcular cambio)
                </label>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-2 rounded-lg bg-[#238636] hover:bg-[#2ea043] text-white font-bold transition-all shadow cursor-pointer text-center"
                >
                  {editingId ? 'GUARDAR CAMBIOS' : 'REGISTRAR MÉTODO'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}