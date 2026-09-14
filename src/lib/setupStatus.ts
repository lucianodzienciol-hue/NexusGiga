const MANUAL_KEY = 'nexus_guide_manual_v1';
const DISMISS_KEY = 'nexus_guide_dismissed_v1';

export interface SetupCtx {
  hasRepo: boolean;
  hasToken: boolean;
  hasWebUrl: boolean;
  hasCompany: boolean;
}

export interface SetupStep {
  id: string;
  title: string;
  description: string;
  status: 'done' | 'pending';
  gating: boolean;
}

export function loadManualDone(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(MANUAL_KEY) || '{}');
  } catch {
    return {};
  }
}

export function setManualDone(id: string, done: boolean): Record<string, boolean> {
  const next = { ...loadManualDone(), [id]: done };
  localStorage.setItem(MANUAL_KEY, JSON.stringify(next));
  return next;
}

export function isGuideDismissed(): boolean {
  return localStorage.getItem(DISMISS_KEY) === '1';
}

export function setGuideDismissed(d: boolean): void {
  if (d) localStorage.setItem(DISMISS_KEY, '1');
  else localStorage.removeItem(DISMISS_KEY);
}

export function computeSetupSteps(ctx: SetupCtx, manualDone: Record<string, boolean>): SetupStep[] {
  return [
    {
      id: 'repo',
      title: 'Creá tu repositorio en GitHub',
      description: 'Creá un repo público nuevo (rama main) y generá un token fine-grained con permiso Contents: Read and write, limitado solo a ese repo.',
      status: manualDone.repo || (ctx.hasRepo && ctx.hasToken) ? 'done' : 'pending',
      gating: true,
    },
    {
      id: 'company',
      title: 'Configurá los datos de tu empresa',
      description: 'Cargá nombre, logo, WhatsApp, redes y catálogo desde Panel Web → Empresa y guardá.',
      status: manualDone.company || ctx.hasCompany ? 'done' : 'pending',
      gating: true,
    },
    {
      id: 'deploy',
      title: 'Publicá en GitHub Pages',
      description: 'En Configuración pegá el token y el repositorio y presioná "Desplegar". La tienda queda en una URL pública.',
      status: manualDone.deploy || ctx.hasWebUrl ? 'done' : 'pending',
      gating: true,
    },
  ];
}

export function setupComplete(steps: SetupStep[]): boolean {
  return steps.filter((s) => s.gating).every((s) => s.status === 'done');
}

export function buildSetupCtx(
  companyConfig: any,
  webData: any,
): SetupCtx {
  return {
    hasRepo: !!companyConfig?.githubRepo,
    hasToken: !!companyConfig?.githubToken,
    hasWebUrl: !!companyConfig?.webUrl,
    hasCompany: !!(webData?.config?.companyName && webData.config.companyName !== 'Mi Empresa'),
  };
}