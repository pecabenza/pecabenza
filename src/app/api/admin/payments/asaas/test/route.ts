import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { decryptSecret } from '@/lib/security/encryption';
import { AsaasPaymentProvider } from '@/modules/payments/providers/asaas.provider';

export const dynamic = 'force-dynamic';

const TestAsaasSchema = z.object({
  mode: z.enum(['connection', 'webhook']),
  sandboxMode: z.boolean().optional(),
  apiKey: z.string().max(300).optional(),
  webhookSecret: z.string().max(300).optional(),
  expectedWebhookUrl: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 401 });
    }

    const raw = await request.json();
    const parsed = TestAsaasSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Parâmetros inválidos para teste.' },
        { status: 400 }
      );
    }

    const { mode, expectedWebhookUrl } = parsed.data;
    const supabase = getSupabaseAdmin();
    const { data: saved } = await supabase
      .from('tenant_payment_settings')
      .select('sandbox_mode, api_key_encrypted, webhook_secret')
      .eq('tenant_id', session.tenant.id)
      .maybeSingle();

    const isSandbox =
      parsed.data.sandboxMode !== undefined
        ? parsed.data.sandboxMode
        : saved?.sandbox_mode !== false;

    const apiKeyInput = parsed.data.apiKey?.trim();
    const apiKey =
      apiKeyInput ||
      (saved?.api_key_encrypted ? decryptSecret(saved.api_key_encrypted) : '');

    const webhookSecretInput = parsed.data.webhookSecret?.trim();
    const webhookSecret =
      webhookSecretInput ||
      (saved?.webhook_secret ? decryptSecret(saved.webhook_secret) : '');

    const baseUrl = isSandbox
      ? 'https://sandbox.asaas.com/api/v3'
      : 'https://api.asaas.com/api/v3';

    if (mode === 'connection') {
      if (!apiKey) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Informe a API Key da Asaas (ou salve uma chave antes) para testar a conexão.',
          },
          { status: 400 }
        );
      }

      const res = await fetch(`${baseUrl}/customers?limit=1`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          access_token: apiKey,
          'User-Agent': 'SysFood-Benza-Commerce/1.0',
        },
        cache: 'no-store',
      });

      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const errJson = await res.json();
          if (errJson?.errors?.[0]?.description) {
            detail = errJson.errors[0].description;
          }
        } catch {
          // mantém HTTP status
        }
        return NextResponse.json(
          {
            ok: false,
            environment: isSandbox ? 'sandbox' : 'production',
            error: `Falha na autenticação com Asaas (${isSandbox ? 'Sandbox' : 'Produção'}): ${detail}`,
          },
          { status: 400 }
        );
      }

      const data = await res.json();
      return NextResponse.json(
        {
          ok: true,
          environment: isSandbox ? 'sandbox' : 'production',
          message: `Conexão autenticada com sucesso na Asaas (${isSandbox ? 'Sandbox' : 'Produção'}). Clientes encontrados na conta: ${typeof data?.totalCount === 'number' ? data.totalCount : 'OK'}.`,
        },
        { status: 200 }
      );
    }

    // mode === 'webhook'
    if (!webhookSecret) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Informe o Webhook Secret (authToken) antes de testar o webhook. Por segurança, a Asaas exige um token próprio diferente da API Key.',
        },
        { status: 400 }
      );
    }

    if (apiKey && webhookSecret === apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'O Webhook Secret não pode ser igual à API Key da Asaas. Defina um token exclusivo para o webhook.',
        },
        { status: 400 }
      );
    }

    const provider = new AsaasPaymentProvider({
      apiKey,
      webhookSecret,
      isSandbox,
    });

    const simulatedBody = {
      id: `evt_test_${Date.now()}`,
      event: 'PAYMENT_RECEIVED',
      payment: {
        id: 'pay_test_simulation',
        value: 49.9,
        confirmedDate: new Date().toISOString(),
      },
    };

    const signatureOk = provider.verifyWebhookSignature({
      tenantId: session.tenant.id,
      provider: 'asaas',
      headers: { 'asaas-access-token': webhookSecret },
      rawBody: JSON.stringify(simulatedBody),
      parsedBody: simulatedBody,
    });

    const parsedEvent = provider.parseWebhookEvent({
      tenantId: session.tenant.id,
      provider: 'asaas',
      headers: { 'asaas-access-token': webhookSecret },
      rawBody: JSON.stringify(simulatedBody),
      parsedBody: simulatedBody,
    });

    if (!signatureOk || parsedEvent.newStatus !== 'paid') {
      return NextResponse.json(
        {
          ok: false,
          error: 'Falha na verificação local da assinatura/parser do webhook Asaas.',
        },
        { status: 400 }
      );
    }

    // Se houver API Key, consulta também os webhooks cadastrados na conta Asaas
    let asaasWebhookNote = '';
    if (apiKey) {
      try {
        const whRes = await fetch(`${baseUrl}/webhooks`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            access_token: apiKey,
            'User-Agent': 'SysFood-Benza-Commerce/1.0',
          },
          cache: 'no-store',
        });
        if (whRes.ok) {
          const whJson = await whRes.json();
          const list = Array.isArray(whJson?.data) ? whJson.data : [];
          const cleanExpected = (expectedWebhookUrl || '').split('?')[0];
          const matched = list.find(
            (w: { url?: string; enabled?: boolean }) =>
              typeof w.url === 'string' && cleanExpected && w.url.includes(cleanExpected)
          );
          if (matched) {
            asaasWebhookNote = ` Webhook cadastrado na Asaas (${matched.enabled ? 'ativo' : 'inativo'}).`;
          } else {
            asaasWebhookNote = ` Nenhum webhook com esta URL foi encontrado na Asaas ainda (${list.length} cadastrado(s) na conta) — cadastre a URL abaixo no painel da Asaas.`;
          }
        }
      } catch {
        // segue sem bloquear o teste do token
      }
    }

    return NextResponse.json(
      {
        ok: true,
        environment: isSandbox ? 'sandbox' : 'production',
        message: `Assinatura (asaas-access-token) e parser de evento (${parsedEvent.eventType} → ${parsedEvent.newStatus}) validados com sucesso.${asaasWebhookNote}`,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const msg = (err as { message?: string })?.message || 'Erro ao testar integração com Asaas.';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

