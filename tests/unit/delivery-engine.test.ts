import { describe, it, expect } from 'vitest';
import {
  isValidDeliveryTransition,
  generateDriverAccessToken,
  hashDriverAccessToken,
  isDriverTokenActive,
  shouldExposeLiveLocationToCustomer,
  maskDriverFirstName,
  suggestDeliveryStopSequence,
  buildDriverWhatsAppMessage,
} from '@/modules/delivery/delivery.engine';
import {
  createDriverSchema,
  dispatchRunSchema,
  confirmDeliveryProofSchema,
  recordDeliveryFailureSchema,
  locationPingSchema,
} from '@/modules/delivery/delivery.schema';

describe('Etapa 3E — Motor Logístico, Segurança & Privacidade (Unitário)', () => {
  it('1. Deve validar máquina de estados logística desacoplada do pedido', () => {
    expect(isValidDeliveryTransition('pending_dispatch', 'assigned').valid).toBe(true);
    expect(isValidDeliveryTransition('assigned', 'in_transit').valid).toBe(true);
    expect(isValidDeliveryTransition('in_transit', 'arrived').valid).toBe(true);
    expect(isValidDeliveryTransition('arrived', 'delivered').valid).toBe(true);
    expect(isValidDeliveryTransition('in_transit', 'failed_attempt').valid).toBe(true);
    // Re-despacho após tentativa frustrada
    expect(isValidDeliveryTransition('failed_attempt', 'assigned').valid).toBe(true);
    // Estados terminais bloqueados
    expect(isValidDeliveryTransition('delivered', 'assigned').valid).toBe(false);
    expect(isValidDeliveryTransition('cancelled', 'in_transit').valid).toBe(false);
  });

  it('2. Deve gerar tokens criptográficos únicos e validar hash SHA-256 + expiração', () => {
    const t1 = generateDriverAccessToken();
    const t2 = generateDriverAccessToken();

    expect(t1.rawToken.length).toBeGreaterThanOrEqual(48);
    expect(t1.rawToken).not.toBe(t2.rawToken);
    expect(t1.tokenHash).toBe(hashDriverAccessToken(t1.rawToken));
    expect(t1.tokenHash).not.toBe(t1.rawToken);

    const future = new Date(Date.now() + 3600_000).toISOString();
    const past = new Date(Date.now() - 3600_000).toISOString();

    expect(isDriverTokenActive({ status: 'dispatched', driver_token_expires_at: future }).valid).toBe(true);
    expect(isDriverTokenActive({ status: 'in_progress', driver_token_expires_at: future }).valid).toBe(true);
    expect(isDriverTokenActive({ status: 'completed', driver_token_expires_at: future }).valid).toBe(false);
    expect(isDriverTokenActive({ status: 'cancelled', driver_token_expires_at: future }).valid).toBe(false);
    expect(isDriverTokenActive({ status: 'dispatched', driver_token_expires_at: past }).valid).toBe(false);
  });

  it('3. Deve impor política LGPD de exposição de localização apenas durante rota ativa e com consentimento', () => {
    // Ativa + consentida + em trânsito -> OK
    expect(
      shouldExposeLiveLocationToCustomer({
        deliveryStatus: 'in_transit',
        runStatus: 'in_progress',
        locationSharingEnabled: true,
      })
    ).toBe(true);

    // Sem consentimento -> Bloqueado
    expect(
      shouldExposeLiveLocationToCustomer({
        deliveryStatus: 'in_transit',
        runStatus: 'in_progress',
        locationSharingEnabled: false,
      })
    ).toBe(false);

    // Entrega concluída -> Bloqueado imediatamente (mesmo se flag estivesse true)
    expect(
      shouldExposeLiveLocationToCustomer({
        deliveryStatus: 'delivered',
        runStatus: 'in_progress',
        locationSharingEnabled: true,
      })
    ).toBe(false);

    // Rota encerrada -> Bloqueado
    expect(
      shouldExposeLiveLocationToCustomer({
        deliveryStatus: 'in_transit',
        runStatus: 'completed',
        locationSharingEnabled: true,
      })
    ).toBe(false);
  });

  it('4. Deve mascarar nome completo do entregador expondo apenas primeiro nome ao cliente', () => {
    expect(maskDriverFirstName('Carlos Eduardo Silva')).toBe('Carlos');
    expect(maskDriverFirstName('  Mariana  ')).toBe('Mariana');
    expect(maskDriverFirstName(null)).toBeNull();
  });

  it('5. Deve sugerir sequência lógica de paradas priorizando agendamento e agrupando bairros/CEP', () => {
    const ordered = suggestDeliveryStopSequence([
      {
        orderId: 'o1',
        orderNumber: '#001',
        scheduleType: 'asap',
        createdAt: '2026-11-10T10:00:00Z',
        neighborhood: 'Vila Mariana',
        zipCode: '04101-000',
      },
      {
        orderId: 'o2',
        orderNumber: '#002',
        scheduleType: 'asap',
        createdAt: '2026-11-10T10:05:00Z',
        neighborhood: 'Moema',
        zipCode: '04077-000',
      },
      {
        orderId: 'o3',
        orderNumber: '#003',
        scheduleType: 'scheduled',
        scheduledFor: '2026-11-10T12:00:00Z',
        createdAt: '2026-11-10T10:10:00Z',
        neighborhood: 'Pinheiros',
        zipCode: '05422-000',
      },
      {
        orderId: 'o4',
        orderNumber: '#004',
        scheduleType: 'asap',
        createdAt: '2026-11-10T10:15:00Z',
        neighborhood: 'Moema',
        zipCode: '04077-010',
      },
    ]);

    // Agendado primeiro (#003), depois Moema agrupada (#002, #004), depois Vila Mariana (#001)
    expect(ordered.map((x) => x.orderNumber)).toEqual(['#003', '#002', '#004', '#001']);
  });

  it('6. Deve validar schemas Zod de entrega, comprovante, ocorrência e GPS', () => {
    expect(
      createDriverSchema.safeParse({ name: 'João Motoboy', phone: '11999998888' }).success
    ).toBe(true);
    expect(createDriverSchema.safeParse({ name: 'A', phone: '123' }).success).toBe(false);

    expect(
      dispatchRunSchema.safeParse({
        driverId: '00000000-0000-0000-0000-000000000010',
        orderIds: [],
      }).success
    ).toBe(false);

    expect(
      confirmDeliveryProofSchema.safeParse({
        deliveryId: '00000000-0000-0000-0000-000000000020',
        recipientName: '',
      }).success
    ).toBe(false);

    expect(
      recordDeliveryFailureSchema.safeParse({
        deliveryId: '00000000-0000-0000-0000-000000000020',
        action: 'returned_to_store',
        failureReason: 'Cliente ausente após 3 tentativas',
      }).success
    ).toBe(true);

    expect(locationPingSchema.safeParse({ latitude: -23.55, longitude: -46.63 }).success).toBe(true);
    expect(locationPingSchema.safeParse({ latitude: 999, longitude: 0 }).success).toBe(false);
  });

  it('7. Deve gerar mensagem formatada para envio do link de rota ao motoboy via WhatsApp', () => {
    const msg = buildDriverWhatsAppMessage({
      driverName: 'Carlos',
      runCode: 'ROTA-0012',
      stopsCount: 3,
      portalUrl: 'https://pecabenza.com.br/entregador/abc123',
    });

    expect(msg).toContain('Carlos');
    expect(msg).toContain('ROTA-0012');
    expect(msg).toContain('3 paradas');
    expect(msg).toContain('https://pecabenza.com.br/entregador/abc123');
  });
});

