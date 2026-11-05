import {
  PaymentProvider,
  PaymentProviderName,
  CreatePixPaymentInput,
  PixPaymentResult,
  WebhookEventInput,
  ParsedWebhookEvent,
  PaymentStatus,
} from '../types';
import { timingSafeStringEqual } from '@/lib/security/encryption';

export interface AsaasConfig {
  apiKey: string;
  webhookSecret?: string;
  isSandbox?: boolean;
}

export class AsaasPaymentProvider implements PaymentProvider {
  readonly name: PaymentProviderName = 'asaas';
  private baseUrl: string;
  private apiKey: string;
  private webhookSecret?: string;

  constructor(config: AsaasConfig) {
    this.baseUrl = config.isSandbox !== false
      ? 'https://sandbox.asaas.com/api/v3'
      : 'https://api.asaas.com/api/v3';
    this.apiKey = config.apiKey;
    this.webhookSecret = config.webhookSecret;
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'access_token': this.apiKey,
      'User-Agent': 'SysFood-Benza-Commerce/1.0',
    };
  }

  /**
   * Garante a existência do cliente no Asaas ou cria caso não exista
   */
  private async findOrCreateCustomer(customer: CreatePixPaymentInput['customer']): Promise<string> {
    // 1. Busca cliente por email ou telefone se houver
    if (customer.email || customer.phone) {
      const searchParam = customer.email ? `email=${encodeURIComponent(customer.email)}` : `phone=${encodeURIComponent(customer.phone)}`;
      const searchRes = await fetch(`${this.baseUrl}/customers?${searchParam}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.data && searchData.data.length > 0) {
          return searchData.data[0].id;
        }
      }
    }

    // 2. Se não existir, cria novo cliente
    const createRes = await fetch(`${this.baseUrl}/customers`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        name: customer.name,
        phone: customer.phone,
        email: customer.email || undefined,
        cpfCnpj: customer.taxId || undefined,
        notificationDisabled: true,
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.json();
      throw new Error(`Falha ao registrar cliente no gateway Asaas: ${JSON.stringify(err.errors || err)}`);
    }

    const createdData = await createRes.json();
    return createdData.id;
  }

  async createPix(
    input: CreatePixPaymentInput
  ): Promise<Omit<PixPaymentResult, 'paymentId' | 'orderId'>> {
    const asaasCustomerId = await this.findOrCreateCustomer(input.customer);

    const valueInReais = Number((input.amountInCents / 100).toFixed(2));
    const expirationMinutes = input.expiresInMinutes || 15;
    const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000).toISOString();
    const dueDate = expiresAt.split('T')[0];

    // 1. Cria a cobrança no Asaas com billingType PIX
    const paymentRes = await fetch(`${this.baseUrl}/payments`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        customer: asaasCustomerId,
        billingType: 'PIX',
        value: valueInReais,
        dueDate,
        description: input.description || `Pedido ${input.orderNumber}`,
        externalReference: input.orderId,
        postalService: false,
      }),
    });

    if (!paymentRes.ok) {
      const err = await paymentRes.json();
      throw new Error(`Falha ao gerar cobrança no Asaas: ${JSON.stringify(err.errors || err)}`);
    }

    const paymentData = await paymentRes.json();
    const providerPaymentId = paymentData.id;

    // 2. Obtém o QR Code e código Copia e Cola Pix
    const qrCodeRes = await fetch(`${this.baseUrl}/payments/${providerPaymentId}/pixQrCode`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!qrCodeRes.ok) {
      const err = await qrCodeRes.json();
      throw new Error(`Falha ao recuperar QR Code Pix no Asaas: ${JSON.stringify(err.errors || err)}`);
    }

    const qrCodeData = await qrCodeRes.json();

    return {
      provider: 'asaas',
      providerPaymentId,
      status: 'pending',
      amountInCents: input.amountInCents,
      pixQrCodeText: qrCodeData.payload,
      pixQrCodeBase64: qrCodeData.encodedImage?.startsWith('data:')
        ? qrCodeData.encodedImage
        : `data:image/png;base64,${qrCodeData.encodedImage}`,
      pixExpiresAt: qrCodeData.expirationDate
        ? new Date(qrCodeData.expirationDate).toISOString()
        : expiresAt,
    };
  }

  async checkStatus(
    providerPaymentId: string,
    _tenantId: string
  ): Promise<{ status: PaymentStatus; paidAt?: string }> {
    const res = await fetch(`${this.baseUrl}/payments/${providerPaymentId}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      throw new Error(`Erro ao consultar status no Asaas para ${providerPaymentId}`);
    }

    const data = await res.json();
    let status: PaymentStatus = 'pending';

    if (data.status === 'RECEIVED' || data.status === 'CONFIRMED') {
      status = 'paid';
    } else if (data.status === 'OVERDUE') {
      status = 'expired';
    } else if (data.status === 'REFUNDED') {
      status = 'refunded';
    }

    return {
      status,
      paidAt: data.paymentDate || data.confirmedDate || (status === 'paid' ? new Date().toISOString() : undefined),
    };
  }

  verifyWebhookSignature(input: WebhookEventInput, secret?: string): boolean {
    const expectedAuthToken = secret || this.webhookSecret;
    if (!expectedAuthToken) {
      // Se não houver authToken de webhook configurado, rejeita por segurança
      return false;
    }

    const receivedToken =
      input.headers['asaas-access-token'] ||
      input.headers['x-asaas-access-token'];

    if (!receivedToken || typeof receivedToken !== 'string') {
      return false;
    }

    // REGRA DE SEGURANÇA ASAAS: A API Key NUNCA pode ser aceita como authToken de webhook
    if (this.apiKey && timingSafeStringEqual(receivedToken, this.apiKey)) {
      return false;
    }

    return timingSafeStringEqual(receivedToken, expectedAuthToken);
  }

  parseWebhookEvent(input: WebhookEventInput): ParsedWebhookEvent {
    const body = input.parsedBody;
    const eventId = String(body.id || `asaas_evt_${Date.now()}`);
    const eventType = String(body.event || '');
    const providerPaymentId = String(body.payment?.id || '');

    let newStatus: PaymentStatus = 'pending';
    if (eventType === 'PAYMENT_RECEIVED' || eventType === 'PAYMENT_CONFIRMED') {
      newStatus = 'paid';
    } else if (eventType === 'PAYMENT_OVERDUE') {
      newStatus = 'expired';
    } else if (eventType === 'PAYMENT_REFUNDED') {
      newStatus = 'refunded';
    }

    const value = body.payment?.value;
    const amountInCents = typeof value === 'number' ? Math.round(value * 100) : undefined;

    return {
      eventId,
      eventType,
      providerPaymentId,
      newStatus,
      amountInCents,
      paidAt: body.payment?.confirmedDate || (newStatus === 'paid' ? new Date().toISOString() : undefined),
    };
  }
}
