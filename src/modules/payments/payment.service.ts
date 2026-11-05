import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { logger } from '@/lib/observability/logger';
import { encryptSecret, decryptSecret, maskSecret } from '@/lib/security/encryption';
import {
  PaymentProvider,
  PaymentProviderName,
  CreatePixPaymentInput,
  PixPaymentResult,
  PaymentStatusResult,
  WebhookEventInput,
  WebhookProcessResult,
} from './types';
import { MockPaymentProvider } from './providers/mock.provider';
import { AsaasPaymentProvider } from './providers/asaas.provider';

export interface UpdatePaymentSettingsInput {
  provider?: PaymentProviderName;
  isActive?: boolean;
  pixEnabled?: boolean;
  pixExpirationMinutes?: number;
  sandboxMode?: boolean;
  apiKey?: string;
  webhookSecret?: string;
}

export interface PublicPaymentSettingsResult {
  tenantId: string;
  provider: PaymentProviderName;
  isActive: boolean;
  pixEnabled: boolean;
  pixExpirationMinutes: number;
  sandboxMode: boolean;
  hasApiKey: boolean;
  hasWebhookSecret: boolean;
  maskedApiKey?: string;
  updatedAt: string;
}

export class PaymentService {
  /**
   * Resolve o provedor de pagamento configurado para o tenant com decifragem segura
   */
  static async getProviderForTenant(tenantId: string): Promise<PaymentProvider> {
    const supabase = getSupabaseAdmin();

    try {
      const { data: settings } = await supabase
        .from('tenant_payment_settings')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (settings && settings.is_active && settings.provider === 'asaas' && settings.api_key_encrypted) {
        const decryptedApiKey = decryptSecret(settings.api_key_encrypted);
        const decryptedWebhookSecret = settings.webhook_secret
          ? decryptSecret(settings.webhook_secret)
          : undefined;

        return new AsaasPaymentProvider({
          apiKey: decryptedApiKey,
          webhookSecret: decryptedWebhookSecret,
          isSandbox: settings.sandbox_mode !== false,
        });
      }
    } catch (err: any) {
      logger.warn('Erro ao carregar tenant_payment_settings, usando MockPaymentProvider padrão', {
        tenantId,
        error: err.message,
      });
    }

    // Provedor Mock padrão (sempre disponível para homologação e desenvolvimento)
    return new MockPaymentProvider();
  }

  /**
   * Gera cobrança Pix para um pedido transacional existente
   */
  static async createPixPayment(
    tenantId: string,
    orderId: string
  ): Promise<PixPaymentResult> {
    const supabase = getSupabaseAdmin();

    // 1. Busca pedido autoritativo no banco
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      throw new Error('Pedido não localizado para processamento de pagamento.');
    }

    // 2. Valida status do pedido
    if (order.status === 'paid' || order.payment_status === 'paid') {
      throw new Error('Este pedido já foi pago anteriormente.');
    }

    if (order.status === 'cancelled') {
      throw new Error('Este pedido está cancelado e não aceita mais pagamentos.');
    }

    // 3. Busca configurações comerciais do tenant para obter minutos de expiração do checkout
    let expirationMinutes = 15;
    try {
      const { data: settings } = await supabase
        .from('tenant_payment_settings')
        .select('pix_expiration_minutes')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (settings?.pix_expiration_minutes) {
        expirationMinutes = settings.pix_expiration_minutes;
      }
    } catch {
      // Mantém default de 15 minutos
    }

