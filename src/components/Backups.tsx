import React, { useState, useEffect } from 'react';
import { RotateCcw, Database, FileText, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';

interface BackupsProps {
  onRefresh: () => void;
}

interface BackupInfo {
  base: string;
  date: string;
  hasJson: boolean;
  hasDb: boolean;
}

export default function Backups({ onRefresh }: BackupsProps) {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadBackups = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/backups');
      if (r.ok) setBackups(await r.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadBackups(); }, []);

  const handleRestore = async (base: string) => {
    if (!window.confirm(`¿Restaurar la base de datos desde el backup "${base}"?\n\nSe perderán los datos actuales. Se creará un backup de seguridad antes de restaurar.`)) return;
    setRestoring(base);
    setMessage(null);
    try {
      const r = await fetch('/api/backups/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base })
      });
      const d = await r.json();
      if (d.success) {
        setMessage({ type: 'success', text: 'Base de datos restaurada correctamente.' });
        onRefresh();
      } else {
        setMessage({ type: 'error', text: d.error || 'Error al restaurar' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Error de conexión con el servidor' });
    }
    setRestoring(null);
  };

  const formatDate = (dateStr: string) => {
    const parts = dateStr.split(' ');
    if (parts.length < 2) return dateStr;
    const [date, time] = parts;
    return `${date} ${time.slice(0, 5)}`;
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">Copias de Seguridad</h2>
            <p className="text-[11px] text-slate-500">Backups automáticos almacenados en el servidor local</p>
          </div>
          <button
            onClick={loadBackups}
            className="flex items-center gap-1.5 bg-[#2d3444] hover:bg-[#3a4155] text-white rounded-lg py-1.5 px-3 text-xs font-semibold transition-colors"
          >
            <RefreshCw size={13} />
            Refrescar
          </button>
        </div>

        {message && (
          <div className={`mb-4 flex items-center gap-2 p-3 rounded-lg text-xs font-semibold ${
            message.type === 'success' ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800/40' : 'bg-red-900/30 text-red-400 border border-red-800/40'
          }`}>
            {message.type === 'success' ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
            {message.text}
          </div>
        )}

        {loading ? (
          <div className="p-12 text-center text-slate-500 text-xs">Cargando backups...</div>
        ) : backups.length === 0 ? (
          <div className="p-12 text-center text-slate-500 italic text-xs">
            No hay copias de seguridad disponibles. Los backups se generan automáticamente cada 24h (10:00 - 19:00).
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-[#1b1e26] bg-[#0d0e12]">
            <div className="divide-y divide-[#1b1e26]">
              <div className="grid grid-cols-12 bg-[#181a20] px-4 py-3 text-[10px] tracking-wider text-slate-400 font-mono uppercase font-bold text-left">
                <div className="col-span-5">FECHA</div>
                <div className="col-span-3">TIPO</div>
                <div className="col-span-4 text-right">ACCIÓN</div>
              </div>
              {backups.map(b => (
                <div key={b.base} className="grid grid-cols-12 px-4 py-3 text-xs text-slate-300 hover:bg-[#14171e] items-center transition-colors">
                  <div className="col-span-5 font-mono text-slate-400">
                    {formatDate(b.date)}
                  </div>
                  <div className="col-span-3 flex items-center gap-1.5">
                    {b.hasDb && (
                      <span className="inline-flex items-center gap-1 bg-blue-900/30 border border-blue-800/40 text-blue-400 rounded px-1.5 py-0.5 text-[9px] font-mono uppercase">
                        <Database size={10} /> DB
                      </span>
                    )}
                    {b.hasJson && (
                      <span className="inline-flex items-center gap-1 bg-amber-900/30 border border-amber-800/40 text-amber-400 rounded px-1.5 py-0.5 text-[9px] font-mono uppercase">
                        <FileText size={10} /> JSON
                      </span>
                    )}
                  </div>
                  <div className="col-span-4 text-right">
                    <button
                      onClick={() => handleRestore(b.base)}
                      disabled={restoring === b.base}
                      className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg py-1.5 px-3 text-[10px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {restoring === b.base ? (
                        <><RotateCcw size={12} className="animate-spin" /> Restaurando...</>
                      ) : (
                        <><RotateCcw size={12} /> Restaurar</>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}