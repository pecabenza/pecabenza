import crypto from 'crypto';
import type {
  DeliveryStatus,
  DeliveryRunStatus,
  DriverType,
  DriverAvailabilityStatus,
  ProofRelationship,
} from '@/types/database.types';

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  pending_dispatch: 'Aguardando Despacho',
  assigned: 'Atribuído ao Entregador',
  picked_up: 'Retirado na Expedição',
  in_transit: 'Em Rota de Entrega',
  arrived: 'No Local de Entrega',
  delivered: 'Entregue ao Cliente',
  failed_attempt: 'Tentativa Frustrada',
  returned_to_store: 'Retornou à Loja',
  cancelled: 'Cancelado',
};

export const DRIVER_TYPE_LABELS: Record<DriverType, string> = {
  internal: 'Motoboy Próprio',
  freelance: 'Avulso / Diarista',
  third_party: 'Terceirizado / Parceiro',
};

export const DRIVER_AVAILABILITY_LABELS: Record<DriverAvailabilityStatus, string> = {
  available: 'Disponível',
  on_route: 'Em Rota',
  offline: 'Offline',
};

export const PROOF_RELATIONSHIP_LABELS: Record<ProofRelationship, string> = {
  recipient: 'Próprio Cliente',
  concierge: 'Portaria / Zelador',
  family: 'Familiar / Morador',
  neighbor: 'Vizinho Autorizado',
  other: 'Outro',
};

export const ALLOWED_DELIVERY_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  pending_dispatch: ['assigned', 'cancelled'],
  assigned: ['picked_up', 'in_transit', 'arrived', 'delivered', 'failed_attempt', 'returned_to_store', 'cancelled'],
  picked_up: ['in_transit', 'arrived', 'delivered', 'failed_attempt', 'returned_to_store', 'cancelled'],
  in_transit: ['arrived', 'delivered', 'failed_attempt', 'returned_to_store', 'cancelled'],
  arrived: ['delivered', 'failed_attempt', 'returned_to_store', 'cancelled'],
  delivered: [],
  failed_attempt: ['assigned', 'returned_to_store', 'cancelled'],
  returned_to_store: ['assigned', 'cancelled'],
  cancelled: [],
};

export function isValidDeliveryTransition(
  fromStatus: DeliveryStatus,
  toStatus: DeliveryStatus
): { valid: boolean; reason?: string } {
  if (fromStatus === toStatus) {
    return { valid: true };
  }

  const allowed = ALLOWED_DELIVERY_TRANSITIONS[fromStatus] || [];
  if (allowed.length === 0) {
    return {
      valid: false,
      reason: `Entrega em estado terminal '${DELIVERY_STATUS_LABELS[fromStatus]}' não permite alteração.`,
    };
  }

  if (!allowed.includes(toStatus)) {
    return {
      valid: false,
      reason: `Transição inválida de '${fromStatus}' para '${toStatus}'.`,
    };
  }

  return { valid: true };
}

/**
 * Gera token criptográfico não-enumerável de alta entropia (48 hex chars = 192 bits)
 * e retorna o token bruto (para envio único ao entregador) + hash SHA-256 para persistência.
 */
export function generateDriverAccessToken(): { rawToken: string; tokenHash: string } {
  const rawToken = crypto.randomBytes(24).toString('hex');
  const tokenHash = hashDriverAccessToken(rawToken);
  return { rawToken, tokenHash };
}

export function hashDriverAccessToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
}

export function isDriverTokenActive(run: {
  status: DeliveryRunStatus;
  driver_token_expires_at?: string | null;
}, now: Date = new Date()): { valid: boolean; reason?: string } {
  if (run.status === 'completed' || run.status === 'cancelled') {
    return {
      valid: false,
      reason: 'Esta rota de entrega já foi encerrada.',
    };
  }

  if (run.driver_token_expires_at) {
    const expiresAt = new Date(run.driver_token_expires_at);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) {
      return {
        valid: false,
        reason: 'O link de acesso do entregador expirou.',
      };
    }
  }

  return { valid: true };
}

/**
 * Política LGPD / Privacidade:
 * Localização em tempo real só é exposta ao cliente se:
 * 1. A rota estiver ativa ('dispatched' | 'in_progress')
 * 2. O entregador tiver consentido explicitamente (location_sharing_enabled === true)
 * 3. A entrega específica do cliente ainda estiver em curso ('picked_up' | 'in_transit' | 'arrived')
 */
export function shouldExposeLiveLocationToCustomer(params: {
  deliveryStatus: DeliveryStatus;
  runStatus?: DeliveryRunStatus | null;
  locationSharingEnabled?: boolean | null;
}): boolean {
  if (!params.locationSharingEnabled) return false;
  if (params.runStatus !== 'dispatched' && params.runStatus !== 'in_progress') return false;
  return (
    params.deliveryStatus === 'picked_up' ||
    params.deliveryStatus === 'in_transit' ||
    params.deliveryStatus === 'arrived'
  );
}

export function maskDriverFirstName(fullName?: string | null): string | null {
  if (!fullName) return null;
  const parts = fullName.trim().split(/\s+/);
  return parts[0] || null;
}

export interface StopSuggestionInput {
  orderId: string;
  orderNumber: string;
  scheduleType: 'asap' | 'scheduled';
  scheduledFor?: string | null;
  createdAt: string;
  neighborhood?: string | null;
  zipCode?: string | null;
  street?: string | null;
}

/**
 * Heurística local determinística de sequenciamento de paradas sem depender de APIs externas.
 * Prioriza:
 * 1. Pedidos agendados com janela mais próxima
 * 2. Agrupamento por bairro e prefixo de CEP (reduzindo deslocamento)
 * 3. Antiguidade (FIFO)
 * Estruturada para futura substituição/enriquecimento pela Google Route Optimization API.
 */
export function suggestDeliveryStopSequence<T extends StopSuggestionInput>(orders: T[]): T[] {
  return [...orders].sort((a, b) => {
    // 1. Urgência de agendamento
    const aSched = a.scheduleType === 'scheduled' && a.scheduledFor ? new Date(a.scheduledFor).getTime() : Number.MAX_SAFE_INTEGER;
    const bSched = b.scheduleType === 'scheduled' && b.scheduledFor ? new Date(b.scheduledFor).getTime() : Number.MAX_SAFE_INTEGER;
    if (aSched !== bSched) {
      return aSched - bSched;
    }

    // 2. Agrupamento por bairro
    const aNeigh = (a.neighborhood || '').trim().toLowerCase();
    const bNeigh = (b.neighborhood || '').trim().toLowerCase();
    if (aNeigh !== bNeigh) {
      return aNeigh.localeCompare(bNeigh, 'pt-BR');
    }

    // 3. Proximidade por CEP
    const aZip = (a.zipCode || '').replace(/\D/g, '');
    const bZip = (b.zipCode || '').replace(/\D/g, '');
    if (aZip !== bZip) {
      return aZip.localeCompare(bZip);
    }

    // 4. Ordem de entrada
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

export function buildDriverWhatsAppMessage(params: {
  driverName: string;
  runCode: string;
  stopsCount: number;
  portalUrl: string;
}): string {
  return [
    `Olá *${params.driverName}*! 🛵`,
    `Nova rota de entrega atribuída: *${params.runCode}* (${params.stopsCount} ${params.stopsCount === 1 ? 'parada' : 'paradas'}).`,
    '',
    `Acesse suas paradas, endereços e comprovante pelo link:`,
    params.portalUrl,
    '',
    `_O link expira automaticamente ao finalizar todas as entregas._`,
  ].join('\n');
}

