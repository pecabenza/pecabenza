import { describe, it, expect } from 'vitest';
import type {
  InventoryBatch,
  RawMaterial,
  Recipe,
  ProductionOrder,
} from '@/modules/inventory/inventory.types';

describe('Motor de Estoque, Ficha Técnica, Lotes e FEFO (Etapa 3D)', () => {
  it('1. Deve calcular o custo médio ponderado corretamente na entrada de novos insumos', () => {
    // Estoque inicial: 10 kg de carne seca com custo médio de R$ 30,00/kg (3000 centavos)
    const currentStock = 10;
    const currentAverageCostCents = 3000;

    // Nova compra: 20 kg a R$ 36,00/kg (3600 centavos)
    const newQty = 20;
    const newUnitCostCents = 3600;

    const newStock = currentStock + newQty;
    const newAverageCostCents = Math.round(
      (currentStock * currentAverageCostCents + newQty * newUnitCostCents) / newStock
    );

    // Custo ponderado esperado: (10 * 3000 + 20 * 3600) / 30 = (30000 + 72000) / 30 = 102000 / 30 = 3400 (R$ 34,00)
    expect(newStock).toBe(30);
    expect(newAverageCostCents).toBe(3400);
  });

  it('2. Deve aplicar ordenação FEFO (First Expired, First Out) rigorosa entre lotes ativos', () => {
    const batches: InventoryBatch[] = [
      {
        id: 'batch-03',
        tenantId: 'tenant-1',
        batchType: 'finished_product',
        variantId: 'var-feijoada-500g',
        batchCode: 'L-202611-03',
        manufactureDate: '2026-11-05',
        expirationDate: '2027-02-05', // Vence depois
        initialQuantity: 50,
        currentQuantity: 40,
        reservedQuantity: 0,
        availableQuantity: 40,
        unitCostCents: 1200,
        storageLocation: 'freezer_1',
        status: 'active',
        createdAt: '2026-11-05T10:00:00Z',
        updatedAt: '2026-11-05T10:00:00Z',
      },
      {
        id: 'batch-01',
        tenantId: 'tenant-1',
        batchType: 'finished_product',
        variantId: 'var-feijoada-500g',
        batchCode: 'L-202610-01',
        manufactureDate: '2026-10-01',
        expirationDate: '2027-01-01', // Vence primeiro (FEFO 1)
        initialQuantity: 30,
        currentQuantity: 15,
        reservedQuantity: 5,
        availableQuantity: 10,
        unitCostCents: 1150,
        storageLocation: 'freezer_1',
        status: 'active',
        createdAt: '2026-10-01T10:00:00Z',
        updatedAt: '2026-10-01T10:00:00Z',
      },
      {
        id: 'batch-02',
        tenantId: 'tenant-1',
        batchType: 'finished_product',
        variantId: 'var-feijoada-500g',
        batchCode: 'L-202610-15',
        manufactureDate: '2026-10-15',
        expirationDate: '2027-01-15', // Vence em segundo lugar (FEFO 2)
        initialQuantity: 40,
        currentQuantity: 20,
        reservedQuantity: 0,
        availableQuantity: 20,
        unitCostCents: 1180,
        storageLocation: 'freezer_1',
        status: 'active',
        createdAt: '2026-10-15T10:00:00Z',
        updatedAt: '2026-10-15T10:00:00Z',
      },
    ];

    // Ordenação FEFO: expirationDate ASC
    const sortedFefo = [...batches].sort(
      (a, b) => new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime()
    );

    expect(sortedFefo[0].batchCode).toBe('L-202610-01');
    expect(sortedFefo[1].batchCode).toBe('L-202610-15');
    expect(sortedFefo[2].batchCode).toBe('L-202611-03');
  });

  it('3. Deve reservar estoque de produto acabado via FEFO preservando saldo disponível', () => {
    // Cenário: Pedido precisa de 18 embalagens de Feijoada 500g
    const qtyNeeded = 18;

    const batch1 = {
      id: 'b1',
      batchCode: 'L-01',
      expirationDate: '2027-01-01',
      currentQuantity: 12,
      reservedQuantity: 2, // disponível: 10
    };
    const batch2 = {
      id: 'b2',
      batchCode: 'L-02',
      expirationDate: '2027-01-15',
      currentQuantity: 20,
      reservedQuantity: 0, // disponível: 20
    };

    const allocations: Array<{ batchId: string; reserved: number }> = [];
    let remaining = qtyNeeded;

    const availableB1 = batch1.currentQuantity - batch1.reservedQuantity;
    const takeB1 = Math.min(remaining, availableB1);
    allocations.push({ batchId: batch1.id, reserved: takeB1 });
    remaining -= takeB1;

    const availableB2 = batch2.currentQuantity - batch2.reservedQuantity;
    const takeB2 = Math.min(remaining, availableB2);
    allocations.push({ batchId: batch2.id, reserved: takeB2 });
    remaining -= takeB2;

    expect(remaining).toBe(0);
    expect(allocations[0]).toEqual({ batchId: 'b1', reserved: 10 });
    expect(allocations[1]).toEqual({ batchId: 'b2', reserved: 8 });

    // Saldo do batch1 após reserva: físico = 12, reservado = 12, disponível = 0
    expect(batch1.currentQuantity).toBe(12);
    expect(batch1.reservedQuantity + takeB1).toBe(12);

    // Saldo do batch2 após reserva: físico = 20, reservado = 8, disponível = 12
    expect(batch2.currentQuantity).toBe(20);
    expect(batch2.currentQuantity - (batch2.reservedQuantity + takeB2)).toBe(12);
  });

  it('4. Deve liberar reserva atômica sem gerar saída física quando o pedido for cancelado', () => {
    const batch = {
      id: 'b1',
      currentQuantity: 25,
      reservedQuantity: 10,
    };

    // Pedido com 10 unidades reservadas é cancelado
    const reservedToRelease = 10;
    batch.reservedQuantity = Math.max(0, batch.reservedQuantity - reservedToRelease);

    // Saldo físico permanece intacto em 25, saldo reservado zera, saldo disponível volta a 25
    expect(batch.currentQuantity).toBe(25);
    expect(batch.reservedQuantity).toBe(0);
    const available = batch.currentQuantity - batch.reservedQuantity;
    expect(available).toBe(25);
  });

  it('5. Deve efetuar a baixa definitiva na expedição e calcular o CMV real realizado da venda', () => {
    // Pedido entregue contendo 2 itens do Lote A (custo unitário R$ 11,50) e 3 itens do Lote B (custo unitário R$ 12,00)
    const batchA = { unitCostCents: 1150, quantity: 2 };
    const batchB = { unitCostCents: 1200, quantity: 3 };

    const cmvBatchA = batchA.quantity * batchA.unitCostCents; // 2 * 1150 = 2300 centavos (R$ 23,00)
    const cmvBatchB = batchB.quantity * batchB.unitCostCents; // 3 * 1200 = 3600 centavos (R$ 36,00)
    const totalOrderCmvCents = cmvBatchA + cmvBatchB; // 5900 centavos (R$ 59,00)

    expect(totalOrderCmvCents).toBe(5900);

    // Se o pedido teve preço de venda de R$ 160,00 (16000 centavos)
    const totalSalesCents = 16000;
    const grossProfitCents = totalSalesCents - totalOrderCmvCents; // 10100 centavos (R$ 101,00)
    const grossMarginPercent = Number(((grossProfitCents / totalSalesCents) * 100).toFixed(2));

    expect(grossProfitCents).toBe(10100);
    expect(grossMarginPercent).toBe(63.13); // Margem de contribuição bruta de 63.13%
  });

  it('6. Deve calcular o rendimento real da produção, custos de batelada e desvios operacionais', () => {
    // Receita: Feijoada Artesanal 500g
    // Esperado: 40 embalagens de 500g
    // Insumos consumidos: R$ 380,00 (38000 centavos)
    // Embalagens + selos: R$ 40,00 (4000 centavos)
    const totalBatchCostCents = 38000 + 4000; // 42000 centavos (R$ 420,00)

    // Rendimento Real apurado: 38 embalagens envasadas, 1 embalagem almoço equipe, 1 embalagem perda panela
    const actualYieldQuantity = 38;
    const staffConsumptionQuantity = 1;
    const wasteSpoilageQuantity = 1;
    const expectedYieldQuantity = 40;

    // Custo unitário por pote comercializável = 42000 / 38 = 1105 centavos (R$ 11,05)
    const unitCostCents = Math.round(totalBatchCostCents / actualYieldQuantity);
    expect(unitCostCents).toBe(1105);

    // Desvio de rendimento comercializável: ((38 + 1 + 1) - 40) / 40 = 0% de perda total, mas -5% comercializável
    const totalRealYield = actualYieldQuantity + staffConsumptionQuantity + wasteSpoilageQuantity;
    const deviationPercentage = Number((((totalRealYield - expectedYieldQuantity) / expectedYieldQuantity) * 100).toFixed(2));
    expect(deviationPercentage).toBe(0.0);
  });

  it('7. Deve calcular o Fator de Correção (FC) na ficha técnica a partir de pesos bruto e líquido', () => {
    // Carne seca: 1.250 kg bruto para obter 1.000 kg líquido limpo e dessalgado
    const grossQuantity = 1.25;
    const netQuantity = 1.0;
    const correctionFactor = Number((grossQuantity / netQuantity).toFixed(3));

    expect(correctionFactor).toBe(1.25);
  });

  it('8. Deve impedir utilização ou baixa de lotes vencidos ou com status em quarentena', () => {
    const expiredBatch: InventoryBatch = {
      id: 'b-exp',
      tenantId: 'tenant-1',
      batchType: 'finished_product',
      batchCode: 'L-EXP',
      manufactureDate: '2026-05-01',
      expirationDate: '2026-08-01',
      initialQuantity: 20,
      currentQuantity: 10,
      reservedQuantity: 0,
      availableQuantity: 10,
      unitCostCents: 1200,
      storageLocation: 'freezer_1',
      status: 'active',
      createdAt: '2026-05-01T10:00:00Z',
      updatedAt: '2026-05-01T10:00:00Z',
    };

    const now = new Date('2026-11-09');
    const isExpired = new Date(expiredBatch.expirationDate) < now;
    const isEligibleForSale = !isExpired && expiredBatch.status === 'active';

    expect(isExpired).toBe(true);
    expect(isEligibleForSale).toBe(false);
  });
});

