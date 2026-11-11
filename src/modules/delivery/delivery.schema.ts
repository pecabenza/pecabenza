import { z } from 'zod';

export const createDriverSchema = z.object({
  name: z.string().trim().min(2, 'Nome do entregador deve ter pelo menos 2 caracteres.').max(120),
  phone: z.string().trim().min(8, 'Telefone válido é obrigatório.').max(30),
  driverType: z.enum(['internal', 'freelance', 'third_party']).default('internal'),
  vehicleType: z.enum(['motorcycle', 'car', 'bicycle', 'other']).default('motorcycle'),
  vehiclePlate: z.string().trim().max(20).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const updateDriverSchema = z.object({
  driverId: z.string().uuid('ID de entregador inválido.'),
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().min(8).max(30).optional(),
  driverType: z.enum(['internal', 'freelance', 'third_party']).optional(),
  vehicleType: z.enum(['motorcycle', 'car', 'bicycle', 'other']).optional(),
  vehiclePlate: z.string().trim().max(20).optional().nullable(),
  availabilityStatus: z.enum(['available', 'on_route', 'offline']).optional(),
  isActive: z.boolean().optional(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const dispatchRunSchema = z.object({
  driverId: z.string().uuid('Selecione um entregador válido.'),
  orderIds: z.array(z.string().uuid()).min(1, 'Selecione pelo menos um pedido pronto para despacho.'),
  routeStrategy: z.enum(['manual', 'neighborhood_group', 'google_route_optimization']).default('manual'),
  tokenExpiresHours: z.number().int().min(1).max(72).default(12),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const deliveryStepSchema = z.object({
  deliveryId: z.string().uuid(),
  toStatus: z.enum(['picked_up', 'in_transit', 'arrived']),
  notes: z.string().trim().max(300).optional().nullable(),
});

export const confirmDeliveryProofSchema = z.object({
  deliveryId: z.string().uuid(),
  recipientName: z.string().trim().min(2, 'Informe quem recebeu o pedido.').max(120),
  relationship: z.enum(['recipient', 'concierge', 'family', 'neighbor', 'other']).default('recipient'),
  paymentCollected: z.boolean().default(false),
  photoPath: z.string().trim().max(300).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const recordDeliveryFailureSchema = z.object({
  deliveryId: z.string().uuid(),
  action: z.enum(['failed_attempt', 'returned_to_store']).default('failed_attempt'),
  failureReason: z.string().trim().min(5, 'Descreva o motivo da ocorrência (mín. 5 caracteres).').max(500),
});

export const toggleLocationSharingSchema = z.object({
  enabled: z.boolean(),
});

export const locationPingSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().int().min(0).max(10000).optional().nullable(),
});

