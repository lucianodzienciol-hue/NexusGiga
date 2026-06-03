import React, { useState, useEffect } from 'react';
import { Store, Search, RefreshCw, Download, Upload, Globe, Image, Settings, Plus, Trash2, MessageCircle, TrendingUp, X } from 'lucide-react';

interface PanelWebProps {
  webData: any;
  onRefresh: () => void;
}

export default function PanelWeb({ webData, onRefresh }: PanelWebProps) {
  const config = webData?.config || {};
  const categories = webData?.categories || [];
  const banners = config.banners || [];
  const [activeSection, setActiveSection] = useState('config');
  const [visitStats, setVisitStats] = useState<{ total: number; today: number; lastDays: { date: string; count: number }[] } | null>(null);

  useEffect(() => {
    if (activeSection === 'visitas') {
      fetch('/api/visits').then(r => r.ok && r.json()).then(d => setVisitStats(d)).catch(() => {});
    }
  }, [activeSection]);

  const handleSave = async (updated: any) => {
    try {
      await fetch('/api/web-save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
      onRefresh();
    } catch { alert('Error al guardar'); }
  };

  const updateConfig = (patch: any) => {
    const updated = { ...webData, config: { ...config, ...patch } };
    handleSave(updated);
  };

  const updateFull = (updated: any) => handleSave(updated);

  const handleSync = async () => {
    if (!window.confirm('¿Sincronizar todo con GitHub? Se hará push forzado.')) return;
    try {
      const res = await fetch('/api/web-sync-full', { method: 'POST' });
      const data = await res.json();
      alert(data.success ? 'Sincronización exitosa' : 'Error: ' + (data.error || ''));
    } catch { alert('Error de conexión'); }
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(webData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `web-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
    input.onchange = async (e: any) => {
      const file = e.target.files[0]; if (!file) return;
      const text = await file.text();
      try {
        const data = JSON.parse(text);
        if (!data.products) throw new Error('Formato inválido');
        await fetch('/api/web-save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        onRefresh();
        alert('Datos importados correctamente');
      } catch { alert('Archivo inválido'); }
    };
    input.click();
  };

  const services = webData?.services || [];
  const [editingService, setEditingService] = useState<any | null>(null);
  const [svcForm, setSvcForm] = useState<any>({});

  const openServiceModal = (s: any | null) => {
    setEditingService(s);
    setSvcForm(s ? { ...s } : { name: '', desc: '', icon: '', price: 0 });
  };

  const saveServiceModal = () => {
    let updated;
    if (editingService) {
      updated = services.map((x: any) => x.id === editingService.id ? { ...x, ...svcForm } : x);
    } else {
      const maxId = services.length > 0 ? Math.max(...services.map((x: any) => x.id)) : 0;
      updated = [...services, { ...svcForm, id: maxId + 1 }];
    }
    handleSave({ ...webData, services: updated });
    setEditingService(null);
  };

  const SERVICE_ICONS = ['ph-wrench','ph-cpu','ph-desktop','ph-laptop','ph-device-mobile','ph-monitor','ph-keyboard','ph-mouse','ph-hard-drive','ph-memory','ph-fan','ph-plug','ph-wifi-high','ph-shield-check','ph-database','ph-cloud-arrow-up','ph-broom','ph-gear','ph-printer','ph-headset'];

  const imgSrc = (path: string) => {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) return path;
    const clean = path.replace(/^\//, '');
    if (clean.startsWith('web/')) return '/' + clean;
    return '/web/' + clean;
  };

  const tabs = [
    { id: 'config', label: 'Empresa', icon: <Store size={13} /> },
    { id: 'seo', label: 'SEO', icon: <Search size={13} /> },
    { id: 'visitas', label: 'Visitas', icon: <TrendingUp size={13} /> },
    { id: 'servicios', label: 'Servicios', icon: <Settings size={13} /> },
    { id: 'popup', label: 'Popup', icon: <MessageCircle size={13} /> },
    { id: 'banners', label: 'Banners', icon: <Image size={13} /> },
    { id: 'categorias', label: 'Categorías', icon: <Settings size={13} /> },
    { id: 'sync', label: 'Sync', icon: <RefreshCw size={13} /> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-white">Panel Web</h2>
        <span className="text-[10px] text-slate-500 font-mono">Configuración de la tienda online</span>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveSection(t.id)} className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${activeSection === t.id ? 'bg-[#5aa6ec] text-[#0c0d10]' : 'bg-[#181a20] border border-[#2d3444] text-slate-400 hover:text-white'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-5">
        {activeSection === 'config' && (
          <div className="space-y-4 max-w-xl">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Datos de la Empresa</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-[10px] text-slate-500 font-mono uppercase">Nombre</label><input type="text" value={config.companyName || ''} onChange={e => updateConfig({ companyName: e.target.value })} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
              <div><label className="text-[10px] text-slate-500 font-mono uppercase">Dirección</label><input type="text" value={config.address || ''} onChange={e => updateConfig({ address: e.target.value })} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
              <div><label className="text-[10px] text-slate-500 font-mono uppercase">Teléfono</label><input type="text" value={config.phone || ''} onChange={e => updateConfig({ phone: e.target.value })} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
              <div><label className="text-[10px] text-slate-500 font-mono uppercase">WhatsApp</label><input type="text" value={config.whatsapp || ''} onChange={e => updateConfig({ whatsapp: e.target.value })} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
              <div><label className="text-[10px] text-slate-500 font-mono uppercase">Email</label><input type="text" value={config.email || ''} onChange={e => updateConfig({ email: e.target.value })} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
              <div><label className="text-[10px] text-slate-500 font-mono uppercase">Horario</label><input type="text" value={config.hours || ''} onChange={e => updateConfig({ hours: e.target.value })} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
              <div><label className="text-[10px] text-slate-500 font-mono uppercase">Instagram</label><input type="text" value={config.instagram || ''} onChange={e => updateConfig({ instagram: e.target.value })} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
              <div><label className="text-[10px] text-slate-500 font-mono uppercase">Facebook</label><input type="text" value={config.facebook || ''} onChange={e => updateConfig({ facebook: e.target.value })} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
            </div>
            <p className="text-[10px] text-slate-500">Los cambios se guardan automáticamente al escribir.</p>
          </div>
        )}

        {activeSection === 'seo' && (
          <div className="space-y-4 max-w-xl">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">SEO y Métricas</h3>
            <div><label className="text-[10px] text-slate-500 font-mono uppercase">Título del Sitio</label><input type="text" value={config.siteTitle || ''} onChange={e => updateConfig({ siteTitle: e.target.value })} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
            <div><label className="text-[10px] text-slate-500 font-mono uppercase">Meta Descripción</label><textarea rows={2} value={config.metaDescription || ''} onChange={e => updateConfig({ metaDescription: e.target.value })} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-[10px] text-slate-500 font-mono uppercase">Google Analytics ID</label><input type="text" value={config.ga4Id || ''} onChange={e => updateConfig({ ga4Id: e.target.value })} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white font-mono focus:outline-none" placeholder="G-XXXXXXXXXX" /></div>
              <div><label className="text-[10px] text-slate-500 font-mono uppercase">Google Tag Manager</label><input type="text" value={config.gtmId || ''} onChange={e => updateConfig({ gtmId: e.target.value })} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white font-mono focus:outline-none" placeholder="GTM-XXXXXXX" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-[10px] text-slate-500 font-mono uppercase">Productos en Inicio</label><input type="number" value={config.homeProductLimit ?? config.productLimit ?? ''} onChange={e => updateConfig({ homeProductLimit: parseInt(e.target.value) || 0, productLimit: parseInt(e.target.value) || 0 })} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
              <div className="flex items-end pb-2"><label className="flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" checked={config.homeRandomOrder ?? config.randomOrder ?? false} onChange={e => updateConfig({ homeRandomOrder: e.target.checked, randomOrder: e.target.checked })} className="h-4 w-4 bg-[#181a20] border-[#2d3444] rounded" />Orden aleatorio</label></div>
            </div>
          </div>
        )}



        {activeSection === 'servicios' && (
          <div className="space-y-4 max-w-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Servicios Web</h3>
              <button onClick={() => openServiceModal(null)} className="bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg py-1.5 px-3 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"><Plus size={13} />Agregar</button>
            </div>
            {services.length === 0 ? (
              <p className="text-xs text-slate-500 italic">Sin servicios configurados.</p>
            ) : (
              <div className="bg-[#0d0e12] border border-[#1f242e] rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#181a20] text-[10px] tracking-wider text-slate-400 font-mono uppercase font-bold text-left">
                      <th className="px-3 py-2">Nombre</th>
                      <th className="px-3 py-2">Descripción</th>
                      <th className="px-3 py-2">Icono</th>
                      <th className="px-3 py-2">Precio</th>
                      <th className="px-3 py-2 w-20">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((s: any) => (
                      <tr key={s.id} className="border-t border-[#1b1e26] cursor-pointer hover:bg-[#181a20]/50" onDoubleClick={() => openServiceModal(s)}>
                        <td className="px-3 py-2 text-slate-200 font-medium">{s.name}</td>
                        <td className="px-3 py-2 text-slate-400 max-w-[200px] truncate">{s.desc || '—'}</td>
                        <td className="px-3 py-2 text-slate-400"><i className={`ph ${s.icon || ''}`}></i> {s.icon || '—'}</td>
                        <td className="px-3 py-2 text-white font-semibold">{s.price ? `$${s.price}` : '—'}</td>
                        <td className="px-3 py-2">
                          <button onClick={() => openServiceModal(s)} className="text-[#5aa6ec] hover:text-white cursor-pointer text-[10px] font-bold uppercase tracking-wider mr-2">Editar</button>
                          <button onClick={() => { if (!window.confirm(`¿Eliminar servicio "${s.name}"?`)) return; handleSave({ ...webData, services: services.filter((x: any) => x.id !== s.id) }); }} className="text-red-400 hover:text-red-300 cursor-pointer text-[10px] font-bold uppercase tracking-wider">Eliminar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Modal de Servicio */}
        {editingService !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setEditingService(null)}>
            <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">{editingService ? 'Editar Servicio' : 'Nuevo Servicio'}</h3>
                <button onClick={() => setEditingService(null)} className="text-slate-500 hover:text-white cursor-pointer"><X size={16} /></button>
              </div>
              <div className="space-y-3 mb-4">
                <div><label className="text-[10px] text-slate-500 font-mono uppercase">Nombre</label><input type="text" value={svcForm.name || ''} onChange={e => setSvcForm((p: any) => ({ ...p, name: e.target.value }))} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
                <div><label className="text-[10px] text-slate-500 font-mono uppercase">Descripción</label><textarea rows={2} value={svcForm.desc || ''} onChange={e => setSvcForm((p: any) => ({ ...p, desc: e.target.value }))} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
                <div><label className="text-[10px] text-slate-500 font-mono uppercase">Precio</label><input type="number" value={svcForm.price || ''} onChange={e => setSvcForm((p: any) => ({ ...p, price: parseFloat(e.target.value) || 0 }))} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
              </div>
              <div className="mb-4">
                <label className="text-[10px] text-slate-500 font-mono uppercase block mb-2">Icono</label>
                <div className="grid grid-cols-5 gap-2">
                  {SERVICE_ICONS.map(icon => (
                    <div key={icon} onClick={() => setSvcForm((p: any) => ({ ...p, icon }))} className={`flex items-center justify-center p-2 rounded-lg border cursor-pointer transition-all text-lg ${svcForm.icon === icon ? 'bg-[#5aa6ec] text-[#0c0d10] border-[#5aa6ec]' : 'bg-[#181a20] border-[#2d3444] text-slate-400 hover:text-white hover:border-slate-500'}`}>
                      <i className={`ph ${icon}`}></i>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                {editingService && (
                  <button onClick={() => { if (!window.confirm(`¿Eliminar servicio "${editingService.name}"?`)) return; handleSave({ ...webData, services: services.filter((x: any) => x.id !== editingService.id) }); setEditingService(null); }} className="bg-red-800 hover:bg-red-700 text-white rounded-lg py-1.5 px-4 text-xs font-bold transition-all cursor-pointer">Eliminar</button>
                )}
                <button onClick={() => setEditingService(null)} className="bg-[#181a20] border border-[#2d3444] text-slate-300 hover:text-white rounded-lg py-1.5 px-4 text-xs font-bold transition-all cursor-pointer">Cancelar</button>
                <button onClick={saveServiceModal} className="bg-[#5aa6ec] text-[#0c0d10] rounded-lg py-1.5 px-4 text-xs font-bold transition-all cursor-pointer">Guardar</button>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'popup' && (
          <div className="space-y-4 max-w-xl">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Popup Promocional</h3>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" checked={config.popupActive || false} onChange={e => updateConfig({ popupActive: e.target.checked })} className="h-4 w-4 bg-[#181a20] border-[#2d3444] rounded" />Activo</label>
              <label className="flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" checked={config.popupAlways || false} onChange={e => updateConfig({ popupAlways: e.target.checked })} className="h-4 w-4 bg-[#181a20] border-[#2d3444] rounded" />Mostrar siempre</label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-[10px] text-slate-500 font-mono uppercase">Duración (seg)</label><input type="number" value={config.popupDuration || 5} onChange={e => updateConfig({ popupDuration: parseInt(e.target.value) || 5 })} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
              <div><label className="text-[10px] text-slate-500 font-mono uppercase">Delay (seg)</label><input type="number" value={config.popupDelay || 2} onChange={e => updateConfig({ popupDelay: parseInt(e.target.value) || 2 })} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
            </div>
            <div><label className="text-[10px] text-slate-500 font-mono uppercase">Texto</label><textarea rows={2} value={config.popupText || ''} onChange={e => updateConfig({ popupText: e.target.value })} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
            <div>
              <label className="text-[10px] text-slate-500 font-mono uppercase">Imagen</label>
              <div className="relative border-2 border-dashed border-[#2d3444] rounded-lg p-3 mt-1 text-center cursor-pointer hover:border-[#5aa6ec] transition-colors"
                onClick={() => { const inp = document.getElementById('popup-file-input') as HTMLInputElement; inp?.click(); }}
                onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-[#5aa6ec]'); }}
                onDragLeave={e => { e.currentTarget.classList.remove('border-[#5aa6ec]'); }}
                onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('border-[#5aa6ec]'); const f = e.dataTransfer.files[0]; if (f && f.type.startsWith('image/')) { const r = new FileReader(); r.onload = (ev) => updateConfig({ popupImage: ev.target?.result as string }); r.readAsDataURL(f); } }}
              >
                <input id="popup-file-input" type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f && f.type.startsWith('image/')) { const r = new FileReader(); r.onload = (ev) => updateConfig({ popupImage: ev.target?.result as string }); r.readAsDataURL(f); } }} />
                {config.popupImage ? (
                  <img src={config.popupImage.startsWith('data:') || config.popupImage.startsWith('http') ? config.popupImage : imgSrc(config.popupImage)} alt="" className="max-h-24 mx-auto rounded object-contain" />
                ) : (
                  <div className="text-slate-500 text-xs py-3"><Image size={20} className="mx-auto mb-1 opacity-50" />Arrastrá imagen o hacé clic</div>
                )}
              </div>
              <input type="text" value={config.popupImage && !config.popupImage.startsWith('data:') ? config.popupImage : ''} onChange={e => updateConfig({ popupImage: e.target.value })} placeholder="O URL externa" className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white mt-2 focus:outline-none" />
            </div>
          </div>
        )}

        {activeSection === 'visitas' && (
          <div className="space-y-4 max-w-xl">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Métrica de Visitas</h3>
            <p className="text-[10px] text-slate-500">Visitas registradas en la tienda online (<span className="text-slate-300">www.gigacomputers.com.ar</span>).</p>
            {!visitStats ? (
              <div className="text-xs text-slate-500 italic">Cargando...</div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#0d0e12] border border-[#1f242e] rounded-lg p-4 text-center">
                  <div className="text-[10px] text-slate-500 font-mono uppercase mb-1">Total</div>
                  <div className="text-3xl font-bold text-white">{visitStats.total.toLocaleString()}</div>
                </div>
                <div className="bg-[#0d0e12] border border-[#1f242e] rounded-lg p-4 text-center">
                  <div className="text-[10px] text-slate-500 font-mono uppercase mb-1">Hoy</div>
                  <div className="text-3xl font-bold text-emerald-400">{visitStats.today.toLocaleString()}</div>
                </div>
              </div>
            )}
            {visitStats && visitStats.lastDays.length > 0 && (
              <div>
                <h4 className="text-[10px] text-slate-500 font-mono uppercase font-bold mb-2">Últimos 7 días</h4>
                <div className="bg-[#0d0e12] border border-[#1f242e] rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-[#181a20] text-[10px] tracking-wider text-slate-400 font-mono uppercase font-bold text-left">
                        <th className="px-4 py-2">Fecha</th>
                        <th className="px-4 py-2 text-right">Visitas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visitStats.lastDays.map((d: any) => (
                        <tr key={d.date} className="border-t border-[#1b1e26]">
                          <td className="px-4 py-2 text-slate-300">{d.date}</td>
                          <td className="px-4 py-2 text-right text-white font-semibold">{d.count.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {activeSection === 'banners' && (
          <div className="space-y-4 max-w-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Carrusel de Banners</h3>
              <button onClick={() => updateConfig({ banners: [...banners, { image: '', title: '', link: '', description: '' }] })} className="bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg py-1.5 px-3 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"><Plus size={13} />Agregar</button>
            </div>
            {banners.length === 0 ? <p className="text-xs text-slate-500 italic">Sin banners configurados.</p> : banners.map((b: any, i: number) => (
              <div key={i} className="bg-[#0d0e12] border border-[#1f242e] rounded-lg p-4 space-y-2">
                <div className="flex justify-between items-center"><span className="text-[10px] text-slate-500 font-mono uppercase">Banner #{i + 1}</span><button onClick={() => { const bs = [...banners]; bs.splice(i, 1); updateConfig({ banners: bs }); }} className="text-red-400 hover:text-red-300 cursor-pointer"><Trash2 size={12} /></button></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-[10px] text-slate-500 font-mono">Título</label><input type="text" value={b.title || ''} onChange={e => { const bs = [...banners]; bs[i] = { ...bs[i], title: e.target.value }; updateConfig({ banners: bs }); }} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
                  <div><label className="text-[10px] text-slate-500 font-mono">Link</label><input type="text" value={b.link || ''} onChange={e => { const bs = [...banners]; bs[i] = { ...bs[i], link: e.target.value }; updateConfig({ banners: bs }); }} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 font-mono">Imagen</label>
                  <div className="relative border-2 border-dashed border-[#2d3444] rounded-lg p-2 mt-1 text-center cursor-pointer hover:border-[#5aa6ec] transition-colors"
                    onClick={() => { const inp = document.getElementById('banner-file-' + i) as HTMLInputElement; inp?.click(); }}
                    onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-[#5aa6ec]'); }}
                    onDragLeave={e => { e.currentTarget.classList.remove('border-[#5aa6ec]'); }}
                    onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('border-[#5aa6ec]'); const f = e.dataTransfer.files[0]; if (f && f.type.startsWith('image/')) { const r = new FileReader(); r.onload = (ev) => { const bs = [...banners]; bs[i] = { ...bs[i], image: ev.target?.result as string }; updateConfig({ banners: bs }); }; r.readAsDataURL(f); } }}
                  >
                    <input id={'banner-file-' + i} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f && f.type.startsWith('image/')) { const r = new FileReader(); r.onload = (ev) => { const bs = [...banners]; bs[i] = { ...bs[i], image: ev.target?.result as string }; updateConfig({ banners: bs }); }; r.readAsDataURL(f); } }} />
                    {b.image ? (
                      <img src={b.image.startsWith('data:') || b.image.startsWith('http') ? b.image : imgSrc(b.image)} alt="" className="max-h-16 mx-auto rounded object-contain" />
                    ) : (
                      <div className="text-slate-500 text-[10px] py-2"><Image size={16} className="mx-auto mb-1 opacity-50" />Arrastrá o clic</div>
                    )}
                  </div>
                  <input type="text" value={b.image && !b.image.startsWith('data:') ? b.image : ''} onChange={e => { const bs = [...banners]; bs[i] = { ...bs[i], image: e.target.value }; updateConfig({ banners: bs }); }} placeholder="O URL externa" className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white mt-1 focus:outline-none" />
                </div>
                <div><label className="text-[10px] text-slate-500 font-mono">Descripción</label><input type="text" value={b.description || ''} onChange={e => { const bs = [...banners]; bs[i] = { ...bs[i], description: e.target.value }; updateConfig({ banners: bs }); }} className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" /></div>
              </div>
            ))}
          </div>
        )}

        {activeSection === 'categorias' && (
          <div className="space-y-4 max-w-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Categorías</h3>
            </div>
            <div className="flex gap-2">
              <input type="text" id="new-cat-input" placeholder="Nueva categoría..." className="flex-1 bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white placeholder-slate-500 focus:outline-none" />
              <button onClick={() => { const inp = document.getElementById('new-cat-input') as HTMLInputElement; if (!inp.value.trim()) return; updateFull({ ...webData, categories: [...categories, { id: Date.now().toString(), name: inp.value.trim() }] }); inp.value = ''; }} className="bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg py-1.5 px-3 text-xs font-bold transition-all cursor-pointer"><Plus size={13} /></button>
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map((c: any) => (
                <div key={c.id} className="flex items-center gap-2 bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white">
                  {c.name}
                  <button onClick={() => updateFull({ ...webData, categories: categories.filter((x: any) => x.id !== c.id) })} className="text-slate-500 hover:text-red-400 cursor-pointer"><Trash2 size={11} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === 'sync' && (
          <div className="space-y-4 max-w-xl">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Sincronización y Backup</h3>
            <div className="flex flex-wrap gap-3">
              <button onClick={handleSync} className="flex items-center gap-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded-lg py-2 px-4 text-xs font-bold transition-all cursor-pointer"><RefreshCw size={13} />Sync GitHub</button>
              <button onClick={handleExport} className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg py-2 px-4 text-xs font-bold transition-all cursor-pointer"><Download size={13} />Exportar Backup</button>
              <button onClick={handleImport} className="flex items-center gap-1.5 bg-amber-700 hover:bg-amber-600 text-white rounded-lg py-2 px-4 text-xs font-bold transition-all cursor-pointer"><Upload size={13} />Importar Backup</button>
              <a href="/web/" target="_blank" className="flex items-center gap-1.5 bg-[#181a20] border border-[#2d3444] text-slate-300 hover:text-white rounded-lg py-2 px-4 text-xs font-bold transition-all cursor-pointer"><Globe size={13} />Ver Tienda</a>
            </div>
            <p className="text-[10px] text-slate-500">El sync completo sube todos los archivos a GitHub (push forzado).<br/>El backup exporta data.json completo.</p>
          </div>
        )}
      </div>
    </div>
  );
}
