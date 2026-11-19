import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { DeliveryQuoteService } from '@/modules/delivery/delivery-quote.service';
import { MapProviderNotConfiguredError } from '@/modules/delivery/providers/google-routes.adapter';

export const dynamic = 'force-dynamic';

const OriginGeocodeSchema = z.object({
  zipCode: z.string().trim().min(8, 'Informe um CEP válido'),
  street: z.string().trim().min(2, 'Informe a rua/avenida'),
  number: z.string().trim().min(1, 'Informe o número'),
  neighborhood: z.string().trim().min(2, 'Informe o bairro'),
  city: z.string().trim().min(2, 'Informe a cidade'),
  state: z.string().trim().length(2, 'Informe a UF (2 letras)'),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = OriginGeocodeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Endereço de origem inválido.' },
        { status: 400 }
      );
    }

    const result = await DeliveryQuoteService.geocodeStoreOrigin(parsed.data);
    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof MapProviderNotConfiguredError) {
      return NextResponse.json(
        { error: err.message, notConfigured: true },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: (err as { message?: string })?.message || 'Falha ao geocodificar origem.' },
      { status: 422 }
    );
  }
}

