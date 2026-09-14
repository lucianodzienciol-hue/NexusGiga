import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Search, Eye, X, CheckSquare, ShieldAlert } from 'lucide-react';
import { Purchase, Product, Provider } from '../types';
import { formatMoney } from '../lib/currency';

interface ComprasProps {
  products: Product[];
  providers: Provider[];
  onRefresh: () => void;
  currency?: string;
}

export default function Compras({ products, providers, onRefresh, currency }: ComprasProps) {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [search, setSearch] = useState('');
  const [viewing, setViewing] = useState<Purchase | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Create form state
  const [selectedProvider, setSelectedProvider] = useState('');
  const [showNewProvider, setShowNewProvider] = useState(false);
  const [providerQuery, setProviderQuery] = useState('');
  const [isProviderSearching, setIsProviderSearching] = useState(false);
  const [newProvName, setNewProvName] = useState('');
  const [newProvRuc, setNewProvRuc] = useState('');
  const [newProvPhone, setNewProvPhone] = useState('');
  const [newProvEmail, setNewProvEmail] = useState('');
  const [paymentMethods, setPaymentMethods] = useState<{ id: string; name: string }[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('Efectivo');
  const [items, setItems] = useState<{ productId: string; productName: string; quantity: number; cost: number }[]>([]);
  const [productQuery, setProductQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [qty, setQty] = useState('10');
  const [cost, setCost] = useState('');
  const searchRef = useRef<HTMLDivElement>(null);
  const providerSearchRef = useRef<HTMLDivElement>(null);

  const activeProvider = providers.find(p => p.id === selectedProvider);

  useEffect(() => { loadPurchases(); loadPaymentMethods(); }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsSearching(false);
      }
      if (providerSearchRef.current && !providerSearchRef.current.contains(e.target as Node)) {
        setIsProviderSearching(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filteredProducts = products.filter(p => {
    const q = productQuery.toLowerCase().trim();
    if (!q) return false;
    return p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q);
  }).sort((a, b) => a.name.localeCompare(b.name));

  const loadPurchases = async () => {
    try {
      const r = await fetch('/api/purchases');
      if (r.ok) setPurchases(await r.json());
    } catch {}
  };

  const loadPaymentMethods = async () => {
    try {
      const r = await fetch('/api/payment-methods');
      if (r.ok) setPaymentMethods(await r.json());
    } catch {}
  };

  const filteredProviders = providers.filter(p => {
    const q = providerQuery.toLowerCase().trim();
    if (!q) return false;
    return p.name.toLowerCase().includes(q) || p.ruc.includes(q);
  }).sort((a, b) => a.name.localeCompare(b.name));

  const selectProvider = (prov: Provider) => {
    setSelectedProvider(prov.id);
    setProviderQuery(prov.name);
    setIsProviderSearching(false);
  };

  const filtered = purchases.filter(p =>
    p.providerName.toLowerCase().includes(search.toLowerCase()) ||
    p.id.toLowerCase().includes(search.toLowerCase())
  );

  const selectProduct = (prod: Product) => {
    setSelectedProductId(prod.id);
    setProductQuery(prod.name);
    setCost(prod.cost.toString());
    setIsSearching(false);
  };

  const addItemToPurchase = () => {
    if (!selectedProductId) { alert('Seleccione un artículo.'); return; }
    const quantityVal = parseInt(qty) || 0;
    const costVal = parseFloat(cost) || 0;
    if (quantityVal <= 0 || costVal <= 0) { alert('Cantidad y costo deben ser mayores a cero.'); return; }
    const prod = products.find(p => p.id === selectedProductId);
    if (!prod) return;
    const existingIndex = items.findIndex(it => it.productId === selectedProductId);
    if (existingIndex !== -1) {
      const updated = [...items];
      updated[existingIndex].quantity += quantityVal;
      setItems(updated);
    } else {
      setItems([...items, { productId: selectedProductId, productName: prod.name, quantity: quantityVal, cost: costVal }]);
    }
    setSelectedProductId(null);
    setProductQuery('');
    setQty('10');
    setCost('');
  };

  const removeItem = (index: number) => setItems(items.filter((_, idx) => idx !== index));

  const purchaseTotal = items.reduce((sum, item) => sum + (item.cost * item.quantity), 0);

  const submitPurchase = async () => {
    if (saving) return;
    if (!selectedProvider) { alert('Seleccione un proveedor.'); return; }
    if (items.length === 0) { alert('Agregue al menos un producto.'); return; }
    setSaving(true);
    try {
      const resp = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: selectedProvider, providerName: activeProvider?.name || '', items, total: purchaseTotal, paymentMethod: selectedPaymentMethod })
      });
      if (resp.ok) {
        alert('Compra registrada. Stock actualizado.');
        setItems([]);
        setSelectedProvider('');
        setShowForm(false);
        loadPurchases();
        onRefresh();
      } else alert('Error al guardar la compra.');
    } catch { alert('Error de conexión.'); } finally { setSaving(false); }
  };

  const viewPurchase = async (id: string) => {
    try {
      const r = await fetch(`/api/purchases/${id}`);
      if (r.ok) setViewing(await r.json());
    } catch {}
  };

  const deletePurchase = async (id: string) => {
    if (!confirm('¿Eliminar esta compra? El stock se revertirá.')) return;
    try {
      const r = await fetch(`/api/purchases/${id}`, { method: 'DELETE' });
      if (r.ok) { loadPurchases(); onRefresh(); }
      else alert('Error al eliminar.');
    } catch { alert('Error de conexión.'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#111318] border border-[#1f242e] rounded-xl p-6">
        <div>
          <h1 className="text-xl font-bold font-display text-white">Compras</h1>
          <p className="text-xs text-slate-400 mt-1">Historial de compras a proveedores y registro de nuevo abastecimiento.</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); if (!showForm) { setItems([]); setSelectedProvider(''); setSelectedPaymentMethod(''); } }} className={`py-2 px-4 rounded-lg font-bold text-xs tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${showForm ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-[#A63A42] text-[#0c0d10] hover:brightness-110'}`}>
          {showForm ? <X size={14} /> : <Plus size={14} />}
          {showForm ? 'Cerrar' : 'Nueva Compra'}
        </button>
      </div>

      {showForm && (
        <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white border-b border-[#1f242e] pb-2">Registrar Compra</h2>

          {/* Top row: Provider + Payment Method */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-[#0d0e12] border border-[#1b1e26] rounded-lg p-3 space-y-1">
              <label className="text-[10px] text-slate-500 font-mono block">PROVEEDOR *</label>
              <div className="flex gap-2">
                <div className="relative flex-1" ref={providerSearchRef}>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                    <input
                      type="text"
                      className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-2 pl-9 pr-8 text-xs text-white placeholder-slate-500 focus:outline-none"
                      placeholder="Buscar proveedor..."
                      value={providerQuery}
                      onChange={e => { setProviderQuery(e.target.value); setIsProviderSearching(true); setSelectedProvider(''); }}
                      onFocus={() => setIsProviderSearching(true)}
                    />
                    {providerQuery && (
                      <button onClick={() => { setProviderQuery(''); setIsProviderSearching(false); setSelectedProvider(''); }} className="absolute inset-y-0 right-0 pr-2 flex items-center text-slate-500 hover:text-white">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  {isProviderSearching && providerQuery.trim().length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-[#181a20] border border-[#2d3444] rounded-lg shadow-2xl z-20 max-h-48 overflow-y-auto">
                      {filteredProviders.length === 0 ? (
                        <div className="p-3 text-xs text-slate-500 italic text-center">Sin resultados</div>
                      ) : (
                        filteredProviders.map(p => (
                          <button
                            key={p.id}
                            onClick={() => selectProvider(p)}
                            className="w-full text-left p-2.5 text-xs border-b border-[#242b38] last:border-0 hover:bg-[#212631] flex items-center justify-between"
                          >
                            <div className="flex flex-col">
                              <span className="font-semibold text-white">{p.name}</span>
                              <span className="text-[10px] text-slate-500 font-mono">RUC: {p.ruc}</span>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <button onClick={() => setShowNewProvider(!showNewProvider)} className="px-3 rounded-lg border border-[#2d3444] text-[#A63A42] hover:bg-[#1a1d24] hover:text-white text-xs font-bold transition-all flex items-center gap-1 cursor-pointer">
                  <Plus size={13} /> Nuevo
                </button>
              </div>
              {showNewProvider && (
                <div className="mt-2 p-3 rounded-lg bg-[#0d0e12] border border-dashed border-[#2d3444] space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" className="bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" placeholder="Nombre *" value={newProvName} onChange={e => setNewProvName(e.target.value)} />
                    <input type="text" className="bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" placeholder="RUC/DNI *" value={newProvRuc} onChange={e => setNewProvRuc(e.target.value)} />
                    <input type="text" className="bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" placeholder="Teléfono" value={newProvPhone} onChange={e => setNewProvPhone(e.target.value)} />
                    <input type="text" className="bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" placeholder="Email" value={newProvEmail} onChange={e => setNewProvEmail(e.target.value)} />
                  </div>
                  <button onClick={async () => {
                    if (!newProvName.trim() || !newProvRuc.trim()) { alert('Nombre y RUC son obligatorios'); return; }
                    try {
                      const r = await fetch('/api/providers', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: newProvName.trim(), ruc: newProvRuc.trim(), phone: newProvPhone.trim(), email: newProvEmail.trim() })
                      });
                      if (r.ok) {
                        const created = await r.json();
                        setSelectedProvider(created.id);
                        setProviderQuery(created.name);
                        setShowNewProvider(false);
                        setNewProvName('');
                        setNewProvRuc('');
                        setNewProvPhone('');
                        setNewProvEmail('');
                        onRefresh();
                      } else alert('Error al crear proveedor');
                    } catch { alert('Error de conexión'); }
                  }} className="w-full bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg py-1.5 px-3 text-xs font-bold transition-all cursor-pointer">Crear Proveedor y Seleccionar</button>
                </div>
              )}
            </div>
            <div className="bg-[#0d0e12] border border-[#1b1e26] rounded-lg p-3 space-y-1">
              <label className="text-[10px] text-slate-500 font-mono block">MEDIO DE PAGO</label>
              <select value={selectedPaymentMethod} onChange={e => setSelectedPaymentMethod(e.target.value)} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-2 px-3 text-xs text-white focus:outline-none">
                {paymentMethods.map(pm => <option key={pm.id} value={pm.name}>{pm.name}</option>)}
              </select>
            </div>
          </div>

          {/* Main area: Items Table + Add Product side panel */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-2">
              <div className="overflow-hidden rounded-lg border border-[#1b1e26] bg-[#0d0e12] min-h-[150px]">
                {items.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500 italic">Lista vacía. Agregue productos.</div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#181a20] border-b border-[#2d3444] text-[10px] tracking-wider text-slate-400 font-mono uppercase">
                        <th className="py-2.5 px-4">ARTÍCULO</th>
                        <th className="py-2.5 px-4 text-center">CANT</th>
                        <th className="py-2.5 px-4 text-right">COSTO</th>
                        <th className="py-2.5 px-4 text-right">PARCIAL</th>
                        <th className="py-2.5 px-4 text-center"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, idx) => (
                        <tr key={idx} className="border-b border-[#1b1e26] text-xs hover:bg-[#14171e]">
                          <td className="py-2.5 px-4 text-white font-medium">{it.productName}</td>
                          <td className="py-2.5 px-4 text-center font-mono font-bold text-amber-500">+{it.quantity}</td>
                          <td className="py-2.5 px-4 text-right font-mono text-slate-300">{formatMoney(it.cost, currency)}</td>
                          <td className="py-2.5 px-4 text-right font-mono font-semibold text-red-400">{formatMoney(it.cost * it.quantity, currency)}</td>
                          <td className="py-2.5 px-4 text-center"><button onClick={() => removeItem(idx)} className="text-slate-500 hover:text-red-400 p-1 rounded"><Trash2 size={13} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="flex items-center justify-between bg-[#0d0e12] border border-[#1b1e26] rounded-lg px-4 py-3">
                <span className="text-lg font-extrabold font-mono text-[#A63A42]">{formatMoney(purchaseTotal, currency)}</span>
                <button onClick={submitPurchase} disabled={saving || items.length === 0 || !selectedProvider} className={`py-2 px-5 rounded-lg font-bold text-xs tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${saving || items.length === 0 || !selectedProvider ? 'bg-[#1b222d] text-slate-500 cursor-not-allowed' : 'bg-emerald-500 hover:bg-emerald-600 text-white'}`}>
                  <CheckSquare size={14} /> {saving ? 'Registrando...' : 'Registrar Compra'}
                </button>
              </div>
            </div>

            <div className="bg-[#0d0e12] border border-[#1b1e26] rounded-lg p-3 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white pb-1">Añadir Artículo</h3>
              <div className="space-y-1 relative" ref={searchRef}>
                <label className="text-slate-500 block font-mono text-[10px]">PRODUCTO *</label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  <input
                    type="text"
                    className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:outline-none"
                    placeholder="Buscar producto..."
                    value={productQuery}
                    onChange={e => { setProductQuery(e.target.value); setIsSearching(true); setSelectedProductId(null); }}
                    onFocus={() => setIsSearching(true)}
                  />
                  {productQuery && (
                    <button onClick={() => { setProductQuery(''); setIsSearching(false); setSelectedProductId(null); setCost(''); }} className="absolute inset-y-0 right-0 pr-2 flex items-center text-slate-500 hover:text-white">
                      <X size={14} />
                    </button>
                  )}
                </div>
                {isSearching && productQuery.trim().length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-[#181a20] border border-[#2d3444] rounded-lg shadow-2xl z-20 max-h-48 overflow-y-auto">
                    {filteredProducts.length === 0 ? (
                      <div className="p-3 text-xs text-slate-500 italic text-center">Sin resultados</div>
                    ) : (
                      filteredProducts.map(p => (
                        <button
                          key={p.id}
                          onClick={() => selectProduct(p)}
                          className="w-full text-left p-2.5 text-xs border-b border-[#242b38] last:border-0 hover:bg-[#212631] flex items-center justify-between"
                        >
                          <div className="flex flex-col">
                            <span className="font-semibold text-white">{p.name}</span>
                            <span className="text-[10px] text-slate-500 font-mono">COD: {p.code} | Stock: {p.stock}</span>
                          </div>
                          <span className="font-mono text-slate-400 text-xs">{formatMoney(p.cost, currency)}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-slate-500 block font-mono text-[10px]">CANTIDAD</label>
                  <input type="number" className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg p-2 text-xs text-white focus:outline-none font-mono" value={qty} onChange={e => setQty(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-500 block font-mono text-[10px]">COSTO UNIT.</label>
                  <input type="number" step="0.01" className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg p-2 text-xs text-white focus:outline-none font-mono" value={cost} onChange={e => setCost(e.target.value)} />
                </div>
              </div>
              <button onClick={addItemToPurchase} className="w-full py-2 rounded-lg border border-[#2d3444] text-[#A63A42] hover:bg-[#1a1d24] hover:text-white font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"><Plus size={14} /> Agregar</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input type="text" placeholder="Buscar por proveedor o código..." value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:outline-none" />
          </div>
          <span className="text-[11px] text-slate-500 font-mono">{filtered.length} compras</span>
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500 italic">No hay compras registradas.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#181a20] border-b border-[#2d3444] text-[10px] tracking-wider text-slate-400 font-mono uppercase">
                  <th className="py-2.5 px-4">CÓDIGO</th>
                  <th className="py-2.5 px-4">FECHA</th>
                  <th className="py-2.5 px-4">PROVEEDOR</th>
                  <th className="py-2.5 px-4 text-right">TOTAL</th>
                  <th className="py-2.5 px-4 text-center">PAGO</th>
                  <th className="py-2.5 px-4 text-center">ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} className="border-b border-[#1b1e26] text-xs hover:bg-[#14171e]">
                    <td className="py-2.5 px-4 font-mono text-[#A63A42] font-bold">{p.id}</td>
                    <td className="py-2.5 px-4 text-slate-300">{new Date(p.date).toLocaleString('es-AR')}</td>
                    <td className="py-2.5 px-4 text-white font-medium">{p.providerName}</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-white">{formatMoney(p.total, currency)}</td>
                    <td className="py-2.5 px-4 text-center"><span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold leading-tight bg-[#181a20] text-slate-300 border border-[#2d3444]">{p.paymentMethod || 'Efectivo'}</span></td>
                    <td className="py-2.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => viewPurchase(p.id)} className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-[#1a1d24] transition-all" title="Ver detalle"><Eye size={14} /></button>
                        <button onClick={() => deletePurchase(p.id)} className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-red-900/20 transition-all" title="Eliminar"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewing && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setViewing(null)}>
          <div className="bg-[#111318] border border-[#2d3444] rounded-xl max-w-2xl w-full overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="bg-[#181a20] px-6 py-4 border-b border-[#2d3444] flex items-center justify-between">
              <span className="font-bold text-white font-display flex items-center gap-2 text-sm">
                <ShieldAlert size={16} className="text-[#A63A42]" />
                Compra {viewing.id}
              </span>
              <button onClick={() => setViewing(null)} className="text-slate-400 hover:text-white"><X size={16} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div><span className="text-slate-500 font-mono">PROVEEDOR</span><p className="text-white font-semibold mt-0.5">{viewing.providerName}</p></div>
                <div><span className="text-slate-500 font-mono">FECHA</span><p className="text-white font-semibold mt-0.5">{new Date(viewing.date).toLocaleString('es-AR')}</p></div>
                <div><span className="text-slate-500 font-mono">MEDIO DE PAGO</span><p className="text-white font-semibold mt-0.5">{viewing.paymentMethod || 'Efectivo'}</p></div>
              </div>
              <div className="overflow-hidden rounded-lg border border-[#1b1e26]">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#181a20] border-b border-[#2d3444] text-[10px] tracking-wider text-slate-400 font-mono uppercase">
                      <th className="py-2 px-4">ARTÍCULO</th>
                      <th className="py-2 px-4 text-center">CANT</th>
                      <th className="py-2 px-4 text-right">COSTO</th>
                      <th className="py-2 px-4 text-right">PARCIAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(viewing.items || []).map((it: any, idx: number) => (
                      <tr key={idx} className="border-b border-[#1b1e26] text-xs">
                        <td className="py-2 px-4 text-white">{it.productName}</td>
                        <td className="py-2 px-4 text-center font-mono text-amber-400">+{it.quantity}</td>
                        <td className="py-2 px-4 text-right font-mono text-slate-300">{formatMoney(Number(it.cost), currency)}</td>
                        <td className="py-2 px-4 text-right font-mono text-red-400 font-bold">{formatMoney(Number(it.cost) * Number(it.quantity), currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="text-right text-lg font-extrabold font-mono text-[#A63A42]">Total: {formatMoney(viewing.total, currency)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
