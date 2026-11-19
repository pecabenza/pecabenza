/**
 * Contratos de integração desacoplados para futura Plataforma Independente de Entregadores.
 * Mantém separação financeira estrita: taxa paga pelo cliente != repasse ao entregador != comissão da plataforma.
 */

export type RequiredVehicleType = 'motorcycle' | 'bicycle' | 'car' | 'any';
export type RequiredEquipmentType = 'hot_thermal_bag' | 'frozen_thermal_bag' | 'large_cargo_box';

export interface ExternalDeliveryEquipmentRequirements {
  vehicleTypes: RequiredVehicleType[];
  equipment: RequiredEquipmentType[];
  notes?: string;
}

export interface ExternalDeliveryQuoteRequest {
  tenantId: string;
  origin: { lat: number; lng: number; addressLabel: string };
  destination: { lat: number; lng: number; addressLabel: string };
  requirements: ExternalDeliveryEquipmentRequirements;
  scheduledFor?: string | null;
}

export interface ExternalDeliveryQuoteResponse {
  externalQuoteId: string;
  providerCode: string;
  /** Valor cobrado do restaurante / cliente (centavos) */
  customerFeeCents: number;
  /** Repasse líquido previsto ao entregador (centavos) */
  driverPayoutCents: number;
  /** Taxa de intermediação retida pela plataforma (centavos) */
  platformFeeCents: number;
  estimatedDistanceMeters: number;
  estimatedDurationSeconds: number;
  expiresAt: string;
}

export interface ExternalDeliveryDispatchRequest {
  tenantId: string;
  orderId: string;
  orderNumber: string;
  externalQuoteId?: string;
  pickupContact: { name: string; phone: string };
  dropoffContact: { name: string; phone: string; instructions?: string };
  requirements: ExternalDeliveryEquipmentRequirements;
}

export type ExternalDeliveryWebhookEventType =
  | 'delivery.accepted'
  | 'delivery.rejected'
  | 'delivery.driver_assigned'
  | 'delivery.picked_up'
  | 'delivery.in_transit'
  | 'delivery.delivered'
  | 'delivery.failed'
  | 'delivery.cancelled';

export interface ExternalDeliveryWebhookEvent {
  eventId: string;
  providerCode: string;
  externalDeliveryId: string;
  orderId: string;
  eventType: ExternalDeliveryWebhookEventType;
  occurredAt: string;
  driver?: {
    externalDriverId: string;
    name: string;
    phone?: string;
    vehiclePlate?: string;
  };
  proof?: {
    recipientName?: string;
    relationship?: string;
    photoUrl?: string;
    codeVerified?: boolean;
  };
}

export interface ExternalDeliveryOperatorClient {
  requestQuote(input: ExternalDeliveryQuoteRequest): Promise<ExternalDeliveryQuoteResponse>;
  dispatchDelivery(input: ExternalDeliveryDispatchRequest): Promise<{ externalDeliveryId: string }>;
  cancelDelivery(externalDeliveryId: string, reason: string): Promise<{ cancelled: boolean }>;
  getDeliveryStatus(externalDeliveryId: string): Promise<{ status: string; lat?: number; lng?: number }>;
}

