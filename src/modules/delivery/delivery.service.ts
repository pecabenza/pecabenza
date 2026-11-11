import { createAdminClient } from '@/lib/supabase/admin';
import type {
  DeliveryDriver,
  DeliveryRun,
  OrderDelivery,
  DeliveryEvent,
  DeliveryStatus,
  DriverType,
  DriverVehicleType,
  DriverAvailabilityStatus,
  ProofRelationship,
  DeliveryRouteStrategy,
} from '@/types/database.types';
import {
  DELIVERY_STATUS_LABELS,
  PROOF_RELATIONSHIP_LABELS,
  generateDriverAccessToken,
  hashDriverAccessToken,
  isDriverTokenActive,
  shouldExposeLiveLocationToCustomer,
  maskDriverFirstName,
  suggestDeliveryStopSequence,
  buildDriverWhatsAppMessage,
} from './delivery.engine';
import { formatBrl } from '@/modules/cart/cart.utils';

// ==============================================================================
// 1. Gestão de Entregadores (Motoboys Próprios e Terceirizados)
// ==============================================================================

export interface DriverWithMetrics extends DeliveryDriver {
  deliveredCount: number;
  failedCount: number;
  activeDeliveriesCount: number;
}

export async function listDeliveryDrivers(
  tenantId: string,
  options?: { includeInactive?: boolean }
): Promise<DriverWithMetrics[]> {
  const supabase = createAdminClient();
  let query = supabase
    .from('delivery_drivers')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('is_active', { ascending: false })
    .order('name', { ascending: true });

  if (!options?.includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data: drivers, error } = await query;
  if (error) {
    throw new Error(`Falha ao listar entregadores: ${error.message}`);
  }

  const { data: deliveries } = await supabase
    .from('order_deliveries')
    .select('driver_id, delivery_status')
    .eq('tenant_id', tenantId)
    .not('driver_id', 'is', null);

  const metricsMap = new Map<string, { delivered: number; failed: number; active: number }>();
  for (const d of deliveries || []) {
    if (!d.driver_id) continue;
    const current = metricsMap.get(d.driver_id) || { delivered: 0, failed: 0, active: 0 };
    if (d.delivery_status === 'delivered') current.delivered += 1;
    else if (d.delivery_status === 'failed_attempt' || d.delivery_status === 'returned_to_store') current.failed += 1;
    else if (['assigned', 'picked_up', 'in_transit', 'arrived'].includes(d.delivery_status)) current.active += 1;
    metricsMap.set(d.driver_id, current);
  }

  return (drivers || []).map((drv: any) => {
    const m = metricsMap.get(drv.id) || { delivered: 0, failed: 0, active: 0 };
    return {
      ...drv,
      deliveredCount: m.delivered,
      failedCount: m.failed,
      activeDeliveriesCount: m.active,
    };
  });
}

export async function createDeliveryDriver(
  tenantId: string,
  input: {
    name: string;
    phone: string;
    driverType?: DriverType;
    vehicleType?: DriverVehicleType;
    vehiclePlate?: string | null;
    notes?: string | null;
  }
): Promise<DeliveryDriver> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('delivery_drivers')
    .insert({
      tenant_id: tenantId,
      name: input.name.trim(),
      phone: input.phone.trim(),
      driver_type: input.driverType || 'internal',
      vehicle_type: input.vehicleType || 'motorcycle',
      vehicle_plate: input.vehiclePlate?.trim() || null,
      availability_status: 'available',
      is_active: true,
      notes: input.notes?.trim() || null,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Falha ao cadastrar entregador: ${error.message}`);
  }

  return data as DeliveryDriver;
}

export async function updateDeliveryDriver(
  tenantId: string,
  input: {
    driverId: string;
    name?: string;
    phone?: string;
    driverType?: DriverType;
    vehicleType?: DriverVehicleType;
    vehiclePlate?: string | null;
    availabilityStatus?: DriverAvailabilityStatus;
    isActive?: boolean;
    notes?: string | null;
  }
): Promise<DeliveryDriver> {
  const supabase = createAdminClient();
  const updates: Record<string, any> = { updated_at: new Date().toISOString() };

  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.phone !== undefined) updates.phone = input.phone.trim();
  if (input.driverType !== undefined) updates.driver_type = input.driverType;
  if (input.vehicleType !== undefined) updates.vehicle_type = input.vehicleType;
  if (input.vehiclePlate !== undefined) updates.vehicle_plate = input.vehiclePlate?.trim() || null;
  if (input.availabilityStatus !== undefined) updates.availability_status = input.availabilityStatus;
  if (input.isActive !== undefined) updates.is_active = input.isActive;
  if (input.notes !== undefined) updates.notes = input.notes?.trim() || null;

  const { data, error } = await supabase
    .from('delivery_drivers')
    .update(updates)
    .eq('tenant_id', tenantId)
    .eq('id', input.driverId)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Falha ao atualizar entregador: ${error?.message || 'Não encontrado.'}`);
  }

  return data as DeliveryDriver;
}

