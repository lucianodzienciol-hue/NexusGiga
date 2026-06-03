import React, { useState } from 'react';
import { Plus, Trash2, ShieldAlert, ArrowDownCircle, CheckSquare, Search } from 'lucide-react';
import { Product, Provider } from '../types';

interface ComprarProps {
  products: Product[];
  providers: Provider[];
  onPurchaseCompleted: () => void;
}

export default function Comprar({ products, providers, onPurchaseCompleted }: ComprarProps) {
  // Main form states
  const [selectedProvider, setSelectedProvider] = useState('');
  const [items, setItems] = useState<{ productId: string; productName: string; quantity: number; cost: number }[]>([]);

  // Individual item states
  const [selectedProduct, setSelectedProduct] = useState('');
  const [qty, setQty] = useState('10');
  const [cost, setCost] = useState('');

  const activeProvider = providers.find(p => p.id === selectedProvider);

  // Auto-fill cost when product is selected
  const handleProductChange = (id: string) => {
    setSelectedProduct(id);
    const prod = products.find(p => p.id === id);
    if (prod) {
      setCost(prod.cost.toString());
    }
  };

  const addItemToPurchase = () => {
    if (!selectedProduct) {
      alert('Por favor seleccione un artículo.');
      return;
    }
    const quantityVal = parseInt(qty) || 0;
    const costVal = parseFloat(cost) || 0;

    if (quantityVal <= 0 || costVal <= 0) {
      alert('La cantidad y costo deben ser mayores a cero.');
      return;
    }

    const prod = products.find(p => p.id === selectedProduct);
    if (!prod) return;

    // Check if product already exists in draft list
    const existingIndex = items.findIndex(it => it.productId === selectedProduct);
    if (existingIndex !== -1) {
      const updated = [...items];
      updated[existingIndex].quantity += quantityVal;
      setItems(updated);
    } else {
      setItems([
        ...items,
        {
          productId: selectedProduct,
          productName: prod.name,
          quantity: quantityVal,
          cost: costVal
        }
      ]);
    }

    // Reset item input
    setSelectedProduct('');
    setQty('10');
    setCost('');
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, idx) => idx !== index));
  };

  const purchaseTotal = items.reduce((sum, item) => sum + (item.cost * item.quantity), 0);

  const submitPurchase = async () => {
    if (!selectedProvider) {
      alert('Por favor seleccione un proveedor primero.');
      return;
    }
    if (items.length === 0) {
      alert('Agregue al menos un producto a la lista de compra.');
      return;
    }

    const payload = {
      providerId: selectedProvider,
      providerName: activeProvider?.name || 'Proveedor General',
      items,
      total: purchaseTotal
    };

    try {
      const resp = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (resp.ok) {
        alert('¡Abastecimiento registrado con éxito! El stock ha sido reabastecido.');
        setItems([]);
        setSelectedProvider('');
        onPurchaseCompleted();
      } else {
        alert('Ocurrió un error al guardar el abastecimiento.');
      }
    } catch (err) {
      console.error('Error submitting purchase:', err);
      alert('Error de conexión con el servidor.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#111318] border border-[#1f242e] rounded-xl p-6">
        <div>
          <h1 className="text-xl font-bold font-display text-white">Reabastecimiento de Inventario (Compras)</h1>
          <p className="text-xs text-slate-400 mt-1">Registre facturas de compra para reponer unidades en el almacenaje local automáticamente.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Purchasing Draft List */}
        <div className="lg:col-span-2 bg-[#111318] border border-[#1f242e] rounded-xl p-5 flex flex-col justify-between min-h-[420px]">
          <div>
            <div className="border-b border-[#1f242e] pb-3 mb-4 flex justify-between items-center">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-white">Abastecimiento Actual</h2>
              <div className="text-xs text-amber-500 font-mono font-bold flex items-center gap-1">
                <ShieldAlert size={14} />
                <span>Auditoría de Entrada de Stock</span>
              </div>
            </div>

            {/* Provider Picker */}
            <div className="mb-6 space-y-1">
              <label className="text-[11px] text-slate-400 font-mono block">PROVEEDOR RECEPTOR *</label>
              <select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
                className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-2 px-3 text-xs text-white focus:outline-none"
              >
                <option value="">-- Seleccionar Proveedor --</option>
                {providers.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.ruc})</option>
                ))}
              </select>
            </div>

            {/* Table layout of draft */}
            <div className="overflow-hidden rounded-lg border border-[#1b1e26] bg-[#0d0e12] min-h-[180px]">
              {items.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-500 italic mt-6">
                  La lista de abastecimiento está vacía. Use el módulo lateral para reabastecer productos.
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#181a20] border-b border-[#2d3444] text-[10px] tracking-wider text-slate-400 font-mono uppercase">
                      <th className="py-2.5 px-4">ARTÍCULO</th>
                      <th className="py-2.5 px-4 text-center">CANT. ENTRADA</th>
                      <th className="py-2.5 px-4 text-right">COSTO COMPRA</th>
                      <th className="py-2.5 px-4 text-right">PARCIAL</th>
                      <th className="py-2.5 px-4 text-center">ELIMINAR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => (
                      <tr key={idx} className="border-b border-[#1b1e26] text-xs hover:bg-[#14171e]">
                        <td className="py-2.5 px-4 text-white font-medium">{it.productName}</td>
                        <td className="py-2.5 px-4 text-center font-mono font-bold text-amber-500">+{it.quantity}</td>
                        <td className="py-2.5 px-4 text-right font-mono text-slate-300">${it.cost.toFixed(0)}</td>
                        <td className="py-2.5 px-4 text-right font-mono font-semibold text-blue-400">
                          ${(it.cost * it.quantity).toFixed(0)}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <button
                            onClick={() => removeItem(idx)}
                            className="text-slate-500 hover:text-red-400 p-1 rounded"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Sum total and execute button */}
          <div className="mt-8 pt-4 border-t border-[#1f242e] flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-left">
              <span className="text-[10px] tracking-widest text-slate-400 font-mono block uppercase">Total Documentado</span>
              <div className="text-3xl font-extrabold font-mono text-[#5aa6ec]">
                ${purchaseTotal.toFixed(0)}
              </div>
            </div>

            <button
              onClick={submitPurchase}
              disabled={items.length === 0 || !selectedProvider}
              className={`py-3 px-6 rounded-lg font-bold text-xs tracking-wider uppercase transition-all shadow-md flex items-center gap-1.5 cursor-pointer ${
                items.length === 0 || !selectedProvider
                  ? 'bg-[#1b222d] text-slate-500 border border-[#252e3d] cursor-not-allowed'
                  : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.15)] font-bold'
              }`}
            >
              <CheckSquare size={14} />
              REGISTRAR COMPRA
            </button>
          </div>
        </div>

        {/* Adding tool segment */}
        <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-5 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white border-b border-[#1f242e] pb-2">
            Añadir Artículo al Abastecimiento
          </h3>

          <div className="space-y-4 text-xs">
            <div className="space-y-1">
              <label className="text-slate-400 block font-mono text-[10px]">SELECCIONAR ARTÍCULO *</label>
              <select
                value={selectedProduct}
                onChange={(e) => handleProductChange(e.target.value)}
                className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-2 px-3 text-white focus:outline-none"
              >
                <option value="">-- Buscar Producto --</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name} (Stock: {p.stock})</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-slate-400 block font-mono text-[10px]">CANTIDAD *</label>
                <input
                  type="number"
                  placeholder="Ej: 10"
                  className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg p-2 text-white placeholder-slate-600 focus:outline-none font-mono"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 block font-mono text-[10px]">COSTO UNIT. * ($)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg p-2 text-white placeholder-slate-600 focus:outline-none font-mono"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={addItemToPurchase}
                className="w-full py-2.5 rounded-lg border border-[#2d3444] text-[#5aa6ec] hover:bg-[#1a1d24] hover:text-white font-bold transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus size={14} />
                Agregar Abastecimiento
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
