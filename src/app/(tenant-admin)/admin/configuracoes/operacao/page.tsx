'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  ChefHat,
  Plus,
  Save,
  Trash2,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  CheckCircle2,
  AlertOctagon,
  Layers,
  Flame,
} from 'lucide-react';
import type {
  ProductionStation,
  ProductionStationType,
  ProductProductionStep,
} from '@/types/database.types';

const STATION_TYPE_LABELS: Record<ProductionStationType, string> = {
  kitchen: 'Cozinha Quente / Fogão',
  grill: 'Chapa / Grelha',
  oven: 'Forno',
  assembly: 'Montagem / Embalagem',
  drinks: 'Bebidas / Bar',
  dessert: 'Sobremesas / Confeitaria',
  expedition: 'Expedição / Conferência Final',
  custom: 'Setor Customizado',
};

interface EditableStep {
  station_id: string;
  estimated_duration_seconds: number;
  capacity_weight: number;
  is_active: boolean;
}

export default function OperationalSettingsPage() {
  const [stations, setStations] = useState<ProductionStation[]>([]);
  const [products, setProducts] = useState<
    Array<{ id: string; name: string; slug: string; status: string }>
  >([]);
  const [variants, setVariants] = useState<
    Array<{ id: string; product_id: string; name: string; sku: string | null }>
  >([]);
  const [productSteps, setProductSteps] = useState<ProductProductionStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Estado do formulário de Estação
  const [editingStationId, setEditingStationId] = useState<string | undefined>(
    undefined
  );
  const [stName, setStName] = useState('');
  const [stSlug, setStSlug] = useState('');
  const [stDescription, setStDescription] = useState('');
  const [stType, setStType] = useState<ProductionStationType>('kitchen');
  const [stOrder, setStOrder] = useState(1);
  const [stCapacity, setStCapacity] = useState(4);
  const [stDurationSec, setStDurationSec] = useState(600);
  const [stActive, setStActive] = useState(true);

  // Estado do configurador de Fluxo por Produto/Variante
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');
  const [draftSteps, setDraftSteps] = useState<EditableStep[]>([]);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/operations/config', {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Falha ao carregar configurações operacionais.');
      const data = await res.json();
      setStations(data.stations || []);
      setProducts(data.products || []);
      setVariants(data.variants || []);
      setProductSteps(data.productSteps || []);

      if (!selectedProductId && data.products?.length > 0) {
        setSelectedProductId(data.products[0].id);
      }
    } catch (e: any) {
      setFeedback({
        type: 'error',
        message: e.message || 'Erro ao carregar dados.',
      });
    } finally {
      setLoading(false);
    }
  }, [selectedProductId]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Atualiza rascunho de etapas quando o produto ou variante selecionada muda
  useEffect(() => {
    if (!selectedProductId) {
      setDraftSteps([]);
      return;
    }

    const matching = productSteps
      .filter(
        (s) =>
          s.product_id === selectedProductId &&
          (selectedVariantId
            ? s.variant_id === selectedVariantId
            : !s.variant_id)
      )
      .sort((a, b) => a.step_order - b.step_order);

    setDraftSteps(
      matching.map((m) => ({
        station_id: m.station_id,
        estimated_duration_seconds: m.estimated_duration_seconds,
        capacity_weight: m.capacity_weight || 1,
        is_active: m.is_active,
      }))
    );
  }, [selectedProductId, selectedVariantId, productSteps]);

  const productVariants = useMemo(
    () => variants.filter((v) => v.product_id === selectedProductId),
    [variants, selectedProductId]
  );

  const slugify = (val: string) =>
    val
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  const handleSelectStationForEdit = (st: ProductionStation) => {
    setEditingStationId(st.id);
    setStName(st.name);
    setStSlug(st.slug);
    setStDescription(st.description || '');
    setStType(st.station_type);
    setStOrder(st.display_order);
    setStCapacity(st.default_capacity);
    setStDurationSec(st.default_duration_seconds);
    setStActive(st.is_active);
  };

  const resetStationForm = () => {
    setEditingStationId(undefined);
    setStName('');
    setStSlug('');
    setStDescription('');
    setStType('kitchen');
    setStOrder(stations.length + 1);
    setStCapacity(4);
    setStDurationSec(600);
    setStActive(true);
  };

  const handleSaveStation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/operations/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'save_station',
          id: editingStationId,
          name: stName,
          slug: stSlug || slugify(stName),
          description: stDescription || null,
          station_type: stType,
          display_order: Number(stOrder),
          default_capacity: Number(stCapacity),
          default_duration_seconds: Number(stDurationSec),
          is_active: stActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar estação.');

      setFeedback({
        type: 'success',
        message: `Estação "${data.station.name}" salva com sucesso.`,
      });
      resetStationForm();
      await loadConfig();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleAddDraftStep = () => {
    const firstActive = stations.find((s) => s.is_active) || stations[0];
    if (!firstActive) return;
    setDraftSteps((prev) => [
      ...prev,
      {
        station_id: firstActive.id,
        estimated_duration_seconds: firstActive.default_duration_seconds || 300,
        capacity_weight: 1,
        is_active: true,
      },
    ]);
  };

  const handleMoveDraftStep = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draftSteps.length) return;
    const copy = [...draftSteps];
    const [moved] = copy.splice(index, 1);
    copy.splice(target, 0, moved);
    setDraftSteps(copy);
  };

  const handleRemoveDraftStep = (index: number) => {
    setDraftSteps((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSaveProductFlow = async () => {
    if (!selectedProductId) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/operations/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'save_product_flow',
          productId: selectedProductId,
          variantId: selectedVariantId || null,
          steps: draftSteps,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar fluxo.');

      setFeedback({
        type: 'success',
        message: 'Fluxo sequencial de produção salvo com sucesso.',
      });
      await loadConfig();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-stone-200 shadow-xs">
        <div>
          <h1 className="font-heading text-2xl font-black text-stone-950 flex items-center gap-2.5">
            <ChefHat className="w-7 h-7 text-amber-600" />
            <span>Estações de Produção & Fluxo Sequencial</span>
          </h1>
          <p className="text-sm text-stone-600 mt-1">
            Configure estações de cozinha, capacidades simultâneas e roteamento sequencial de etapas por produto ou variante.
          </p>
        </div>

        <Link
          href="/admin/kds"
          className="px-4 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-black uppercase tracking-wide flex items-center gap-2 self-start sm:self-auto"
        >
          <Flame className="w-4 h-4 text-amber-400" />
          <span>Ir para o KDS</span>
        </Link>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl border text-xs font-bold flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-red-50 border-red-300 text-red-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertOctagon className="w-4 h-4 text-red-600" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="underline font-black"
          >
            Fechar
          </button>
        </div>
      )}

      {/* SEÇÃO 1: ESTAÇÕES DE PRODUÇÃO */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-stone-200 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-lg font-black text-stone-950">
              1. Estações Cadastradas ({stations.length})
            </h2>
            {editingStationId && (
              <button
                type="button"
                onClick={resetStationForm}
                className="text-xs font-bold text-amber-700 hover:underline"
              >
                + Nova Estação
              </button>
            )}
          </div>

          {loading ? (
            <div className="py-8 text-center text-xs text-stone-500">
              Carregando estações...
            </div>
          ) : stations.length === 0 ? (
            <div className="py-8 text-center text-xs text-stone-500">
              Nenhuma estação configurada. O KDS usará 1 etapa padrão automática.
            </div>
          ) : (
            <div className="space-y-3">
              {stations.map((st) => (
                <div
                  key={st.id}
                  className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    st.is_active
                      ? 'bg-stone-50 border-stone-200'
                      : 'bg-stone-100/60 border-stone-200 opacity-60'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black px-2 py-0.5 rounded bg-stone-900 text-amber-400">
                        #{st.display_order}
                      </span>
                      <span className="font-heading font-black text-base text-stone-950">
                        {st.name}
                      </span>
                      <span className="text-xs font-semibold text-stone-500">
                        ({STATION_TYPE_LABELS[st.station_type] || st.station_type})
                      </span>
                      {!st.is_active && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-800">
                          Inativa
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-stone-600 mt-1">
                      Capacidade simultânea: <strong>{st.default_capacity}</strong> • Duração padrão:{' '}
                      <strong>{Math.round(st.default_duration_seconds / 60)} min</strong> ({st.default_duration_seconds}s)
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/admin/kds/${st.slug}`}
                      className="px-3 py-1.5 rounded-lg bg-white border border-stone-300 text-xs font-bold text-stone-800 hover:bg-stone-100 flex items-center gap-1"
                    >
                      <span>Abrir KDS</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleSelectStationForEdit(st)}
                      className="px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-900 border border-amber-500/30 text-xs font-bold hover:bg-amber-500/25"
                    >
                      Editar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Formulário de Criação/Edição de Estação */}
        <form
          onSubmit={handleSaveStation}
          className="lg:col-span-5 bg-white p-6 rounded-2xl border border-stone-200 space-y-4"
        >
          <h2 className="font-heading text-lg font-black text-stone-950">
            {editingStationId ? 'Editar Estação' : 'Nova Estação de Produção'}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Nome da Estação *
              </label>
              <input
                type="text"
                required
                value={stName}
                onChange={(e) => {
                  setStName(e.target.value);
                  if (!editingStationId) setStSlug(slugify(e.target.value));
                }}
                placeholder="Ex: Cozinha Quente"
                className="w-full px-3 py-2 rounded-xl border border-stone-300 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Slug (URL do KDS) *
              </label>
              <input
                type="text"
                required
                value={stSlug}
                onChange={(e) => setStSlug(slugify(e.target.value))}
                placeholder="cozinha-quente"
                className="w-full px-3 py-2 rounded-xl border border-stone-300 text-sm font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Tipo da Estação
              </label>
              <select
                value={stType}
                onChange={(e) => setStType(e.target.value as ProductionStationType)}
                className="w-full px-3 py-2 rounded-xl border border-stone-300 text-sm bg-white"
              >
                {Object.entries(STATION_TYPE_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Ordem de Exibição
              </label>
              <input
                type="number"
                min={0}
                value={stOrder}
                onChange={(e) => setStOrder(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-stone-300 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Capacidade Simultânea (Slots)
              </label>
              <input
                type="number"
                min={1}
                required
                value={stCapacity}
                onChange={(e) => setStCapacity(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-stone-300 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Duração Padrão (Segundos)
              </label>
              <input
                type="number"
                min={10}
                step={30}
                required
                value={stDurationSec}
                onChange={(e) => setStDurationSec(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-stone-300 text-sm"
              />
              <span className="text-[11px] text-stone-500">
                Equivale a ~{Math.round(stDurationSec / 60)} min
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">
              Descrição Operacional
            </label>
            <input
              type="text"
              value={stDescription}
              onChange={(e) => setStDescription(e.target.value)}
              placeholder="Ex: Preparo de carnes, grelhados e feijoada"
              className="w-full px-3 py-2 rounded-xl border border-stone-300 text-sm"
            />
          </div>

          <label className="flex items-center gap-2 text-xs font-bold text-stone-800 cursor-pointer">
            <input
              type="checkbox"
              checked={stActive}
              onChange={(e) => setStActive(e.target.checked)}
              className="rounded border-stone-300"
            />
            <span>Estação ativa para roteamento de novos pedidos</span>
          </label>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs uppercase tracking-wide flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>
              {editingStationId ? 'Salvar Alterações da Estação' : 'Criar Estação'}
            </span>
          </button>
        </form>
      </div>

      {/* SEÇÃO 2: FLUXO DE PRODUÇÃO POR PRODUTO / VARIANTE (Seção 34) */}
      <div className="bg-white p-6 rounded-2xl border border-stone-200 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-200 pb-4">
          <div>
            <h2 className="font-heading text-lg font-black text-stone-950 flex items-center gap-2">
              <Layers className="w-5 h-5 text-amber-600" />
              <span>2. Fluxo Sequencial de Produção por Produto / Variante</span>
            </h2>
            <p className="text-xs text-stone-600 mt-0.5">
              Precedência automática: Variante específica &gt; Produto geral &gt; Fallback automático de 1 etapa.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">
              Selecione o Produto
            </label>
            <select
              value={selectedProductId}
              onChange={(e) => {
                setSelectedProductId(e.target.value);
                setSelectedVariantId('');
              }}
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm font-bold bg-white"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">
              Escopo do Fluxo (Produto Padrão ou Variante Específica)
            </label>
            <select
              value={selectedVariantId}
              onChange={(e) => setSelectedVariantId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm bg-white"
            >
              <option value="">
                Fluxo Padrão do Produto (Todas as variantes sem override)
              </option>
              {productVariants.map((v) => (
                <option key={v.id} value={v.id}>
                  Variante Específica: {v.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Lista Sequencial de Etapas do Produto */}
        <div className="space-y-3">
          {draftSteps.length === 0 ? (
            <div className="p-6 rounded-xl bg-stone-50 border border-dashed border-stone-300 text-center text-xs text-stone-600">
              Nenhuma etapa customizada configurada neste escopo. O item usará o fallback padrão (ou o fluxo do produto caso esteja vendo uma variante).
            </div>
          ) : (
            draftSteps.map((step, index) => (
              <div
                key={index}
                className="p-4 rounded-xl bg-stone-50 border border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 flex-1">
                  <span className="w-8 h-8 rounded-lg bg-stone-900 text-amber-400 font-heading font-black text-xs flex items-center justify-center shrink-0">
                    #{index + 1}
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-stone-500">
                        Estação
                      </label>
                      <select
                        value={step.station_id}
                        onChange={(e) => {
                          const next = [...draftSteps];
                          next[index].station_id = e.target.value;
                          setDraftSteps(next);
                        }}
                        className="w-full mt-0.5 px-2.5 py-1.5 rounded-lg border border-stone-300 text-xs font-bold bg-white"
                      >
                        {stations.map((st) => (
                          <option key={st.id} value={st.id}>
                            {st.name} {!st.is_active ? '(Inativa)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase text-stone-500">
                        Duração Estimada (Segundos)
                      </label>
                      <input
                        type="number"
                        min={5}
                        step={15}
                        value={step.estimated_duration_seconds}
                        onChange={(e) => {
                          const next = [...draftSteps];
                          next[index].estimated_duration_seconds = Number(
                            e.target.value
                          );
                          setDraftSteps(next);
                        }}
                        className="w-full mt-0.5 px-2.5 py-1.5 rounded-lg border border-stone-300 text-xs font-bold bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase text-stone-500">
                        Peso de Capacidade (Slots)
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={step.capacity_weight}
                        onChange={(e) => {
                          const next = [...draftSteps];
                          next[index].capacity_weight = Number(e.target.value);
                          setDraftSteps(next);
                        }}
                        className="w-full mt-0.5 px-2.5 py-1.5 rounded-lg border border-stone-300 text-xs font-bold bg-white"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => handleMoveDraftStep(index, -1)}
                    disabled={index === 0}
                    className="p-2 rounded-lg border border-stone-300 bg-white text-stone-700 disabled:opacity-40"
                    aria-label="Mover etapa para cima"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveDraftStep(index, 1)}
                    disabled={index === draftSteps.length - 1}
                    className="p-2 rounded-lg border border-stone-300 bg-white text-stone-700 disabled:opacity-40"
                    aria-label="Mover etapa para baixo"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveDraftStep(index)}
                    className="p-2 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                    aria-label="Remover etapa"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={handleAddDraftStep}
            className="px-4 py-2.5 rounded-xl border border-stone-300 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Adicionar Etapa Sequencial</span>
          </button>

          <button
            type="button"
            onClick={handleSaveProductFlow}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-black uppercase tracking-wide flex items-center gap-2"
          >
            <Save className="w-4 h-4 text-amber-400" />
            <span>Salvar Fluxo de Produção</span>
          </button>
        </div>
      </div>
    </div>
  );
}