// ==============================================================================
// 2. Painel de Expedição & Fila de Despacho
// ==============================================================================

export interface DispatchQueueOrder {
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  scheduleType: 'asap' | 'scheduled';
  scheduledFor?: string | null;
  createdAt: string;
  orderStatus: string;
  paymentMethod: string;
  paymentStatus: string;
  totalCents: number;
  formattedTotal: string;
  cashChangeForCents?: number | null;
  amountToCollectCents: number;
  formattedAmountToCollect: string;
  address?: {
    zipCode: string;
    street: string;
    number: string;
    complement?: string | null;
    neighborhood: string;
    city: string;
    state: string;
    reference?: string | null;
  } | null;
  itemsSummary: string;
  delivery?: OrderDelivery | null;
}

export interface ActiveDeliveryRunSummary {
  run: DeliveryRun;
  driver?: DeliveryDriver | null;
  stops: Array<{
    delivery: OrderDelivery;
    orderNumber: string;
    customerName: string;
    customerPhone: string;
    paymentMethod: string;
    paymentStatus: string;
    cashChangeForCents?: number | null;
    address?: DispatchQueueOrder['address'];
  }>;
  latestLocation?: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number | null;
    recordedAt: string;
  } | null;
}

export async function getDispatchBoardData(tenantId: string): Promise<{
  readyOrders: DispatchQueueOrder[];
  failedOrReturnedDeliveries: DispatchQueueOrder[];
  activeRuns: ActiveDeliveryRunSummary[];
  recentCompletedRuns: ActiveDeliveryRunSummary[];
  drivers: DriverWithMetrics[];
}> {
  const supabase = createAdminClient();

  // 1. Pedidos delivery em estado operacional ativo ('ready' ou 'out_for_delivery')
  const { data: orders, error: ordErr } = await supabase
    .from('orders')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('fulfillment_type', 'delivery')
    .in('status', ['ready', 'out_for_delivery'])
    .order('created_at', { ascending: true })
    .limit(150);

  if (ordErr) {
    throw new Error(`Erro ao carregar fila de expedição: ${ordErr.message}`);
  }

  const orderIds = (orders || []).map((o: any) => o.id);

  // Busca entregas existentes vinculadas a esses pedidos ou falhas recentes
  const { data: allDeliveries } = await supabase
    .from('order_deliveries')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false })
    .limit(200);

  const deliveryByOrderId = new Map<string, OrderDelivery>();
  const extraOrderIds = new Set<string>(orderIds);
  for (const d of allDeliveries || []) {
    deliveryByOrderId.set(d.order_id, d as OrderDelivery);
    if (['assigned', 'picked_up', 'in_transit', 'arrived', 'failed_attempt', 'returned_to_store'].includes(d.delivery_status)) {
      extraOrderIds.add(d.order_id);
    }
  }

  const targetOrderIds = Array.from(extraOrderIds);
  let fullOrders = orders || [];
  const missingIds = targetOrderIds.filter((id) => !fullOrders.some((o: any) => o.id === id));
  if (missingIds.length > 0) {
    const { data: extraOrders } = await supabase
      .from('orders')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('id', missingIds);
    fullOrders = [...fullOrders, ...(extraOrders || [])];
  }

  // Endereços e itens em lote
  const [{ data: addresses }, { data: items }] = targetOrderIds.length
    ? await Promise.all([
        supabase.from('order_addresses').select('*').eq('tenant_id', tenantId).in('order_id', targetOrderIds),
        supabase.from('order_items').select('order_id, snapshot_product_name, snapshot_variant_name, quantity').eq('tenant_id', tenantId).in('order_id', targetOrderIds),
      ])
    : [{ data: [] }, { data: [] }];

  const addrMap = new Map<string, any>();
  for (const a of addresses || []) addrMap.set(a.order_id, a);

  const itemsMap = new Map<string, string[]>();
  for (const it of items || []) {
    const arr = itemsMap.get(it.order_id) || [];
    arr.push(`${it.quantity}x ${it.snapshot_product_name} (${it.snapshot_variant_name})`);
    itemsMap.set(it.order_id, arr);
  }

  const orderMap = new Map<string, any>();
  for (const o of fullOrders) orderMap.set(o.id, o);

  const toQueueItem = (o: any): DispatchQueueOrder => {
    const addr = addrMap.get(o.id);
    const deliv = deliveryByOrderId.get(o.id) || null;
    const collect =
      o.payment_status !== 'paid' && ['cash', 'card_on_delivery', 'pos_card'].includes(o.payment_method)
        ? o.total_cents
        : 0;

    return {
      orderId: o.id,
      orderNumber: o.order_number,
      customerName: o.customer_name,
      customerPhone: o.customer_phone,
      scheduleType: o.schedule_type || 'asap',
      scheduledFor: o.scheduled_for,
      createdAt: o.created_at,
      orderStatus: o.status,
      paymentMethod: o.payment_method || 'pix',
      paymentStatus: o.payment_status,
      totalCents: o.total_cents,
      formattedTotal: formatBrl(o.total_cents),
      cashChangeForCents: o.cash_change_for_cents,
      amountToCollectCents: collect,
      formattedAmountToCollect: formatBrl(collect),
      address: addr
        ? {
            zipCode: addr.zip_code,
            street: addr.street,
            number: addr.number,
            complement: addr.complement,
            neighborhood: addr.neighborhood,
            city: addr.city,
            state: addr.state,
            reference: addr.reference,
          }
        : null,
      itemsSummary: (itemsMap.get(o.id) || []).join(', '),
      delivery: deliv,
    };
  };

  // Pedidos prontos ainda sem rota ativa
  const readyRaw = fullOrders
    .filter((o: any) => {
      if (o.status !== 'ready') return false;
      const d = deliveryByOrderId.get(o.id);
      return !d || d.delivery_status === 'pending_dispatch';
    })
    .map(toQueueItem);

  const readyOrders = suggestDeliveryStopSequence(
    readyRaw.map((r) => ({
      ...r,
      neighborhood: r.address?.neighborhood || '',
      zipCode: r.address?.zipCode || '',
      street: r.address?.street || '',
    }))
  );

  // Ocorrências / Tentativas frustradas ou retornos sanitários pendentes
  const failedOrReturnedDeliveries = fullOrders
    .filter((o: any) => {
      const d = deliveryByOrderId.get(o.id);
      return d && (d.delivery_status === 'failed_attempt' || d.delivery_status === 'returned_to_store');
    })
    .map(toQueueItem);

  // Rotas ativas e recentes
  const { data: runs } = await supabase
    .from('delivery_runs')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('status', ['dispatched', 'in_progress', 'completed'])
    .order('created_at', { ascending: false })
    .limit(30);

  const drivers = await listDeliveryDrivers(tenantId, { includeInactive: false });
  const driverMap = new Map<string, DeliveryDriver>();
  for (const drv of drivers) driverMap.set(drv.id, drv);

  const activeRunIds = (runs || [])
    .filter((r: any) => ['dispatched', 'in_progress'].includes(r.status) && r.location_sharing_enabled)
    .map((r: any) => r.id);

  const latestPingByRun = new Map<string, any>();
  if (activeRunIds.length > 0) {
    const { data: pings } = await supabase
      .from('delivery_location_pings')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('run_id', activeRunIds)
      .order('recorded_at', { ascending: false });

    for (const p of pings || []) {
      if (!latestPingByRun.has(p.run_id)) {
        latestPingByRun.set(p.run_id, {
          latitude: Number(p.latitude),
          longitude: Number(p.longitude),
          accuracyMeters: p.accuracy_meters,
          recordedAt: p.recorded_at,
        });
      }
    }
  }

  const buildRunSummary = (run: DeliveryRun): ActiveDeliveryRunSummary => {
    const stopsDeliveries = (allDeliveries || [])
      .filter((d: any) => d.run_id === run.id)
      .sort((a: any, b: any) => a.stop_sequence - b.stop_sequence);

    return {
      run,
      driver: run.driver_id ? driverMap.get(run.driver_id) || null : null,
      stops: stopsDeliveries.map((d: any) => {
        const ord = orderMap.get(d.order_id);
        const addr = addrMap.get(d.order_id);
        return {
          delivery: d as OrderDelivery,
          orderNumber: ord?.order_number || '-',
          customerName: ord?.customer_name || 'Cliente',
          customerPhone: ord?.customer_phone || '',
          paymentMethod: ord?.payment_method || 'pix',
          paymentStatus: ord?.payment_status || 'pending',
          cashChangeForCents: ord?.cash_change_for_cents,
          address: addr
            ? {
                zipCode: addr.zip_code,
                street: addr.street,
                number: addr.number,
                complement: addr.complement,
                neighborhood: addr.neighborhood,
                city: addr.city,
                state: addr.state,
                reference: addr.reference,
              }
            : null,
        };
      }),
      latestLocation: latestPingByRun.get(run.id) || null,
    };
  };

  const activeRuns = (runs || [])
    .filter((r: any) => r.status === 'dispatched' || r.status === 'in_progress')
    .map((r: any) => buildRunSummary(r as DeliveryRun));

  const recentCompletedRuns = (runs || [])
    .filter((r: any) => r.status === 'completed')
    .slice(0, 10)
    .map((r: any) => buildRunSummary(r as DeliveryRun));

  return {
    readyOrders,
    failedOrReturnedDeliveries,
    activeRuns,
    recentCompletedRuns,
    drivers,
  };
}

