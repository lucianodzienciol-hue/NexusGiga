import React, { useState, useEffect } from 'react';
import { MessageCircle, CheckCircle, Loader, Send, X, RefreshCw, LogOut, Save } from 'lucide-react';

interface WAConfig {
  number: string;
  sendDailyClose: boolean;
  sendLowStock: boolean;
  sendNewSale: boolean;
  sendWeeklySummary: boolean;
}

const DEFAULT_CONFIG: WAConfig = {
  number: '',
  sendDailyClose: false,
  sendLowStock: false,
  sendNewSale: false,
  sendWeeklySummary: false
};

const REPORT_OPTIONS: { key: keyof WAConfig; label: string; desc: string }[] = [
  { key: 'sendDailyClose', label: 'Cierre de Caja Diario', desc: 'Resumen de ventas, egresos y métodos de pago del día al cerrar caja' },
  { key: 'sendLowStock', label: 'Alertas de Stock Bajo', desc: 'Notificación cuando un producto tenga stock 0 o menor al mínimo' },
  { key: 'sendNewSale', label: 'Notificación de Venta', desc: 'Cada vez que se registre una venta, enviar detalle por WhatsApp' },
  { key: 'sendWeeklySummary', label: 'Resumen Semanal', desc: 'Estadísticas de la semana: total vendido, productos más vendidos, ganancias' },
];

