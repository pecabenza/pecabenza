import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { sanitizePlainText, sanitizePhone, sanitizeEmail } from '@/lib/security/sanitize';
import { logger } from '@/lib/observability/logger';
import { QuickOrderInputSchema } from '@/modules/orders/orders.schema';
import {
  createQuickOrder,
  searchTenantCustomers,
  getTenantCommerceSettings,
  listProductionStations,
} from '@/modules/orders/orders.service';
import { PaymentService } from '@/modules/payments/payment.service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 401 });
    }

    const tenantId = session.tenant.id;
    const url = new URL(request.url);
    const customerQuery = url.searchParams.get('q');

    // Modo 1: Busca de clientes recorrentes por telefone ou nome
    if (customerQuery !== null) {
      const customers = await searchTenantCustomers(tenantId, customerQuery);
      return NextResponse.json({ customers }, { status: 200 });
    }

    // Modo 2: Carregamento inicial do PDV / Pedido Rápido (Catálogo Ativo + Configurações + Estações)
    const supabase = createAdminClient();
    const [
      { data: categories },
      { data: products },
      { data: variants },
      { data: prodSteps },
      commerceSettings,
      stations,
    ] = await Promise.all([
      supabase
        .from('product_categories')
        .select('id, name, slug, display_order')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('display_order', { ascending: true }),
      supabase
        .from('products')
        .select('id, category_id, name, slug, short_description, status, is_featured')
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .order('is_featured', { ascending: false })
        .order('name', { ascending: true }),
      supabase
        .from('product_variants')
        .select('id, product_id, name, sku, unit_type, unit_value, price_in_cents, is_available, display_order')
        .eq('tenant_id', tenantId)
        .eq('is_available', true)
        .order('display_order', { ascending: true }),
      supabase
        .from('product_production_steps')
        .select('product_id, variant_id, station_id, step_order')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('step_order', { ascending: true }),
      getTenantCommerceSettings(tenantId),
      listProductionStations(tenantId, false),
    ]);

    const stationMap = new Map(stations.map((s) => [s.id, s]));
    const variantsByProduct = new Map<string, any[]>();
    (variants || []).forEach((v) => {
      const arr = variantsByProduct.get(v.product_id) || [];
      arr.push(v);
      variantsByProduct.set(v.product_id, arr);
    });

    const stepsByProduct = new Map<string, string[]>();
    (prodSteps || []).forEach((ps) => {
      const st = stationMap.get(ps.station_id);
      if (st) {
        const arr = stepsByProduct.get(ps.product_id) || [];
        if (!arr.includes(st.name)) {
          arr.push(st.name);
        }
        stepsByProduct.set(ps.product_id, arr);
      }
    });

    const activeCatalog = (products || [])
      .map((p) => ({
        ...p,
        variants: variantsByProduct.get(p.id) || [],
        stationNames: stepsByProduct.get(p.id) || [],
      }))
      .filter((p) => p.variants.length > 0);

    return NextResponse.json(
      {
        tenant: {
          id: session.tenant.id,
          name: session.tenant.name,
          slug: session.tenant.slug,
        },
        operator: {
          id: session.user.id,
          email: session.user.email,
          role: session.role,
        },
        categories: categories || [],
        catalog: activeCatalog,
        commerceSettings,
        stations,
      },
      { status: 200 }
    );
  } catch (error: any) {
    logger.error('Erro ao carregar dados do Pedido Rápido', { error: error.message });
    return NextResponse.json(
      { error: error.message || 'Falha ao carregar catálogo do Pedido Rápido.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 401 });
    }

    const body = await request.json();
    const parseResult = QuickOrderInputSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Dados do pedido rápido inválidos. Verifique os campos preenchidos.',
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const raw = parseResult.data;

    const sanitizedInput = {
      ...raw,
      customer: {
        name: sanitizePlainText(raw.customer.name),
        phone: raw.customer.phone ? sanitizePhone(raw.customer.phone) : '',
        email: raw.customer.email ? sanitizeEmail(raw.customer.email) : undefined,
      },
      address: raw.address
        ? {
            zipCode: sanitizePlainText(raw.address.zipCode),
            street: sanitizePlainText(raw.address.street),
            number: sanitizePlainText(raw.address.number),
            complement: raw.address.complement ? sanitizePlainText(raw.address.complement) : undefined,
            neighborhood: sanitizePlainText(raw.address.neighborhood),
            city: sanitizePlainText(raw.address.city),
            state: sanitizePlainText(raw.address.state).toUpperCase(),
            reference: raw.address.reference ? sanitizePlainText(raw.address.reference) : undefined,
          }
        : undefined,
      notes: raw.notes ? sanitizePlainText(raw.notes) : undefined,
    };

    const origin = request.headers.get('origin') || new URL(request.url).origin;

    const result = await createQuickOrder(
      session.tenant.id,
      sanitizedInput,
      {
        userId: session.user.id,
        role: session.role,
        email: session.user.email,
      },
      {
        tenantName: session.tenant.name,
        baseUrl: origin,
      }
    );

    // Se o método for Pix, gera também o QR Code Pix imediatamente via PaymentService
    let pixPayment = null;
    if (sanitizedInput.paymentMethod === 'pix' && body.generatePixQr !== false) {
      try {
        pixPayment = await PaymentService.createPixPayment(session.tenant.id, result.orderId);
      } catch (pixErr: any) {
        logger.warn('Aviso ao gerar QR Code Pix no Pedido Rápido', {
          orderId: result.orderId,
          error: pixErr.message,
        });
      }
    }

    logger.info('Pedido Rápido multicanal registrado com sucesso', {
      tenantId: session.tenant.id,
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      orderChannel: result.orderChannel,
      paymentMethod: result.paymentMethod,
      paymentStatus: result.paymentStatus,
      totalInCents: result.totalInCents,
      actorId: session.user.id,
    });

    return NextResponse.json(
      {
        ...result,
        pixPayment,
      },
      { status: 201 }
    );
  } catch (error: any) {
    logger.warn('Rejeição ao registrar Pedido Rápido', {
      error: error.message,
    });
    return NextResponse.json(
      { error: error.message || 'Não foi possível registrar o pedido rápido.' },
      { status: 400 }
    );
  }
}

