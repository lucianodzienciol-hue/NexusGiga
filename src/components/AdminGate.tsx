import React, { useState, useEffect } from 'react';

interface DemoStatus {
  demo: boolean;
  edition?: string;
  days?: number;
  daysLeft?: number;
  expiresAt?: string;
  expired?: boolean;
}

export default function AdminGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<DemoStatus | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/demo-status')
      .then((r) => (r.ok ? r.json() : { demo: false }))
      .then((j) => { if (alive) setStatus(j); })
      .catch(() => { if (alive) setStatus({ demo: false }); });
    return () => { alive = false; };
  }, []);

  if (!status || !status.demo) return <>{children}</>;

  if (status.expired) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d0f14', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif', padding: 24 }}>
        <div style={{ maxWidth: 440, textAlign: 'center', background: '#111318', border: '1px solid #2d3444', borderRadius: 16, padding: 40 }}>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>Período de prueba finalizado</div>
          <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.6 }}>
            Tu demo de {status.days || 15} días de Nexus {status.edition === 'lite' ? 'Lite' : 'Full'} ha terminado.
            Contactanos para activar tu licencia y seguir usando tus datos.
          </p>
          <p style={{ color: '#64748b', fontSize: 12, marginTop: 16 }}>Tus datos están a salvo en este equipo.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={{ background: '#7c2d12', color: '#fed7aa', fontSize: 12, textAlign: 'center', padding: '6px 12px', fontFamily: 'system-ui, sans-serif' }}>
        Versión demo · quedan {status.daysLeft} día(s) de prueba
      </div>
      {children}
    </>
  );
}