    // 4. Verifica se já existe um pagamento pendente ainda válido dentro da janela interna
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('order_id', orderId)
      .eq('status', 'pending')
      .gt('pix_expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .maybeSingle();

    if (existingPayment) {
      return {
        paymentId: existingPayment.id,
        orderId: existingPayment.order_id,
        provider: existingPayment.provider as PaymentProviderName,
        providerPaymentId: existingPayment.provider_payment_id || '',
        status: existingPayment.status,
        amountInCents: existingPayment.amount_cents,
        pixQrCodeText: existingPayment.pix_qr_code_text || '',
        pixQrCodeBase64: existingPayment.pix_qr_code_url || '',
        pixExpiresAt: existingPayment.pix_expires_at,
      };
    }

    // Se havia pagamento anterior vencido, marca como 'expired' para manter histórico limpo
    await supabase
      .from('payments')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('order_id', orderId)
      .eq('status', 'pending');

    // 5. Resolve o provedor e gera nova tentativa Pix
    const provider = await this.getProviderForTenant(tenantId);
    const pixInput: CreatePixPaymentInput = {
      tenantId,
      orderId: order.id,
      orderNumber: order.order_number,
      amountInCents: order.total_cents,
      customer: {
        name: order.customer_name,
        phone: order.customer_phone,
        email: order.customer_email || undefined,
      },
      description: `Pedido ${order.order_number}`,
      expiresInMinutes: expirationMinutes,
    };

    const generatedPix = await provider.createPix(pixInput);

    // 6. Salva registro na tabela payments
    const { data: savedPayment, error: saveError } = await supabase
      .from('payments')
      .insert({
        tenant_id: tenantId,
        order_id: orderId,
        provider: generatedPix.provider,
        provider_payment_id: generatedPix.providerPaymentId,
        method: 'pix',
        status: 'pending',
        amount_cents: generatedPix.amountInCents,
        pix_qr_code_text: generatedPix.pixQrCodeText,
        pix_qr_code_url: generatedPix.pixQrCodeBase64,
        pix_expires_at: generatedPix.pixExpiresAt,
        metadata: {
          orderNumber: order.order_number,
        },
      })
      .select()
      .single();

    if (saveError || !savedPayment) {
      throw new Error(`Falha ao registrar cobrança no banco: ${saveError?.message || 'Erro desconhecido'}`);
    }

    // 7. Atualiza o pedido para 'awaiting_payment'
    await supabase
      .from('orders')
      .update({
        status: 'awaiting_payment',
        payment_status: 'awaiting_payment',
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('id', orderId);

    logger.info('Cobrança Pix gerada com sucesso', {
      tenantId,
      orderId,
      paymentId: savedPayment.id,
      amountCents: generatedPix.amountInCents,
      provider: generatedPix.provider,
    });

    return {
      paymentId: savedPayment.id,
      orderId,
      provider: generatedPix.provider,
      providerPaymentId: generatedPix.providerPaymentId,
      status: 'pending',
      amountInCents: generatedPix.amountInCents,
      pixQrCodeText: generatedPix.pixQrCodeText,
      pixQrCodeBase64: generatedPix.pixQrCodeBase64,
      pixExpiresAt: generatedPix.pixExpiresAt,
    };
  }

  /**
   * Consulta status de pagamento atualizado
   */
  static async getPaymentStatus(
    tenantId: string,
    paymentId: string
  ): Promise<PaymentStatusResult> {
    const supabase = getSupabaseAdmin();

    const { data: payment, error } = await supabase
      .from('payments')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', paymentId)
      .single();

    if (error || !payment) {
      throw new Error('Registro de pagamento não localizado.');
    }

    // Auto-expiração se passou do horário limite interno e continua pending
    let currentStatus = payment.status;
    if (currentStatus === 'pending' && new Date(payment.pix_expires_at) < new Date()) {
      currentStatus = 'expired';
      await supabase
        .from('payments')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('tenant_id', tenantId)
        .eq('id', paymentId);
    }

    return {
      paymentId: payment.id,
      orderId: payment.order_id,
      status: currentStatus,
      amountInCents: payment.amount_cents,
      paidAt: payment.paid_at,
      pixExpiresAt: payment.pix_expires_at,
    };
  }

  /**
   * Processamento Idempotente, Atômico e de Baixa Latência de Webhooks
   */
  static async processWebhook(
    input: WebhookEventInput
  ): Promise<WebhookProcessResult> {
    const startTime = Date.now();
    const supabase = getSupabaseAdmin();
    const provider = await this.getProviderForTenant(input.tenantId);

    // 1. Validação estrita de assinatura / authToken
    const isValidSignature = provider.verifyWebhookSignature(input);
    if (!isValidSignature) {
      logger.warn('Tentativa de webhook com assinatura ou token inválido recusada', {
        tenantId: input.tenantId,
        provider: input.provider,
      });
      return {
        success: false,
        idempotent: false,
        error: 'Assinatura do webhook inválida.',
      };
    }

    // 2. Extração dos dados do evento
    const parsed = provider.parseWebhookEvent(input);

    // 3. Validação de consistência do pagamento no banco antes do processamento
    const { data: matchedPayment } = await supabase
      .from('payments')
      .select('id, tenant_id, order_id, amount_cents, status')
      .eq('tenant_id', input.tenantId)
      .or(`provider_payment_id.eq.${parsed.providerPaymentId},id.eq.${parsed.providerPaymentId}`)
      .maybeSingle();

    if (!matchedPayment) {
      logger.warn('Webhook recebido para pagamento inexistente ou de outro tenant', {
        tenantId: input.tenantId,
        provider: input.provider,
        providerPaymentId: parsed.providerPaymentId,
      });
      return {
        success: false,
        idempotent: false,
        error: 'Pagamento não localizado para o identificador fornecido.',
      };
    }

    // 4. Validação de integridade de valor (anti-tampering de quantia paga)
    if (parsed.amountInCents !== undefined && parsed.amountInCents !== matchedPayment.amount_cents) {
      logger.error('Divergência crítica de valor no webhook de pagamento', {
        tenantId: input.tenantId,
        paymentId: matchedPayment.id,
        expectedAmountCents: matchedPayment.amount_cents,
        receivedAmountCents: parsed.amountInCents,
      });
      return {
        success: false,
        idempotent: false,
        error: 'Valor informado no webhook diverge do valor registrado no pedido.',
      };
    }

    // 5. Execução Atômica via RPC no PostgreSQL
    const { data: rpcResult, error: rpcError } = await supabase.rpc('process_payment_webhook_atomic', {
      p_tenant_id: input.tenantId,
      p_provider: input.provider,
      p_event_id: parsed.eventId,
      p_event_type: parsed.eventType,
      p_provider_payment_id: parsed.providerPaymentId,
      p_new_status: parsed.newStatus,
      p_paid_at: parsed.paidAt || null,
      p_payload: input.parsedBody,
    });

    const elapsedMs = Date.now() - startTime;

    if (rpcError) {
      logger.error('Erro na RPC de processamento atômico de webhook', {
        tenantId: input.tenantId,
        provider: input.provider,
        error: rpcError.message,
        elapsedMs,
      });
      return {
        success: false,
        idempotent: false,
        error: rpcError.message,
      };
    }

    logger.info('Webhook de pagamento processado com sucesso', {
      tenantId: input.tenantId,
      provider: input.provider,
      eventId: parsed.eventId,
      idempotent: rpcResult?.idempotent,
      newStatus: parsed.newStatus,
      elapsedMs,
    });

    return {
      success: true,
      idempotent: Boolean(rpcResult?.idempotent),
      eventId: parsed.eventId,
      paymentId: rpcResult?.payment_id,
      orderId: rpcResult?.order_id,
      newStatus: parsed.newStatus,
      message: rpcResult?.message,
    };
  }

  /**
   * Rotação segura de credenciais do tenant com criptografia em repouso
   */
  static async updateTenantPaymentSettings(
    tenantId: string,
    input: UpdatePaymentSettingsInput
  ): Promise<PublicPaymentSettingsResult> {
    const supabase = getSupabaseAdmin();

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (input.provider !== undefined) updatePayload.provider = input.provider;
    if (input.isActive !== undefined) updatePayload.is_active = input.isActive;
    if (input.pixEnabled !== undefined) updatePayload.pix_enabled = input.pixEnabled;
    if (input.pixExpirationMinutes !== undefined) updatePayload.pix_expiration_minutes = input.pixExpirationMinutes;
    if (input.sandboxMode !== undefined) updatePayload.sandbox_mode = input.sandboxMode;

    if (input.apiKey !== undefined) {
      updatePayload.api_key_encrypted = input.apiKey ? encryptSecret(input.apiKey) : null;
    }

    if (input.webhookSecret !== undefined) {
      updatePayload.webhook_secret = input.webhookSecret ? encryptSecret(input.webhookSecret) : null;
    }

    const { data: updated, error } = await supabase
      .from('tenant_payment_settings')
      .upsert({
        tenant_id: tenantId,
        ...updatePayload,
      })
      .select('*')
      .single();

    if (error || !updated) {
      throw new Error(`Falha ao salvar configurações de pagamento: ${error?.message || 'Erro desconhecido'}`);
    }

    logger.info('Configurações de pagamento atualizadas com segurança', {
      tenantId,
      provider: updated.provider,
      rotatedApiKey: input.apiKey !== undefined,
      rotatedWebhookSecret: input.webhookSecret !== undefined,
    });

    let maskedApiKey: string | undefined;
    if (updated.api_key_encrypted) {
      try {
        const decrypted = decryptSecret(updated.api_key_encrypted);
        maskedApiKey = maskSecret(decrypted);
      } catch {
        maskedApiKey = '****';
      }
    }

    return {
      tenantId: updated.tenant_id,
      provider: updated.provider,
      isActive: updated.is_active,
      pixEnabled: updated.pix_enabled,
      pixExpirationMinutes: updated.pix_expiration_minutes,
      sandboxMode: updated.sandbox_mode,
      hasApiKey: Boolean(updated.api_key_encrypted),
      hasWebhookSecret: Boolean(updated.webhook_secret),
      maskedApiKey,
      updatedAt: updated.updated_at,
    };
  }

  /**
   * Retorna configurações públicas e seguras (sem dados sensíveis)
   */
  static async getPublicTenantPaymentSettings(
    tenantId: string
  ): Promise<PublicPaymentSettingsResult | null> {
    const supabase = getSupabaseAdmin();

    const { data: settings } = await supabase
      .from('tenant_payment_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!settings) return null;

    let maskedApiKey: string | undefined;
    if (settings.api_key_encrypted) {
      try {
        const decrypted = decryptSecret(settings.api_key_encrypted);
        maskedApiKey = maskSecret(decrypted);
      } catch {
        maskedApiKey = '****';
      }
    }

    return {
      tenantId: settings.tenant_id,
      provider: settings.provider,
      isActive: settings.is_active,
      pixEnabled: settings.pix_enabled,
      pixExpirationMinutes: settings.pix_expiration_minutes,
      sandboxMode: settings.sandbox_mode,
      hasApiKey: Boolean(settings.api_key_encrypted),
      hasWebhookSecret: Boolean(settings.webhook_secret),
      maskedApiKey,
      updatedAt: settings.updated_at,
    };
  }
}
