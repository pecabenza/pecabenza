import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveTenantByHost } from '@/lib/tenancy/context';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { createSafeErrorResponse } from '@/lib/security/error-response';
import { isCommerceEnabled, getCommerceDisabledMessage } from '@/lib/tenancy/site-mode';
import { CartItemInputSchema, OrderAddressSchema } from '@/modules/orders/orders.schema';
import { DeliveryQuoteService } from '@/modules/delivery/delivery-quote.service';
import { MapProviderNotConfiguredError } from '@/modules/delivery/providers/google-routes.adapter';

export const dynamic = 'force-dynamic';

const CheckoutDeliveryQuoteSchema = z.object({
  items: z.array(CartItemInputSchema).min(1, 'Adicione pelo menos um item à sacola.'),
  fulfillmentType: z.enum(['delivery', 'pickup']),
  checkoutSessionId: z.string().trim().max(120).optional(),
  address: OrderAddressSchema.optional(),
  confirmedPin: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .nullable()
    .optional(),
});

export async function POST(request: NextRequest) {
  try {
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'anonymous';
    const rateLimit = await checkRateLimit(clientIp, {
      limit: 30,
      windowSeconds: 60,
      prefix: 'checkout_delivery_quote',
    });

    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Muitas cotações de entrega em sequência. Aguarde alguns instantes.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.reset) } }
      );
    }

    const host =
      request.headers.get('x-tenant-host') ||
      request.headers.get('host') ||
      '';
    if (!host.trim()) {
      return NextResponse.json({ error: 'Estabelecimento não identificado.' }, { status: 404 });
    }

    const tenantContext = await resolveTenantByHost(host);
    if (!tenantContext) {
      return NextResponse.json({ error: 'Estabelecimento não identificado.' }, { status: 404 });
    }

    const { tenant } = tenantContext;
    if (!isCommerceEnabled(tenant.site_mode)) {
      return NextResponse.json(
        { error: getCommerceDisabledMessage(tenant.site_mode) },
        { status: 403 }
      );
    }

    const raw = await request.json();
    const parsed = CheckoutDeliveryQuoteSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Dados inválidos para cotação de entrega.' },
        { status: 400 }
      );
    }

    const quoteRes = await DeliveryQuoteService.createCheckoutQuote({
      tenantId: tenant.id,
      checkoutSessionId: parsed.data.checkoutSessionId || null,
      fulfillmentType: parsed.data.fulfillmentType,
      items: parsed.data.items,
      address: parsed.data.address,
      confirmedPin: parsed.data.confirmedPin || null,
    });

    return NextResponse.json(quoteRes, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof MapProviderNotConfiguredError) {
      return NextResponse.json(
        { error: 'Serviço de cálculo de rotas não configurado no servidor.' },
        { status: 503 }
      );
    }
    return createSafeErrorResponse(err, 400, {
      path: '/api/checkout/delivery-quote',
      action: 'checkout_delivery_quote',
    });
  }
}

