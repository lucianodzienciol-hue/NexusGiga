import React, { useEffect, useState } from 'react';
import {
  X, Check, Circle, CheckCircle2, Loader2, Map,
  Settings2, Store, Rocket, Save, Github, Building2,
} from 'lucide-react';
import {
  SetupCtx, computeSetupSteps, loadManualDone, setManualDone,
  setGuideDismissed, isGuideDismissed, setupComplete,
} from '../lib/setupStatus';

interface Props {
  open: boolean;
  ctx: SetupCtx;
  webData: any;
  companyConfig: any;
  onClose: () => void;
  onOpenSettings: () => void;
  onGoPanelWeb: () => void;
  onRefresh: () => void;
}

function Field({ label, value, onChange, placeholder, type, hint }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; hint?: string;
}) {
  return (
    <label className="block">
      <span className="block mb-1 text-[10px] text-slate-500">{label}</span>
      <input
        type={type || 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[#0d0f13] border border-[#2d3444] rounded-md px-2.5 py-1.5 text-xs text-white placeholder:text-slate-600 focus:border-[#A63A42] outline-none"
      />
      {hint && <span className="block mt-0.5 text-[9px] text-slate-600">{hint}</span>}
    </label>
  );
}

function SaveBtn({ onClick, busy, done, label }: { onClick: () => void; busy?: boolean; done?: boolean; label?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#A63A42] text-slate-950 text-[11px] font-semibold hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer"
    >
      {busy ? <Loader2 size={12} className="animate-spin" /> : done ? <Check size={12} /> : <Save size={12} />}
      {busy ? 'Guardando…' : done ? 'Guardado' : (label || 'Guardar')}
    </button>
  );
}

function StatusPill({ done, children }: { done: boolean; children: string }) {
  return (
    <span className={`text-[9px] px-2 py-0.5 rounded-full font-mono ${done ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
      {children}
    </span>
  );
}

export default function OnboardingGuide({ open, ctx, webData, companyConfig, onClose, onOpenSettings, onGoPanelWeb, onRefresh }: Props) {
  const [manualDone, setManual] = useState<Record<string, boolean>>(loadManualDone());
  const [notAgain, setNotAgain] = useState<boolean>(isGuideDismissed());
  const [form, setForm] = useState({
    githubRepo: '', githubToken: '',
    companyName: '', whatsapp: '', phone: '', email: '', address: '',
  });
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [savedMsg, setSavedMsg] = useState<Record<string, string>>({});
  const [deploy, setDeploy] = useState<{ running: boolean; url: string; error: string }>({ running: false, url: '', error: '' });

  const setF = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!open) return;
    const cc = companyConfig || {};
    const wc = webData?.config || {};
    setForm((f) => ({
      githubRepo: f.githubRepo || cc.githubRepo || '',
      githubToken: f.githubToken || cc.githubToken || '',
      companyName: f.companyName || wc.companyName || '',
      whatsapp: f.whatsapp || wc.whatsapp || '',
      phone: f.phone || wc.phone || '',
      email: f.email || wc.email || '',
      address: f.address || wc.address || '',
    }));
  }, [open, companyConfig, webData]);

  const toggleManual = (id: string) => {
    const next = setManualDone(id, !manualDone[id]);
    setManual(next);
  };

  const toggleNotAgain = () => {
    const next = !notAgain;
    setNotAgain(next);
    setGuideDismissed(next);
  };

  const saveCompanyConfig = async () => {
    setBusy((b) => ({ ...b, config: true }));
    setSavedMsg((s) => ({ ...s, config: '' }));
    try {
      const r = await fetch('/api/company-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          githubRepo: form.githubRepo,
          githubToken: form.githubToken,
        }),
      });
      const d = await r.json();
      if (r.ok) {
        setSavedMsg((s) => ({ ...s, config: 'Guardado correctamente.' }));
        onRefresh();
      } else setSavedMsg((s) => ({ ...s, config: d?.error || 'Error al guardar.' }));
    } catch {
      setSavedMsg((s) => ({ ...s, config: 'Error de conexión con el servidor.' }));
    }
    setBusy((b) => ({ ...b, config: false }));
  };

  const saveWebConfig = async () => {
    setBusy((b) => ({ ...b, company: true }));
    setSavedMsg((s) => ({ ...s, company: '' }));
    try {
      const base = { ...(webData?.config || {}) };
      const config = {
        ...base,
        companyName: form.companyName,
        whatsapp: form.whatsapp,
        phone: form.phone,
        email: form.email,
        address: form.address,
      };
      const r = await fetch('/api/web-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const d = await r.json();
      if (r.ok) { setSavedMsg((s) => ({ ...s, company: 'Datos de empresa guardados.' })); onRefresh(); }
      else setSavedMsg((s) => ({ ...s, company: d?.error || 'Error al guardar.' }));
    } catch {
      setSavedMsg((s) => ({ ...s, company: 'Error de conexión con el servidor.' }));
    }
    setBusy((b) => ({ ...b, company: false }));
  };

  const deployNow = async () => {
    setDeploy({ running: true, url: '', error: '' });
    try {
      const token = form.githubToken.startsWith('****') ? companyConfig?.githubToken || '' : form.githubToken;
      const repo = form.githubRepo;
      if (!token || !repo) { setDeploy({ running: false, url: '', error: 'Falta el repositorio o el token.' }); return; }
      const r = await fetch('/api/deploy-ghpages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, repo }),
      });
      const d = await r.json();
      if (r.ok && d.success) { setDeploy({ running: false, url: d.url, error: '' }); onRefresh(); }
      else setDeploy({ running: false, url: '', error: d?.error || 'Error al desplegar.' });
    } catch {
      setDeploy({ running: false, url: '', error: 'Error de conexión con el servidor.' });
    }
  };

  if (!open) return null;

  const steps = computeSetupSteps(ctx, manualDone);

  const doneCount = steps.filter((s) => s.status === 'done').length;
  const complete = setupComplete(steps);

  return (
    <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#111318] border border-[#2d3444] rounded-xl max-w-3xl w-full shadow-2xl flex flex-col max-h-[94vh] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2d3444] shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-[#A63A42]/15 border border-[#A63A42]/40 flex items-center justify-center text-[#A63A42]">
              <Map size={17} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white font-display">Configurá tu nuevo comercio</h2>
              <p className="text-[10px] text-slate-500">Completá los datos y la guía avanza sola. Todo queda guardado en el panel.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-[#1a1d24] transition-all cursor-pointer">
            <X size={15} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-[#1b1e26] bg-[#0d0f13] shrink-0">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#A63A42] animate-pulse" />
            <span className="text-[11px] font-medium text-white">{Math.min(doneCount, steps.length)} de {steps.length} pasos listos</span>
            <span className="ml-auto text-[10px] text-slate-500 font-mono flex items-center gap-1">
              {complete ? <CheckCircle2 size={12} className="text-emerald-400" /> : <Circle size={12} className="text-amber-400" />}
              {complete ? 'Comercio configurado' : 'Completá los campos de cada paso'}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* STEP 1 — GitHub */}
          <div className={`rounded-lg border p-3.5 transition-all ${ctx.hasRepo && ctx.hasToken ? 'border-emerald-500/25 bg-emerald-500/[0.04]' : 'border-[#2d3444] bg-[#151821]/40'}`}>
            <div className="flex items-start gap-3">
              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5 ${ctx.hasRepo && ctx.hasToken ? 'bg-emerald-500 text-slate-950' : 'bg-[#22262f] text-slate-400'}`}>
                {ctx.hasRepo && ctx.hasToken ? <Check size={12} /> : <Github size={12} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-white">1. Repositorio de GitHub</span>
                  <StatusPill done={ctx.hasRepo && ctx.hasToken}>{ctx.hasRepo && ctx.hasToken ? 'Listo' : 'Pendiente'}</StatusPill>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed mt-1">
                  Repo público nuevo y token fine-grained con permiso <strong>Contents: Read and write</strong> sobre ese repo.
                </p>
                <div className="mt-3 grid sm:grid-cols-2 gap-2.5">
                  <Field label="Repositorio (usuario/repo)" value={form.githubRepo} onChange={setF('githubRepo')} placeholder="mi-comercio/tienda" />
                  <Field label="Token GitHub (fine-grained)" type="password" value={form.githubToken} onChange={setF('githubToken')} placeholder="github_pat_…" hint="Se guarda encriptado en tu computadora." />
                </div>
                <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                  <SaveBtn onClick={saveCompanyConfig} busy={!!busy.config} done={!!(ctx.hasRepo && ctx.hasToken)} label="Guardar GitHub" />
                  {savedMsg.config && <span className="text-[10px] text-emerald-400">{savedMsg.config}</span>}
                </div>
              </div>
            </div>
          </div>

          {/* STEP 2 — Empresa */}
          <div className={`rounded-lg border p-3.5 transition-all ${ctx.hasCompany ? 'border-emerald-500/25 bg-emerald-500/[0.04]' : 'border-[#2d3444] bg-[#151821]/40'}`}>
            <div className="flex items-start gap-3">
              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5 ${ctx.hasCompany ? 'bg-emerald-500 text-slate-950' : 'bg-[#22262f] text-slate-400'}`}>
                {ctx.hasCompany ? <Check size={12} /> : <Building2 size={12} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-white">2. Datos de tu empresa</span>
                  <StatusPill done={ctx.hasCompany}>{ctx.hasCompany ? 'Listo' : 'Pendiente'}</StatusPill>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed mt-1">
                  Nombre, contacto y dirección. Después cargá el logo y el catálogo desde <strong>Panel Web</strong>.
                </p>
                <div className="mt-3 grid sm:grid-cols-2 gap-2.5">
                  <div className="sm:col-span-2"><Field label="Nombre de la empresa" value={form.companyName} onChange={setF('companyName')} placeholder="Mi Comercio" /></div>
                  <Field label="WhatsApp (solo números)" value={form.whatsapp} onChange={setF('whatsapp')} placeholder="1122334455" />
                  <Field label="Teléfono" value={form.phone} onChange={setF('phone')} placeholder="011-5555-0000" />
                  <Field label="Email" value={form.email} onChange={setF('email')} placeholder="contacto@miempresa.com" />
                  <Field label="Dirección" value={form.address} onChange={setF('address')} placeholder="Calle Ejemplo 1234" />
                </div>
                <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                  <SaveBtn onClick={saveWebConfig} busy={!!busy.company} done={ctx.hasCompany} label="Guardar empresa" />
                  {savedMsg.company && <span className="text-[10px] text-emerald-400">{savedMsg.company}</span>}
                  <button onClick={onGoPanelWeb} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#1a1d24] border border-[#2d3444] text-[11px] text-slate-300 hover:border-[#A63A42] transition-all cursor-pointer">
                    <Store size={12} /> Más datos (logo, redes)
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* STEP 3 — Deploy */}
          <div className={`rounded-lg border p-3.5 transition-all ${ctx.hasWebUrl ? 'border-emerald-500/25 bg-emerald-500/[0.04]' : 'border-[#2d3444] bg-[#151821]/40'}`}>
            <div className="flex items-start gap-3">
              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5 ${ctx.hasWebUrl ? 'bg-emerald-500 text-slate-950' : 'bg-[#22262f] text-slate-400'}`}>
                {ctx.hasWebUrl ? <Check size={12} /> : <Rocket size={12} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-white">3. Publicar en GitHub Pages</span>
                  <StatusPill done={ctx.hasWebUrl}>{ctx.hasWebUrl ? 'Publicado' : 'Pendiente'}</StatusPill>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed mt-1">
                  Con el repo y el token del paso 1, publicá la tienda. Tarda alrededor de 1 a 2 minutos en estar lista.
                </p>
                <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                  <button onClick={deployNow} disabled={deploy.running} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#A63A42] text-slate-950 text-[11px] font-semibold hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer">
                    {deploy.running ? <Loader2 size={12} className="animate-spin" /> : <Rocket size={12} />}
                    {deploy.running ? 'Desplegando…' : (ctx.hasWebUrl ? 'Re-desplegar' : 'Desplegar ahora')}
                  </button>
                  {!ctx.hasRepo && (
                    <span className="text-[10px] text-slate-500">Guardá primero el repositorio y el token en el paso 1.</span>
                  )}
                </div>
                {deploy.url && (
                  <p className="mt-1.5 text-[10px] text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 size={11} /> Publicada en <a href={deploy.url} target="_blank" rel="noopener noreferrer" className="underline">{deploy.url}</a>
                  </p>
                )}
                {deploy.error && <p className="mt-1.5 text-[10px] text-red-400">{deploy.error}</p>}
                {ctx.hasWebUrl && companyConfig?.webUrl && (
                  <p className="mt-1.5 text-[10px] text-slate-400">
                    Publicada en <a href={companyConfig.webUrl} target="_blank" rel="noopener noreferrer" className="underline">{companyConfig.webUrl}</a>
                  </p>
                )}
              </div>
            </div>
          </div>

          <label className="block rounded-lg border border-[#2d3444] bg-[#151821]/40 p-3 text-[10px] text-slate-400 leading-relaxed">
            <strong className="text-slate-300">Extras</strong>: la aplicación de pedidos (PWA) queda en <code className="font-mono text-[9px]">{companyConfig?.webUrl ? companyConfig.webUrl.replace(/\/$/, '') + '/pedidos/' : 'tu-pagina/pedidos/'}</code>.
            Podés cambiar el logo del header, banners, popup y más desde <button onClick={onGoPanelWeb} className="underline text-[#A63A42] cursor-pointer">Panel Web</button> o la <button onClick={onOpenSettings} className="underline text-[#A63A42] cursor-pointer">Configuración</button>.
          </label>
        </div>

        <div className="px-5 py-3 border-t border-[#2d3444] flex items-center justify-between gap-3 shrink-0 bg-[#0d0f13]">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={notAgain} onChange={toggleNotAgain} className="accent-[#A63A42] cursor-pointer" />
            <span className="text-[11px] text-slate-400">No volver a mostrar esta guía al iniciar</span>
          </label>
          <button onClick={onClose} className="px-4 py-1.5 rounded-md bg-[#A63A42] text-slate-950 text-[11px] font-semibold hover:opacity-90 transition-all cursor-pointer">
            {complete ? 'Comenzar' : 'Cerrar'}
          </button>
        </div>
      </div>
    </div>
  );
}