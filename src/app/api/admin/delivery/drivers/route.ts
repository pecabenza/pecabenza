import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import {
  listDeliveryDrivers,
  createDeliveryDriver,
  updateDeliveryDriver,
} from '@/modules/delivery/delivery.service';
import { createDriverSchema, updateDriverSchema } from '@/modules/delivery/delivery.schema';
import { sanitizePlainText } from '@/lib/security/sanitize';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const drivers = await listDeliveryDrivers(session.tenant.id, { includeInactive });
    return NextResponse.json({ drivers }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Erro ao listar entregadores.' },
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

    const raw = await request.json();
    const parsed = createDriverSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Dados inválidos.' },
        { status: 400 }
      );
    }

    const driver = await createDeliveryDriver(session.tenant.id, {
      name: sanitizePlainText(parsed.data.name),
      phone: sanitizePlainText(parsed.data.phone),
      driverType: parsed.data.driverType,
      vehicleType: parsed.data.vehicleType,
      vehiclePlate: parsed.data.vehiclePlate ? sanitizePlainText(parsed.data.vehiclePlate) : null,
      notes: parsed.data.notes ? sanitizePlainText(parsed.data.notes) : null,
    });

    return NextResponse.json({ driver }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Erro ao cadastrar entregador.' },
      { status: 400 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 401 });
    }

    const raw = await request.json();
    const parsed = updateDriverSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Dados inválidos para atualização.' },
        { status: 400 }
      );
    }

    const driver = await updateDeliveryDriver(session.tenant.id, {
      driverId: parsed.data.driverId,
      name: parsed.data.name ? sanitizePlainText(parsed.data.name) : undefined,
      phone: parsed.data.phone ? sanitizePlainText(parsed.data.phone) : undefined,
      driverType: parsed.data.driverType,
      vehicleType: parsed.data.vehicleType,
      vehiclePlate:
        parsed.data.vehiclePlate !== undefined
          ? parsed.data.vehiclePlate
            ? sanitizePlainText(parsed.data.vehiclePlate)
            : null
          : undefined,
      availabilityStatus: parsed.data.availabilityStatus,
      isActive: parsed.data.isActive,
      notes:
        parsed.data.notes !== undefined
          ? parsed.data.notes
            ? sanitizePlainText(parsed.data.notes)
            : null
          : undefined,
    });

    return NextResponse.json({ driver }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Erro ao atualizar entregador.' },
      { status: 400 }
    );
  }
}