// ==============================================================================
// 3. Despacho de Romaneio & Portal do Entregador (Token Criptográfico)
// ==============================================================================

export async function dispatchDeliveryRun(
  tenantId: string,
  input: {
    driverId: string;
    orderIds: string[];
    routeStrategy?: DeliveryRouteStrategy;
    tokenExpiresHours?: number;
    notes?: string | null;
    actorUserId?: string | null;
    baseUrl?: string;
  }
) {
  const supabase = createAdminClient();
  const { rawToken, tokenHash } = generateDriverAccessToken();

  const { data, error } = await supabase.rpc('dispatch_delivery_run_atomic', {
    p_tenant_id: tenantId,
    p_driver_id: input.driverId,
    p_order_ids: input.orderIds,
    p_driver_token_hash: tokenHash,
    p_token_expires_hours: input.tokenExpiresHours ?? 12,
    p_route_strategy: input.routeStrategy || 'manual',
    p_notes: input.notes || null,
    p_actor_user_id: input.actorUserId || null,
  });

  if (error) {
    throw new Error(`Falha ao despachar romaneio: ${error.message}`);
  }

  if (!data || data.success === false) {
    throw new Error(data?.error || 'Não foi possível criar o romaneio de entrega.');
  }

  const baseUrl = (input.baseUrl || '').replace(/\/$/, '');
  const portalPath = `/entregador/${rawToken}`;
  const portalUrl = baseUrl ? `${baseUrl}${portalPath}` : portalPath;

  const whatsappMessage = buildDriverWhatsAppMessage({
    driverName: data.driver_name,
    runCode: data.run_code,
    stopsCount: data.orders_count,
    portalUrl,
  });

  return {
    success: true,
    runId: data.run_id as string,
    runCode: data.run_code as string,
    driverId: data.driver_id as string,
    driverName: data.driver_name as string,
    ordersCount: data.orders_count as number,
    expiresAt: data.expires_at as string,
    driverAccessToken: rawToken,
    portalPath,
    portalUrl,
    whatsappMessage,
  };
}

