import React, { useState, useEffect, useRef } from 'react';
import { Plus, Edit2, Trash2, Search, Package, User, Hash, MessageSquare, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { Exchange, Client, Product } from '../types';

interface CambiosProps {
  onRefresh: () => void;
}

const STATUSES = [
  { value: 'recibido', label: 'Recibido', icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-900/30 border-amber-700' },
  { value: 'esperando', label: 'Esperando', icon: Clock, color: 'text-blue-400', bg: 'bg-blue-900/30 border-blue-700' },
  { value: 'entregado', label: 'Entregado', icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-900/30 border-emerald-700' },
];

export default function Cambios({ onRefresh }: CambiosProps) {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [clientSearch, setClientSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [formClientId, setFormClientId] = useState('');
  const [formClientName, setFormClientName] = useState('');
  const [formProductId, setFormProductId] = useState('');
  const [formProductName, setFormProductName] = useState('');
  const [formStatus, setFormStatus] = useState<'recibido' | 'esperando' | 'entregado'>('recibido');
  const [formNotes, setFormNotes] = useState('');

  const clientRef = useRef<HTMLDivElement>(null);
  const productRef = useRef<HTMLDivElement>(null);

  const loadData = async () => {
    try {
      const [exRes, clRes, prRes] = await Promise.all([
        fetch('/api/exchanges'),
        fetch('/api/clients'),
        fetch('/api/products'),
      ]);
      if (exRes.ok) setExchanges(await exRes.json());
      if (clRes.ok) setClients(await clRes.json());
      if (prRes.ok) setProducts(await prRes.json());
    } catch {}
  };

  useEffect(() => { loadData(); }, []);

  const filtered = exchanges.filter(e =>
    e.clientName.toLowerCase().includes(search.toLowerCase()) ||
    e.productName.toLowerCase().includes(search.toLowerCase()) ||
    e.id.includes(search)
  );

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    c.document.includes(clientSearch)
  ).slice(0, 20);

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.code?.toLowerCase().includes(productSearch.toLowerCase())
  ).slice(0, 20);

  const resetForm = () => {
    setClientSearch('');
    setProductSearch('');
    setFormClientId('');
    setFormClientName('');
    setFormProductId('');
    setFormProductName('');
    setFormStatus('recibido');
    setFormNotes('');
    setEditingId(null);
    setFormOpen(false);
  };

  const handleEditClick = (ex: Exchange) => {
    setEditingId(ex.id);
    setFormClientId(ex.clientId);
    setFormClientName(ex.clientName);
    setFormProductId(ex.productId);
    setFormProductName(ex.productName);
    setFormStatus(ex.status);
    setFormNotes(ex.notes || '');
    setClientSearch(ex.clientName);
    setProductSearch(ex.productName);
    setFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formClientId || !formProductId) {
      alert('Seleccioná un cliente y un producto.');
      return;
    }
    const payload = {
      clientId: formClientId,
      clientName: formClientName,
      productId: formProductId,
      productName: formProductName,
      status: formStatus,
      notes: formNotes,
    };
    const url = editingId ? `/api/exchanges/${editingId}` : '/api/exchanges';
    const method = editingId ? 'PUT' : 'POST';
    try {
      const resp = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (resp.ok) {
        await loadData();
        onRefresh();
        resetForm();
      } else {
        alert('Error al guardar el cambio.');
      }
    } catch {
      alert('Error de red al guardar.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este cambio definitivamente?')) return;
    try {
      const resp = await fetch(`/api/exchanges/${id}`, { method: 'DELETE' });
      if (resp.ok) {
        await loadData();
        onRefresh();
      } else {
        alert('Error al eliminar.');
      }
    } catch {
      alert('Error de red al eliminar.');
    }
  };

  const handleQuickStatus = async (id: string, newStatus: 'recibido' | 'esperando' | 'entregado') => {
    try {
      const resp = await fetch(`/api/exchanges/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (resp.ok) {
        await loadData();
        onRefresh();
      }
    } catch {}
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (clientRef.current && !clientRef.current.contains(e.target as Node)) {
        setClientSearch('');
      }
      if (productRef.current && !productRef.current.contains(e.target as Node)) {
        setProductSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#111318] border border-[#1f242e] rounded-xl p-6">
        <div>
          <h1 className="text-xl font-bold font-display text-white">Cambios y Devoluciones</h1>
          <p className="text-xs text-slate-400 mt-1">Gestión de productos defectuosos o cambios de clientes.</p>
        </div>
        <button
          onClick={() => { resetForm(); setFormOpen(true); }}
          className="bg-[#5aa6ec] hover:bg-[#4691db] text-slate-900 font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
        >
          <Plus size={14} />
          Nuevo Cambio
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start">
        <div className={`xl:col-span-3 bg-[#111318] border border-[#1f242e] rounded-xl p-5 ${formOpen ? '' : 'xl:col-span-4'}`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div className="relative w-full sm:w-72">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Search size={14} />
              </span>
              <input
                type="text"
                className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:outline-none"
                placeholder="Buscar por cliente, producto o código..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
              <Package size={14} />
              <span>Registros: {exchanges.length}</span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-[#1b1e26] bg-[#0d0e12]">
            <table className="w-full">
              <thead>
                <tr className="bg-[#181a20] border-b border-[#2d3444] text-[10px] tracking-wider text-slate-400 font-mono uppercase">
                  <th className="py-3 px-4">CÓDIGO</th>
                  <th className="py-3 px-4">CLIENTE</th>
                  <th className="py-3 px-4">PRODUCTO</th>
                  <th className="py-3 px-4">ESTADO</th>
                  <th className="py-3 px-4">FECHA</th>
                  <th className="py-3 px-4 text-right">ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(ex => {
                  const st = STATUSES.find(s => s.value === ex.status) || STATUSES[0];
                  const StIcon = st.icon;
                  return (
                    <tr
                      key={ex.id}
                      className="border-b border-[#1b1e26] hover:bg-[#14171e] text-xs transition-colors"
                    >
                      <td className="py-3 px-4 font-mono font-bold text-[#5aa6ec]">#{ex.id.slice(-6)}</td>
                      <td className="py-3 px-4 text-white font-medium">{ex.clientName}</td>
                      <td className="py-3 px-4 text-slate-300">{ex.productName}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <select
                            value={ex.status}
                            onChange={e => handleQuickStatus(ex.id, e.target.value as any)}
                            className={`text-[10px] font-semibold rounded-lg py-1 px-2 border cursor-pointer ${st.bg} ${st.color} focus:outline-none appearance-none`}
                          >
                            {STATUSES.map(s => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-400 font-mono">{ex.date?.slice(0, 10)}</td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleEditClick(ex)}
                            className="p-1 rounded text-slate-400 hover:text-[#5aa6ec] hover:bg-[#1f242e] transition-all"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => handleDelete(ex.id)}
                            className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-[#251012] transition-all"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                      No hay cambios registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {formOpen && (
          <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#1f242e] pb-3 mb-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                {editingId ? 'Editar Cambio' : 'Nuevo Cambio'}
              </h3>
              <button onClick={resetForm} className="text-slate-500 hover:text-white text-xs cursor-pointer">
                Cancelar
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div className="space-y-1" ref={clientRef}>
                <label className="text-slate-400 block">Cliente *</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="Buscar cliente..."
                    className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg p-2 text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={clientSearch}
                    onChange={e => {
                      setClientSearch(e.target.value);
                      setFormClientId('');
                      setFormClientName('');
                    }}
                    onFocus={() => setClientSearch(clientSearch || '')}
                  />
                  {clientSearch && !formClientId && filteredClients.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-[#181a20] border border-[#2d3444] rounded-lg max-h-40 overflow-y-auto shadow-xl">
                      {filteredClients.map(c => (
                        <button
                          type="button"
                          key={c.id}
                          className="w-full text-left px-3 py-2 text-white hover:bg-[#2d3444] transition-colors cursor-pointer"
                          onClick={() => {
                            setFormClientId(c.id);
                            setFormClientName(c.name);
                            setClientSearch(c.name);
                          }}
                        >
                          <span className="font-medium">{c.name}</span>
                          <span className="text-slate-500 ml-2">{c.document}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {formClientId && (
                    <p className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1">
                      <User size={10} /> {formClientName}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-1" ref={productRef}>
                <label className="text-slate-400 block">Producto *</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="Buscar producto..."
                    className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg p-2 text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={productSearch}
                    onChange={e => {
                      setProductSearch(e.target.value);
                      setFormProductId('');
                      setFormProductName('');
                    }}
                    onFocus={() => setProductSearch(productSearch || '')}
                  />
                  {productSearch && !formProductId && filteredProducts.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-[#181a20] border border-[#2d3444] rounded-lg max-h-40 overflow-y-auto shadow-xl">
                      {filteredProducts.map(p => (
                        <button
                          type="button"
                          key={p.id}
                          className="w-full text-left px-3 py-2 text-white hover:bg-[#2d3444] transition-colors cursor-pointer"
                          onClick={() => {
                            setFormProductId(p.id);
                            setFormProductName(p.name);
                            setProductSearch(p.name);
                          }}
                        >
                          <span className="font-medium">{p.name}</span>
                          <span className="text-slate-500 ml-2">{p.code}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {formProductId && (
                    <p className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1">
                      <Package size={10} /> {formProductName}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 block">Estado</label>
                <div className="flex gap-2">
                  {STATUSES.map(s => {
                    const Icon = s.icon;
                    const isActive = formStatus === s.value;
                    return (
                      <button
                        type="button"
                        key={s.value}
                        onClick={() => setFormStatus(s.value as any)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                          isActive
                            ? `${s.bg} ${s.color} border`
                            : 'bg-[#181a20] border-[#2d3444] text-slate-400 hover:text-white'
                        }`}
                      >
                        <Icon size={12} />
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 block">Notas</label>
                <textarea
                  rows={3}
                  placeholder="Motivo del cambio, observaciones..."
                  className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg p-2 text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                />
              </div>

              <div className="pt-2 space-y-2">
                {editingId && (
                  <div className="bg-[#181a20] border border-[#2d3444] rounded-lg p-3 text-[10px]">
                    <span className="text-slate-500">Código para informar al cliente: </span>
                    <span className="text-[#5aa6ec] font-bold font-mono">#{editingId.slice(-6)}</span>
                  </div>
                )}
                <button
                  type="submit"
                  className="w-full py-2 rounded-lg bg-[#238636] hover:bg-[#2ea043] text-white font-bold transition-all shadow cursor-pointer text-center"
                >
                  {editingId ? 'GUARDAR CAMBIOS' : 'REGISTRAR CAMBIO'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
