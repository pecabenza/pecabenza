import QRCode from 'qrcode';
import {
  PaymentProvider,
  PaymentProviderName,
  CreatePixPaymentInput,
  PixPaymentResult,
  CreateCardCheckoutInput,
  CardCheckoutResult,
  WebhookEventInput,
  ParsedWebhookEvent,
  PaymentStatus,
} from '../types';
import { timingSafeStringEqual } from '@/lib/security/encryption';

export class MockPaymentProvider implements PaymentProvider {
  readonly name: PaymentProviderName = 'mock';

  /**
   * Gera código Pix Copia e Cola formatado conforme o padrão BACEN BR Code
   */
  private generateMockBrcode(input: CreatePixPaymentInput): string {
    const formattedAmount = (input.amountInCents / 100).toFixed(2);
    // Formato BR Code simplificado e padronizado para testes e homologação
    return `00020126580014br.gov.bcb.pix0136${input.tenantId}520400005303986540${formattedAmount}5802BR5915SysFood Commerce6009Sao Paulo62070503***6304MOCK`;
  }

  async createPix(
    input: CreatePixPaymentInput
  ): Promise<Omit<PixPaymentResult, 'paymentId' | 'orderId'>> {
    const expirationMinutes = input.expiresInMinutes || 15;
    const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000).toISOString();
    const providerPaymentId = `mock_pay_${input.orderId.replace(/-/g, '').slice(0, 16)}`;
    const pixQrCodeText = this.generateMockBrcode(input);

    // Gera o QR Code em Data URI base64
    const pixQrCodeBase64 = await QRCode.toDataURL(pixQrCodeText, {
      width: 320,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });

    return {
      provider: 'mock',
      providerPaymentId,
      status: 'pending',
      amountInCents: input.amountInCents,
      pixQrCodeText,
      pixQrCodeBase64,
      pixExpiresAt: expiresAt,
    };
  }

  async createCardCheckout(
    input: CreateCardCheckoutInput
  ): Promise<Omit<CardCheckoutResult, 'paymentId' | 'orderId'>> {
    const expirationMinutes = input.expiresInMinutes || 30;
    const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000).toISOString();
    const providerPaymentId = `mock_card_${input.orderId.replace(/-/g, '').slice(0, 16)}`;
    const checkoutUrl = `https://sandbox.asaas.com/i/${providerPaymentId}`;

    return {
      provider: 'mock',
      providerPaymentId,
      status: 'pending',
      amountInCents: input.amountInCents,
      checkoutUrl,
      expiresAt,
    };
  }

  async checkStatus(
    _providerPaymentId: string,
    _tenantId: string
  ): Promise<{ status: PaymentStatus; paidAt?: string }> {
    // Por padrão no mock aguarda confirmação de webhook ou expiração
    return {
      status: 'pending',
    };
  }

  verifyWebhookSignature(input: WebhookEventInput, secret?: string): boolean {
    if (!secret) return true;
    const headerToken =
      input.headers['x-mock-signature'] ||
      input.headers['authorization'] ||
      input.headers['x-webhook-token'];
    
    if (typeof headerToken !== 'string') return false;
    const cleanHeader = headerToken.startsWith('Bearer ') ? headerToken.slice(7) : headerToken;
    return timingSafeStringEqual(cleanHeader, secret);
  }

  parseWebhookEvent(input: WebhookEventInput): ParsedWebhookEvent {
    const body = input.parsedBody;
    const eventId = String(body.id || body.eventId || `mock_evt_${Date.now()}`);
    const eventType = String(body.event || body.eventType || 'PAYMENT_RECEIVED');
    const providerPaymentId = String(
      body.paymentId || body.providerPaymentId || body.payment?.id || ''
    );
    
    let newStatus: PaymentStatus = 'pending';
    if (eventType === 'PAYMENT_RECEIVED' || eventType === 'PAYMENT_CONFIRMED' || body.status === 'paid') {
      newStatus = 'paid';
    } else if (eventType === 'PAYMENT_OVERDUE' || eventType === 'PAYMENT_EXPIRED' || body.status === 'expired') {
      newStatus = 'expired';
    } else if (eventType === 'PAYMENT_FAILED' || body.status === 'failed') {
      newStatus = 'failed';
    }

    const amountInCents =
      typeof body.amountCents === 'number'
        ? body.amountCents
        : typeof body.amount === 'number'
        ? Math.round(body.amount * 100)
        : undefined;

    return {
      eventId,
      eventType,
      providerPaymentId,
      newStatus,
      amountInCents,
      paidAt: body.paidAt || (newStatus === 'paid' ? new Date().toISOString() : undefined),
    };
  }
}
