import ticketTemplate from '../ticketTemplate';
import ticket80, { ThermalSale, ThermalRepair, repair80 } from './ticket80';
import { CompanyConfig } from '../types';

export type PrintMode = 'a4' | 'ticket80';

export function printModeOf(company?: CompanyConfig | null): PrintMode {
  return company?.printMode === 'ticket80' ? 'ticket80' : 'a4';
}

export function printHtml(html: string): boolean {
  const w = window.open('', '_blank');
  if (!w) {
    alert('El navegador bloqueó la ventana de impresión. Permita popups para este sitio.');
    return false;
  }
  w.document.write(html);
  w.document.close();
  return true;
}

export function printSale(
  sale: ThermalSale,
  reprint: boolean,
  company?: CompanyConfig | null
): boolean {
  const html = printModeOf(company) === 'ticket80'
    ? ticket80(sale, reprint, company || undefined)
    : ticketTemplate(sale as any, reprint, company || undefined);
  return printHtml(html);
}

export function printRepair(
  repair: ThermalRepair,
  mode: PrintMode,
  company?: { companyName?: string; phone?: string; currency?: string },
  a4html?: string
): boolean {
  if (mode === 'ticket80') return printHtml(repair80(repair, company));
  if (a4html) return printHtml(a4html);
  return false;
}
