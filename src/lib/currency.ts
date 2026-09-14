// Monedas soportadas por el POS y la tienda online.
// El código vive en companyConfig.currency (servidor); fallback ARS.
export const CURRENCIES: Record<string, { label: string; locale: string; decimals: number; symbol: string }> = {
  ARS: { label: 'Peso argentino (ARS $)', locale: 'es-AR', decimals: 0, symbol: '$' },
  USD: { label: 'Dólar estadounidense (USD $)', locale: 'en-US', decimals: 2, symbol: '$' },
  MXN: { label: 'Peso mexicano (MXN $)', locale: 'es-MX', decimals: 2, symbol: '$' },
  CLP: { label: 'Peso chileno (CLP $)', locale: 'es-CL', decimals: 0, symbol: '$' },
  COP: { label: 'Peso colombiano (COP $)', locale: 'es-CO', decimals: 0, symbol: '$' },
  PEN: { label: 'Sol peruano (PEN S/)', locale: 'es-PE', decimals: 2, symbol: 'S/' },
  UYU: { label: 'Peso uruguayo (UYU $)', locale: 'es-UY', decimals: 2, symbol: '$' },
  PYG: { label: 'Guaraní paraguayo (PYG ₲)', locale: 'es-PY', decimals: 0, symbol: '₲' },
  BOB: { label: 'Boliviano (BOB Bs.)', locale: 'es-BO', decimals: 2, symbol: 'Bs' },
  BRL: { label: 'Real brasileño (BRL R$)', locale: 'pt-BR', decimals: 2, symbol: 'R$' },
};

export function currencySymbol(code?: unknown): string {
  return CURRENCIES[currencyCodeOf(code)].symbol;
}

export function currencyCodeOf(code: unknown): string {
  const c = typeof code === 'string' ? code.toUpperCase() : 'ARS';
  return CURRENCIES[c] ? c : 'ARS';
}

export function formatMoney(amount: number, code?: unknown): string {
  const cur = currencyCodeOf(code);
  const c = CURRENCIES[cur];
  const n = Number(amount);
  return new Intl.NumberFormat(c.locale, {
    style: 'currency',
    currency: cur,
    minimumFractionDigits: c.decimals,
    maximumFractionDigits: c.decimals,
  }).format(Number.isFinite(n) ? n : 0);
}
