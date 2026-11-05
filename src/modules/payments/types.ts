export type PaymentProviderName = 'mock' | 'asaas' | 'mercadopago';

export type PaymentMethod = 'pix' | 'credit_card';

export type PaymentStatus = 'pending' | 'paid' | 'expired' | 'failed' | 'refunded';

export interface CreatePixPaymentInput {
  tenantId: string;
  orderId: string;
  orderNumber: string;
  amountInCents: number;
  customer: {
    name: string;
    phone: string;
    email?: string;
    taxId?: string;
  };
  description?: string;
  expiresInMinutes?: number;
}

export interface PixPaymentResult {
  paymentId: string;
  orderId: string;
  provider: PaymentProviderName;
  providerPaymentId: string;
  status: PaymentStatus;
  amountInCents: number;
  pixQrCodeText: string;
  pixQrCodeBase64: string;
  pixExpiresAt: string;
}

export interface PaymentStatusResult {
  paymentId: string;
  orderId: string;
  status: PaymentStatus;
  amountInCents: number;
  paidAt: string | null;
  pixExpiresAt: string;
}

export interface WebhookEventInput {
  tenantId: string;
  provider: PaymentProviderName;
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
  parsedBody: any;
}

export interface ParsedWebhookEvent {
  eventId: string;
  eventType: string;
  providerPaymentId: string;
  newStatus: PaymentStatus;
  amountInCents?: number;
  paidAt?: string;
}

export interface WebhookProcessResult {
  success: boolean;
  idempotent: boolean;
  eventId?: string;
  paymentId?: string;
  orderId?: string;
  newStatus?: PaymentStatus;
  message?: string;
  error?: string;
}

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  createPix(input: CreatePixPaymentInput): Promise<Omit<PixPaymentResult, 'paymentId' | 'orderId'>>;
  checkStatus(providerPaymentId: string, tenantId: string): Promise<{ status: PaymentStatus; paidAt?: string }>;
  verifyWebhookSignature(input: WebhookEventInput, secret?: string): boolean;
  parseWebhookEvent(input: WebhookEventInput): ParsedWebhookEvent;
}
