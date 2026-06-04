import React, { useState, useEffect, useRef } from 'react';
import { Search, Printer, Trash2, Plus, Minus, X, CreditCard, DollarSign, ArrowRight, UserPlus, ShoppingCart, Eye } from 'lucide-react';
import { Product, Client, CartItem, PaymentMethod, CompanyConfig } from '../types';
import ticketTemplate from '../ticketTemplate';


interface TerminalVentaProps {
  products: Product[];
  clients: Client[];
  paymentMethods: PaymentMethod[];
  companyConfig: CompanyConfig | null;
  stockWarningEnabled: boolean;
  onSaleCompleted: () => void;
  onNavigateToClients: () => void;
}

export default function TerminalVenta({ products, clients, paymentMethods, companyConfig, stockWarningEnabled, onSaleCompleted, onNavigateToClients }: TerminalVentaProps) {
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = sessionStorage.getItem('nexus_pos_cart');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('TODAS');
  const [isSearching, setIsSearching] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  
  // Checkout States
  const defaultClientId = '';
  const [selectedClient, setSelectedClient] = useState<string>(defaultClientId);
  const [paymentMethod, setPaymentMethod] = useState<string>('Efectivo');
  const [cashReceived, setCashReceived] = useState<string>('');
  const [ticketPrinted, setTicketPrinted] = useState(false);
  const [lastFinishedSale, setLastFinishedSale] = useState<any | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 10));

  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [customPrices, setCustomPrices] = useState<Record<string, string>>(() => {
    try {
      const saved = sessionStorage.getItem('nexus_pos_customPrices');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  // Persist cart and custom prices to sessionStorage on change
  useEffect(() => {
    sessionStorage.setItem('nexus_pos_cart', JSON.stringify(cart));
  }, [cart]);
  useEffect(() => {
    sessionStorage.setItem('nexus_pos_customPrices', JSON.stringify(customPrices));
  }, [customPrices]);

  // Categories list
  const categories = ['TODAS', ...Array.from(new Set(products.map(p => p.category)))];

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && dropdownRef.current) {
      const item = dropdownRef.current.querySelector(`[data-index="${highlightedIndex}"]`);
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  // Filter products by category & search query, sorted alphabetically
  const filteredProducts = React.useMemo(() => products
    .filter(p => {
      const matchesCategory = selectedCategory === 'TODAS' || p.category === selectedCategory;
      const cleanQuery = searchQuery.toLowerCase().trim();
      const matchesSearch = p.name.toLowerCase().includes(cleanQuery) || p.code.includes(cleanQuery);
      return matchesCategory && matchesSearch;
    })
    .sort((a, b) => a.name.localeCompare(b.name)),
  [products, selectedCategory, searchQuery]);

  const getEffectivePrice = (item: CartItem) => {
    const cp = customPrices[item.product.id];
    return cp !== undefined ? (parseFloat(cp) || 0) : item.product.price;
  };

  const cartTotal = cart.reduce((sum, item) => sum + (getEffectivePrice(item) * item.quantity), 0);

  const selectedMethod = paymentMethods.find(pm => pm.name === paymentMethod);
  const adjustmentPct = selectedMethod?.adjustment || 0;
  const adjustedTotal = cartTotal * (1 + adjustmentPct / 100);

  // Keyboard navigation listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setIsSearching(true);
        return;
      }

      if (e.key === 'Escape') {
        if (checkoutOpen) { setCheckoutOpen(false); return; }
        if (showPreview) { setShowPreview(false); return; }
        if (isSearching) { setIsSearching(false); setSearchQuery(''); setHighlightedIndex(-1); searchInputRef.current?.blur(); return; }
        searchInputRef.current?.blur();
        return;
      }

      if (isSearching && searchQuery.trim().length > 0 && filteredProducts.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setHighlightedIndex(prev => Math.min(prev + 1, filteredProducts.length - 1));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setHighlightedIndex(prev => Math.max(prev - 1, 0));
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          const idx = highlightedIndex >= 0 ? highlightedIndex : 0;
          if (idx < filteredProducts.length) {
            addToCart(filteredProducts[idx]);
            setHighlightedIndex(-1);
          }
          return;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearching, searchQuery, filteredProducts, highlightedIndex, checkoutOpen, showPreview]);

  const addToCart = (product: Product) => {
    if (stockWarningEnabled && product.stock <= 0) {
      alert(`¡Advertencia! El stock de ${product.name} está en 0. Se procederá de todos modos.`);
    }
    
    setCart(prevCart => {
      const existing = prevCart.find(item => item.product.id === product.id);
      if (existing) {
        // limit cart additions to realistic numbers, or stock if strictly restricted
        return prevCart.map(item => 
          item.product.id === product.id 
            ? { ...item, quantity: item.quantity + 1 } 
            : item
        );
      }
      return [...prevCart, { product, quantity: 1 }];
    });
    setSearchQuery('');
    setIsSearching(false);
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prevCart => 
      prevCart.map(item => {
        if (item.product.id === productId) {
          const newQty = Math.max(1, item.quantity + delta);
          return { ...item, quantity: newQty };
        }
        return item;
      })
    );
  };

  const removeFromCart = (productId: string) => {
    setCart(prevCart => prevCart.filter(item => item.product.id !== productId));
  };

  const clearCart = () => {
    if (cart.length === 0) return;
    if (confirm('¿Está seguro de que desea vaciar el carrito actual?')) {
      setCart([]);
      setCustomPrices({});
    }
  };

  const handleOpenCheckout = () => {
    if (cart.length === 0) return;
    setCashReceived(adjustedTotal.toFixed(0));
    setTicketPrinted(false);
    setCheckoutOpen(true);
  };

  const submitSale = async () => {
    const cash = parseFloat(cashReceived) || adjustedTotal;
    const change = Math.max(0, cash - adjustedTotal);
    const clientObj = clients.find(c => c.id === selectedClient);

    const salePayload = {
      items: cart.map(item => ({
        productId: item.product.id,
        productName: item.product.name,
        quantity: item.quantity,
        price: getEffectivePrice(item)
      })),
      total: adjustedTotal,
      paymentMethod,
      clientId: selectedClient,
      clientName: clientObj?.name || 'Cliente General',
      cashReceived: cash,
      change: change,
      date: new Date(saleDate + 'T' + new Date().toTimeString().slice(0, 8)).toISOString()
    };

    try {
      const response = await fetch('/api/sales', {
        method: 'POST',
        headers: {      'Content-Type': 'application/json' },
        body: JSON.stringify(salePayload)
      });
      if (response.ok) {
        const finishedSale = await response.json();
        setLastFinishedSale(finishedSale);
        setTicketPrinted(true);
        setCart([]);
        setCustomPrices({});
        onSaleCompleted();
      } else {
        alert('Error al registrar la venta.');
      }
    } catch (err) {
      console.error('Error submitting sale:', err);
      alert('Error de conexión con el servidor.');
    }
  };

  const simulatePrintTicket = () => {
    if (!lastFinishedSale) {
      alert('No hay ninguna venta reciente para imprimir ticket.');
      return;
    }
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('El navegador bloqueó la ventana emergente de impresión. Por favor permita popups.');
      return;
    }
    printWindow.document.write(ticketTemplate(lastFinishedSale, false, companyConfig || undefined));
    printWindow.document.close();
  };

  const showFullScreenTicket = () => {
    if (!lastFinishedSale) return;
    const w = window.open('', '_blank');
    if (!w) { alert('Permita popups para ver la venta en pantalla completa.'); return; }
    const s = lastFinishedSale;
    const c = companyConfig || {} as CompanyConfig;
    const itemsHtml = s.items.map((it: any) => `
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
    ${c.address ? `<p>${c.address}${c.phone ? ' · '+c.phone : ''}</p>` : ''}
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-10 gap-6 h-full items-stretch">
      {/* LEFT COLUMN: Main Sale Terminal Area (approx 70%) */}
      <div className="lg:col-span-7 flex flex-col bg-[#111318] border border-[#1f242e] rounded-xl overflow-hidden p-6 relative">
        {/* Terminal Header - Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1f242e] pb-4 mb-4">
          {/* Quick Search and ADD Input */}
          <div className="relative w-full">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search size={16} />
            </div>
            <input
              id="nexus-pos-search-input"
              ref={searchInputRef}
              type="text"
              className="w-full pl-10 pr-3 py-2 text-sm bg-[#181a20] border border-[#2d3444] rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-mono transition-all"
              placeholder="Buscar producto (F1)..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setHighlightedIndex(-1);
                setIsSearching(true);
              }}
              onFocus={() => setIsSearching(true)}
            />
            {searchQuery && (
              <button 
                onClick={() => { setSearchQuery(''); setIsSearching(false); }}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-white"
              >
                <X size={14} />
              </button>
            )}

            {/* Float Search Dropdown */}
            {isSearching && searchQuery.trim().length > 0 && (
              <div ref={dropdownRef} className="absolute top-full left-0 right-0 mt-2 bg-[#181a20] border border-[#2d3444] rounded-lg shadow-2xl z-20 max-h-60 overflow-y-auto">
                {filteredProducts.length === 0 ? (
                  <div className="p-3 text-xs text-slate-500 italic text-center">No se encontraron artículos</div>
                ) : (
                  filteredProducts.map((p, idx) => (
                    <button
                      key={p.id}
                      data-index={idx}
                      onClick={() => { addToCart(p); setHighlightedIndex(-1); }}
                      className={`w-full text-left p-2.5 text-xs border-b border-[#242b38] last:border-0 flex items-center justify-between group transition-colors ${
                        idx === highlightedIndex ? 'bg-[#212631] border-l-2 border-l-[#5aa6ec]' : 'hover:bg-[#212631]'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className={`font-semibold ${idx === highlightedIndex ? 'text-blue-400' : 'text-white'} group-hover:text-blue-400`}>{p.name}</span>
                        <span className="text-[10px] text-slate-500 font-mono">COD: {p.code} | Stock: {p.stock}</span>
                      </div>
                      <span className="font-mono text-emerald-400 text-sm">${p.price.toFixed(0)}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 mt-1 uppercase tracking-wider font-mono">Categoría:</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-[#181a20] text-xs text-white border border-[#2d3444] rounded-lg py-1.5 px-3 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {/* CART TABLE VIEW */}
        <div className="flex-1 overflow-y-auto min-h-[320px] rounded-lg bg-[#0d0e12] border border-[#1b1e26]">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-12 text-slate-500 select-none">
              <ShoppingCart size={48} className="text-[#262b35] mb-4" />
              <p className="text-sm">La Terminal de Venta está vacía.</p>
              <p className="text-xs text-slate-600 mt-1">Busca artículos con F1, navegá con ↑↓ y seleccioná con ENTER.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#181a20] border-b border-[#2d3444] text-[11px] tracking-wider text-slate-400 font-mono uppercase">
                  <th className="py-3 px-4 w-20">COD</th>
                  <th className="py-3 px-4">Descripción del Artículo</th>
                  <th className="py-3 px-4 text-center w-36">Cant.</th>
                  <th className="py-3 px-4 text-right w-28">Precio</th>
                  <th className="py-3 px-4 text-right w-28">Subtotal</th>
                  <th className="py-3 px-4 text-center w-12"></th>
                </tr>
              </thead>
              <tbody>
                  {cart.map(item => (
                    <tr key={item.product.id} className="border-b border-[#1b1e26] hover:bg-[#14171e] text-sm group transition-all">
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-400">{item.product.code}</td>
                      <td className="py-3.5 px-4 font-medium text-white">{item.product.name}</td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-center gap-1.5 bg-[#181a20] rounded-md border border-[#2d3444] p-1 w-28 mx-auto">
                          <button onClick={() => updateQuantity(item.product.id, -1)} className="text-slate-400 hover:text-white hover:bg-[#242b38] rounded p-0.5"><Minus size={13} /></button>
                          <span className="font-mono text-white text-xs w-8 text-center select-none font-semibold">{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.product.id, 1)} className="text-slate-400 hover:text-white hover:bg-[#242b38] rounded p-0.5"><Plus size={13} /></button>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono">
                        <input type="text" value={customPrices[item.product.id] !== undefined ? customPrices[item.product.id] : item.product.price.toFixed(0)} onChange={(e) => { const val = e.target.value; setCustomPrices(prev => ({ ...prev, [item.product.id]: val })); }} className="w-24 bg-[#181a20] border border-[#2d3444] rounded py-1 px-2 text-xs text-right text-slate-300 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500" />
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-semibold text-blue-400">${(getEffectivePrice(item) * item.quantity).toFixed(0)}</td>
                      <td className="py-3.5 px-4 text-center">
                        <button onClick={() => removeFromCart(item.product.id)} className="text-slate-500 hover:text-red-400 p-1 rounded hover:bg-[#211417] transition-all"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: Sidebar (approx 30%) */}
      <div className="lg:col-span-3 flex flex-col gap-6">
        {/* Rapid Actions Panel */}
        <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-5 flex flex-col justify-between h-full min-h-[400px]">
          <div>
            <div className="border-b border-[#1f242e] pb-3 mb-4">
              <h2 className="text-base font-semibold text-white tracking-tight font-display">Acciones Rápidas</h2>
              <p className="text-xs text-slate-500 font-mono mt-0.5">Terminal 01 — Usuario: Admin</p>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={handleOpenCheckout}
                disabled={cart.length === 0}
                className={`w-full py-4 px-4 rounded-lg font-bold text-sm tracking-wide text-white uppercase shadow-md flex items-center justify-center gap-2 transform active:scale-[0.98] transition-all cursor-pointer ${
                  cart.length === 0
                    ? 'bg-[#1b222d] text-slate-500 border border-[#252e3d] cursor-not-allowed'
                    : 'bg-[#5aa6ec] hover:bg-[#4691db] text-slate-900 font-extrabold shadow-[0_0_15px_rgba(90,166,236,0.15)]'
                }`}
              >
                REALIZAR VENTA
                <ArrowRight size={16} />
              </button>

              <button
                onClick={() => setShowPreview(true)}
                disabled={cart.length === 0}
                className={`w-full py-2.5 px-4 rounded-lg text-xs font-semibold border flex items-center justify-center gap-2 transition-all ${
                  cart.length === 0
                    ? 'bg-transparent border-[#1f242e] text-slate-600 cursor-not-allowed'
                    : 'bg-transparent border-[#2d3444] text-slate-300 hover:bg-[#1a1d24] hover:text-white'
                }`}
              >
                <Eye size={14} />
                Previsualizar Venta
              </button>

              <button
                onClick={simulatePrintTicket}
                disabled={!lastFinishedSale}
                className={`w-full py-2.5 px-4 rounded-lg text-xs font-semibold border flex items-center justify-center gap-2 transition-all ${
                  !lastFinishedSale
                    ? 'bg-transparent border-[#1f242e] text-slate-600 cursor-not-allowed'
                    : 'bg-transparent border-[#2d3444] text-slate-300 hover:bg-[#1a1d24] hover:text-white'
                }`}
              >
                <Printer size={14} />
                Imprimir Ticket
              </button>

              <button
                onClick={clearCart}
                disabled={cart.length === 0}
                className={`w-full py-2.5 px-4 rounded-lg text-xs font-semibold border flex items-center justify-center gap-2 transition-all ${
                  cart.length === 0
                    ? 'bg-transparent border-[#1f242e] text-slate-600 cursor-not-allowed'
                    : 'bg-transparent border-[#3a1b1e] text-red-400 hover:bg-[#251012] hover:text-red-300'
                }`}
              >
                <Trash2 size={14} />
                Borrar Todo
              </button>
            </div>
          </div>

          {/* TOTAL CARD */}
          <div className="mt-8 bg-[#0d0e12] border border-[#1b1e26] rounded-xl p-5 shadow-inner">
            <span className="text-[10px] tracking-widest text-slate-400 font-mono block uppercase">Total a Pagar</span>
            <div className="text-4xl lg:text-4xl xl:text-5xl font-extrabold font-mono text-[#5aa6ec] mt-2 tracking-tight drop-shadow-[0_0_12px_rgba(90,166,236,0.2)]">
              ${cartTotal.toFixed(0)}
            </div>
          </div>
        </div>
      </div>

      {/* CHECKOUT FLOW MODAL (REALIZAR VENTA) */}
        {checkoutOpen && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#111318] border border-[#2d3444] rounded-xl max-w-lg w-full overflow-hidden shadow-2xl relative"
            >
              {/* Header */}
              <div className="bg-[#181a20] px-6 py-4 border-b border-[#2d3444] flex items-center justify-between">
                <div className="flex items-center gap-2 text-[#5aa6ec]">
                  <CreditCard size={20} />
                  <span className="font-semibold text-white font-display">Registrar Transacción</span>
                </div>
                <button
                  onClick={() => setCheckoutOpen(false)}
                  className="text-slate-400 hover:text-white rounded-lg p-1 hover:bg-[#1f242e]"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6">
                {!ticketPrinted ? (
                  <div className="space-y-4">
                    {/* Amount reminder */}
                    <div className="bg-[#0d0e12] rounded-lg p-4 flex flex-col gap-1 border border-[#1c222d]">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 text-xs">Subtotal:</span>
                        <span className="font-mono text-slate-400 text-sm">${cartTotal.toFixed(0)}</span>
                      </div>
                      {adjustmentPct !== 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 text-xs">Ajuste ({adjustmentPct > 0 ? '+' : ''}{adjustmentPct}%):</span>
                          <span className={`font-mono text-sm ${adjustmentPct > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                            {adjustmentPct > 0 ? '+' : ''}{(cartTotal * adjustmentPct / 100).toFixed(0)}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between items-center border-t border-[#1f242e] pt-1 mt-1">
                        <span className="text-slate-300 text-xs font-semibold">Total del pedido:</span>
                        <span className="text-2xl font-bold font-mono text-[#5aa6ec]">${adjustedTotal.toFixed(0)}</span>
                      </div>
                    </div>

                    {/* Sale Date */}
                    <div className="space-y-1.5">
                      <label className="text-slate-300 text-xs font-medium block">Fecha de Venta</label>
                      <input
                        type="date"
                        value={saleDate}
                        onChange={e => setSaleDate(e.target.value)}
                        className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-2 px-3 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    {/* Client Selection */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <label className="text-slate-300 font-medium">Asignar Cliente</label>
                        <button 
                          onClick={() => { setCheckoutOpen(false); onNavigateToClients(); }}
                          className="text-[#5aa6ec] hover:underline flex items-center gap-1"
                        >
                          <UserPlus size={12} />
                          Listado de clientes
                        </button>
                      </div>
                      <select
                        value={selectedClient}
                        onChange={(e) => setSelectedClient(e.target.value)}
                        className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="">Cliente General</option>
                        {clients.map(c => (
                          <option key={c.id} value={c.id}>{c.name} ({c.document})</option>
                        ))}
                      </select>
                    </div>

                    {/* Method Seleciton */}
                    <div className="space-y-2">
                      <label className="text-slate-300 text-xs font-medium block">Forma de Pago</label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {(paymentMethods.length > 0 ? paymentMethods : [{ id: 'pm1', name: 'Efectivo', requiresCash: true }]).map(method => (
                          <button
                            key={method.id}
                            type="button"
                            onClick={() => {
                              setPaymentMethod(method.name);
                              const adj = cartTotal * (1 + (method.adjustment || 0) / 100);
                              if (!method.requiresCash) {
                                setCashReceived(adj.toFixed(0));
                              }
                            }}
                            className={`py-2 px-3 text-xs rounded-lg font-semibold border transition-all text-center ${
                              paymentMethod === method.name
                                ? 'bg-[#5aa6ec]/10 border-[#5aa6ec] text-[#5aa6ec]'
                                : 'bg-transparent border-[#2d3444] text-slate-400 hover:bg-[#181a20]'
                            }`}
                          >
                            <span>{method.name}</span>
                            {method.adjustment ? <span className={`text-[9px] ml-1 ${(method.adjustment || 0) > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{(method.adjustment || 0) > 0 ? '+' : ''}{method.adjustment}%</span> : null}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Cash received & Change - only for methods that require cash */}
                    {(() => {
                      const selected = paymentMethods.find(pm => pm.name === paymentMethod);
                      return selected?.requiresCash !== false;
                    })() && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-slate-300 text-xs font-medium block">Paga Con:</label>
                          <div className="relative">
                            <span className="absolute left-3 inset-y-0 flex items-center text-slate-500 text-xs font-mono">$</span>
                            <input
                              type="text"
                              className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-2 pl-7 pr-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                              placeholder="0.00"
                              value={cashReceived}
                              onChange={(e) => setCashReceived(e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-slate-300 text-xs font-medium block">Devolver Cambio:</label>
                          <div className="bg-[#181a20] border border-[#2d3444] rounded-lg py-2 px-3 text-sm text-amber-400 font-semibold font-mono h-[38px] flex items-center">
                            ${Math.max(0, (parseFloat(cashReceived) || 0) - adjustedTotal).toFixed(0)}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="pt-4 border-t border-[#1f242e] flex gap-3">
                      <button
                        type="button"
                        onClick={() => setCheckoutOpen(false)}
                        className="flex-1 py-2 rounded-lg border border-[#2d3444] text-xs font-semibold text-slate-400 hover:bg-[#1a1d24] hover:text-white"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={submitSale}
                        className="flex-1 py-2 rounded-lg bg-[#238636] hover:bg-[#2ea043] font-bold text-xs text-white uppercase tracking-wide"
                      >
                        Confirmar Venta
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <div className="h-12 w-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-4 scale-110">
                      <ShoppingCart size={24} />
                    </div>
                    <h3 className="text-white font-semibold font-display text-lg">¡Venta Registrada Exitosamente!</h3>
                    <p className="text-xs text-slate-400 mt-2">La venta ha sido guardada en la base de datos local.</p>

                    <div className="my-6 p-4 rounded bg-[#0d0e12] border border-[#1c222d] max-w-sm mx-auto text-left font-mono text-[11px] leading-relaxed select-all shadow-inner">
                      <div className="text-center font-bold pb-2 border-b border-dashed border-slate-700">=== TICKET SIMULADO ===</div>
                      <div className="mt-2 text-slate-300">ID Venta: {lastFinishedSale?.id}</div>
                      <div className="text-slate-300">Cliente: {lastFinishedSale?.clientName}</div>
                      <div className="border-b border-dashed border-slate-800 my-1.5"></div>
                      {lastFinishedSale?.items.map((it: any, idx: number) => (
                        <div key={idx} className="flex justify-between text-slate-300">
                          <span>{it.productName} x{it.quantity}</span>
                          <span>${(it.price * it.quantity).toFixed(0)}</span>
                        </div>
                      ))}
                      <div className="border-b border-dashed border-slate-800 my-1.5"></div>
                      <div className="flex justify-between font-bold text-white text-xs">
                        <span>TOTAL PAID:</span>
                        <span>${lastFinishedSale?.total.toFixed(0)}</span>
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>Forma de Pago:</span>
                        <span>{lastFinishedSale?.paymentMethod}</span>
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>Recibido:</span>
                        <span>${Number(lastFinishedSale?.cashReceived || 0).toFixed(0)}</span>
                      </div>
                      <div className="flex justify-between text-[10px] text-amber-400 font-semibold">
                        <span>Cambio:</span>
                        <span>${Number(lastFinishedSale?.change || 0).toFixed(0)}</span>
                      </div>
                    </div>

                    <div className="flex gap-3 max-w-sm mx-auto">
                      <button
                        onClick={simulatePrintTicket}
                        className="flex-1 py-2 rounded-lg bg-[#5aa6ec] hover:bg-[#4691db] text-slate-900 font-bold text-xs"
                      >
                        Imprimir Ticket
                      </button>
                      <button
                        onClick={showFullScreenTicket}
                        className="flex-1 py-2 rounded-lg bg-[#111318] border border-[#2d3444] hover:bg-[#1a1d24] text-white font-bold text-xs"
                      >
                        Pantalla Completa
                      </button>
                      <button
                        onClick={() => { setCheckoutOpen(false); setTicketPrinted(false); }}
                        className="flex-1 py-2 rounded-lg border border-[#2d3444] text-slate-400 hover:bg-[#1a1d24] hover:text-white text-xs font-semibold"
                      >
                        Cerrar Panel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      {/* PREVIEW SALE MODAL */}
        {showPreview && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#111318] border border-[#2d3444] rounded-xl max-w-md w-full overflow-hidden shadow-2xl">
              <div className="bg-[#181a20] px-6 py-4 border-b border-[#2d3444] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye size={18} className="text-[#5aa6ec]" />
                  <span className="font-semibold text-white font-display">Previsualizar Venta</span>
                </div>
                <button
                  onClick={() => setShowPreview(false)}
                  className="text-slate-400 hover:text-white rounded-lg p-1 hover:bg-[#1f242e]"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6">
                <div className="bg-[#0d0e12] border border-[#1c222d] rounded-xl p-5 font-mono text-xs leading-relaxed">
                  <div className="text-center font-bold text-white text-sm pb-3 border-b border-dashed border-slate-700">
                    PREVISUALIZACIÓN DE TICKET
                  </div>
                  <div className="mt-3 text-slate-400">
                    <div>Fecha: {new Date().toLocaleString()}</div>
                    <div>Atendido por: Admin</div>
                    <div>Artículos: {cart.reduce((s, i) => s + i.quantity, 0)} unidades</div>
                  </div>
                  <div className="border-b border-dashed border-slate-800 my-3"></div>
                  <div className="text-[10px] font-bold uppercase text-slate-500 tracking-wider mb-2">Detalle:</div>
                  {cart.map((item, idx) => (
                    <div key={idx} className="flex justify-between py-1 border-b border-[#1f242e] last:border-0">
                      <span className="text-slate-300">{item.product.name} <span className="text-slate-500">x{item.quantity}</span></span>
                      <span className="text-[#5aa6ec] font-semibold">${(getEffectivePrice(item) * item.quantity).toFixed(0)}</span>
                    </div>
                  ))}
                  <div className="border-b border-dashed border-slate-800 my-3"></div>
                  <div className="flex justify-between font-bold text-white text-base">
                    <span>TOTAL:</span>
                    <span>${cartTotal.toFixed(0)}</span>
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setShowPreview(false)}
                    className="flex-1 py-2 rounded-lg border border-[#2d3444] text-xs font-semibold text-slate-400 hover:bg-[#1a1d24] hover:text-white"
                  >
                    Cerrar
                  </button>
                  <button
                    onClick={() => { setShowPreview(false); handleOpenCheckout(); }}
                    className="flex-1 py-2 rounded-lg bg-[#5aa6ec] hover:bg-[#4691db] text-slate-900 font-bold text-xs flex items-center justify-center gap-1.5"
                  >
                    Ir a Cobrar
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
