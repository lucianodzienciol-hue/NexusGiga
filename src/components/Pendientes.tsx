import React, { useState, useEffect, useRef } from 'react';
import { Package, Plus, Trash2, CheckCircle, Search, ChevronDown } from 'lucide-react';
import { Product } from '../types';

interface Pendiente {
  id: string;
  productId: string;
  productName: string;
  productCode: string;
  quantity: number;
  createdAt: string;
  updatedAt: string;
}

interface PendientesProps {
  products: Product[];
  onRefresh: () => void;
}

export default function Pendientes({ products, onRefresh }: PendientesProps) {
  const [items, setItems] = useState<Pendiente[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [quantity, setQuantity] = useState('1');
  const [showDropdown, setShowDropdown] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState('');

  const loadItems = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/pendientes');
      if (r.ok) setItems(await r.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadItems(); }, []);

  const handleAdd = async () => {
    if (!selectedProduct) { alert('Seleccione un producto'); return; }
    const qty = parseInt(quantity);
    if (isNaN(qty) || qty < 1) { alert('Ingrese una cantidad válida'); return; }
    const product = products.find(p => p.id === selectedProduct);
    if (!product) return;
    try {
      const r = await fetch('/api/pendientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id, productName: product.name, productCode: product.code, quantity: qty })
      });
      if (r.ok) {
        setSelectedProduct('');
        setQuantity('1');
        setProductSearch('');
        loadItems();
      }
    } catch {}
  };

  const handleUpdateQty = async (id: string) => {
    const qty = parseInt(editQty);
    if (isNaN(qty) || qty < 1) return;
    try {
      await fetch(`/api/pendientes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: qty })
      });
      setEditingId(null);
      loadItems();
    } catch {}
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`¿Marcar "${name}" como repuesto?`)) return;
    try {
      await fetch(`/api/pendientes/${id}`, { method: 'DELETE' });
      loadItems();
    } catch {}
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.code.toLowerCase().includes(productSearch.toLowerCase())
  ).slice(0, 20);

  const selectedProductObj = products.find(p => p.id === selectedProduct);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showDropdown || !listRef.current) return;
    const el = listRef.current.children[highlightedIndex] as HTMLElement;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex, showDropdown]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
      {/* Left: Form */}
      <div className="lg:col-span-4">
        <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-5 sticky top-24">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2 mb-4">
            <Package size={15} className="text-amber-400" />
            Agregar Pendiente
          </h2>

          <div className="space-y-4">
            {/* Product selector */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-500 font-mono uppercase">Producto</label>
              <div className="relative">
                <div
                  onClick={() => setShowDropdown(!showDropdown)}
                  className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-2 px-3 text-xs text-white flex items-center justify-between cursor-pointer"
                >
                  <span className={selectedProductObj ? 'text-white' : 'text-slate-500'}>
                    {selectedProductObj ? `${selectedProductObj.name} (${selectedProductObj.code})` : 'Seleccionar producto...'}
                  </span>
                  <ChevronDown size={14} className={`text-slate-500 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
                </div>
                {showDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-[#181a20] border border-[#2d3444] rounded-lg shadow-2xl z-20 max-h-60 overflow-hidden">
                    <div className="p-2 border-b border-[#2d3444]">
                      <div className="relative">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          type="text"
                          value={productSearch}
                          onChange={e => { setProductSearch(e.target.value); setHighlightedIndex(0); }}
                          onKeyDown={e => {
                            if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedIndex(i => Math.min(i + 1, filteredProducts.length - 1)); }
                            if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedIndex(i => Math.max(i - 1, 0)); }
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const target = filteredProducts[highlightedIndex];
                              if (target) { setSelectedProduct(target.id); setShowDropdown(false); setProductSearch(''); }
                            }
                            if (e.key === 'Escape') { e.preventDefault(); setShowDropdown(false); setProductSearch(''); }
                          }}
                          className="w-full bg-[#0d0e12] border border-[#2d3444] rounded-lg py-1.5 pl-7 pr-2 text-xs text-white focus:outline-none"
                          placeholder="Buscar producto..."
                          autoFocus
                        />
                      </div>
                    </div>
                    <div className="overflow-y-auto max-h-44" ref={listRef}>
                      {filteredProducts.length === 0 ? (
                        <div className="p-3 text-xs text-slate-500 italic text-center">Sin resultados</div>
                      ) : filteredProducts.map((p, idx) => (
                        <button
                          key={p.id}
                          onClick={() => { setSelectedProduct(p.id); setShowDropdown(false); setProductSearch(''); }}
                          onMouseEnter={() => setHighlightedIndex(idx)}
                          className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between ${
                            idx === highlightedIndex ? 'bg-[#5aa6ec]/20 text-white' : selectedProduct === p.id ? 'bg-[#1b1f28] text-white' : 'text-slate-400 hover:bg-[#14171e] hover:text-white'
                          }`}
                        >
                          <span className="font-medium">{p.name}</span>
                          <span className="text-[10px] font-mono text-slate-500">{p.code}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Quantity */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-500 font-mono uppercase">Unidades a Reponer</label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-2 px-3 text-xs text-white font-mono focus:outline-none"
              />
            </div>

            <button
              onClick={handleAdd}
              disabled={!selectedProduct}
              className="w-full flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 text-white font-bold py-2.5 rounded-lg text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={14} />
              Agregar Pendiente
            </button>
          </div>
        </div>
      </div>

      {/* Right: List */}
      <div className="lg:col-span-6">
        <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                <Package size={15} className="text-amber-400" />
                Productos Pendientes
              </h2>
              <p className="text-[11px] text-slate-500">{items.length} producto{items.length !== 1 ? 's' : ''} por reponer</p>
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-slate-500 text-xs">Cargando...</div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center text-slate-500 italic text-xs">
              No hay productos pendientes de reposición.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-[#1b1e26] bg-[#0d0e12]">
              <div className="divide-y divide-[#1b1e26]">
                <div className="grid grid-cols-12 bg-[#181a20] px-4 py-3 text-[10px] tracking-wider text-slate-400 font-mono uppercase font-bold text-left">
                  <div className="col-span-6">PRODUCTO</div>
                  <div className="col-span-2 text-center">CANT.</div>
                  <div className="col-span-4 text-right">ACCIÓN</div>
                </div>
                {items.map(item => (
                  <div key={item.id} className="grid grid-cols-12 px-4 py-3 text-xs text-slate-300 hover:bg-[#14171e] items-center transition-colors">
                    <div className="col-span-6 font-medium text-white truncate">{item.productName}</div>
                    <div className="col-span-2 text-center">
                      {editingId === item.id ? (
                        <input
                          type="number"
                          min="1"
                          value={editQty}
                          onChange={e => setEditQty(e.target.value)}
                          onBlur={() => handleUpdateQty(item.id)}
                          onKeyDown={e => { if (e.key === 'Enter') handleUpdateQty(item.id); if (e.key === 'Escape') setEditingId(null); }}
                          className="w-16 bg-[#0d0e12] border border-[#5aa6ec] rounded py-0.5 px-1.5 text-xs text-white font-mono text-center focus:outline-none"
                          autoFocus
                        />
                      ) : (
                        <span
                          onClick={() => { setEditingId(item.id); setEditQty(String(item.quantity)); }}
                          className="cursor-pointer font-mono font-bold text-amber-400 hover:text-amber-300"
                        >
                          {item.quantity}
                        </span>
                      )}
                    </div>
                    <div className="col-span-4 text-right flex items-center justify-end gap-2">
                      <button
                        onClick={() => { setEditingId(item.id); setEditQty(String(item.quantity)); }}
                        className="text-slate-500 hover:text-white transition-colors"
                        title="Editar cantidad"
                      >
                        <Package size={12} />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id, item.productName)}
                        className="text-slate-500 hover:text-emerald-400 transition-colors"
                        title="Marcar como repuesto"
                      >
                        <CheckCircle size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}