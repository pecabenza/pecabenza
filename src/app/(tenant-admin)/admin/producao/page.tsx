'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ClipboardList,
  Flame,
  PlusCircle,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ChefHat,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Package,
} from 'lucide-react';
import type {
  Recipe,
  ProductionOrder,
  RawMaterial,
} from '@/modules/inventory/inventory.types';

export default function ProducaoPage() {
  const [activeTab, setActiveTab] = useState<'orders' | 'recipes'>('orders');
  const [loading, setLoading] = useState(true);
  const [productionOrders, setProductionOrders] = useState<ProductionOrder[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);

  // Modais
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [selectedOrderForComplete, setSelectedOrderForComplete] = useState<ProductionOrder | null>(null);
  const [isNewRecipeModalOpen, setIsNewRecipeModalOpen] = useState(false);

  // Formulário Nova Ordem
  const [orderForm, setOrderForm] = useState({
    recipeId: '',
    orderCode: 'OP-001',
    plannedMultiplier: '1.0',
    notes: '',
  });

  // Formulário Conclusão Ordem
  const [completeForm, setCompleteForm] = useState({
    actualYieldQuantity: '',
    batchCode: '',
    staffConsumptionQuantity: '0',
    wasteSpoilageQuantity: '0',
    deviationReason: '',
    storageLocation: 'freezer_principal',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ordRes, recRes, rawRes] = await Promise.all([
        fetch('/api/admin/inventory/production'),
        fetch('/api/admin/inventory/recipes'),
        fetch('/api/admin/inventory/raw-materials'),
      ]);

      if (ordRes.ok) {
        const od = await ordRes.json();
        setProductionOrders(od.orders || []);
      }
      if (recRes.ok) {
        const rd = await recRes.json();
        setRecipes(rd.recipes || []);
      }
      if (rawRes.ok) {
        const rmd = await rawRes.json();
        setRawMaterials(rmd.items || []);
      }
    } catch (e: any) {
      console.error('Erro ao carregar dados de produção:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatBrl = (cents: number) => {
    return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const handleCreateOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch('/api/admin/inventory/production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          recipeId: orderForm.recipeId,
          orderCode: orderForm.orderCode,
          plannedMultiplier: Number(orderForm.plannedMultiplier),
          notes: orderForm.notes,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao abrir ordem de produção.');

      setActionSuccess(`Ordem de produção ${orderForm.orderCode} iniciada com sucesso!`);
      setIsNewOrderModalOpen(false);
      setOrderForm({
        recipeId: '',
        orderCode: `OP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 900 + 100)}`,
        plannedMultiplier: '1.0',
        notes: '',
      });
      loadData();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderForComplete) return;

    setIsSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch('/api/admin/inventory/production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'complete',
          productionOrderId: selectedOrderForComplete.id,
          actualYieldQuantity: Number(completeForm.actualYieldQuantity),
          batchCode: completeForm.batchCode,
          staffConsumptionQuantity: Number(completeForm.staffConsumptionQuantity || 0),
          wasteSpoilageQuantity: Number(completeForm.wasteSpoilageQuantity || 0),
          deviationReason: completeForm.deviationReason,
          storageLocation: completeForm.storageLocation,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao concluir produção.');

      setActionSuccess(`Batelada concluída! ${completeForm.actualYieldQuantity} embalagens adicionadas ao freezer (Lote ${completeForm.batchCode}).`);
      setIsCompleteModalOpen(false);
      setSelectedOrderForComplete(null);
      setCompleteForm({
        actualYieldQuantity: '',
        batchCode: '',
        staffConsumptionQuantity: '0',
        wasteSpoilageQuantity: '0',
        deviationReason: '',
        storageLocation: 'freezer_principal',
      });
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
            <ClipboardList className="w-7 h-7 text-amber-700" />
            Fichas Técnicas & Ordens de Produção
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Controle de bateladas, rendimento real vs teórico, consumo de equipe e rastreabilidade total de lotes.
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
            onClick={() => setIsNewOrderModalOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-amber-700 text-white rounded-lg text-sm font-semibold hover:bg-amber-800 shadow-sm transition"
          >
            <PlusCircle className="w-4 h-4" />
            Iniciar Ordem de Produção
          </button>
        </div>
      </div>

      {/* Alertas */}
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

      {/* Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
            activeTab === 'orders'
              ? 'bg-amber-700 text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          Ordens de Produção ({productionOrders.length})
        </button>
        <button
          onClick={() => setActiveTab('recipes')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
            activeTab === 'recipes'
              ? 'bg-amber-700 text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          Fichas Técnicas / Receitas ({recipes.length})
        </button>
      </div>

      {/* Tab 1: Ordens de Produção */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          {productionOrders.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-xl border border-gray-200 text-gray-400">
              Nenhuma ordem de produção registrada. Clique em &quot;Iniciar Ordem de Produção&quot; para abrir uma batelada.
            </div>
          ) : (
            productionOrders.map((order) => {
              const isCompleted = order.status === 'completed';

              return (
                <div
                  key={order.id}
                  className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow transition"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-bold text-gray-900 px-2.5 py-1 bg-gray-100 rounded-md">
                        {order.orderCode}
                      </span>
                      <h3 className="font-bold text-gray-900 text-base">{order.recipeName}</h3>
                      <span
                        className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                          isCompleted
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {isCompleted ? 'Concluída' : 'Em Preparo'}
                      </span>
                    </div>

                    {!isCompleted && (
                      <button
                        onClick={() => {
                          setSelectedOrderForComplete(order);
                          setCompleteForm({
                            actualYieldQuantity: String(order.expectedYieldQuantity),
                            batchCode: `L-${order.orderCode}`,
                            staffConsumptionQuantity: '0',
                            wasteSpoilageQuantity: '0',
                            deviationReason: '',
                            storageLocation: 'freezer_principal',
                          });
                          setIsCompleteModalOpen(true);
                        }}
                        className="px-3.5 py-1.5 bg-emerald-700 text-white rounded-lg text-xs font-semibold hover:bg-emerald-800 transition"
                      >
                        Apontar Rendimento Real
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 text-xs text-gray-600">
                    <div>
                      <span className="text-gray-400 block mb-0.5">Rendimento Esperado:</span>
                      <span className="font-bold text-gray-900 text-sm">
                        {order.expectedYieldQuantity} embalagens ({order.plannedMultiplier}x receita)
                      </span>
                    </div>

                    <div>
                      <span className="text-gray-400 block mb-0.5">Rendimento Real Envasado:</span>
                      <span className="font-bold text-emerald-700 text-sm">
                        {order.actualYieldQuantity !== null ? `${order.actualYieldQuantity} embalagens` : 'Pendente'}
                      </span>
                    </div>

                    <div>
                      <span className="text-gray-400 block mb-0.5">Custo Efetivo Unitário:</span>
                      <span className="font-bold text-gray-900 text-sm">
                        {order.unitCostCents > 0 ? formatBrl(order.unitCostCents) : 'A calcular'}
                      </span>
                    </div>

                    <div>
                      <span className="text-gray-400 block mb-0.5">Lote Gerado no Freezer:</span>
                      <span className="font-mono font-semibold text-gray-800 text-sm">
                        {order.generatedBatchCode || '—'}
                      </span>
                    </div>
                  </div>

                  {isCompleted && (
                    <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between text-xs text-gray-500 gap-2">
                      <div className="flex items-center gap-4">
                        <span>
                          Consumo da Equipe:{' '}
                          <strong className="text-gray-900">{order.staffConsumptionQuantity} un</strong>
                        </span>
                        <span>
                          Perda / Raspagem:{' '}
                          <strong className="text-gray-900">{order.wasteSpoilageQuantity} un</strong>
                        </span>
                        {order.yieldDeviationPercentage !== null && order.yieldDeviationPercentage !== undefined && (
                          <span
                            className={`font-semibold ${
                              order.yieldDeviationPercentage >= 0 ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            Desvio:{' '}
                            {order.yieldDeviationPercentage > 0
                              ? `+${order.yieldDeviationPercentage}%`
                              : `${order.yieldDeviationPercentage}%`}
                          </span>
                        )}
                      </div>

                      {order.inputs && order.inputs.length > 0 && (
                        <div className="text-[11px] text-gray-400">
                          Rastreabilidade: {order.inputs.length} lotes de insumos vinculados
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Tab 2: Fichas Técnicas */}
      {activeTab === 'recipes' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {recipes.length === 0 ? (
            <div className="col-span-2 bg-white p-12 text-center rounded-xl border border-gray-200 text-gray-400">
              Nenhuma ficha técnica cadastrada.
            </div>
          ) : (
            recipes.map((recipe) => (
              <div key={recipe.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <div className="flex items-start justify-between border-b border-gray-100 pb-3">
                  <div>
                    <h3 className="font-bold text-gray-900 text-base">{recipe.name}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Rendimento Base: <strong>{recipe.expectedYieldQuantity} {recipe.yieldUnit}</strong> | Validade:{' '}
                      <strong>{recipe.shelfLifeDays} dias</strong> a -18°C
                    </p>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 bg-gray-100 text-gray-700 rounded">
                    v{recipe.version}
                  </span>
                </div>

                <div className="mt-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                    Ingredientes da Ficha (BOM):
                  </h4>
                  <div className="space-y-1.5">
                    {(recipe.items || []).map((it) => (
                      <div
                        key={it.id}
                        className="flex items-center justify-between text-xs py-1 border-b border-gray-50"
                      >
                        <span className="font-medium text-gray-800">{it.rawMaterialName}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-gray-500">
                            Bruto: {it.grossQuantity} {it.unitOfMeasure} (FC {it.correctionFactor})
                          </span>
                          <span className="font-semibold text-gray-900">
                            {formatBrl(it.itemTotalCostCents || 0)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                  <span className="text-gray-500">CMV Teórico por Embalagem:</span>
                  <span className="font-bold text-sm text-amber-700">
                    {formatBrl(recipe.theoreticalUnitCostCents || 0)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Modal Iniciar Ordem de Produção */}
      {isNewOrderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-gray-100 bg-amber-50/50">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <ChefHat className="w-5 h-5 text-amber-700" />
                Iniciar Ordem de Produção
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Abre uma nova batelada na cozinha baseada na ficha técnica da BENZA.
              </p>
            </div>

            <form onSubmit={handleCreateOrderSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Ficha Técnica *</label>
                <select
                  required
                  value={orderForm.recipeId}
                  onChange={(e) => setOrderForm({ ...orderForm, recipeId: e.target.value })}
                  className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-700"
                >
                  <option value="">Selecione a receita...</option>
                  {recipes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} (Rende {r.expectedYieldQuantity} {r.yieldUnit})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Código da OP *</label>
                  <input
                    type="text"
                    required
                    value={orderForm.orderCode}
                    onChange={(e) => setOrderForm({ ...orderForm, orderCode: e.target.value })}
                    className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Multiplicador da Receita *</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    required
                    value={orderForm.plannedMultiplier}
                    onChange={(e) => setOrderForm({ ...orderForm, plannedMultiplier: e.target.value })}
                    className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-700"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Observações de Produção</label>
                <textarea
                  rows={2}
                  placeholder="Ex: Utilizar panela industrial #2..."
                  value={orderForm.notes}
                  onChange={(e) => setOrderForm({ ...orderForm, notes: e.target.value })}
                  className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-700"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsNewOrderModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-sm font-semibold bg-amber-700 text-white rounded-lg hover:bg-amber-800 disabled:opacity-50"
                >
                  {isSubmitting ? 'Iniciando...' : 'Iniciar Preparo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Apontamento de Conclusão */}
      {isCompleteModalOpen && selectedOrderForComplete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-lg overflow-hidden">
            <div className="p-6 border-b border-gray-100 bg-emerald-50/50">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-700" />
                Concluir Produção & Envasar Congelados
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                OP: <strong className="text-gray-900">{selectedOrderForComplete.orderCode}</strong> | Esperado:{' '}
                {selectedOrderForComplete.expectedYieldQuantity} embalagens
              </p>
            </div>

            <form onSubmit={handleCompleteOrderSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Rendimento Real Envasado (Potes) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    min="0.001"
                    placeholder="Ex: 46"
                    value={completeForm.actualYieldQuantity}
                    onChange={(e) => setCompleteForm({ ...completeForm, actualYieldQuantity: e.target.value })}
                    className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Código do Lote Gerado *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: L202611-FEIJ01"
                    value={completeForm.batchCode}
                    onChange={(e) => setCompleteForm({ ...completeForm, batchCode: e.target.value })}
                    className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Consumo da Equipe (Almoço/Degustação)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="Ex: 1"
                    value={completeForm.staffConsumptionQuantity}
                    onChange={(e) => setCompleteForm({ ...completeForm, staffConsumptionQuantity: e.target.value })}
                    className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Desperdício / Perda de Raspagem
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="Ex: 0.5"
                    value={completeForm.wasteSpoilageQuantity}
                    onChange={(e) => setCompleteForm({ ...completeForm, wasteSpoilageQuantity: e.target.value })}
                    className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-700"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Justificativa de Desvio (se houver)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Rendimento 2 potes menor devido à redução extra no cozimento"
                  value={completeForm.deviationReason}
                  onChange={(e) => setCompleteForm({ ...completeForm, deviationReason: e.target.value })}
                  className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-amber-700"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsCompleteModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-sm font-semibold bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 disabled:opacity-50"
                >
                  {isSubmitting ? 'Finalizando...' : 'Concluir e Enviar ao Freezer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