export async function getDriverPortalByToken(rawToken: string) {
  if (!rawToken || rawToken.trim().length < 24) {
    return null;
  }

  const supabase = createAdminClient();
  const tokenHash = hashDriverAccessToken(rawToken);

  const { data: run, error: runErr } = await supabase
    .from('delivery_runs')
    .select('*')
    .eq('driver_token_hash', tokenHash)
    .maybeSingle();

  if (runErr || !run) {
    return null;
  }

  const tokenStatus = isDriverTokenActive({
    status: run.status,
    driver_token_expires_at: run.driver_token_expires_at,
  });

  if (!tokenStatus.valid) {
    return {
      expired: true,
      reason: tokenStatus.reason || 'Acesso encerrado.',
      runCode: run.run_code,
      status: run.status,
    };
  }

  const [{ data: tenant }, { data: driver }, { data: deliveries }] = await Promise.all([
    supabase.from('tenants').select('id, name, slug').eq('id', run.tenant_id).single(),
    run.driver_id
      ? supabase.from('delivery_drivers').select('id, name, vehicle_type').eq('id', run.driver_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('order_deliveries')
      .select('*')
      .eq('tenant_id', run.tenant_id)
      .eq('run_id', run.id)
      .order('stop_sequence', { ascending: true }),
  ]);

  const orderIds = (deliveries || []).map((d: any) => d.order_id);
  const [{ data: orders }, { data: addresses }, { data: items }] = orderIds.length
    ? await Promise.all([
        supabase
          .from('orders')
          .select('id, order_number, customer_name, customer_phone, payment_method, payment_status, total_cents, cash_change_for_cents, notes')
          .eq('tenant_id', run.tenant_id)
          .in('id', orderIds),
        supabase
          .from('order_addresses')
          .select('order_id, zip_code, street, number, complement, neighborhood, city, state, reference')
          .eq('tenant_id', run.tenant_id)
          .in('order_id', orderIds),
        supabase
          .from('order_items')
          .select('order_id, snapshot_product_name, snapshot_variant_name, quantity')
          .eq('tenant_id', run.tenant_id)
          .in('order_id', orderIds),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const orderMap = new Map<string, any>((orders || []).map((o: any) => [o.id, o]));
  const addrMap = new Map<string, any>((addresses || []).map((a: any) => [a.order_id, a]));
  const itemsMap = new Map<string, string[]>();
  for (const it of items || []) {
    const list = itemsMap.get(it.order_id) || [];
    list.push(`${it.quantity}x ${it.snapshot_product_name} (${it.snapshot_variant_name})`);
    itemsMap.set(it.order_id, list);
  }

  return {
    expired: false,
    tenantName: tenant?.name || 'BENZA',
    runId: run.id,
    tenantId: run.tenant_id,
    runCode: run.run_code,
    status: run.status,
    locationSharingEnabled: Boolean(run.location_sharing_enabled),
    driverName: driver?.name || 'Entregador',
    expiresAt: run.driver_token_expires_at,
    stops: (deliveries || []).map((del: any) => {
      const ord = orderMap.get(del.order_id);
      const addr = addrMap.get(del.order_id);
      const fullAddressText = addr
        ? `${addr.street}, ${addr.number}${addr.complement ? ` (${addr.complement})` : ''} - ${addr.neighborhood}, ${addr.city}/${addr.state}`
        : '';

      return {
        deliveryId: del.id,
        orderId: del.order_id,
        orderNumber: ord?.order_number || '-',
        stopSequence: del.stop_sequence,
        deliveryStatus: del.delivery_status as DeliveryStatus,
        deliveryStatusLabel: DELIVERY_STATUS_LABELS[del.delivery_status as DeliveryStatus] || del.delivery_status,
        customerName: ord?.customer_name || 'Cliente',
        customerPhone: ord?.customer_phone || '',
        paymentMethod: ord?.payment_method || 'pix',
        paymentStatus: ord?.payment_status || 'pending',
        paymentToCollectCents: del.payment_to_collect_cents || 0,
        formattedPaymentToCollect: formatBrl(del.payment_to_collect_cents || 0),
        cashChangeForCents: ord?.cash_change_for_cents || null,
        formattedCashChangeFor: ord?.cash_change_for_cents ? formatBrl(ord.cash_change_for_cents) : null,
        notes: ord?.notes || null,
        itemsSummary: (itemsMap.get(del.order_id) || []).join(', '),
        address: addr
          ? {
              zipCode: addr.zip_code,
              street: addr.street,
              number: addr.number,
              complement: addr.complement,
              neighborhood: addr.neighborhood,
              city: addr.city,
              state: addr.state,
              reference: addr.reference,
              fullAddressText,
              googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddressText)}`,
            }
          : null,
        proofRecipientName: del.proof_recipient_name,
        failureReason: del.failure_reason,
      };
    }),
  };
}

// ==============================================================================
// 4. Ações de Entrega (Progresso, Prova, Tentativa Frustrada, Quarentena, GPS)
// ==============================================================================

export async function updateDeliveryStep(
  tenantId: string,
  input: {
    deliveryId: string;
    toStatus: 'picked_up' | 'in_transit' | 'arrived';
    source: 'admin' | 'driver';
    actorUserId?: string | null;
    notes?: string | null;
  }
) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('update_delivery_step_atomic', {
    p_tenant_id: tenantId,
    p_delivery_id: input.deliveryId,
    p_to_status: input.toStatus,
    p_source: input.source,
    p_actor_user_id: input.actorUserId || null,
    p_notes: input.notes || null,
  });

  if (error) {
    throw new Error(`Erro ao atualizar etapa da entrega: ${error.message}`);
  }
  if (!data || data.success === false) {
    throw new Error(data?.error || 'Falha ao atualizar entrega.');
  }

  return data;
}

export async function confirmDeliveryProof(
  tenantId: string,
  input: {
    deliveryId: string;
    recipientName: string;
    relationship?: ProofRelationship;
    paymentCollected?: boolean;
    photoPath?: string | null;
    notes?: string | null;
    source: 'admin' | 'driver';
    actorUserId?: string | null;
  }
) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('confirm_delivery_proof_atomic', {
    p_tenant_id: tenantId,
    p_delivery_id: input.deliveryId,
    p_recipient_name: input.recipientName,
    p_relationship: input.relationship || 'recipient',
    p_payment_collected: Boolean(input.paymentCollected),
    p_photo_path: input.photoPath || null,
    p_notes: input.notes || null,
    p_source: input.source,
    p_actor_user_id: input.actorUserId || null,
  });

  if (error) {
    throw new Error(`Erro ao confirmar entrega: ${error.message}`);
  }
  if (!data || data.success === false) {
    throw new Error(data?.error || 'Não foi possível confirmar o comprovante de entrega.');
  }

  return data;
}

export async function recordDeliveryFailure(
  tenantId: string,
  input: {
    deliveryId: string;
    action: 'failed_attempt' | 'returned_to_store';
    failureReason: string;
    source: 'admin' | 'driver';
    actorUserId?: string | null;
    sendToSanitaryQuarantine?: boolean;
  }
) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('record_delivery_failure_atomic', {
    p_tenant_id: tenantId,
    p_delivery_id: input.deliveryId,
    p_failure_reason: input.failureReason,
    p_action: input.action,
    p_source: input.source,
    p_actor_user_id: input.actorUserId || null,
  });

  if (error) {
    throw new Error(`Erro ao registrar ocorrência de entrega: ${error.message}`);
  }
  if (!data || data.success === false) {
    throw new Error(data?.error || 'Não foi possível registrar a ocorrência.');
  }

  // Integração com Etapa 3D (Segurança Sanitária ANVISA): se retornou à loja e acionou quarentena
  if (input.action === 'returned_to_store' && input.sendToSanitaryQuarantine) {
    const { data: deliveryRow } = await supabase
      .from('order_deliveries')
      .select('order_id')
      .eq('id', input.deliveryId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (deliveryRow?.order_id) {
      await supabase.rpc('process_order_return_quarantine_atomic', {
        p_tenant_id: tenantId,
        p_order_id: deliveryRow.order_id,
        p_action: 'quarantine',
        p_reason: `Retorno logístico de entrega: ${input.failureReason}`,
        p_actor_user_id: input.actorUserId || null,
      });
    }
  }

  return data;
}

export async function processDeliverySanitaryQuarantine(
  tenantId: string,
  input: {
    deliveryId: string;
    sanitaryAction: 'quarantine' | 'discard_loss';
    reason: string;
    actorUserId?: string | null;
  }
) {
  const supabase = createAdminClient();
  const { data: deliv, error: dErr } = await supabase
    .from('order_deliveries')
    .select('id, order_id, sanitary_quarantine_required')
    .eq('tenant_id', tenantId)
    .eq('id', input.deliveryId)
    .single();

  if (dErr || !deliv) {
    throw new Error('Entrega não localizada para tratamento sanitário.');
  }

  const { data: res, error: qErr } = await supabase.rpc('process_order_return_quarantine_atomic', {
    p_tenant_id: tenantId,
    p_order_id: deliv.order_id,
    p_action: input.sanitaryAction,
    p_reason: input.reason,
    p_actor_user_id: input.actorUserId || null,
  });

  if (qErr || !res || res.success === false) {
    throw new Error(qErr?.message || res?.error || 'Falha ao processar quarentena sanitária da entrega.');
  }

  await supabase
    .from('order_deliveries')
    .update({ sanitary_quarantine_required: false, updated_at: new Date().toISOString() })
    .eq('id', deliv.id)
    .eq('tenant_id', tenantId);

  return res;
}

export async function toggleRunLocationSharingByToken(rawToken: string, enabled: boolean) {
  const portal = await getDriverPortalByToken(rawToken);
  if (!portal || portal.expired || !portal.runId || !portal.tenantId) {
    throw new Error(portal?.reason || 'Rota encerrada ou token inválido.');
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('toggle_run_location_sharing_atomic', {
    p_tenant_id: portal.tenantId,
    p_run_id: portal.runId,
    p_enabled: enabled,
    p_source: 'driver',
  });

  if (error || !data || data.success === false) {
    throw new Error(error?.message || data?.error || 'Não foi possível alterar o compartilhamento de localização.');
  }

  return data;
}

export async function recordDriverLocationPingByToken(
  rawToken: string,
  coords: { latitude: number; longitude: number; accuracyMeters?: number | null }
) {
  const portal = await getDriverPortalByToken(rawToken);
  if (!portal || portal.expired || !portal.runId || !portal.tenantId) {
    throw new Error(portal?.reason || 'Rota encerrada ou token inválido.');
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('record_driver_location_ping_atomic', {
    p_tenant_id: portal.tenantId,
    p_run_id: portal.runId,
    p_latitude: coords.latitude,
    p_longitude: coords.longitude,
    p_accuracy_meters: coords.accuracyMeters ?? null,
  });

  if (error || !data || data.success === false) {
    throw new Error(error?.message || data?.error || 'Localização rejeitada pela política de rota ativa.');
  }

  return data;
}

export async function closeDeliveryRun(
  tenantId: string,
  runId: string,
  action: 'complete' | 'cancel',
  actorUserId?: string | null
) {
  const supabase = createAdminClient();
  const { data: run, error } = await supabase
    .from('delivery_runs')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', runId)
    .single();

  if (error || !run) {
    throw new Error('Romaneio não localizado.');
  }

  const now = new Date().toISOString();
  const nextStatus = action === 'cancel' ? 'cancelled' : 'completed';

  const { error: updErr } = await supabase
    .from('delivery_runs')
    .update({
      status: nextStatus,
      location_sharing_enabled: false,
      location_ended_at: run.location_ended_at || now,
      completed_at: now,
      driver_token_expires_at: now,
      updated_at: now,
    })
    .eq('id', runId)
    .eq('tenant_id', tenantId);

  if (updErr) {
    throw new Error(`Falha ao encerrar romaneio: ${updErr.message}`);
  }

  if (run.driver_id) {
    await supabase
      .from('delivery_drivers')
      .update({ availability_status: 'available', updated_at: now })
      .eq('id', run.driver_id)
      .eq('tenant_id', tenantId);
  }

  await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    actor_id: actorUserId || null,
    action: action === 'cancel' ? 'delivery_run_cancelled' : 'delivery_run_completed',
    resource_type: 'delivery_runs',
    resource_id: runId,
    payload_after: { status: nextStatus },
  });

  return { success: true, runId, status: nextStatus };
}

// ==============================================================================
// 5. Enriquecimento Seguro para Rastreamento Público do Cliente (Sem PII)
// ==============================================================================

export interface PublicDeliveryTrackingInfo {
  status: DeliveryStatus;
  statusLabel: string;
  driverFirstName: string | null;
  stopSequence: number;
  dispatchedAt?: string | null;
  arrivedAt?: string | null;
  deliveredAt?: string | null;
  proofSummary?: {
    recipientName: string;
    relationshipLabel: string;
  } | null;
  liveLocation?: {
    latitude: number;
    longitude: number;
    recordedAt: string;
  } | null;
  events: Array<{
    id: string;
    eventType: string;
    notes?: string | null;
    createdAt: string;
  }>;
}

export async function getPublicDeliveryTrackingForOrder(
  tenantId: string,
  orderId: string
): Promise<PublicDeliveryTrackingInfo | null> {
  const supabase = createAdminClient();

  const { data: delivery } = await supabase
    .from('order_deliveries')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('order_id', orderId)
    .maybeSingle();

  if (!delivery) {
    return null;
  }

  const [{ data: driver }, { data: run }, { data: events }] = await Promise.all([
    delivery.driver_id
      ? supabase.from('delivery_drivers').select('name').eq('id', delivery.driver_id).maybeSingle()
      : Promise.resolve({ data: null }),
    delivery.run_id
      ? supabase.from('delivery_runs').select('id, status, location_sharing_enabled').eq('id', delivery.run_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('delivery_events')
      .select('id, event_type, notes, created_at')
      .eq('tenant_id', tenantId)
      .eq('delivery_id', delivery.id)
      .order('created_at', { ascending: true }),
  ]);

  let liveLocation: PublicDeliveryTrackingInfo['liveLocation'] = null;
  const canExposeLocation = shouldExposeLiveLocationToCustomer({
    deliveryStatus: delivery.delivery_status as DeliveryStatus,
    runStatus: run?.status || null,
    locationSharingEnabled: run?.location_sharing_enabled || false,
  });

  if (canExposeLocation && run?.id) {
    const { data: latestPing } = await supabase
      .from('delivery_location_pings')
      .select('latitude, longitude, recorded_at')
      .eq('tenant_id', tenantId)
      .eq('run_id', run.id)
      .gt('expires_at', new Date().toISOString())
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestPing) {
      liveLocation = {
        latitude: Number(latestPing.latitude),
        longitude: Number(latestPing.longitude),
        recordedAt: latestPing.recorded_at,
      };
    }
  }

  const status = delivery.delivery_status as DeliveryStatus;

  return {
    status,
    statusLabel: DELIVERY_STATUS_LABELS[status] || status,
    driverFirstName: maskDriverFirstName(driver?.name),
    stopSequence: delivery.stop_sequence,
    dispatchedAt: delivery.dispatched_at,
    arrivedAt: delivery.arrived_at,
    deliveredAt: delivery.delivered_at,
    proofSummary:
      status === 'delivered' && delivery.proof_recipient_name
        ? {
            recipientName: delivery.proof_recipient_name,
            relationshipLabel:
              PROOF_RELATIONSHIP_LABELS[(delivery.proof_relationship as ProofRelationship) || 'recipient'] ||
              'Recebedor',
          }
        : null,
    liveLocation,
    events: (events || []).map((ev: any) => ({
      id: ev.id,
      eventType: ev.event_type,
      notes: ev.notes,
      createdAt: ev.created_at,
    })),
  };
}