export default function WhatsAppConfig() {
  const [config, setConfig] = useState<WAConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [waStatus, setWaStatus] = useState<{ ready: boolean; hasQR: boolean; initializing: boolean }>({ ready: false, hasQR: false, initializing: false });
  const [showQR, setShowQR] = useState(false);
  const [qrData, setQrData] = useState<string | null>(null);
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const loadConfig = async () => {
    try {
      const r = await fetch('/api/whatsapp/config');
      if (r.ok) {
        const data = await r.json();
        if (data && data.number) setConfig({ ...DEFAULT_CONFIG, ...data });
      }
    } catch {}
  };

  const loadStatus = async () => {
    try {
      const r = await fetch('/api/whatsapp/status');
      if (r.ok) setWaStatus(await r.json());
    } catch {}
  };

  useEffect(() => { loadConfig(); loadStatus(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {}
    setSaving(false);
  };

  const handleTest = async () => {
    if (!config.number) { setTestResult('Ingresá un número primero'); return; }
    setTestSending(true);
    setTestResult(null);
    try {
      const r = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: config.number,
          message: '🔧 *Prueba de conexión WhatsApp*\n\nSi recibís este mensaje, los reportes de Nexus POS están configurados correctamente.'
        })
      });
      if (r.ok) setTestResult('Mensaje enviado correctamente');
      else {
        const err = await r.json();
        setTestResult(err.error || 'Error al enviar');
      }
    } catch { setTestResult('Error de conexión'); }
    setTestSending(false);
  };

  const handleInitWA = async () => {
    setShowQR(true);
    await fetch('/api/whatsapp/init', { method: 'POST' });
    const poll = setInterval(async () => {
      const r = await fetch('/api/whatsapp/status');
      if (r.ok) {
        const s = await r.json();
        setWaStatus(s);
        if (s.hasQR && !qrData) {
          const qrR = await fetch('/api/whatsapp/qr');
          if (qrR.ok) { const d = await qrR.json(); setQrData(d.qr); }
        }
        if (s.ready) clearInterval(poll);
      }
    }, 3000);
  };

  const handleLogoutWA = async () => {
    await fetch('/api/whatsapp/logout', { method: 'POST' });
    setWaStatus({ ready: false, hasQR: false, initializing: false });
    setQrData(null);
    setShowQR(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <MessageCircle size={16} className="text-[#5aa6ec]" />
        <h2 className="text-sm font-bold uppercase tracking-wider text-white">WhatsApp</h2>
        <span className="text-[10px] text-slate-500 font-mono">Configuración de reportes automáticos</span>
      </div>

      {/* Connection Status */}
      <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-5 max-w-xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              Estado de Conexión
            </h3>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {waStatus.ready
                ? 'WhatsApp conectado. Podés recibir reportes automáticos.'
                : waStatus.initializing
                ? 'Inicializando cliente WhatsApp...'
                : 'WhatsApp no conectado. Iniciá sesión para recibir reportes.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {waStatus.ready ? (
              <span className="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold">
                <CheckCircle size={14} /> Conectado
              </span>
            ) : waStatus.initializing ? (
              <span className="flex items-center gap-1.5 text-amber-400 text-xs font-semibold">
                <Loader size={14} className="animate-spin" /> Inicializando
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-slate-400 text-xs font-semibold">
                <span className="h-2 w-2 rounded-full bg-slate-500" /> Desconectado
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          {!waStatus.ready ? (
            <button onClick={handleInitWA} className="flex items-center gap-1.5 bg-[#5aa6ec] text-[#0c0d10] rounded-lg py-1.5 px-3 text-xs font-bold hover:brightness-110 transition-all cursor-pointer">
              <RefreshCw size={12} /> Conectar WhatsApp
            </button>
          ) : (
            <button onClick={handleLogoutWA} className="flex items-center gap-1.5 bg-red-800 hover:bg-red-700 text-white rounded-lg py-1.5 px-3 text-xs font-bold transition-all cursor-pointer">
              <LogOut size={12} /> Desconectar
            </button>
          )}
        </div>
      </div>

      {/* QR Modal */}
      {showQR && !waStatus.ready && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowQR(false)}>
          <div className="bg-[#111318] border border-[#2d3444] rounded-xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">Conectar WhatsApp</h3>
              <button onClick={() => setShowQR(false)} className="text-slate-400 hover:text-white cursor-pointer"><X size={16} /></button>
            </div>
            {qrData ? (
              <div className="text-center space-y-4">
                <p className="text-slate-400 text-xs">Escaneá el código QR con WhatsApp.</p>
                <img src={qrData} alt="WhatsApp QR" className="mx-auto" />
                <p className="text-slate-500 text-[10px]">WhatsApp → Menú → Dispositivos vinculados → Vincular</p>
              </div>
            ) : (
              <div className="text-center py-8">
                <Loader size={32} className="text-amber-400 animate-spin mx-auto" />
                <p className="text-amber-400 text-xs mt-4">Generando QR...</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Config Form */}
      <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-5 max-w-xl">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4">Configuración de Reportes</h3>

        <div className="space-y-3 mb-4">
          <label className="text-[10px] text-slate-500 font-mono uppercase block">Número de WhatsApp (con código de área)</label>
          <input
            type="text"
            value={config.number}
            onChange={e => setConfig(p => ({ ...p, number: e.target.value }))}
            placeholder="Ej: 5491123456789"
            className="w-full bg-[#181a20] border border-[#2d3444] rounded-lg py-1.5 px-3 text-xs text-white font-mono focus:outline-none"
          />
          <p className="text-[9px] text-slate-600">Formato internacional sin + ni espacios. Ej: 5491123456789</p>
        </div>

        <div className="space-y-2">
          {REPORT_OPTIONS.map(opt => (
            <label key={opt.key} className="flex items-start gap-3 p-3 rounded-lg hover:bg-[#181a20] transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={config[opt.key] as boolean}
                onChange={e => setConfig(p => ({ ...p, [opt.key]: e.target.checked }))}
                className="mt-0.5 h-4 w-4 bg-[#181a20] border-[#2d3444] rounded"
              />
              <div>
                <span className="text-xs font-semibold text-white block">{opt.label}</span>
                <span className="text-[10px] text-slate-500">{opt.desc}</span>
              </div>
            </label>
          ))}
        </div>

        <div className="flex items-center gap-3 mt-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 bg-[#5aa6ec] text-[#0c0d10] rounded-lg py-1.5 px-4 text-xs font-bold hover:brightness-110 transition-all cursor-pointer disabled:opacity-50"
          >
            <Save size={13} /> {saving ? 'Guardando...' : 'Guardar Configuración'}
          </button>
          {saved && <span className="text-emerald-400 text-xs font-semibold flex items-center gap-1"><CheckCircle size={12} /> Guardado</span>}
        </div>
      </div>

      {/* Test */}
      <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-5 max-w-xl">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3">Probar Envío</h3>
        <p className="text-[10px] text-slate-500 mb-4">Enviá un mensaje de prueba al número configurado para verificar que todo funcione.</p>
        <button
          onClick={handleTest}
          disabled={testSending || !waStatus.ready || !config.number}
          className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg py-1.5 px-4 text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {testSending ? <Loader size={13} className="animate-spin" /> : <Send size={13} />}
          {testSending ? 'Enviando...' : 'Enviar Mensaje de Prueba'}
        </button>
        {testResult && (
          <p className={`mt-3 text-xs font-semibold ${testResult.includes('correctamente') ? 'text-emerald-400' : 'text-red-400'}`}>
            {testResult}
          </p>
        )}
      </div>
    </div>
  );
}
