import { describe, it, expect } from 'vitest';
import { MockPaymentProvider } from '@/modules/payments/providers/mock.provider';
import { AsaasPaymentProvider } from '@/modules/payments/providers/asaas.provider';
import { CreatePixPaymentInput } from '@/modules/payments/types';
import {
  encryptSecret,
  decryptSecret,
  maskSecret,
  timingSafeStringEqual,
} from '@/lib/security/encryption';

describe('Payment Engine & Hardening Security Tests (Etapa 2B.1)', () => {
  const sampleInput: CreatePixPaymentInput = {
    tenantId: '00000000-0000-0000-0000-000000000001',
    orderId: 'c1b2a3d4-e5f6-4a1b-9c2d-3e4f5a6b7c8d',
    orderNumber: '#000101',
    amountInCents: 4800,
    customer: {
      name: 'Cliente Teste',
      phone: '11999999999',
      email: 'cliente@teste.com',
    },
    description: 'Pedido #000101',
    expiresInMinutes: 15,
  };

  describe('Criptografia e Proteção de Segredos em Repouso', () => {
    it('deve cifrar segredos no formato versionado v1:iv:authTag:ciphertext (AES-256-GCM)', () => {
      const plainApiKey = '$aact_live_secret_key_1234567890';
      const encrypted = encryptSecret(plainApiKey);

      expect(encrypted).not.toBe(plainApiKey);
      expect(encrypted.startsWith('v1:')).toBe(true);
      expect(encrypted.split(':')).toHaveLength(4);

      const [version, iv, tag, ciphertext] = encrypted.split(':');
      expect(version).toBe('v1');
      expect(iv).toHaveLength(24); // 12 bytes em hex
      expect(tag).toHaveLength(32); // 16 bytes em hex
      expect(ciphertext.length).toBeGreaterThan(0);
    });

    it('deve decifrar fielmente o segredo original com a chave mestre', () => {
      const plainWebhookSecret = 'whsec_secret_token_abcdef_999';
      const encrypted = encryptSecret(plainWebhookSecret);
      const decrypted = decryptSecret(encrypted);

      expect(decrypted).toBe(plainWebhookSecret);
    });

    it('deve mascarar segredos para visualização administrativa sem vazar a chave real', () => {
      expect(maskSecret('minha_chave_super_secreta_9999')).toBe('****9999');
      expect(maskSecret('1234')).toBe('****');
      expect(maskSecret('')).toBe('');
      expect(maskSecret(null)).toBe('');
    });

    it('deve executar comparação timing-safe resistente a timing attacks', () => {
      expect(timingSafeStringEqual('token_correto_123', 'token_correto_123')).toBe(true);
      expect(timingSafeStringEqual('token_correto_123', 'token_errado_456')).toBe(false);
      expect(timingSafeStringEqual('token_correto_123', 'token_correto_12')).toBe(false);
      expect(timingSafeStringEqual('', 'abc')).toBe(false);
      expect(timingSafeStringEqual(null, 'abc')).toBe(false);
    });
  });

  describe('MockPaymentProvider', () => {
    const provider = new MockPaymentProvider();

    it('deve ter nome de provedor "mock"', () => {
      expect(provider.name).toBe('mock');
    });

    it('deve gerar cobrança Pix com dados válidos e QR Code em Data URI base64', async () => {
      const result = await provider.createPix(sampleInput);

      expect(result.provider).toBe('mock');
      expect(result.status).toBe('pending');
      expect(result.amountInCents).toBe(4800);
      expect(result.providerPaymentId).toContain('mock_pay_');

      // Valida padrão Copia e Cola (BR Code)
      expect(result.pixQrCodeText).toContain('00020126580014br.gov.bcb.pix');
      expect(result.pixQrCodeText).toContain('48.00');

      // Valida QR Code base64 Data URI
      expect(result.pixQrCodeBase64).toMatch(/^data:image\/png;base64,/);

      // Valida data de expiração futura (aproximadamente 15 minutos)
      const expiresAt = new Date(result.pixExpiresAt).getTime();
      const now = Date.now();
      expect(expiresAt).toBeGreaterThan(now + 14 * 60 * 1000);
      expect(expiresAt).toBeLessThan(now + 16 * 60 * 1000);
    });

    it('deve validar assinatura de webhook com e sem segredo', () => {
      // Sem segredo esperado -> aceita
      expect(
        provider.verifyWebhookSignature({
          tenantId: sampleInput.tenantId,
          provider: 'mock',
          headers: {},
          rawBody: '{}',
          parsedBody: {},
        })
      ).toBe(true);

      // Com segredo esperado -> valida token timing-safe
      expect(
        provider.verifyWebhookSignature(
          {
            tenantId: sampleInput.tenantId,
            provider: 'mock',
            headers: { 'x-webhook-token': 'segredo_123' },
            rawBody: '{}',
            parsedBody: {},
          },
          'segredo_123'
        )
      ).toBe(true);

      expect(
        provider.verifyWebhookSignature(
          {
            tenantId: sampleInput.tenantId,
            provider: 'mock',
            headers: { 'x-webhook-token': 'segredo_errado' },
            rawBody: '{}',
            parsedBody: {},
          },
          'segredo_123'
        )
      ).toBe(false);
    });

    it('deve converter eventos de webhook para status unificado e extrair amountInCents', () => {
      // Evento de pagamento confirmado
      const paidEvent = provider.parseWebhookEvent({
        tenantId: sampleInput.tenantId,
        provider: 'mock',
        headers: {},
        rawBody: '',
        parsedBody: {
          id: 'evt_100',
          event: 'PAYMENT_RECEIVED',
          paymentId: 'mock_pay_123',
          amountCents: 4800,
        },
      });
      expect(paidEvent.eventId).toBe('evt_100');
      expect(paidEvent.newStatus).toBe('paid');
      expect(paidEvent.providerPaymentId).toBe('mock_pay_123');
      expect(paidEvent.amountInCents).toBe(4800);

      // Evento de pagamento expirado
      const expiredEvent = provider.parseWebhookEvent({
        tenantId: sampleInput.tenantId,
        provider: 'mock',
        headers: {},
        rawBody: '',
        parsedBody: {
          id: 'evt_101',
          event: 'PAYMENT_OVERDUE',
          paymentId: 'mock_pay_123',
        },
      });
      expect(expiredEvent.newStatus).toBe('expired');

      // Evento de falha
      const failedEvent = provider.parseWebhookEvent({
        tenantId: sampleInput.tenantId,
        provider: 'mock',
        headers: {},
        rawBody: '',
        parsedBody: {
          id: 'evt_102',
          event: 'PAYMENT_FAILED',
          paymentId: 'mock_pay_123',
        },
      });
      expect(failedEvent.newStatus).toBe('failed');
    });
  });

  describe('AsaasPaymentProvider & Hardening Oficial de Webhook (2026)', () => {
    const API_KEY = '$aact_test_key_sandbox_super_secret';
    const WEBHOOK_AUTH_TOKEN = 'wh_token_distinto_da_api_key_123';

    const asaasProvider = new AsaasPaymentProvider({
      apiKey: API_KEY,
      webhookSecret: WEBHOOK_AUTH_TOKEN,
      isSandbox: true,
    });

    it('deve ter nome de provedor "asaas"', () => {
      expect(asaasProvider.name).toBe('asaas');
    });

    it('deve ACEITAR webhook quando o header asaas-access-token for o authToken correto', () => {
      expect(
        asaasProvider.verifyWebhookSignature({
          tenantId: sampleInput.tenantId,
          provider: 'asaas',
          headers: {
            'asaas-access-token': WEBHOOK_AUTH_TOKEN,
          },
          rawBody: '{}',
          parsedBody: {},
        })
      ).toBe(true);
    });

    it('deve REJEITAR webhook quando o header asaas-access-token for inválido', () => {
      expect(
        asaasProvider.verifyWebhookSignature({
          tenantId: sampleInput.tenantId,
          provider: 'asaas',
          headers: {
            'asaas-access-token': 'token_completamente_incorreto',
          },
          rawBody: '{}',
          parsedBody: {},
        })
      ).toBe(false);
    });

    it('deve REJEITAR webhook quando o header asaas-access-token estiver ausente', () => {
      expect(
        asaasProvider.verifyWebhookSignature({
          tenantId: sampleInput.tenantId,
          provider: 'asaas',
          headers: {},
          rawBody: '{}',
          parsedBody: {},
        })
      ).toBe(false);
    });

    it('REGRA CRÍTICA ASAAS: deve REJEITAR webhook se a API Key for indevidamente utilizada como authToken', () => {
      // Se um invasor ou configuração errônea enviar a API key no header asaas-access-token:
      expect(
        asaasProvider.verifyWebhookSignature({
          tenantId: sampleInput.tenantId,
          provider: 'asaas',
          headers: {
            'asaas-access-token': API_KEY, // Tentativa indevida de passar a API Key
          },
          rawBody: '{}',
          parsedBody: {},
        })
      ).toBe(false);
    });

    it('deve mapear eventos do Asaas para status padronizados e converter value para amountInCents', () => {
      const asaasReceived = asaasProvider.parseWebhookEvent({
        tenantId: sampleInput.tenantId,
        provider: 'asaas',
        headers: {},
        rawBody: '',
        parsedBody: {
          id: 'evt_asaas_001',
          event: 'PAYMENT_RECEIVED',
          payment: {
            id: 'pay_987654',
            value: 48.00,
            confirmedDate: '2026-11-04',
          },
        },
      });

      expect(asaasReceived.eventId).toBe('evt_asaas_001');
      expect(asaasReceived.newStatus).toBe('paid');
      expect(asaasReceived.providerPaymentId).toBe('pay_987654');
      expect(asaasReceived.amountInCents).toBe(4800);
      expect(asaasReceived.paidAt).toBe('2026-11-04');

      const asaasOverdue = asaasProvider.parseWebhookEvent({
        tenantId: sampleInput.tenantId,
        provider: 'asaas',
        headers: {},
        rawBody: '',
        parsedBody: {
          id: 'evt_asaas_002',
          event: 'PAYMENT_OVERDUE',
          payment: {
            id: 'pay_987654',
          },
        },
      });

      expect(asaasOverdue.newStatus).toBe('expired');

      const asaasRefunded = asaasProvider.parseWebhookEvent({
        tenantId: sampleInput.tenantId,
        provider: 'asaas',
        headers: {},
        rawBody: '',
        parsedBody: {
          id: 'evt_asaas_003',
          event: 'PAYMENT_REFUNDED',
          payment: {
            id: 'pay_987654',
          },
        },
      });

      expect(asaasRefunded.newStatus).toBe('refunded');
    });
  });
});
