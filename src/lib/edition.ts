export type Edition = 'lite' | 'full';

export const APP_EDITION: Edition =
  String((import.meta as any).env?.VITE_APP_EDITION || '').trim() === 'lite' ? 'lite' : 'full';

export const APP_LABEL = APP_EDITION === 'lite' ? 'Nexus Lite' : 'Nexus Full';

export const APP_VERSION = '2.0.0';

export const LITE_TABS = [
  'Vender',
  'Historiales',
  'Artículos',
  'Clientes',
  'Métodos de Pago',
  'Panel Web',
  'Backups',
] as const;
