import { z } from 'zod';

// Item enviado pelo frontend para revalidação ou compra
export const CartItemInputSchema = z.object({
  productId: z.string().min(1, 'ID do produto é obrigatório'),
  variantId: z.string().min(1, 'ID da porção/variante é obrigatório'),
  quantity: z.number().int().positive('Quantidade deve ser pelo menos 1').max(99, 'Quantidade máxima de 99 unidades por item'),
  clientPriceInCents: z.number().int().nonnegative().optional(),
});

export type CartItemInput = z.infer<typeof CartItemInputSchema>;

// Schema do endpoint /api/checkout/validate
export const CartValidationInputSchema = z.object({
  items: z.array(CartItemInputSchema).min(1, 'A sacola não pode estar vazia'),
});

export type CartValidationInput = z.infer<typeof CartValidationInputSchema>;

// Dados do Cliente
export const CustomerInfoSchema = z.object({
  name: z.string().trim().min(2, 'Informe seu nome completo (mínimo 2 caracteres)').max(150, 'Nome muito extenso'),
  phone: z
    .string()
    .trim()
    .min(10, 'Informe um telefone/WhatsApp válido com DDD')
    .max(30, 'Telefone inválido')
    .regex(/^[0-9+() \-\.]{10,25}$/, 'Formato de telefone/WhatsApp inválido'),
  email: z
    .string()
    .trim()
    .email('E-mail em formato inválido')
    .max(255)
    .optional()
    .or(z.literal('')),
});

export type CustomerInfo = z.infer<typeof CustomerInfoSchema>;

// Endereço de Entrega
export const OrderAddressSchema = z.object({
  zipCode: z
    .string()
    .trim()
    .regex(/^[0-9]{5}-?[0-9]{3}$/, 'CEP deve ter 8 dígitos (ex: 01310-100)'),
  street: z.string().trim().min(2, 'Rua/Logradouro é obrigatório').max(200),
  number: z.string().trim().min(1, 'Número do endereço é obrigatório').max(30),
  complement: z.string().trim().max(100).optional().or(z.literal('')),
  neighborhood: z.string().trim().min(2, 'Bairro é obrigatório').max(100),
  city: z.string().trim().min(2, 'Cidade é obrigatória').max(100),
  state: z.string().trim().length(2, 'UF deve ter 2 letras').toUpperCase(),
  reference: z.string().trim().max(300).optional().or(z.literal('')),
});

export type OrderAddressInput = z.infer<typeof OrderAddressSchema>;

// Schema do endpoint /api/orders
export const CreateOrderInputSchema = z
  .object({
    items: z.array(CartItemInputSchema).min(1, 'Adicione pelo menos um item ao pedido'),
    customer: CustomerInfoSchema,
    fulfillmentType: z.enum(['delivery', 'pickup'], {
      errorMap: () => ({ message: 'Escolha entre Entrega ou Retirada' }),
    }),
    scheduleType: z.enum(['asap', 'scheduled']).default('asap'),
    scheduledFor: z.string().datetime({ message: 'Data/hora de agendamento em formato ISO inválido' }).optional(),
    address: OrderAddressSchema.optional(),
    notes: z.string().trim().max(500, 'Observações não podem exceder 500 caracteres').optional(),
  })
  .superRefine((data, ctx) => {
    // 1. Se for entrega, o endereço é obrigatório
    if (data.fulfillmentType === 'delivery' && !data.address) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['address'],
        message: 'Endereço completo é obrigatório para entregas',
      });
    }

    // 2. Se for agendado, a data futura é obrigatória
    if (data.scheduleType === 'scheduled') {
      if (!data.scheduledFor) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['scheduledFor'],
          message: 'Data e horário são obrigatórios para pedidos agendados',
        });
      } else {
        const scheduledDate = new Date(data.scheduledFor);
        const now = new Date();
        if (isNaN(scheduledDate.getTime()) || scheduledDate.getTime() < now.getTime() - 60000) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['scheduledFor'],
            message: 'O horário de agendamento não pode estar no passado',
          });
        }
      }
    }
  });

export type CreateOrderInput = z.infer<typeof CreateOrderInputSchema>;

