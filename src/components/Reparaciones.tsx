import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2, Search, Printer, Wrench, CheckCircle, Pencil, X, Settings } from 'lucide-react';
import { WebRepair, WebClient } from '../types';

interface ReparacionesProps {
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyWhatsapp?: string;
  onRefresh: () => void;
}

const STATUSES = ['Recibida', 'En Diagnostico', 'En Reparacion', 'Esperando Repuestos', 'Finalizada', 'Entregada'];

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    'Recibida': 'bg-blue-900/20 text-blue-400 border-blue-800/30',
    'En Diagnostico': 'bg-red-900/20 text-red-400 border-red-800/30',
    'En Reparacion': 'bg-amber-900/20 text-amber-400 border-amber-800/30',
    'Esperando Repuestos': 'bg-red-900/20 text-red-400 border-red-800/30',
    'Finalizada': 'bg-emerald-900/20 text-emerald-400 border-emerald-800/30',
    'Entregada': 'bg-slate-700/20 text-slate-400 border-slate-600/30',
  };
  return map[s] || 'bg-slate-700/20 text-slate-400 border-slate-600/30';
};

const SORT_OPTIONS = [
  { value: 'date-desc', label: 'Fecha: M\u00e1s Nuevas primero' },
  { value: 'date-asc', label: 'Fecha: M\u00e1s Antiguas primero' },
  { value: 'id-desc', label: 'N\u00b0 Orden: Mayor primero' },
  { value: 'id-asc', label: 'N\u00b0 Orden: Menor primero' },
  { value: 'status-asc', label: 'Estado: A - Z' },
  { value: 'status-desc', label: 'Estado: Z - A' },
];

