'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Package,
  AlertTriangle,
  Clock,
  DollarSign,
  PlusCircle,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Layers,
  ArrowDownRight,
  ArrowUpRight,
  ShieldAlert,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import type {
  InventoryBatch,
  RawMaterial,
  InventoryMovement,
  InventoryDashboardKPIs,
} from '@/modules/inventory/inventory.types';

export default function EstoquePage() {
  const [activeTab, setActiveTab] = useState<'batches' | 'raw_materials' | 'movements'>('batches');
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<InventoryDashboardKPIs | null>(null);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [batchTypeFilter, setBatchTypeFilter] = useState<'all' | 'finished_product' | 'raw_material'>('all');

  // Modais
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [receiptType, setReceiptType] = useState<'raw_material' | 'finished_product'>('raw_material');
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [selectedBatchForAdjust, setSelectedBatchForAdjust] = useState<InventoryBatch | null>(null);

  // Form states
  const [receiptForm, setReceiptForm] = useState({
    targetId: '',
    batchCode: '',
    manufactureDate: new Date().toISOString().split('T')[0],
    expirationDate: '',
    quantity: '',
    unitCostCents: '',
    supplierName: '',
    invoiceNumber: '',
    storageLocation: 'freezer_principal',
    notes: '',
  });

  const [adjustForm, setAdjustForm] = useState({
    newQuantity: '',
    reason: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [kpiRes, batchRes, rawRes, movRes] = await Promise.all([
        fetch('/api/admin/inventory/dashboard'),
        fetch('/api/admin/inventory/batches'),
        fetch('/api/admin/inventory/raw-materials'),
        fetch('/api/admin/inventory/movements?limit=50'),
      ]);

      if (kpiRes.ok) {
        const kd = await kpiRes.json();
        setKpis(kd.kpis);
      }
      if (batchRes.ok) {
        const bd = await batchRes.json();
        setBatches(bd.batches || []);
      }
      if (rawRes.ok) {
        const rd = await rawRes.json();
        setRawMaterials(rd.items || []);
      }
      if (movRes.ok) {
        const md = await movRes.json();
        setMovements(md.movements || []);
      }
    } catch (e: any) {
      console.error('Erro ao carregar dados do estoque:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Formata valor em BRL
  const formatBrl = (cents: number) => {
    return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // Filtragem de lotes
  const filteredBatches = batches.filter((b) => {
    if (batchTypeFilter !== 'all' && b.batchType !== batchTypeFilter) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const name = b.batchType === 'finished_product' ? `${b.productName} ${b.variantName}` : b.rawMaterialName;
    return (
      b.batchCode.toLowerCase().includes(q) ||
      (name && name.toLowerCase().includes(q)) ||
      (b.supplierName && b.supplierName.toLowerCase().includes(q))
    );
  });

  // Filtragem de insumos
  const filteredRawMaterials = rawMaterials.filter((rm) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return rm.name.toLowerCase().includes(q) || (rm.sku && rm.sku.toLowerCase().includes(q));
  });

  // Submissão de recebimento
  const handleReceiptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const payload: any = {
        action: receiptType === 'raw_material' ? 'receive_raw_material' : 'receive_finished_product',
        batchCode: receiptForm.batchCode,
        manufactureDate: receiptForm.manufactureDate,
        expirationDate: receiptForm.expirationDate,
        quantity: Number(receiptForm.quantity),
        unitCostCents: Math.round(parseFloat(receiptForm.unitCostCents || '0') * 100),
        supplierName: receiptForm.supplierName,
        invoiceNumber: receiptForm.invoiceNumber,
        storageLocation: receiptForm.storageLocation,
        notes: receiptForm.notes,
      };

      if (receiptType === 'raw_material') {
        payload.rawMaterialId = receiptForm.targetId;
      } else {
        payload.variantId = receiptForm.targetId;
      }

      const res = await fetch('/api/admin/inventory/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao registrar entrada.');
      }

      setActionSuccess('Entrada de estoque registrada com sucesso!');
      setIsReceiptModalOpen(false);
      setReceiptForm({
        targetId: '',
        batchCode: '',
        manufactureDate: new Date().toISOString().split('T')[0],
        expirationDate: '',
        quantity: '',
        unitCostCents: '',
        supplierName: '',
        invoiceNumber: '',
        storageLocation: 'freezer_principal',
        notes: '',
      });
      loadData();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submissão de ajuste manual
  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatchForAdjust) return;

    setIsSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch('/api/admin/inventory/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'adjust_batch',
          batchId: selectedBatchForAdjust.id,
          newQuantity: Number(adjustForm.newQuantity),
          reason: adjustForm.reason,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao ajustar lote.');
      }

      setActionSuccess('Ajuste de lote efetuado com auditoria.');
      setIsAdjustModalOpen(false);
      setSelectedBatchForAdjust(null);
      setAdjustForm({ newQuantity: '', reason: '' });
      loadData();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <Package className="w-7 h-7 text-amber-700" />
            Controle de Estoque & Congelados
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Gestão de embalagens prontas no freezer, insumos, controle de validade FEFO e auditoria imutável.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadData()}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
            title="Atualizar dados"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => {
              setReceiptType('finished_product');
              setIsReceiptModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-amber-700 text-white rounded-lg text-sm font-semibold hover:bg-amber-800 shadow-sm transition"
          >
            <PlusCircle className="w-4 h-4" />
            Entrada de Congelados
          </button>

          <button
            onClick={() => {
              setReceiptType('raw_material');
              setIsReceiptModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-800 shadow-sm transition"
          >
            <PlusCircle className="w-4 h-4" />
            Entrada de Insumo
          </button>
        </div>
      </div>

      {/* Alertas Rápidos de Sucesso / Erro */}
      {actionSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-700 hover:underline text-xs">
            Fechar
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-red-700 hover:underline text-xs">
            Fechar
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Valor em Estoque</span>
            <DollarSign className="w-5 h-5 text-amber-700" />
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {formatBrl(kpis?.totalInventoryValuationCents || 0)}
          </div>
          <p className="text-xs text-gray-500 mt-1">Custo médio total imobilizado</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Lotes Ativos</span>
            <Layers className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {kpis?.activeBatchesCount || 0}
          </div>
          <p className="text-xs text-gray-500 mt-1">Congelados e matérias-primas</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Vencendo em 30 Dias</span>
            <Clock className="w-5 h-5 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-amber-700">
            {kpis?.expiringSoonBatchesCount || 0}
          </div>
          <p className="text-xs text-gray-500 mt-1">Atenção prioritária no FEFO</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Insumos Críticos</span>
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div className="text-2xl font-bold text-red-700">
            {kpis?.lowStockItemsCount || 0}
          </div>
          <p className="text-xs text-gray-500 mt-1">Abaixo do estoque mínimo</p>
        </div>
      </div>

      {/* Tabs and Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-gray-200 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('batches')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              activeTab === 'batches'
                ? 'bg-amber-700 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            Lotes & Congelados ({batches.length})
          </button>
          <button
            onClick={() => setActiveTab('raw_materials')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              activeTab === 'raw_materials'
                ? 'bg-amber-700 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            Insumos & Matérias-Primas ({rawMaterials.length})
          </button>
          <button
            onClick={() => setActiveTab('movements')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              activeTab === 'movements'
                ? 'bg-amber-700 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            Histórico & Auditoria
          </button>
        </div>

        {activeTab === 'batches' && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por lote ou produto..."
                className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-700"
              />
            </div>
            <select
              value={batchTypeFilter}
              onChange={(e) => setBatchTypeFilter(e.target.value as any)}
              className="text-sm border border-gray-200 rounded-lg py-1.5 px-3 focus:outline-none focus:ring-2 focus:ring-amber-700"
            >
              <option value="all">Todos os Tipos</option>
              <option value="finished_product">Congelados Prontos</option>
              <option value="raw_material">Insumos</option>
            </select>
          </div>
        )}
      </div>

      {/* Tab 1: Lotes e Congelados */}
      {activeTab === 'batches' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-xs uppercase font-semibold text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3.5">Código / Tipo</th>
                  <th className="px-6 py-3.5">Item Comercializável / Insumo</th>
                  <th className="px-6 py-3.5">Saldo Físico</th>
                  <th className="px-6 py-3.5">Reservado</th>
                  <th className="px-6 py-3.5">Disponível</th>
                  <th className="px-6 py-3.5">Validade (FEFO)</th>
                  <th className="px-6 py-3.5">Custo Unitário</th>
                  <th className="px-6 py-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredBatches.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-gray-400">
                      Nenhum lote de estoque encontrado.
                    </td>
                  </tr>
                ) : (
                  filteredBatches.map((batch) => {
                    const days = batch.daysToExpiration ?? 999;
                    let expBadgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                    let expText = `${days} dias`;
                    if (days <= 0) {
                      expBadgeClass = 'bg-red-50 text-red-700 border-red-200';
                      expText = 'VENCIDO';
                    } else if (days <= 15) {
                      expBadgeClass = 'bg-amber-50 text-amber-700 border-amber-200 font-bold';
                      expText = `${days} dias (crítico)`;
                    } else if (days <= 30) {
                      expBadgeClass = 'bg-yellow-50 text-yellow-700 border-yellow-200';
                    }

                    return (
                      <tr key={batch.id} className="hover:bg-gray-50/80 transition">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-gray-900">{batch.batchCode}</div>
                          <span
                            className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mt-0.5 ${
                              batch.batchType === 'finished_product'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {batch.batchType === 'finished_product' ? 'Congelado Pronto' : 'Insumo'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">
                            {batch.batchType === 'finished_product'
                              ? `${batch.productName} - ${batch.variantName}`
                              : batch.rawMaterialName}
                          </div>
                          <div className="text-xs text-gray-400">Local: {batch.storageLocation}</div>
                        </td>
                        <td className="px-6 py-4 font-semibold text-gray-900">
                          {batch.currentQuantity} {batch.batchType === 'finished_product' ? 'un' : ''}
                        </td>
                        <td className="px-6 py-4 text-amber-700 font-medium">
                          {batch.reservedQuantity > 0 ? `${batch.reservedQuantity} un` : '—'}
                        </td>
                        <td className="px-6 py-4 font-bold text-emerald-700">
                          {batch.availableQuantity} {batch.batchType === 'finished_product' ? 'un' : ''}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md border ${expBadgeClass}`}
                          >
                            <Calendar className="w-3.5 h-3.5" />
                            {new Date(batch.expirationDate).toLocaleDateString('pt-BR')} ({expText})
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-900 font-medium">
                          {formatBrl(batch.unitCostCents)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => {
                              setSelectedBatchForAdjust(batch);
                              setAdjustForm({
                                newQuantity: String(batch.currentQuantity),
                                reason: '',
                              });
                              setIsAdjustModalOpen(true);
                            }}
                            className="text-xs font-semibold text-amber-700 hover:text-amber-900 hover:underline"
                          >
                            Ajustar / Inventário
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Insumos e Matérias-Primas */}
      {activeTab === 'raw_materials' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-xs uppercase font-semibold text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3.5">Nome do Insumo</th>
                  <th className="px-6 py-3.5">Categoria</th>
                  <th className="px-6 py-3.5">Unidade</th>
                  <th className="px-6 py-3.5">Estoque Atual</th>
                  <th className="px-6 py-3.5">Estoque Mínimo</th>
                  <th className="px-6 py-3.5">Custo Médio Ponderado</th>
                  <th className="px-6 py-3.5">Última Compra</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredRawMaterials.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-400">
                      Nenhum insumo cadastrado.
                    </td>
                  </tr>
                ) : (
                  filteredRawMaterials.map((rm) => {
                    const isBelowMin = rm.minStockLevel > 0 && rm.currentStock <= rm.minStockLevel;

                    return (
                      <tr key={rm.id} className="hover:bg-gray-50/80 transition">
                        <td className="px-6 py-4 font-semibold text-gray-900">
                          {rm.name}
                          {rm.sku && <span className="text-xs text-gray-400 ml-2">SKU: {rm.sku}</span>}
                        </td>
                        <td className="px-6 py-4">
                          <span className="capitalize px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                            {rm.category}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-medium uppercase text-gray-700">
                          {rm.unitOfMeasure}
                        </td>
                        <td className="px-6 py-4 font-bold text-gray-900">
                          <span className={isBelowMin ? 'text-red-700 flex items-center gap-1' : ''}>
                            {rm.currentStock} {rm.unitOfMeasure}
                            {isBelowMin && <AlertTriangle className="w-3.5 h-3.5 text-red-600 inline" />}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-500">
                          {rm.minStockLevel > 0 ? `${rm.minStockLevel} ${rm.unitOfMeasure}` : 'Não definido'}
                        </td>
                        <td className="px-6 py-4 text-gray-900 font-semibold">
                          {formatBrl(rm.averageCostCents)} / {rm.unitOfMeasure}
                        </td>
                        <td className="px-6 py-4 text-gray-500">
                          {rm.lastPurchaseCostCents > 0
                            ? `${formatBrl(rm.lastPurchaseCostCents)} / ${rm.unitOfMeasure}`
                            : '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Movimentações Imutáveis */}
      {activeTab === 'movements' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-xs uppercase font-semibold text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3.5">Data / Hora</th>
                  <th className="px-6 py-3.5">Operação</th>
                  <th className="px-6 py-3.5">Item</th>
                  <th className="px-6 py-3.5">Lote</th>
                  <th className="px-6 py-3.5">Quantidade</th>
                  <th className="px-6 py-3.5">Custo Total</th>
                  <th className="px-6 py-3.5">Motivo / Vínculo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-400">
                      Nenhuma movimentação registrada até o momento.
                    </td>
                  </tr>
                ) : (
                  movements.map((mov) => {
                    const isPositive =
                      mov.movementType === 'purchase_in' ||
                      mov.movementType === 'production_yield_in' ||
                      mov.movementType === 'manual_adjustment_in' ||
                      mov.movementType === 'order_cancelled_return';

                    return (
                      <tr key={mov.id} className="hover:bg-gray-50/80 transition">
                        <td className="px-6 py-4 text-xs text-gray-500 whitespace-nowrap">
                          {new Date(mov.createdAt).toLocaleString('pt-BR')}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              isPositive
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-red-50 text-red-800 border border-red-200'
                            }`}
                          >
                            {isPositive ? (
                              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <ArrowDownRight className="w-3.5 h-3.5 text-red-600" />
                            )}
                            {mov.movementType}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-semibold text-gray-900">{mov.itemName}</td>
                        <td className="px-6 py-4 font-mono text-xs text-gray-600">
                          {mov.batchCode || '—'}
                        </td>
                        <td
                          className={`px-6 py-4 font-bold ${
                            isPositive ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {isPositive ? '+' : '-'}
                          {mov.quantity}
                        </td>
                        <td className="px-6 py-4 font-medium text-gray-900">
                          {formatBrl(mov.totalCostCents)}
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-500 max-w-xs truncate">
                          {mov.reason || (mov.orderNumber ? `Pedido ${mov.orderNumber}` : '—')}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Entrada de Estoque (Insumos ou Congelados) */}
      {isReceiptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-lg overflow-hidden animate-in fade-in">
            <div className="p-6 border-b border-gray-100 bg-amber-50/50">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-amber-700" />
                {receiptType === 'finished_product'
                  ? 'Entrada de Congelados Prontos (Embalagens)'
                  : 'Entrada de Insumo / Matéria-Prima'}
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Gera novo lote no freezer com rastreabilidade, custo unitário e data de validade ANVISA.
              </p>
            </div>

            <form onSubmit={handleReceiptSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {receiptType === 'finished_product' ? 'Produto / Variante Comercializável' : 'Insumo'} *
                </label>
                {receiptType === 'raw_material' ? (
                  <select
                    required
                    value={receiptForm.targetId}
                    onChange={(e) => setReceiptForm({ ...receiptForm, targetId: e.target.value })}
                    className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-700"
                  >
                    <option value="">Selecione o insumo...</option>
                    {rawMaterials.map((rm) => (
                      <option key={rm.id} value={rm.id}>
                        {rm.name} ({rm.unitOfMeasure})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    required
                    placeholder="ID da variante comercializável (ex: Feijoada 500g)"
                    value={receiptForm.targetId}
                    onChange={(e) => setReceiptForm({ ...receiptForm, targetId: e.target.value })}
                    className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-700"
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Código do Lote *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: L202611-FEIJ01"
                    value={receiptForm.batchCode}
                    onChange={(e) => setReceiptForm({ ...receiptForm, batchCode: e.target.value })}
                    className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Quantidade *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    min="0.0001"
                    placeholder="Ex: 50"
                    value={receiptForm.quantity}
                    onChange={(e) => setReceiptForm({ ...receiptForm, quantity: e.target.value })}
                    className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Data de Fabricação *</label>
                  <input
                    type="date"
                    required
                    value={receiptForm.manufactureDate}
                    onChange={(e) => setReceiptForm({ ...receiptForm, manufactureDate: e.target.value })}
                    className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Data de Validade *</label>
                  <input
                    type="date"
                    required
                    value={receiptForm.expirationDate}
                    onChange={(e) => setReceiptForm({ ...receiptForm, expirationDate: e.target.value })}
                    className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Custo Unitário (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Ex: 12.50"
                    value={receiptForm.unitCostCents}
                    onChange={(e) => setReceiptForm({ ...receiptForm, unitCostCents: e.target.value })}
                    className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Fornecedor / Origem</label>
                  <input
                    type="text"
                    placeholder="Ex: Frigorífico Central"
                    value={receiptForm.supplierName}
                    onChange={(e) => setReceiptForm({ ...receiptForm, supplierName: e.target.value })}
                    className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-700"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsReceiptModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-sm font-semibold bg-amber-700 text-white rounded-lg hover:bg-amber-800 disabled:opacity-50"
                >
                  {isSubmitting ? 'Salvando...' : 'Confirmar Entrada'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Ajuste Manual de Lote (Auditoria) */}
      {isAdjustModalOpen && selectedBatchForAdjust && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-gray-100 bg-red-50/50">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-red-600" />
                Ajuste Manual de Lote (Auditoria)
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Lote: <strong className="text-gray-900">{selectedBatchForAdjust.batchCode}</strong>
              </p>
            </div>

            <form onSubmit={handleAdjustSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Quantidade Atual em Estoque
                </label>
                <input
                  type="text"
                  disabled
                  value={`${selectedBatchForAdjust.currentQuantity} (Reservado: ${selectedBatchForAdjust.reservedQuantity})`}
                  className="w-full text-sm bg-gray-100 border border-gray-200 rounded-lg p-2.5 text-gray-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Nova Quantidade Real *</label>
                <input
                  type="number"
                  step="any"
                  required
                  min={selectedBatchForAdjust.reservedQuantity}
                  value={adjustForm.newQuantity}
                  onChange={(e) => setAdjustForm({ ...adjustForm, newQuantity: e.target.value })}
                  className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-700"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Não pode ser menor que o saldo já reservado por pedidos ativos ({selectedBatchForAdjust.reservedQuantity}).
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Motivo do Ajuste * (Obrigatório)</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Ex: Avaria em embalagem, recontagem de inventário físico, quebra..."
                  value={adjustForm.reason}
                  onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                  className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-700"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsAdjustModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {isSubmitting ? 'Gravando...' : 'Gravar Ajuste Auditado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

