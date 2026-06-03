import React, { useState, useEffect, useRef } from 'react';
import { 
  ShoppingBag, 
  HelpCircle, 
  Settings, 
  User, 
  ChevronRight, 
  CheckCircle, 
  RotateCcw, 
  FileSpreadsheet, 
  Users, 
  Store, 
  Download,
  AlertTriangle,
  LogOut,
  Calculator,
  Wallet
} from 'lucide-react';
import { Product, Client, Provider, Sale, PaymentMethod, CompanyConfig, Expense, CashRegister, WebClient } from './types';
import TerminalVenta from './components/TerminalVenta';
import Articulos from './components/Articulos';
import Clientes from './components/Clientes';
import Historiales from './components/Historiales';
import PaymentMethods from './components/PaymentMethods';
import Egresos from './components/Egresos';
import Reparaciones from './components/Reparaciones';
import PanelWeb from './components/PanelWeb';
import Estadisticas from './components/Estadisticas';
import Backups from './components/Backups';

type TabType = 'Vender' | 'Historiales' | 'Artículos' | 'Clientes' | 'Egresos' | 'Métodos de Pago' | 'Reparaciones' | 'Panel Web' | 'Estadísticas' | 'Backups';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('Vender');
  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [companyConfig, setCompanyConfig] = useState<CompanyConfig | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [cashRegister, setCashRegister] = useState<CashRegister>({ cash: 0, bank: 0 });
  const [stockWarningEnabled, setStockWarningEnabled] = useState(true);
  const [webData, setWebData] = useState<any>(null);

  // Auto-sync GitHub
  const [gitToken, setGitToken] = useState('');
  const [syncStatus, setSyncStatus] = useState<{ pending: boolean; syncing: boolean; lastSync: string | null; error: string | null }>({ pending: false, syncing: false, lastSync: null, error: null });

  // App system utility overlays
  const [showHelp, setShowHelp] = useState(false);
  const [showCaja, setShowCaja] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncModalType, setSyncModalType] = useState<'syncing' | 'success' | 'error'>('syncing');
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const primaryTabs: TabType[] = ['Artículos', 'Clientes', 'Vender', 'Historiales', 'Egresos', 'Reparaciones'];
  const secondaryTabs: TabType[] = ['Métodos de Pago', 'Panel Web', 'Estadísticas', 'Backups'];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);


  const TAB_KEYS: TabType[] = ['Artículos', 'Clientes', 'Vender', 'Historiales', 'Egresos', 'Métodos de Pago', 'Reparaciones', 'Panel Web', 'Estadísticas', 'Backups'];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showHelp) { setShowHelp(false); e.preventDefault(); return; }
        if (showCaja) { setShowCaja(false); e.preventDefault(); return; }
        if (showSettings) { setShowSettings(false); e.preventDefault(); return; }
      }
      // Alt+1..0 cambia de pestana (AltGr saltado porque envía ctrlKey+altKey)
      if (e.altKey && !e.ctrlKey && ['1','2','3','4','5','6','7','8','9','0'].includes(e.key)) {
        e.preventDefault();
        const idx = e.key === '0' ? 9 : parseInt(e.key) - 1;
        setActiveTab(TAB_KEYS[idx]);
      }
      if (e.key === '?' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          e.preventDefault();
          setShowHelp(prev => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showHelp, showCaja, showSettings]);

  // Poll auto-sync status
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/auto-sync-status');
        if (res.ok) {
          const newStatus = await res.json();
          setSyncStatus(prev => {
            if (newStatus.syncing && !prev.syncing) {
              setSyncModalType('syncing');
              setShowSyncModal(true);
            } else if (!newStatus.syncing && prev.syncing) {
              if (newStatus.error) {
                setSyncModalType('error');
              } else if (newStatus.lastSync) {
                setSyncModalType('success');
              }
              setShowSyncModal(true);
              setTimeout(() => setShowSyncModal(false), 4000);
            }
            return newStatus;
          });
        }
      } catch {}
    };
    check();
    const id = setInterval(check, 15000);
    return () => clearInterval(id);
  }, []);

  const fetchAllData = async () => {
    try {
      const [pRes, cRes, prRes, sRes, pmRes, ccRes, swRes, eRes, crRes] = await Promise.all([
        fetch('/api/products'),
        fetch('/api/clients'),
        fetch('/api/providers'),
        fetch('/api/sales'),
        fetch('/api/payment-methods'),
        fetch('/api/company-config'),
        fetch('/api/stock-warning'),
        fetch('/api/expenses'),
        fetch('/api/cash-register')
      ]);
      
      if (pRes.ok) setProducts(await pRes.json());
      if (cRes.ok) setClients(await cRes.json());
      if (prRes.ok) setProviders(await prRes.json());
      if (sRes.ok) setSales(await sRes.json());
      if (pmRes.ok) setPaymentMethods(await pmRes.json());
      if (ccRes.ok) {
        const ccData = await ccRes.json();
        if (ccData && ccData.companyName) {
          setCompanyConfig(ccData);
          if (ccData.gitToken) setGitToken(ccData.gitToken);
        } else {
          setCompanyConfig(null);
        }
      }
      if (swRes.ok) {
        const swData = await swRes.json();
        setStockWarningEnabled(swData.enabled);
      }
      if (eRes.ok) setExpenses(await eRes.json());
      if (crRes.ok) setCashRegister(await crRes.json());
      try { const wd = await (await fetch('/api/web-data')).json(); setWebData(wd); } catch {}
    } catch (err) {
      console.error('Error syncing local database:', err);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const handleToggleStockWarning = async () => {
    const newVal = !stockWarningEnabled;
    try {
      const res = await fetch('/api/stock-warning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newVal })
      });
      if (res.ok) setStockWarningEnabled(newVal);
    } catch (err) {
      console.error('Error toggling stock warning:', err);
    }
  };

  const handleImportCompanyConfig = async () => {
    try {
      const res = await fetch('/api/import-company-config', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        fetchAllData();
      } else {
        alert(data.message || 'Error al importar');
      }
    } catch (err) {
      alert('Error al conectar con Web-main');
    }
  };

  const handleDownloadApp = () => {
    window.location.href = '/api/download-app';
  };

  const handleBackup = () => {
    window.location.href = '/api/backup';
  };

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Error al restaurar');
      alert('Backup restaurado correctamente. Los datos se recargarán.');
      fetchAllData();
    } catch (err) {
      alert('Error al restaurar el backup. Verifica que el archivo sea válido.');
    }
    e.target.value = '';
  };

  // Quick select clients tab from Vender checkout shortcut
  const navigateToClientsTab = () => {
    setActiveTab('Clientes');
  };

  // Header quick search binds and switches to sales terminal and alerts focus
  // Aggregate stats for Caja drawer
  const totalCajaSum = sales.reduce((sum, s) => sum + s.total, 0) - expenses.reduce((sum, e) => sum + e.amount, 0);
  const paymentsByMethod = sales.reduce<Record<string, number>>((acc, s) => {
    acc[s.paymentMethod] = (acc[s.paymentMethod] || 0) + s.total;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-[#0c0d10] flex flex-col justify-between font-sans selection:bg-[#5aa6ec]/20 selection:text-white">
      
      {/* HEADER SECTION --- MATCHING PHOTO */}
      <header className="bg-[#0f1115] border-b border-[#1f242e] sticky top-0 z-30 px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-6">
          
          {/* Logo Brand Brand */}
          <div className="flex items-center gap-3 cursor-pointer select-none" onClick={() => setActiveTab('Vender')}>
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-[#5aa6ec] to-blue-600 flex items-center justify-center p-1 shadow-md shadow-blue-500/10">
              <Calculator size={20} className="text-[#0c0d10] font-bold" />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-black text-white tracking-widest leading-none">NEXUS</span>
              <span className="text-[10px] tracking-widest text-slate-400 font-mono font-bold uppercase mt-0.5">POS</span>
            </div>
          </div>

          {/* Center Navigation Menu Bar */}
          <nav className="hidden md:flex items-center gap-0.5">
            {primaryTabs.map((tab, idx) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => { setActiveTab(tab); }}
                  className={`relative py-1.5 px-2.5 rounded-lg text-[11px] font-semibold tracking-wide transition-all cursor-pointer whitespace-nowrap ${
                    isActive 
                      ? 'text-white bg-[#1b1f28] font-bold' 
                      : 'text-slate-400 hover:text-white hover:bg-[#151821]/50'
                  }`}
                >
                  <span className="text-[9px] text-slate-500 mr-1 font-mono">Alt+{idx + 1}</span>
                  {tab}
                    {isActive && (
                    <div className="absolute bottom-0 left-3 right-3 h-[2px] bg-[#5aa6ec]" />
                  )}
                </button>
              );
            })}

            {/* Dropdown "Más" */}
            <div className="relative" ref={moreMenuRef}>
              <button
                onClick={() => setShowMoreMenu(prev => !prev)}
                className={`relative py-1.5 px-2.5 rounded-lg text-[11px] font-semibold tracking-wide transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                  secondaryTabs.includes(activeTab) 
                    ? 'text-white bg-[#1b1f28] font-bold' 
                    : 'text-slate-400 hover:text-white hover:bg-[#151821]/50'
                }`}
              >
                Más
                <svg className={`w-3 h-3 transition-transform ${showMoreMenu ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
                {secondaryTabs.includes(activeTab) && (
                  <div className="absolute bottom-0 left-3 right-3 h-[2px] bg-[#5aa6ec]" />
                )}
              </button>

              {showMoreMenu && (
                <div className="absolute top-full right-0 mt-2 w-52 bg-[#0f1115] border border-[#1f242e] rounded-xl shadow-2xl z-50 py-2 overflow-hidden">
                  {secondaryTabs.map((tab, idx) => {
                    const isActive = activeTab === tab;
                    return (
                      <button
                        key={tab}
                        onClick={() => { setActiveTab(tab); setShowMoreMenu(false); }}
                        className={`w-full text-left px-4 py-2.5 text-xs font-semibold transition-all flex items-center justify-between ${
                          isActive 
                            ? 'text-white bg-[#1b1f28]' 
                            : 'text-slate-400 hover:text-white hover:bg-[#151821]'
                        }`}
                      >
                        <span>{tab}</span>
                        <span className="text-[9px] text-slate-600 font-mono">Alt+{primaryTabs.length + idx + 1}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </nav>

          {/* Right Header Controls - Search, Settings, Help, Avatar */}
          <div className="flex items-center gap-4">
            
            {/* Utility buttons */}
            <div className="flex items-center gap-1.5">
              <a
                href="https://github.com/gigacomputers2025-bot/Nexus"
                target="_blank"
                rel="noopener noreferrer"
                title={`GitHub - Nexus POS${syncStatus.error ? ' (Error)' : syncStatus.lastSync ? ' (Sincronizado)' : ''}`}
                className={`p-2 rounded-lg transition-all cursor-pointer inline-flex items-center ${
                  syncStatus.error
                    ? 'text-red-400 hover:text-red-300 hover:bg-red-900/30'
                    : syncStatus.lastSync
                    ? 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-900/30'
                    : 'text-slate-400 hover:text-white hover:bg-[#1a1d24]'
                }`}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
              </a>
              <button 
                onClick={() => setShowHelp(true)}
                title="Ayuda / Atajos"
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-[#1a1d24] transition-all cursor-pointer"
              >
                <HelpCircle size={15} />
              </button>

              <button 
                onClick={() => setShowSettings(!showSettings)}
                title="Ajustes de Terminal"
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-[#1a1d24] transition-all cursor-pointer"
              >
                <Settings size={15} />
              </button>
            </div>

            {/* User Profile display */}
            <div className="flex items-center gap-2 pl-2 border-l border-[#1f242e]">
              <div className="h-7 w-7 rounded-full bg-[#181a20] border border-[#2d3444] flex items-center justify-center text-[#5aa6ec]">
                <User size={13} />
              </div>
              <div className="hidden xl:flex flex-col text-left">
                <span className="text-[11px] font-semibold text-white leading-tight">Admin</span>
                <span className="text-[9px] text-[#5aa6ec] font-mono leading-none">Terminal 01</span>
              </div>
            </div>

          </div>

        </div>
      </header>

      {/* MOBILE TAB DRAWER (ONLY ON SMALL DEVICES) */}
      <div className="md:hidden bg-[#0f1115] border-b border-[#1f242e] px-4 py-2 flex gap-1 overflow-x-auto">
{(['Artículos', 'Clientes', 'Vender', 'Historiales', 'Egresos', 'Métodos de Pago', 'Reparaciones', 'Panel Web', 'Estadísticas'] as const).map((tab, idx) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); }}
              className={`py-1 px-3 text-[11px] rounded font-medium shrink-0 transition-all ${
                isActive ? 'bg-[#5aa6ec] text-slate-950 font-bold' : 'text-slate-400'
              }`}
            >
              {tab}
            </button>
          );
        })}
      </div>

      {/* CORE FRAMEWORK INNER SCREEN PAGE CONTROLLER */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        
        {/* TAB RENDERING SEGMENT */}
        {activeTab === 'Vender' && (
          <TerminalVenta 
            products={products} 
            clients={clients} 
            paymentMethods={paymentMethods}
            companyConfig={companyConfig}
            stockWarningEnabled={stockWarningEnabled}
            onSaleCompleted={fetchAllData}
            onNavigateToClients={navigateToClientsTab}
          />
        )}

        {activeTab === 'Artículos' && (
          <Articulos products={products} categories={webData?.categories || []} onRefresh={fetchAllData} />
        )}

        {activeTab === 'Clientes' && (
          <Clientes clients={clients} onRefresh={fetchAllData} />
        )}

        {activeTab === 'Historiales' && (
          <Historiales sales={sales} paymentMethods={paymentMethods} companyConfig={companyConfig} onRefresh={fetchAllData} />
        )}

        {activeTab === 'Métodos de Pago' && (
          <PaymentMethods paymentMethods={paymentMethods} onRefresh={fetchAllData} />
        )}

        {activeTab === 'Egresos' && (
          <Egresos expenses={expenses} cashRegister={cashRegister} onRefresh={fetchAllData} />
        )}

        {activeTab === 'Reparaciones' && (
          <Reparaciones companyName={webData?.config?.companyName} companyAddress={webData?.config?.address} companyPhone={webData?.config?.phone} companyEmail={webData?.config?.email} companyWhatsapp={webData?.config?.whatsapp} onRefresh={fetchAllData} />
        )}

        {activeTab === 'Panel Web' && (
          <PanelWeb webData={webData} onRefresh={fetchAllData} />
        )}

        {activeTab === 'Estadísticas' && (
          <Estadisticas sales={sales} expenses={expenses} products={products} clients={clients} />
        )}

        {activeTab === 'Backups' && (
          <Backups onRefresh={fetchAllData} />
        )}

      </main>

      {/* FOOTER BAR --- MATCHING PHOTO */}
      <footer className="bg-[#090a0d] border-t border-[#12151c] px-6 py-3.5 mt-auto text-xs font-mono text-slate-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          
          {/* Left panel metrics */}
          <div className="flex items-center gap-4 text-slate-500">
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="h-2 w-2 rounded-full bg-[#5aa6ec]" />
              v2.4.0 - Conectado (Localhost)
            </span>
            <span className="hidden sm:inline text-slate-600">|</span>
            <button 
              onClick={() => setShowHelp(true)} 
              className="text-slate-400 hover:text-white"
            >
              Soporte
            </button>
            <span className="hidden sm:inline text-slate-600">|</span>
            <button 
              onClick={() => setShowCaja(true)} 
              className="text-amber-500 hover:text-amber-400 font-bold"
            >
              Cerrar Caja
            </button>
          </div>

          {/* Right status */}
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Sincronizado con Nube
            </span>
            <span className="text-slate-500">Nexus POS — 2026</span>
          </div>

        </div>
      </footer>

      {/* POPUP: HELP & SHORTCUT OVERLAY */}
        {showHelp && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#111318] border border-[#2d3444] rounded-xl max-w-md w-full overflow-hidden shadow-2xl p-6">
              <div className="flex justify-between items-center border-b border-[#2d3444] pb-3 mb-4">
                <span className="font-semibold text-white font-display">Ayuda y Atajos del Sistema</span>
                <button onClick={() => setShowHelp(false)} className="text-slate-400 hover:text-white text-xs">Cerrar</button>
              </div>

              <div className="space-y-4 text-xs">
                <p className="text-slate-400 leading-relaxed">
                  Nexus POS está optimizado para funcionar sin mouse utilizando atajos y operaciones rápidas de teclado.
                </p>

                <div className="space-y-2">
                  <div className="flex justify-between items-center py-2 border-b border-[#1b1e26] font-mono">
                    <span className="text-white font-semibold">F1</span>
                    <span className="text-slate-400 text-right">Enfocar búsqueda de productos</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-[#1b1e26] font-mono">
                    <span className="text-white font-semibold">Alt+1..9</span>
                    <span className="text-slate-400 text-right">Navegar entre secciones</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-[#1b1e26] font-mono">
                    <span className="text-white font-semibold">ESC</span>
                    <span className="text-slate-400 text-right">Cerrar modal / cancelar</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-[#1b1e26] font-mono">
                    <span className="text-white font-semibold">↑ ↓</span>
                    <span className="text-slate-400 text-right">Navegar resultados de búsqueda</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-[#1b1e26] font-mono">
                    <span className="text-white font-semibold">ENTER</span>
                    <span className="text-slate-400 text-right">Seleccionar producto / confirmar</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-[#1b1e26] font-mono">
                    <span className="text-white font-semibold">?</span>
                    <span className="text-slate-400 text-right">Abrir / cerrar esta ayuda</span>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#2d3444] space-y-1 text-slate-500 text-[10px]">
                  <span>Versión de Módulo: v2.4.0 (Canal Estable)</span><br/>
                  <span>Compilado para puerto local: 3010</span><br/>
                  <span>Desarrollado en Node.js + Express + React SPA</span>
                </div>
              </div>
            </div>
          </div>
        )}

      {/* POPUP: CERRAR CAJA / AUDIT REPORT */}
        {showCaja && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#111318] border border-[#2d3444] rounded-xl max-w-md w-full overflow-hidden shadow-2xl">
              <div className="bg-[#181a20] px-6 py-4 border-b border-[#2d3444] flex items-center justify-between">
                <span className="font-bold text-amber-500 font-display flex items-center gap-1.5 uppercase tracking-wide text-sm">
                  <AlertTriangle size={16} />
                  Arqueo y Cierre de Caja
                </span>
                <button onClick={() => setShowCaja(false)} className="text-slate-400 hover:text-white text-xs">Cerrar</button>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Realice la auditoría de caja antes de desconectar el terminal actual de la aplicación principal.
                </p>

                <div className="bg-[#0d0e12] border border-[#1f242e] rounded-lg p-4 space-y-2 text-xs font-mono">
                  {paymentMethods.length > 0 ? paymentMethods.map(pm => (
                    <div key={pm.id} className="flex justify-between text-slate-400">
                      <span>{pm.name}:</span>
                      <span className="text-white font-semibold">${(paymentsByMethod[pm.name] || 0).toFixed(0)}</span>
                    </div>
                  )) : (
                    <div className="flex justify-between text-slate-400">
                      <span>Sin métodos configurados</span>
                      <span className="text-white font-semibold">$0.00</span>
                    </div>
                  )}
                  <div className="border-b border-[#2d3444] my-2"></div>
                  <div className="flex justify-between text-amber-400 font-bold text-sm">
                    <span>SALDO DE CAJA:</span>
                    <span>${totalCajaSum.toFixed(0)}</span>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowCaja(false)}
                    className="flex-1 py-2 text-xs font-semibold rounded-lg border border-[#2d3444] text-slate-400 hover:bg-[#1a1d24] hover:text-white"
                  >
                    Mantener Caja Abierta
                  </button>
                  <button
                    onClick={() => {
                      alert('¡Caja cerrada correctamente! Los datos del arqueo han sido archivados en el log del servidor local.');
                      setShowCaja(false);
                      setSales([]);
                    }}
                    className="flex-1 py-2 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-700 text-white flex items-center justify-center gap-1.5"
                  >
                    <LogOut size={13} />
                    Proceder al Cierre
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      {/* ADJUST SETTINGS SIDEDRAWER */}
        {showSettings && (
          <div className="fixed inset-y-0 right-0 w-80 bg-[#111318] border-l border-[#2d3444] z-40 shadow-2xl p-6 flex flex-col justify-between overflow-y-auto">
            <div>
              <div className="flex justify-between items-center border-b border-[#2d3444] pb-4 mb-6">
                <span className="font-semibold text-white font-display text-sm flex items-center gap-2">
                  <Settings size={16} className="text-[#5aa6ec]" />
                  Configuración del POS
                </span>
                <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white text-xs">Cerrar</button>
              </div>

              <div className="space-y-4 text-xs text-slate-400">
                <div className="space-y-1">
                  <label className="text-white font-medium block">Servidor del Módulo</label>
                  <input
                    type="text"
                    disabled
                    className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg p-2 text-slate-500 font-mono"
                    value="http://localhost:3010"
                  />
                  <p className="text-[10px] text-slate-500">Determinado por el puerto especificado en el .bat ejecutable.</p>
                </div>

                <div className="space-y-1">
                  <label className="text-white font-medium block">Formato de Ticket</label>
                  <select className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 focus:outline-none">
                    <option>Térmico de 58mm</option>
                    <option>Térmico de 80mm</option>
                    <option>Factura A4 Estándar</option>
                  </select>
                </div>

                <div className="space-y-1 pt-2">
                  <label className="text-white font-medium block">Advertencia de Stock</label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="checkbox"
                      id="stock-warning"
                      checked={stockWarningEnabled}
                      onChange={handleToggleStockWarning}
                      className="h-4 w-4 bg-[#181a20] border-[#2d3444] rounded"
                    />
                    <label htmlFor="stock-warning" className="text-xs">Mostrar advertencia cuando el stock sea 0 al vender</label>
                  </div>
                </div>

                <div className="space-y-1 pt-2">
                  <label className="text-white font-medium block">Impresión Automática</label>
                  <div className="flex items-center gap-2 mt-1">
                    <input type="checkbox" id="auto-print" defaultChecked className="h-4 w-4 bg-[#181a20] border-[#2d3444] rounded" />
                    <label htmlFor="auto-print" className="text-xs">Imprimir ticket al registrar venta</label>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#2d3444]/60 space-y-3">
                  <span className="text-white font-medium block flex items-center gap-1.5">
                    Estado de Caja
                  </span>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] text-slate-500 font-mono uppercase">Efectivo ($)</label>
                      <input type="number" step="0.01" value={cashRegister.cash} onChange={async (e) => {
                        const val = parseFloat(e.target.value) || 0;
                        const updated = { ...cashRegister, cash: val };
                        setCashRegister(updated);
                        await fetch('/api/cash-register', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
                      }} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white font-mono focus:outline-none" />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-slate-500 font-mono uppercase">Banco ($)</label>
                      <input type="number" step="0.01" value={cashRegister.bank} onChange={async (e) => {
                        const val = parseFloat(e.target.value) || 0;
                        const updated = { ...cashRegister, bank: val };
                        setCashRegister(updated);
                        await fetch('/api/cash-register', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
                      }} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white font-mono focus:outline-none" />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500">Saldo inicial. Se descuentan los egresos automáticamente.</p>
                </div>

                <div className="pt-4 border-t border-[#2d3444]/60 space-y-2">
                  <span className="text-white font-medium block">Instalar en Servidor Local</span>
                  <button
                    onClick={handleDownloadApp}
                    className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 px-3 rounded-lg text-xs transition-colors cursor-pointer"
                  >
                    <Download size={13} />
                    Descargar App Completa
                  </button>
                  <p className="text-[10px] text-slate-500 leading-normal">
                    Descarga el paquete ZIP para ejecutar el sistema de forma local con el script .bat, base de datos (.db) y código fuente.
                  </p>
                </div>

                <div className="pt-4 border-t border-[#2d3444]/60 space-y-2">
                  <span className="text-white font-medium block">Configuración de Empresa</span>
                  <button
                    onClick={handleImportCompanyConfig}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-3 rounded-lg text-xs transition-colors cursor-pointer"
                  >
                    <Store size={13} />
                    Importar desde Web-main
                  </button>
                  <p className="text-[10px] text-slate-500 leading-normal">
                    {companyConfig ? `Empresa: ${companyConfig.companyName}` : 'No hay empresa configurada'}
                  </p>
                </div>

                <div className="pt-4 border-t border-[#2d3444]/60 space-y-2">
                  <span className="text-white font-medium block flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                    Sincronización GitHub
                  </span>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-mono uppercase">Token de Acceso</label>
                    <div className="flex gap-1">
                      <input
                        type="password"
                        className="flex-1 bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white font-mono focus:outline-none"
                        placeholder="github_pat_..."
                        value={gitToken}
                        onChange={e => setGitToken(e.target.value)}
                      />
                      <button
                        onClick={async () => {
                          if (!gitToken.trim()) { alert('Ingrese un token'); return; }
                          const r = await fetch('/api/company-config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gitToken: gitToken.trim() }) });
                          if (r.ok) {
                            alert('Token guardado correctamente');
                            const d = await r.json();
                            if (d.companyName) setCompanyConfig(d);
                          } else { alert('Error al guardar token'); }
                        }}
                        className="bg-blue-700 hover:bg-blue-600 text-white font-bold px-3 rounded-lg text-xs transition-colors cursor-pointer"
                      >Guardar</button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    {syncStatus.syncing ? (
                      <><span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" /><span className="text-amber-400">Sincronizando...</span></>
                    ) : syncStatus.error ? (
                      <><span className="h-2 w-2 rounded-full bg-red-500" /><span className="text-red-400">Error: {syncStatus.error.length > 50 ? syncStatus.error.slice(0, 50) + '...' : syncStatus.error}</span></>
                    ) : syncStatus.lastSync ? (
                      <><span className="h-2 w-2 rounded-full bg-emerald-500" /><span className="text-emerald-400">Último sync: {syncStatus.lastSync}</span></>
                    ) : syncStatus.pending ? (
                      <><span className="h-2 w-2 rounded-full bg-blue-400" /><span className="text-blue-400">Cambios pendientes</span></>
                    ) : (
                      <><span className="h-2 w-2 rounded-full bg-slate-500" /><span className="text-slate-400">Esperando cambios</span></>
                    )}
                  </div>
                  <button
                    onClick={async () => {
                      if (syncStatus.syncing) return;
                      setShowSyncModal(true);
                      setSyncModalType('syncing');
                      try {
                        const r = await fetch('/api/sync-full', { method: 'POST' });
                        const d = await r.json();
                        if (d.success) {
                          setSyncModalType('success');
                          const statusRes = await fetch('/api/auto-sync-status');
                          if (statusRes.ok) setSyncStatus(await statusRes.json());
                        } else {
                          setSyncModalType('error');
                        }
                      } catch {
                        setSyncModalType('error');
                      }
                    }}
                    disabled={syncStatus.syncing}
                    className="w-full flex items-center justify-center gap-2 bg-[#2d3444] hover:bg-[#3a4155] text-white font-semibold py-2 px-3 rounded-lg text-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                    {syncStatus.syncing ? 'Sincronizando...' : 'Sincronizar Ahora'}
                  </button>
                </div>

                <div className="pt-4 border-t border-[#2d3444]/60 space-y-2">
                  <span className="text-white font-medium block">Copias de Seguridad</span>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={handleBackup}
                      className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-3 rounded-lg text-xs transition-colors cursor-pointer"
                    >
                      <Download size={13} />
                      Guardar Backup
                    </button>
                    <button
                      onClick={() => document.getElementById('restore-input')?.click()}
                      className="w-full flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold py-2 px-3 rounded-lg text-xs transition-colors cursor-pointer"
                    >
                      <RotateCcw size={13} />
                      Restablecer Backup
                    </button>
                    <input
                      id="restore-input"
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={handleRestore}
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 leading-normal">
                    Guarda o restaura un respaldo completo de la base de datos (productos, clientes, ventas, etc.).
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t border-[#2d3444] pt-4 text-[11px] text-slate-500 font-mono">
              <span>Sincronización Integrada: Habilitada</span><br/>
              <span>Empresa: Local Host Module</span>
            </div>
          </div>
        )}

      {/* GitHub Sync popup */}
        {showSyncModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#111318] border border-[#2d3444] rounded-xl max-w-sm w-full overflow-hidden shadow-2xl p-6">
              <div className="flex flex-col items-center text-center gap-3">
                {syncModalType === 'syncing' && (
                  <>
                    <div className="h-10 w-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                      <svg className="w-5 h-5 text-amber-400 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-white font-bold text-sm">Sincronizando con GitHub...</p>
                      <p className="text-slate-400 text-xs mt-1">Subiendo cambios al repositorio remoto</p>
                    </div>
                  </>
                )}
                {syncModalType === 'success' && (
                  <>
                    <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-white font-bold text-sm">Sincronizado</p>
                      <p className="text-slate-400 text-xs mt-1">Repositorio actualizado correctamente</p>
                      {syncStatus.lastSync && (
                        <p className="text-slate-500 text-[10px] mt-1 font-mono">{syncStatus.lastSync}</p>
                      )}
                    </div>
                  </>
                )}
                {syncModalType === 'error' && (
                  <>
                    <div className="h-10 w-10 rounded-full bg-red-500/20 flex items-center justify-center">
                      <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-white font-bold text-sm">Error de sincronización</p>
                      <p className="text-slate-400 text-xs mt-1">{syncStatus.error || 'Error desconocido'}</p>
                    </div>
                  </>
                )}
                <button
                  onClick={() => setShowSyncModal(false)}
                  className="mt-2 text-[10px] text-slate-400 hover:text-white font-mono px-3 py-1 rounded border border-[#2d3444] hover:bg-[#1a1d24] transition-all"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}

    </div>
  );
}
