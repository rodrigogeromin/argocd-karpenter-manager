export interface GatewayContext {
  readonly application: string;
  readonly project: string;
}

declare global {
  interface Window {
    karpenterManagerConfig?: unknown;
  }
}

export function readGatewayContext(config: unknown = window.karpenterManagerConfig): GatewayContext {
  if (!config || typeof config !== 'object') {
    throw new Error('Karpenter Manager não configurado. Aplique karpenter-manager-config.yaml e reinicie o argocd-server.');
  }
  const values = config as Record<string, unknown>;
  const application = typeof values.application === 'string' ? values.application.trim() : '';
  const [namespace, name, ...extra] = application.split(':');
  const project = typeof values.project === 'string' ? values.project.trim() : '';
  if (!namespace?.trim() || !name?.trim() || extra.length > 0 || !project) {
    throw new Error('Configuração Karpenter Manager inválida. Informe application no formato namespace:name e project não vazio.');
  }
  return Object.freeze({application, project});
}
