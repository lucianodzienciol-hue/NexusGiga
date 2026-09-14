import React, { useState } from 'react';
import { Plus, Edit2, Trash2, Search, Store, Send } from 'lucide-react';
import { Provider } from '../types';

interface ProveedoresProps {
  providers: Provider[];
  onRefresh: () => void;
}

export default function Proveedores({ providers, onRefresh }: ProveedoresProps) {
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [ruc, setRuc] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const [formOpen, setFormOpen] = useState(false);

  const filtered = providers.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.ruc.includes(search)
  );

  const resetForm = () => {
    setRuc('');
    setName('');
    setPhone('');
    setEmail('');
    setEditingId(null);
    setFormOpen(false);
  };

  const handleEditClick = (provider: Provider) => {
    setEditingId(provider.id);
    setRuc(provider.ruc);
    setName(provider.name);
    setPhone(provider.phone || '');
    setEmail(provider.email || '');
    setFormOpen(true);
  };

  const handleSaveProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !ruc) {
      alert('RUC y Nombre son campos obligatorios (*).');
      return;
    }

    const payload = {
      ruc,
      name,
      phone: phone || '-',
      email: email || '-'
    };

    const url = editingId ? `/api/providers/${editingId}` : '/api/providers';
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
        alert('Ocurrió un error al guardar el proveedor.');
      }
    } catch (err) {
      console.error('Error saving provider:', err);
      alert('Error de red al guardar.');
    }
  };

  const handleDeleteProvider = async (id: string, providerName: string) => {
    if (!confirm(`¿Está seguro de que desea eliminar a "${providerName}"?`)) return;

    try {
      const resp = await fetch(`/api/providers/${id}`, {
        method: 'DELETE'
      });
      if (resp.ok) {
        onRefresh();
      } else {
        let msg = 'Ocurrió un error al eliminar el proveedor.';
        try { const b = await resp.json(); if (b && b.error) msg = b.error; } catch { /* noop */ }
        alert(msg);
      }
    } catch (err) {
      console.error('Error deleting provider:', err);
      alert('Error de red al eliminar.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#111318] border border-[#1f242e] rounded-xl p-6">
        <div>
          <h1 className="text-xl font-bold font-display text-white">Directorio de Proveedores</h1>
          <p className="text-xs text-slate-400 mt-1">Gestione Proveedores externos para el abastecimiento y reabastecimiento de artículos de su comercio.</p>
        </div>

        <button
          onClick={() => { resetForm(); setFormOpen(true); }}
          className="bg-[#A63A42] hover:bg-[#4691db] text-slate-900 font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
        >
          <Plus size={14} />
          Nuevo Proveedor
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start">
        {/* Table List Column */}
        <div className={`xl:col-span-3 bg-[#111318] border border-[#1f242e] rounded-xl p-5 ${formOpen ? 'xl:col-span-3' : 'xl:col-span-4'}`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div className="relative w-full sm:w-72">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Search size={14} />
              </span>
              <input
                type="text"
                className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:outline-none"
                placeholder="Buscar por RUC o Razón Social..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
              <Store size={14} />
              <span>Proveedores Registrados: {providers.length}</span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-[#1b1e26] bg-[#0d0e12]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#181a20] border-b border-[#2d3444] text-[10px] tracking-wider text-slate-400 font-mono uppercase">
                  <th className="py-3 px-4">RUC PROVEEDOR</th>
                  <th className="py-3 px-4">RAZÓN SOCIAL</th>
                  <th className="py-3 px-4">TELÉFONO</th>
                  <th className="py-3 px-4">CORREO ELECTRÓNICO</th>
                  <th className="py-3 px-4 text-center">CANAL</th>
                  <th className="py-3 px-4 text-right">ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr 
                    key={p.id}
                    className="border-b border-[#1b1e26] hover:bg-[#14171e] text-xs transition-colors"
                  >
                    <td className="py-3 px-4 font-mono font-semibold text-slate-400">{p.ruc}</td>
                    <td className="py-3 px-4 font-medium text-white flex items-center gap-1.5">
                      <Store size={14} className="text-[#A63A42]" />
                      {p.name}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-300">{p.phone || '-'}</td>
                    <td className="py-3 px-4 text-slate-400 font-mono">{p.email || '-'}</td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-[9px] uppercase font-mono px-2 py-0.5 rounded border bg-transparent border-[#A63A42]/20 text-[#A63A42]">
                        Distribuidor Oficial
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleEditClick(p)}
                          className="p-1 rounded text-slate-400 hover:text-[#A63A42] hover:bg-[#1f242e] transition-all"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          onClick={() => handleDeleteProvider(p.id, p.name)}
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
          </div>
        </div>

        {/* Form Drawer */}
        {formOpen && (
          <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#1f242e] pb-3 mb-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                {editingId ? 'Editar Proveedor' : 'Nuevo Proveedor'}
              </h3>
              <button 
                onClick={resetForm}
                className="text-slate-500 hover:text-white text-xs"
              >
                Cancelar
              </button>
            </div>

            <form onSubmit={handleSaveProvider} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-slate-400 block">RUC de 11 Dígitos *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: 20112233445"
                  className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg p-2 text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-red-500 font-mono"
                  value={ruc}
                  onChange={(e) => setRuc(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 block">Razón Social *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Snacks del Valle S.A."
                  className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg p-2 text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-red-500"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 block">Teléfono / Oficina</label>
                <input
                  type="text"
                  placeholder="Ej: 955333111"
                  className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg p-2 text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-red-500 font-mono"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 block">Correo Electrónico</label>
                <input
                  type="email"
                  placeholder="Ej: compras@snacksvalle.com"
                  className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg p-2 text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-red-500 font-mono"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-2 rounded-lg bg-[#238636] hover:bg-[#2ea043] text-white font-bold transition-all shadow cursor-pointer text-center flex items-center justify-center gap-1.5"
                >
                  <Send size={12} />
                  {editingId ? 'GUARDAR CAMBIOS' : 'REGISTRAR PROVEEDOR'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
