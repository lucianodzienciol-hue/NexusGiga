import React from 'react';

interface EstadisticasProps {
  sales: any[];
  expenses: any[];
  products: any[];
  clients: any[];
}

export default function Estadisticas({ sales, expenses, products, clients }: EstadisticasProps) {
  return (
    <div className="space-y-6">
      <div className="bg-[#111318] border border-[#1f242e] rounded-xl p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-white mb-4">Estadísticas</h2>
        <p className="text-slate-400 text-xs">Aquí irán las estadísticas del negocio.</p>
      </div>
    </div>
  );
}