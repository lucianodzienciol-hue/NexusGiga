import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, RefreshCw, LogOut, CheckCircle, Loader } from 'lucide-react';

export default function WhatsAppStatus() {
  const [status, setStatus] = useState<{ ready: boolean; hasQR: boolean; initializing: boolean }>({ ready: false, hasQR: false, initializing: false });
  const [showModal, setShowModal] = useState(false);
  const [qrData, setQrData] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const waitingQR = useRef(false);
  const prevReady = useRef(false);

  const fetchStatus = async () => {
    try {
      const r = await fetch('/api/whatsapp/status');
      if (r.ok) setStatus(await r.json());
    } catch {}
  };

  const loadQR = async () => {
    try {
      const r = await fetch('/api/whatsapp/qr');
      if (r.ok) { const d = await r.json(); setQrData(d.qr); return true; }
    } catch {}
    return false;
  };

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (showModal && waitingQR.current && status.hasQR && !qrData) {
      loadQR().then(ok => { if (ok) waitingQR.current = false; });
    }
  }, [showModal, status.hasQR]);

  useEffect(() => {
    if (status.ready && !prevReady.current) {
      setToast('WhatsApp conectado correctamente');
      setTimeout(() => setToast(null), 4000);
    }
    prevReady.current = status.ready;
  }, [status.ready]);

  const handleInit = () => {
    setShowModal(true);
    setQrData(null);
    waitingQR.current = true;
    fetch('/api/whatsapp/init', { method: 'POST' });
    fetchStatus();
  };

  const handleLogout = async () => {
    await fetch('/api/whatsapp/logout', { method: 'POST' });
    setQrData(null);
    setShowModal(false);
    waitingQR.current = false;
    fetchStatus();
  };

  const close = () => {
    setShowModal(false);
    waitingQR.current = false;
  };

  return (
    <>
      <button
        onClick={() => { if (status.ready) { setShowModal(true); } else { handleInit(); } }}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all cursor-pointer"
        title={status.ready ? 'WhatsApp conectado' : status.initializing ? 'Inicializando...' : 'Conectar WhatsApp'}
      >
        {status.ready ? (
          <><CheckCircle size={12} className="text-emerald-400" /><span className="text-emerald-400">WA</span></>
        ) : status.initializing ? (
          <><Loader size={12} className="text-amber-400 animate-spin" /><span className="text-amber-400">WA</span></>
        ) : (
          <><MessageCircle size={12} className="text-slate-400" /><span className="text-slate-400">WA</span></>
        )}
      </button>

      {toast && (
        <div className="fixed bottom-20 right-6 z-[60] bg-emerald-900/90 border border-emerald-700/60 text-emerald-200 px-4 py-3 rounded-xl shadow-2xl text-xs font-semibold flex items-center gap-2 animate-[fadeInUp_0.3s_ease-out]">
          <CheckCircle size={14} className="text-emerald-400" />
          {toast}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={close}>
          <div className="bg-[#111318] border border-[#2d3444] rounded-xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <MessageCircle size={16} className="text-[#5aa6ec]" />
                WhatsApp
              </h3>
              <button onClick={close} className="text-slate-400 hover:text-white cursor-pointer"><X size={16} /></button>
            </div>

            {status.ready ? (
              <div className="text-center space-y-4">
                <CheckCircle size={48} className="text-emerald-400 mx-auto" />
                <p className="text-emerald-400 font-semibold text-sm">WhatsApp conectado</p>
                <p className="text-slate-400 text-xs">Podés enviar reportes directamente desde el POS.</p>
                <button onClick={handleLogout} className="flex items-center justify-center gap-2 mx-auto bg-red-800 hover:bg-red-700 text-white rounded-lg py-2 px-4 text-xs font-bold transition-all cursor-pointer">
                  <LogOut size={13} /> Cerrar sesión
                </button>
              </div>
            ) : qrData ? (
              <div className="text-center space-y-4">
                <p className="text-slate-400 text-xs">Escaneá el código QR con WhatsApp para conectar.</p>
                <img src={qrData} alt="WhatsApp QR" className="mx-auto" />
                <p className="text-slate-500 text-[10px]">Abrí WhatsApp → Menú → Dispositivos vinculados → Vincular</p>
                <div className="flex gap-2 justify-center">
                  <button onClick={handleLogout} className="flex items-center gap-1.5 bg-red-800 hover:bg-red-700 text-white rounded-lg py-1.5 px-3 text-[10px] font-bold transition-all cursor-pointer">
                    Cancelar
                  </button>
                  <button onClick={() => { setQrData(null); loadQR(); }} className="flex items-center gap-1.5 bg-[#2d3444] hover:bg-[#3a4155] text-white rounded-lg py-1.5 px-3 text-[10px] font-bold transition-all cursor-pointer">
                    <RefreshCw size={11} /> Actualizar QR
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center space-y-4">
                <Loader size={32} className="text-amber-400 animate-spin mx-auto" />
                <p className="text-amber-400 text-xs">Inicializando WhatsApp...</p>
                <p className="text-slate-500 text-[10px]">Esperá mientras se prepara el cliente.</p>
                <button onClick={handleLogout} className="flex items-center gap-1.5 mx-auto bg-red-800 hover:bg-red-700 text-white rounded-lg py-1.5 px-3 text-[10px] font-bold transition-all cursor-pointer">
                  Cancelar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
