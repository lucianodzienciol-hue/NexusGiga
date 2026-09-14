import React, { useState } from 'react';
import { Plus, Edit2, Trash2, Search, User, ShieldCheck } from 'lucide-react';
import { Client } from '../types';

interface ClientesProps {
  clients: Client[];
  onRefresh: () => void;
}

export default function Clientes({ clients, onRefresh }: ClientesProps) {
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states
  const [document, setDocument] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const [formOpen, setFormOpen] = useState(false);

  const filtered = clients.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.document.includes(search)
  );

  const resetForm = () => {
    setDocument('');
    setName('');
    setPhone('');
    setEmail('');
    setEditingId(null);
    setFormOpen(false);
  };

  const handleEditClick = (client: Client) => {
    setEditingId(client.id);
    setDocument(client.document);
    setName(client.name);
    setPhone(client.phone || '');
    setEmail(client.email || '');
    setFormOpen(true);
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !document) {
      alert('Documento y Nombre son campos obligatorios (*).');
      return;
    }

    const payload = {
      document,
      name,
      phone: phone || '-',
      email: email || '-'
    };

    const url = editingId ? `/api/clients/${editingId}` : '/api/clients';
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
        alert('Ocurrió un error al guardar el cliente.');
      }
    } catch (err) {
      console.error('Error saving client:', err);
      alert('Error de red al guardar.');
    }
  };

  const handleDeleteClient = async (id: string, clientName: string) => {
    if (id === 'c1') {
      alert('No se puede eliminar el Cliente General por defecto.');
      return;
    }

    if (!confirm(`¿Está seguro de que desea eliminar a "${clientName}"?`)) {
      return;
    }

    try {
      const resp = await fetch(`/api/clients/${id}`, {
        method: 'DELETE'
      });
      if (resp.ok) {
        onRefresh();
      } else {
        let msg = 'Ocurrió un error al eliminar el cliente.';
        try { const b = await resp.json(); if (b && b.error) msg = b.error; } catch { /* noop */ }
        alert(msg);
      }
    } catch (err) {
      console.error('Error deleting client:', err);
      alert('Error de red al eliminar.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#111318] border border-[#1f242e] rounded-xl p-6">
        <div>
          <h1 className="text-xl font-bold font-display text-white">Directorio de Clientes</h1>
          <p className="text-xs text-slate-400 mt-1">Gestione su cartera de clientes, realice facturas de manera sencilla.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              if (!confirm('Importar clientes desde Web-main?')) return;
              try {
                const r = await fetch('/api/import-web-clients', { method: 'POST' });
                const d = await r.json();
                alert(`Importados ${d.imported} clientes de ${d.total} encontrados.`);
                onRefresh();
              } catch { alert('Error al importar'); }
            }}
            className="bg-[#2d3444] hover:bg-[#3a4155] text-slate-300 font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 transition-all cursor-pointer border border-[#3a4155]"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Importar Web
          </button>
          <button
            onClick={() => { resetForm(); setFormOpen(true); }}
            className="bg-[#A63A42] hover:bg-[#4691db] text-slate-900 font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
          >
            <Plus size={14} />
            Nuevo Cliente
          </button>
        </div>
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
                placeholder="Buscar por DNI, RUC o Nombre..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
              <User size={14} />
              <span>Clientes Registrados: {clients.length}</span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-[#1b1e26] bg-[#0d0e12]">
            <thead>
              <tr className="bg-[#181a20] border-b border-[#2d3444] text-[10px] tracking-wider text-slate-400 font-mono uppercase">
                <th className="py-3 px-4">DOCUMENTO (RUC/DNI)</th>
                <th className="py-3 px-4">NOMBRE / RAZÓN SOCIAL</th>
                <th className="py-3 px-4">TELÉFONO</th>
                <th className="py-3 px-4">CORREO ELECTRÓNICO</th>
                <th className="py-3 px-4 text-center">TIPO</th>
                <th className="py-3 px-4 text-right">ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr 
                  key={c.id}
                  className="border-b border-[#1b1e26] hover:bg-[#14171e] text-xs transition-colors"
                >
                  <td className="py-3 px-4 font-mono font-semibold text-slate-400">{c.document}</td>
                  <td className="py-3 px-4 font-medium text-white flex items-center gap-1.5">
                    {c.id === 'c1' && <ShieldCheck size={14} className="text-[#A63A42]" />}
                    {c.name}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-300">{c.phone || '-'}</td>
                  <td className="py-3 px-4 text-slate-400 font-mono">{c.email || '-'}</td>
                  <td className="py-3 px-4 text-center">
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded border bg-transparent border-slate-700 text-slate-400">
                      {c.document.length > 8 ? 'Contacto Jurídico' : 'Persona Física'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    {c.id !== 'c1' && (
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleEditClick(c)}
                          className="p-1 rounded text-slate-400 hover:text-[#A63A42] hover:bg-[#1f242e] transition-all"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          onClick={() => handleDeleteClient(c.id, c.name)}
                          className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-[#251012] transition-all"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </div>
        </div>

        {/* Sidebar Form */}
        {formOpen && (
          <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#1f242e] pb-3 mb-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                {editingId ? 'Editar Cliente' : 'Nuevo Cliente'}
              </h3>
              <button 
                onClick={resetForm}
                className="text-slate-500 hover:text-white text-xs"
              >
                Cancelar
              </button>
            </div>

            <form onSubmit={handleSaveClient} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-slate-400 block">DNI o RUC *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: 12345678 o RUC de 11 dig."
                  className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg p-2 text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-red-500 font-mono"
                  value={document}
                  onChange={(e) => setDocument(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 block">Nombre o Razón Social *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Juan Pérez o Distribuidora S.A."
                  className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg p-2 text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-red-500"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 block">Teléfono / Celular</label>
                <input
                  type="text"
                  placeholder="Ej: 987654321"
                  className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg p-2 text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-red-500 font-mono"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 block">Correo Electrónico</label>
                <input
                  type="email"
                  placeholder="Ej: nombre@empresa.com"
                  className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg p-2 text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-red-500 font-mono"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-2 rounded-lg bg-[#238636] hover:bg-[#2ea043] text-white font-bold transition-all shadow cursor-pointer text-center"
                >
                  {editingId ? 'GUARDAR CAMBIOS' : 'REGISTRAR CLIENTE'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