export default function Reparaciones({ companyName, companyAddress, companyPhone, companyEmail, companyWhatsapp, onRefresh }: ReparacionesProps) {
  const [repairs, setRepairs] = useState<WebRepair[]>([]);
  const [clients, setClients] = useState<WebClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('date-desc');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showHistorial, setShowHistorial] = useState(false);
  const [successData, setSuccessData] = useState<{ code: string; id: string; clientName?: string; clientPhone?: string; equipment?: string } | null>(null);
  const [showCounterModal, setShowCounterModal] = useState(false);
  const [counterValue, setCounterValue] = useState(1);

  // Form state
  const [clientMode, setClientMode] = useState<'search' | 'create'>('search');
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<WebClient | null>(null);
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [equipment, setEquipment] = useState('');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [status, setStatus] = useState('Recibida');
  const [price, setPrice] = useState('');
  const [problem, setProblem] = useState('');
  const [notes, setNotes] = useState('');

  const clientSearchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const fetchRepairsData = useCallback(async () => {
    try {
      const [repRes, cliRes] = await Promise.all([
        fetch('/api/repairs'),
        fetch('/api/clients')
      ]);
      if (repRes.ok) setRepairs(await repRes.json());
      if (cliRes.ok) setClients(await cliRes.json());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRepairsData(); }, [fetchRepairsData]);

  const filteredClients = clients.filter(c => {
    const q = clientSearch.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.phone || '').toLowerCase().includes(q);
  });

  const openCounterModal = async () => {
    try {
      const res = await fetch('/api/repair-counter');
      if (res.ok) {
        const data = await res.json();
        setCounterValue(data.counter);
      }
    } catch {}
    setShowCounterModal(true);
  };

  const saveCounter = async () => {
    const val = parseInt(String(counterValue), 10);
    if (isNaN(val) || val < 1) return;
    try {
      await fetch('/api/repair-counter', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counter: val }),
      });
    } catch {}
    setShowCounterModal(false);
  };

  // Sort & filter
  const sortRepairs = (arr: WebRepair[]) => {
    const sorted = [...arr];
    sorted.sort((a, b) => {
      if (sortBy === 'date-desc') {
        const diff = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (diff === 0) {
          const numA = parseInt(a.id.replace(/\D/g, ''), 10) || 0;
          const numB = parseInt(b.id.replace(/\D/g, ''), 10) || 0;
          return numB - numA;
        }
        return diff;
      }
      if (sortBy === 'date-asc') {
        const diff = new Date(a.date).getTime() - new Date(b.date).getTime();
        if (diff === 0) {
          const numA = parseInt(a.id.replace(/\D/g, ''), 10) || 0;
          const numB = parseInt(b.id.replace(/\D/g, ''), 10) || 0;
          return numA - numB;
        }
        return diff;
      }
      if (sortBy === 'id-desc') {
        const numA = parseInt(a.id.replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(b.id.replace(/\D/g, ''), 10) || 0;
        return numB - numA;
      }
      if (sortBy === 'id-asc') {
        const numA = parseInt(a.id.replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(b.id.replace(/\D/g, ''), 10) || 0;
        return numA - numB;
      }
      if (sortBy === 'status-asc') return a.status.localeCompare(b.status);
      if (sortBy === 'status-desc') return b.status.localeCompare(a.status);
      return 0;
    });
    return sorted;
  };

  const allRepairs = repairs.filter(r => r.status !== 'Entregada');
  const finishedRepairs = sortRepairs(allRepairs.filter(r => r.status === 'Finalizada'));
  const activeRepairs = sortRepairs(allRepairs.filter(r => r.status !== 'Finalizada'));
  const deliveredRepairs = sortRepairs(repairs.filter(r => r.status === 'Entregada'));

  const getClient = (clientId: string) => clients.find(c => c.id === clientId);

  const filterBySearch = (arr: WebRepair[]) => {
    if (!search.trim()) return arr;
    const q = search.toLowerCase();
    return arr.filter(r => {
      const client = getClient(r.clientId);
      return r.id.toLowerCase().includes(q) ||
             r.code.toLowerCase().includes(q) ||
             r.equipment.toLowerCase().includes(q) ||
             r.status.toLowerCase().includes(q) ||
             (client?.name || '').toLowerCase().includes(q) ||
             (client?.phone || '').includes(q);
    });
  };

  const openNew = async () => {
    setEditingId(null);
    setClientMode('search');
    setClientSearch('');
    setSelectedClient(null);
    setNewClientName('');
    setNewClientPhone('');
    setQuickPhone('');
    setEquipment('');
    setMarca('');
    setModelo('');
    setStatus('Recibida');
    setPrice('');
    setProblem('');
    setNotes('');
    setShowModal(true);
    // Refresh clients list from DB to match "Clientes" tab
    try { const r = await fetch('/api/clients'); if (r.ok) setClients(await r.json()); } catch {}
  };

  const openEdit = (r: WebRepair) => {
    setEditingId(r.id);
    setClientMode('search');
    setClientSearch('');
    const c = clients.find(c => c.id === r.clientId);
    setSelectedClient(c || null);
    setNewClientName('');
    setNewClientPhone('');
    setEquipment(r.equipment);
    setMarca(r.marca || '');
    setModelo(r.modelo || '');
    setStatus(r.status);
    setPrice(String(r.price || 0));
    setProblem(r.problem || '');
    setNotes(r.notes || '');
    setShowModal(true);
  };

  const generateCode = (existingRepairs: WebRepair[]): string => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const usedCodes = new Set(existingRepairs.map(r => r.code));
    let code: string;
    do {
      code = '';
      for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    } while (usedCodes.has(code));
    return code;
  };

  const handleSave = async () => {
    if (!equipment.trim() || !problem.trim()) { alert('Equipo y problema son obligatorios'); return; }
    if (!editingId) {
      if (!selectedClient && clientMode === 'search') { alert('Seleccione un cliente o cambie a modo Nuevo'); return; }
      if (clientMode === 'create' && (!newClientName.trim() || !newClientPhone.trim())) { alert('Complete nombre y tel\u00e9fono del nuevo cliente'); return; }
    }
    try {
      if (editingId) {
        const res = await fetch(`/api/repairs/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            equipment: equipment.trim(), marca: marca.trim(), modelo: modelo.trim(),
            status, price: Number(price) || 0, problem: problem.trim(), notes: notes.trim()
          })
        });
        if (!res.ok) { alert('Error al actualizar'); return; }
        setShowModal(false);
        fetchRepairsData();
      } else {
        let clientId = '';
        let clientName = '';
        let clientPhone = '';
        if (clientMode === 'create') {
          const cliRes = await fetch('/api/clients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: newClientName.trim(), phone: newClientPhone.trim(),
              email: '', document: newClientPhone.replace(/[^0-9]/g, '').slice(0, 11) || '00000000'
            })
          });
          if (!cliRes.ok) { alert('Error al crear cliente'); return; }
          const newClient = await cliRes.json();
          clientId = newClient.id;
          clientName = newClient.name;
          clientPhone = newClient.phone || '';
        } else if (selectedClient) {
          clientId = selectedClient.id;
          clientName = selectedClient.name;
          clientPhone = selectedClient.phone || '';
        }

        const res = await fetch('/api/repairs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId, clientName, clientPhone,
            equipment: equipment.trim(), marca: marca.trim(), modelo: modelo.trim(),
            status, price: Number(price) || 0, problem: problem.trim(), notes: notes.trim()
          })
        });
        if (!res.ok) { alert('Error al crear orden'); return; }
        const newRepair = await res.json();
        setShowModal(false);
        fetchRepairsData();

        setSuccessData({
          code: newRepair.code,
          id: newRepair.id,
          clientName,
          clientPhone,
          equipment: equipment.trim(),
        });
        setTimeout(() => setShowSuccess(true), 150);
      }
    } catch { alert('Error al guardar'); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('\u00bfEst\u00e1 seguro de eliminar esta orden de reparaci\u00f3n?')) return;
    try {
      const res = await fetch(`/api/repairs/${id}`, { method: 'DELETE' });
      if (res.ok) fetchRepairsData();
      else alert('Error al eliminar');
    } catch { alert('Error al eliminar'); }
  };

  const handlePrint = (repair: WebRepair) => {
    const client = getClient(repair.clientId);
    const config = { name: companyName || '', address: companyAddress || '', phone: companyPhone || '', email: companyEmail || '' };
    const printWin = window.open('', '_blank');
    if (!printWin) { alert('Permita ventanas emergentes'); return; }
    printWin.document.write(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Comprobante de Reparaci\u00f3n - ${repair.code}</title>
        <style>
          :root { --primary: #dc2626; --dark: #111827; --gray-50: #f9fafb; --gray-100: #f3f4f6; --gray-200: #e5e7eb; --gray-500: #6b7280; --gray-700: #374151; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Inter', -apple-system, sans-serif; padding: 0; color: var(--dark); line-height: 1.5; background: white; }
          .page { width: 210mm; padding: 15mm; margin: auto; background: white; position: relative; }
          @page { size: A4; margin: 0; }
          @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid var(--primary); padding-bottom: 1rem; margin-bottom: 1.5rem; }
          .company-name { font-size: 1.75rem; font-weight: 800; color: var(--primary); text-transform: uppercase; letter-spacing: -0.025em; }
          .company-info { font-size: 0.85rem; color: var(--gray-500); margin-top: 0.2rem; font-weight: 500; }
          .order-header { display: flex; justify-content: space-between; background: var(--gray-50); padding: 1rem; border-radius: 0.75rem; margin-bottom: 1.5rem; border: 1px solid var(--gray-100); }
          .code-section { text-align: center; flex: 1; }
          .badge-label { font-size: 0.7rem; color: var(--gray-500); font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 0.4rem; }
          .badge-code { background: var(--primary); color: white; padding: 0.5rem 1.5rem; border-radius: 0.75rem; font-size: 4rem; font-weight: 800; letter-spacing: 0.4rem; display: inline-block; line-height: 1; }
          .order-meta { text-align: right; display: flex; flex-direction: column; justify-content: center; gap: 0.25rem; }
          .order-id { font-size: 0.8rem; color: var(--gray-500); text-transform: uppercase; letter-spacing: 0.05em; }
          .order-number { font-size: 1.5rem; font-weight: 700; color: var(--primary); }
          .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 1.5rem; }
          .details-section h3 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--primary); font-weight: 700; border-bottom: 2px solid var(--gray-100); padding-bottom: 0.5rem; margin-bottom: 0.75rem; }
          .detail-row { display: flex; padding: 0.35rem 0; border-bottom: 1px solid var(--gray-100); font-size: 0.85rem; }
          .detail-label { color: var(--gray-500); font-weight: 600; width: 120px; flex-shrink: 0; }
          .detail-value { color: var(--dark); font-weight: 500; }
          .notes-section { margin-bottom: 1rem; }
          .notes-section h3 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--primary); font-weight: 700; border-bottom: 2px solid var(--gray-100); padding-bottom: 0.5rem; margin-bottom: 0.75rem; }
          .notes-box { padding: 0.75rem; border-radius: 0.5rem; font-size: 0.85rem; line-height: 1.6; background: var(--gray-50); border-left: 4px solid var(--primary); }
          .notes-box-secondary { border-left-color: var(--gray-500); margin-top: 0.5rem; }
          .stamp { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-15deg); font-size: 4rem; font-weight: 900; color: rgba(220, 38, 38, 0.08); text-transform: uppercase; pointer-events: none; white-space: nowrap; border: 4px solid rgba(220, 38, 38, 0.12); border-radius: 2rem; padding: 1rem 3rem; }
          .footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--gray-200); display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--gray-500); }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            <div>
              <div class="company-name">${config.name || 'Nexus POS'}</div>
              <div class="company-info">${config.address ? config.address + ' &bull; ' : ''}${config.phone ? config.phone + ' &bull; ' : ''}${config.email || ''}</div>
            </div>
            <div class="order-meta">
              <div class="order-id">Orden de Servicio</div>
              <div class="order-number"># ${repair.id}</div>
            </div>
          </div>

          <div class="order-header">
            <div class="code-section">
              <div class="badge-label">Clave para consulta web</div>
              <div class="badge-code">${repair.code}</div>
              <div style="margin-top: 0.5rem; font-size: 0.75rem; color: var(--gray-500);">Use esta clave en nuestro sitio para ver el estado</div>
            </div>
          </div>

          <div class="details-grid">
            <div class="details-section">
              <h3>Datos del Cliente</h3>
              <div class="detail-row"><span class="detail-label">Nombre</span><span class="detail-value">${client?.name || 'Desconocido'}</span></div>
              <div class="detail-row"><span class="detail-label">Tel\u00e9fono</span><span class="detail-value">${client?.phone || '-'}</span></div>
              <div class="detail-row"><span class="detail-label">Email</span><span class="detail-value">${client?.email || '-'}</span></div>
            </div>
            <div class="details-section">
              <h3>Detalles del Equipo</h3>
              <div class="detail-row"><span class="detail-label">Equipo</span><span class="detail-value">${repair.equipment}</span></div>
              <div class="detail-row"><span class="detail-label">Fecha Ing</span><span class="detail-value">${repair.date}</span></div>
              <div class="detail-row"><span class="detail-label">Estado</span><span class="detail-value">${repair.status}</span></div>
              <div class="detail-row"><span class="detail-label">Costo</span><span class="detail-value">$${Number(repair.price || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span></div>
            </div>
          </div>

          <div class="notes-section">
            <h3>Problema Reportado</h3>
            <div class="notes-box">${repair.problem || 'No especificado'}</div>
          </div>

          ${repair.notes ? `
          <div class="notes-section">
            <h3>Observaciones Adicionales</h3>
            <div class="notes-box notes-box-secondary">${repair.notes}</div>
          </div>` : ''}

          <div class="stamp">${repair.status.toUpperCase()}</div>

          <div class="footer">
            <span>Conserve este comprobante para retirar su equipo.</span>
            <span>${repair.date} &mdash; ${config.name || 'Nexus POS'}</span>
          </div>
        </div>
      </body>
      </html>
    `);
    printWin.document.close();
  };

  const handleWhatsApp = (clientName: string, clientPhone: string, code: string, equipment: string) => {
    const msg = encodeURIComponent(`Hola ${clientName}! \n\nRegistramos tu equipo *${equipment}* para reparaci\u00f3n.\n\nPuedes seguir el estado desde nuestra web con esta clave:\n\n*${code}*\n\nGracias por confiar en *${companyName || 'Nexus POS'}*!`);
    window.open(`https://wa.me/${clientPhone.replace(/[^0-9]/g, '')}?text=${msg}`, '_blank');
  };

  // Search show/hide
  const handleSearchInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearch(q);
  }, []);

  // Close client dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (clientSearchRef.current && !clientSearchRef.current.contains(e.target as Node)) {
        setShowClientDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-white" style={{ margin: 0 }}>Gestión de Reparaciones</h2>
        <div className="flex items-center gap-2">
          {/* Sort */}
          <div className="flex items-center gap-1.5 bg-[#181a20] border border-[#2d3444] rounded-full py-1 px-3">
            <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" /></svg>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="bg-transparent border-none text-[11px] text-white font-medium focus:outline-none cursor-pointer" style={{ padding: '0.25rem 0.5rem', width: 190 }}>
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {/* Search */}
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500"><Search size={14} /></span>
            <input type="text" className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:outline-none" placeholder="Buscar reparaci\u00f3n..." style={{ width: 200 }} value={search} onChange={handleSearchInput} />
          </div>
          <button onClick={openNew} className="bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg py-1.5 px-3 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"><Plus size={13} />Nueva Orden</button>
          <button onClick={() => setShowHistorial(!showHistorial)} className={'rounded-lg py-1.5 px-3 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ' + (showHistorial ? 'bg-blue-700 text-white' : 'bg-[#181a20] border border-[#2d3444] text-slate-300 hover:bg-[#1f242e]')}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {showHistorial ? 'Volver' : 'Historial'}
          </button>
          <button onClick={openCounterModal} className="bg-[#181a20] border border-[#2d3444] text-slate-300 hover:bg-[#1f242e] rounded-lg py-1.5 px-3 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"><Settings size={13} />Numeraci\u00f3n</button>
        </div>
      </div>

      {showHistorial ? (
        <div className="bg-[#111318] border border-[#1f242e] rounded-xl overflow-hidden">
          <div className="px-5 pt-4 pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> Historial de Reparaciones Entregadas</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#181a20] text-[10px] tracking-wider text-slate-400 font-mono uppercase font-bold text-left">
                  <th className="px-4 py-2.5">N\u00b0 Orden</th>
                  <th className="px-4 py-2.5">Clave</th>
                  <th className="px-4 py-2.5">Cliente</th>
                  <th className="px-4 py-2.5">Tel\u00e9fono</th>
                  <th className="px-4 py-2.5">Equipo</th>
                  <th className="px-4 py-2.5">Marca</th>
                  <th className="px-4 py-2.5">Modelo</th>
                  <th className="px-4 py-2.5">Estado</th>
                  <th className="px-4 py-2.5">Fecha</th>
                  <th className="px-4 py-2.5 text-right">Precio</th>
                  <th className="px-4 py-2.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
{filterBySearch(deliveredRepairs).length === 0 ? (
                <tr><td colSpan={11} className="text-center text-slate-500 py-8 italic">No hay reparaciones entregadas</td></tr>
                ) : filterBySearch(deliveredRepairs).map(r => {
                  const client = getClient(r.clientId);
                  return (
                    <tr key={r.id} className="border-t border-[#1b1e26] hover:bg-[#14171e] transition-colors">
                      <td className="px-4 py-2.5 font-semibold text-white">{r.id}</td>
                      <td className="px-4 py-2.5"><span className="text-[1.1rem] font-bold tracking-widest text-cyan-400">{r.code}</span></td>
                      <td className="px-4 py-2.5 text-slate-300 truncate max-w-[140px]">{client?.name || 'Desconocido'}</td>
                      <td className="px-4 py-2.5 text-slate-400 font-mono">{r.clientPhone || client?.phone || '-'}</td>
                      <td className="px-4 py-2.5 text-slate-300 truncate max-w-[180px]">{r.equipment}</td>
                      <td className="px-4 py-2.5 text-slate-400">{r.marca || '-'}</td>
                      <td className="px-4 py-2.5 text-slate-400">{r.modelo || '-'}</td>
                      <td className="px-4 py-2.5"><span className={'inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ' + statusBadge(r.status)}>{r.status}</span></td>
                      <td className="px-4 py-2.5 text-slate-400">{r.date}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-cyan-400">${Number(r.price || 0).toFixed(0)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={(e) => { e.stopPropagation(); handlePrint(r); }} className="text-slate-500 hover:text-white transition-colors cursor-pointer p-1.5 rounded hover:bg-[#1f242e]" title="Imprimir comprobante"><Printer size={12} /></button>
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }} className="text-slate-500 hover:text-red-400 transition-colors cursor-pointer p-1.5 rounded hover:bg-[#1f242e]" title="Eliminar"><Trash2 size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (<>
      <div className="bg-[#111318] border border-[#1f242e] rounded-xl overflow-hidden">
        <div className="px-5 pt-4 pb-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5"><CheckCircle size={14} /> Reparaciones Finalizadas (Listas para Entregar)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#181a20] text-[10px] tracking-wider text-slate-400 font-mono uppercase font-bold text-left">
                <th className="px-4 py-2.5">N\u00b0 Orden</th>
                <th className="px-4 py-2.5">Clave</th>
                <th className="px-4 py-2.5">Cliente</th>
                <th className="px-4 py-2.5">Tel\u00e9fono</th>
                <th className="px-4 py-2.5">Equipo</th>
                <th className="px-4 py-2.5">Estado</th>
                <th className="px-4 py-2.5">Fecha</th>
                <th className="px-4 py-2.5 text-right">Precio</th>
                <th className="px-4 py-2.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody id="repairs-finished-tbody">
              {filterBySearch(finishedRepairs).length === 0 ? (
                <tr><td colSpan={9} className="text-center text-slate-500 py-8 italic">No hay reparaciones finalizadas</td></tr>
              ) : filterBySearch(finishedRepairs).map(r => {
                const client = getClient(r.clientId);
                return (
                  <tr key={r.id} className="border-t border-[#1b1e26] hover:bg-[#14171e] transition-colors cursor-pointer" onDoubleClick={() => openEdit(r)}>
                    <td className="px-4 py-2.5 font-semibold text-white">{r.id}</td>
                    <td className="px-4 py-2.5"><span className="text-[1.1rem] font-bold tracking-widest text-cyan-400">{r.code}</span></td>
                    <td className="px-4 py-2.5 text-slate-300 truncate max-w-[140px]">{client?.name || 'Desconocido'}</td>
                    <td className="px-4 py-2.5 text-slate-400 font-mono">{r.clientPhone || client?.phone || '-'}</td>
                    <td className="px-4 py-2.5 text-slate-300 truncate max-w-[180px]">{r.equipment}</td>
                    <td className="px-4 py-2.5"><span className={'inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ' + statusBadge(r.status)}>{r.status}</span></td>
                    <td className="px-4 py-2.5 text-slate-400">{r.date}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-400">${Number(r.price || 0).toFixed(0)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={(e) => { e.stopPropagation(); openEdit(r); }} className="text-slate-500 hover:text-white transition-colors cursor-pointer p-1.5 rounded hover:bg-[#1f242e]" title="Editar"><Pencil size={12} /></button>
                        <button onClick={(e) => { e.stopPropagation(); handlePrint(r); }} className="text-slate-500 hover:text-white transition-colors cursor-pointer p-1.5 rounded hover:bg-[#1f242e]" title="Imprimir comprobante"><Printer size={12} /></button>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }} className="text-slate-500 hover:text-red-400 transition-colors cursor-pointer p-1.5 rounded hover:bg-[#1f242e]" title="Eliminar"><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Active Repairs */}
      <div className="bg-[#111318] border border-[#1f242e] rounded-xl overflow-hidden">
        <div className="px-5 pt-4 pb-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5"><Wrench size={14} /> Reparaciones en Curso</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#181a20] text-[10px] tracking-wider text-slate-400 font-mono uppercase font-bold text-left">
                <th className="px-4 py-2.5">N\u00b0 Orden</th>
                <th className="px-4 py-2.5">Clave</th>
                <th className="px-4 py-2.5">Cliente</th>
                <th className="px-4 py-2.5">Tel\u00e9fono</th>
                <th className="px-4 py-2.5">Equipo</th>
                <th className="px-4 py-2.5">Estado</th>
                <th className="px-4 py-2.5">Fecha</th>
                <th className="px-4 py-2.5 text-right">Precio</th>
                <th className="px-4 py-2.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody id="repairs-active-tbody">
              {filterBySearch(activeRepairs).length === 0 ? (
                <tr><td colSpan={9} className="text-center text-slate-500 py-8 italic">No hay reparaciones en curso</td></tr>
              ) : filterBySearch(activeRepairs).map(r => {
                const client = getClient(r.clientId);
                return (
                  <tr key={r.id} className="border-t border-[#1b1e26] hover:bg-[#14171e] transition-colors cursor-pointer" onDoubleClick={() => openEdit(r)}>
                    <td className="px-4 py-2.5 font-semibold text-white">{r.id}</td>
                    <td className="px-4 py-2.5"><span className="text-[1.1rem] font-bold tracking-widest text-cyan-400">{r.code}</span></td>
                    <td className="px-4 py-2.5 text-slate-300 truncate max-w-[140px]">{client?.name || 'Desconocido'}</td>
                    <td className="px-4 py-2.5 text-slate-400 font-mono">{r.clientPhone || client?.phone || '-'}</td>
                    <td className="px-4 py-2.5 text-slate-300 truncate max-w-[180px]">{r.equipment}</td>
                    <td className="px-4 py-2.5"><span className={'inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ' + statusBadge(r.status)}>{r.status}</span></td>
                    <td className="px-4 py-2.5 text-slate-400">{r.date}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-400">${Number(r.price || 0).toFixed(0)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={(e) => { e.stopPropagation(); openEdit(r); }} className="text-slate-500 hover:text-white transition-colors cursor-pointer p-1.5 rounded hover:bg-[#1f242e]" title="Editar"><Pencil size={12} /></button>
                        <button onClick={(e) => { e.stopPropagation(); handlePrint(r); }} className="text-slate-500 hover:text-white transition-colors cursor-pointer p-1.5 rounded hover:bg-[#1f242e]" title="Imprimir comprobante"><Printer size={12} /></button>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }} className="text-slate-500 hover:text-red-400 transition-colors cursor-pointer p-1.5 rounded hover:bg-[#1f242e]" title="Eliminar"><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      </>)}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-[#111318] border border-[#2d3444] rounded-xl w-full max-w-xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-[#2d3444] pb-3 mb-4">
              <span className="font-semibold text-white font-display">{editingId ? `Editar Orden: ${editingId}` : 'Nueva Orden de Reparaci\u00f3n'}</span>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white transition-colors cursor-pointer"><X size={16} /></button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Left column */}
              <div className="space-y-3">
                {!editingId && (
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-[10px] text-slate-500 font-mono uppercase font-bold">Cliente</label>
                      <div className="flex bg-[#181a20] rounded-lg overflow-hidden border border-[#2d3444]">
                        <button
                          onClick={() => { setClientMode('search'); setSelectedClient(null); setClientSearch(''); }}
                          className={`text-[10px] px-2.5 py-1 transition-colors cursor-pointer font-bold ${clientMode === 'search' ? 'bg-blue-700 text-white' : 'text-slate-400 hover:text-white'}`}
                        >Buscar</button>
                        <button
                          onClick={() => { setClientMode('create'); setSelectedClient(null); }}
                          className={`text-[10px] px-2.5 py-1 transition-colors cursor-pointer font-bold ${clientMode === 'create' ? 'bg-blue-700 text-white' : 'text-slate-400 hover:text-white'}`}
                        >Nuevo</button>
                      </div>
                    </div>

                    {clientMode === 'search' ? (
                      <div ref={clientSearchRef} className="relative">
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-500"><Search size={12} /></span>
                          <input
                            type="text"
                            className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 pl-8 pr-3 text-xs text-white placeholder-slate-500 focus:outline-none"
                            placeholder="Buscar cliente por nombre o tel\u00e9fono..."
                            value={selectedClient ? `${selectedClient.name} (${selectedClient.phone || 'Sin Tel\u00e9fono'})` : clientSearch}
                            onChange={e => { setClientSearch(e.target.value); setSelectedClient(null); setShowClientDropdown(true); }}
                            onFocus={() => setShowClientDropdown(true)}
                            disabled={!!selectedClient}
                          />
                          {selectedClient && (
                            <button
                              onClick={() => { setSelectedClient(null); setClientSearch(''); }}
                              className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
                            ><X size={12} /></button>
                          )}
                        </div>
                        {showClientDropdown && !selectedClient && (
                          <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-[#1a1d25] border border-[#2d3444] rounded-lg shadow-xl max-h-72 overflow-y-auto">
                            {filteredClients.length > 0 ? (
                              filteredClients.map(c => (
                                <div
                                  key={c.id}
                                  className="px-3 py-2 hover:bg-[#242834] cursor-pointer transition-colors"
                                  onClick={() => { setSelectedClient(c); setClientSearch(''); setShowClientDropdown(false); }}
                                >
                                  <div className="text-xs text-white font-semibold">{c.name}</div>
                                  <div className="text-[10px] text-slate-400">{c.phone}{c.email ? ` \u2022 ${c.email}` : ''}</div>
                                </div>
                              ))
                            ) : (
                              <div className="p-3">
                                <div className="text-xs text-slate-400 mb-2">No se encontraron clientes para "<strong className="text-white">{clientSearch}</strong>"</div>
                                <div className="border-t border-[#2d3444] pt-2 mt-1">
                                  <div className="text-[10px] text-slate-500 font-bold uppercase mb-1.5 flex items-center gap-1"><Plus size={11} className="text-emerald-400" /> Crear Cliente R\u00e1pido</div>
                                  <input type="text" className="w-full bg-[#111318] border border-[#2d3444] rounded-lg py-1 px-2.5 text-xs text-white mb-1.5 focus:outline-none" placeholder="Nombre Completo" value={clientSearch} onChange={e => setClientSearch(e.target.value)} />
                                  <input type="text" className="w-full bg-[#111318] border border-[#2d3444] rounded-lg py-1 px-2.5 text-xs text-white mb-1.5 focus:outline-none" placeholder="Tel\u00e9fono (Obligatorio)" value={quickPhone} onChange={e => setQuickPhone(e.target.value)} />
                                  <button
                                    className="bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg py-1 px-3 text-[10px] font-bold transition-colors cursor-pointer w-full flex items-center justify-center gap-1"
                                    onClick={() => {
                                      const nameVal = clientSearch.trim();
                                      const phoneVal = quickPhone.trim();
                                      if (!nameVal || !phoneVal) { alert('Complete nombre y tel\u00e9fono'); return; }
                                      setNewClientName(nameVal);
                                      setNewClientPhone(phoneVal);
                                      setClientMode('create');
                                      setShowClientDropdown(false);
                                    }}
                                  >Crear y Seleccionar</button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1.5 p-2.5 rounded-lg bg-red-900/5 border border-dashed border-[#2d3444]">
                        <input type="text" className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" placeholder="Nombre completo del cliente nuevo" value={newClientName} onChange={e => setNewClientName(e.target.value)} />
                        <input type="text" className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" placeholder="Tel\u00e9fono (Obligatorio)" value={newClientPhone} onChange={e => setNewClientPhone(e.target.value)} />
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="text-[10px] text-slate-500 font-mono uppercase font-bold block mb-1">Equipo</label>
                  <input type="text" className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" value={equipment} onChange={e => setEquipment(e.target.value)} required />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 font-mono uppercase font-bold block mb-1">Marca</label>
                  <input type="text" className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" value={marca} onChange={e => setMarca(e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 font-mono uppercase font-bold block mb-1">Modelo</label>
                  <input type="text" className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" value={modelo} onChange={e => setModelo(e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 font-mono uppercase font-bold block mb-1">Estado</label>
                  <select className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none" value={status} onChange={e => setStatus(e.target.value)}>
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 font-mono uppercase font-bold block mb-1">Costo / Presupuesto ($)</label>
                  <input type="number" step="0.01" min="0" className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white font-mono focus:outline-none" value={price} onChange={e => setPrice(e.target.value)} />
                </div>
              </div>

              {/* Right column */}
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] text-slate-500 font-mono uppercase font-bold block mb-1">Problema Reportado</label>
                  <textarea className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none resize-none" style={{ height: 80 }} value={problem} onChange={e => setProblem(e.target.value)} required />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 font-mono uppercase font-bold block mb-1">Notas Adicionales</label>
                  <textarea className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none resize-none" style={{ height: 80 }} value={notes} onChange={e => setNotes(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <button onClick={handleSave} className="w-full bg-emerald-700 hover:bg-emerald-600 text-white font-bold py-2 px-4 rounded-lg text-xs transition-all cursor-pointer">
                {editingId ? 'Actualizar Orden' : 'Crear Orden'}
              </button>
              {editingId && (
                <button onClick={() => { if (editingId && window.confirm('\u00bfEst\u00e1 seguro de eliminar esta orden de reparaci\u00f3n de forma permanente?')) handleDelete(editingId); }} className="w-full bg-red-800/50 hover:bg-red-700/60 text-red-300 font-bold py-2 px-4 rounded-lg text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5">
                  <Trash2 size={12} /> Eliminar Orden Permanentemente
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Counter Modal */}
      {showCounterModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowCounterModal(false)}>
          <div className="bg-[#111318] border border-[#2d3444] rounded-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-[#2d3444] pb-3 mb-4">
              <span className="font-semibold text-white font-display flex items-center gap-2"><Settings size={16} className="text-slate-400" /> Configurar Numeración</span>
              <button onClick={() => setShowCounterModal(false)} className="text-slate-400 hover:text-white transition-colors cursor-pointer"><X size={16} /></button>
            </div>
            <p className="text-xs text-slate-400 mb-3">El pr\u00f3ximo n\u00famero de orden ser\u00e1:</p>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Formato:</span>
              <span className="text-sm font-mono font-bold text-amber-400 bg-[#181a20] border border-[#2d3444] rounded-lg px-3 py-1.5">
                {'REP-' + String(counterValue).padStart(4, '0')}
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Orden actual: REP-{String(counterValue).padStart(4, '0')}&nbsp;&rarr;&nbsp;Siguiente: REP-{String(counterValue + 1).padStart(4, '0')}
            </p>
            <label className="text-xs text-slate-400 mb-1 block">N\u00famero inicial para la pr\u00f3xima orden:</label>
            <input
              type="number"
              min="1"
              value={counterValue}
              onChange={e => setCounterValue(parseInt(e.target.value, 10) || 1)}
              className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-2 px-3 text-sm text-white font-mono focus:outline-none mb-4"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowCounterModal(false)} className="flex-1 bg-[#181a20] hover:bg-[#1f242e] text-slate-300 font-medium py-2 px-4 rounded-lg text-xs transition-all cursor-pointer">Cancelar</button>
              <button onClick={saveCounter} className="flex-1 bg-blue-700 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg text-xs transition-all cursor-pointer">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccess && successData && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowSuccess(false)}>
          <div className="bg-[#111318] border border-[#2d3444] rounded-xl w-full max-w-md p-6 text-center" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-[#2d3444] pb-3 mb-4">
              <span className="font-semibold text-white font-display flex items-center gap-2"><CheckCircle size={16} className="text-emerald-400" /> Orden Creada Exitosamente</span>
              <button onClick={() => setShowSuccess(false)} className="text-slate-400 hover:text-white transition-colors cursor-pointer"><X size={16} /></button>
            </div>
            <p className="text-xs text-slate-400 mb-4">Entregale esta clave al cliente para que pueda rastrear su reparaci\u00f3n:</p>
            <div className="bg-blue-700 text-white py-4 px-6 rounded-xl mb-3">
              <div className="text-[10px] opacity-80 mb-1 font-bold uppercase tracking-wider">Clave de Consulta</div>
              <div style={{ fontSize: '3.5rem', fontWeight: 900, letterSpacing: '0.6rem', lineHeight: 1 }}>{successData.code}</div>
            </div>
            <p className="text-xs text-slate-400 mb-4">Orden: <strong className="text-white">{successData.id}</strong></p>
            <div className="flex gap-2">
              <button
                className="flex-1 bg-blue-700 hover:bg-blue-600 text-white font-bold py-2 px-3 rounded-lg text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
                onClick={() => {
                  const r = repairs.find(r => r.code === successData.code) || repairs.find(r => r.id === successData.id);
                  if (r) handlePrint(r);
                  setShowSuccess(false);
                }}
              ><Printer size={13} /> Imprimir / PDF</button>
              {successData.clientPhone && (
                <button
                  className="flex-1 bg-emerald-700 hover:bg-emerald-600 text-white font-bold py-2 px-3 rounded-lg text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  onClick={() => { handleWhatsApp(successData.clientName || '', successData.clientPhone || '', successData.code, successData.equipment || ''); setShowSuccess(false); }}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  Enviar a Cliente
                </button>
              )}
            </div>
            <button onClick={() => setShowSuccess(false)} className="w-full mt-3 bg-[#181a20] hover:bg-[#1f242e] text-slate-300 font-medium py-2 px-4 rounded-lg text-xs transition-all cursor-pointer">Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}
