'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Plus,
  Route,
  Trash2,
} from 'lucide-react';
import {
  calculateSmartDeliveryQuote,
  validateDistanceBands,
  type DeliveryDistanceBand,
  type DeliveryPricingMode,
} from '@/modules/delivery/delivery-pricing.engine';
import { formatBrl } from '@/modules/cart/CartContext';

const SIMULATION_BANDS_99: DeliveryDistanceBand[] = [
  { id: 'band-1', minMeters: 0, maxMeters: 4000, feeCents: 890, label: 'Até 4 km', active: true },
  { id: 'band-2', minMeters: 4000, maxMeters: 8000, feeCents: 1290, label: '4 a 8 km', active: true },
  { id: 'band-3', minMeters: 8000, maxMeters: 12000, feeCents: 1590, label: '8 a 12 km', active: true },
  { id: 'band-4', minMeters: 12000, maxMeters: 15000, feeCents: 1990, label: '12 a 15 km', active: true },
];

const MODE_LABELS: Record<DeliveryPricingMode, string> = {
  fixed: 'Taxa Fixa',
  distance: 'Por Quilômetro (Contínuo)',
  distance_band: 'Por Faixas de Distância (Fixo por Faixa)',
  external_quote: 'Cotação Externa',
};

export function DistanceBandsEditor() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeMode, setActiveMode] = useState<DeliveryPricingMode>('fixed');
  const [selectedMode, setSelectedMode] = useState<DeliveryPricingMode>('fixed');
  const [ruleVersion, setRuleVersion] = useState(1);
  const [maxDistanceKm, setMaxDistanceKm] = useState(10);
  const [bands, setBands] = useState<DeliveryDistanceBand[]>([]);
  const [simMeters, setSimMeters] = useState(6700);
  const [confirmActivation, setConfirmActivation] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/admin/delivery-pricing')
      .then((r) => r.json())
      .then((data) => {
        if (!active || !data || data.error) return;
        const mode = (data.pricingMode || 'fixed') as DeliveryPricingMode;
        setActiveMode(mode);
        setSelectedMode(mode);
        setRuleVersion(Number(data.pricingRuleVersion || 1));
        setMaxDistanceKm(Number(data.maxDeliveryDistanceKm ?? 10));
        setBands(Array.isArray(data.distanceBands) ? data.distanceBands : []);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const validation = useMemo(
    () =>
      validateDistanceBands(
        bands,
        maxDistanceKm,
        selectedMode === 'distance_band'
      ),
    [bands, maxDistanceKm, selectedMode]
  );

  const simQuote = useMemo(() => {
    if (selectedMode !== 'distance_band') return null;
    return calculateSmartDeliveryQuote({
      fulfillmentType: 'delivery',
      serverSubtotalCents: 10000,
      routeDistanceMeters: simMeters,
      routeDurationSeconds: Math.round((simMeters / 1000) * 120),
      config: {
        pricingMode: 'distance_band',
        pricingRuleVersion: ruleVersion,
        originVerified: true,
        fixedDeliveryFeeCents: 1200,
        baseDeliveryFeeCents: 600,
        perKmFeeCents: 150,
        minDeliveryFeeCents: 800,
        maxDeliveryFeeCents: 3000,
        maxDeliveryDistanceKm: maxDistanceKm,
        distanceRoundingMode: 'exact',
        freeDeliveryThresholdCents: null,
        freeDeliveryMaxDistanceKm: null,
        maxDeliverySubsidyCents: null,
        contingencyPolicy: 'block_on_failure',
        distanceBands: bands,
      },
    });
  }, [selectedMode, simMeters, ruleVersion, maxDistanceKm, bands]);

  const handleAddBand = () => {
    const lastMax = bands.length > 0 ? Math.max(...bands.map((b) => b.maxMeters)) : 0;
    setBands((prev) => [
      ...prev,
      {
        id: `band-${Date.now()}`,
        minMeters: lastMax,
        maxMeters: lastMax + 4000,
        feeCents: 1290,
        label: '',
        active: true,
      },
    ]);
  };

  const handleUpdateBand = (id: string, patch: Partial<DeliveryDistanceBand>) => {
    setBands((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };

  const handleRemoveBand = (id: string) => {
    setBands((prev) => prev.filter((b) => b.id !== id));
  };

  const handleSave = async () => {
    setFeedback(null);
    if (!validation.valid) {
      setFeedback({ type: 'error', text: validation.errors[0] || 'Corrija as faixas antes de salvar.' });
      return;
    }
    if (selectedMode === 'distance_band' && !confirmActivation) {
      setFeedback({
        type: 'error',
        text: 'Marque a caixa de confirmação antes de ativar o modo por faixas de distância.',
      });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/delivery-pricing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pricingMode: selectedMode,
          maxDeliveryDistanceKm: maxDistanceKm,
          distanceBands: bands,
          expectedRuleVersion: ruleVersion,
          confirmActivation: selectedMode === 'distance_band' ? confirmActivation : true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'error', text: data?.error || 'Erro ao salvar configuração.' });
        return;
      }
      setActiveMode(data.pricingMode);
      setRuleVersion(data.pricingRuleVersion);
      setConfirmActivation(false);
      setFeedback({
        type: 'success',
        text: `Configuração salva (versão v${data.pricingRuleVersion}). Cotações anteriores foram invalidadas.`,
      });
    } catch {
      setFeedback({ type: 'error', text: 'Erro de conexão ao salvar faixas.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 rounded-xl border border-tenant-border bg-tenant-surface text-xs text-tenant-muted">
        Carregando regras de frete por faixa...
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 rounded-2xl border border-tenant-border bg-tenant-surface space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="font-heading font-bold text-base text-tenant-text flex items-center gap-2">
            <Route className="w-4 h-4 text-tenant-primary" />
            Frete Inteligente por Faixas de Distância (distance_band)
          </h3>
          <p className="text-xs text-tenant-muted mt-0.5">
            Cobra taxa fixa por intervalo rodoviário em metros inteiros, absorvendo oscilações de 99/Uber.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-full bg-tenant-primary/10 text-tenant-primary font-bold">
            Modo ativo: {MODE_LABELS[activeMode]}
          </span>
          <span className="px-2.5 py-1 rounded-full bg-tenant-background border border-tenant-border font-mono">
            v{ruleVersion}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-tenant-muted mb-1">
            Modo de Precificação
          </label>
          <select
            value={selectedMode}
            onChange={(e) => {
              setSelectedMode(e.target.value as DeliveryPricingMode);
              setConfirmActivation(false);
            }}
            className="w-full px-3 py-2 rounded-lg border border-tenant-border bg-tenant-background text-sm text-tenant-text"
          >
            <option value="fixed">Taxa Fixa (Padrão)</option>
            <option value="distance">Por Km Contínuo (distance)</option>
            <option value="distance_band">Por Faixas de Distância (distance_band)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-tenant-muted mb-1">
            Área Máxima Atendida (km)
          </label>
          <input
            type="number"
            min={1}
            max={100}
            step={0.5}
            value={maxDistanceKm}
            onChange={(e) => setMaxDistanceKm(Math.max(1, Number(e.target.value) || 1))}
            className="w-full px-3 py-2 rounded-lg border border-tenant-border bg-tenant-background text-sm text-tenant-text"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-tenant-border/50">
        <span className="text-xs font-bold uppercase tracking-wider text-tenant-text">
          Tabela de Faixas (em metros inteiros)
        </span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setBands(SIMULATION_BANDS_99)}
            className="px-3 py-1.5 rounded-lg border border-tenant-border bg-tenant-background hover:border-tenant-primary text-xs font-semibold text-tenant-text"
          >
            Carregar simulação 99 (4 faixas)
          </button>
          <button
            type="button"
            onClick={handleAddBand}
            className="px-3 py-1.5 rounded-lg bg-tenant-primary text-white text-xs font-bold flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            Nova faixa
          </button>
        </div>
      </div>

      {bands.length === 0 ? (
        <div className="p-4 rounded-xl border border-dashed border-tenant-border text-xs text-tenant-muted text-center">
          Nenhuma faixa cadastrada. Clique em <strong>Nova faixa</strong> ou carregue a simulação para testar.
        </div>
      ) : (
        <div className="space-y-2.5">
          {bands.map((band, idx) => (
            <div
              key={band.id}
              className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end p-3 rounded-xl border border-tenant-border bg-tenant-background"
            >
              <div className="sm:col-span-3">
                <label className="block text-[11px] font-medium text-tenant-muted mb-1">
                  De (metros) {idx === 0 ? '[inclusivo]' : '[exclusivo]'}
                </label>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={band.minMeters}
                  onChange={(e) =>
                    handleUpdateBand(band.id, { minMeters: Math.max(0, Math.round(Number(e.target.value) || 0)) })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg border border-tenant-border bg-tenant-surface text-xs text-tenant-text"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-[11px] font-medium text-tenant-muted mb-1">
                  Até (metros) ({(band.maxMeters / 1000).toFixed(1)} km)
                </label>
                <input
                  type="number"
                  min={1}
                  step={100}
                  value={band.maxMeters}
                  onChange={(e) =>
                    handleUpdateBand(band.id, { maxMeters: Math.max(1, Math.round(Number(e.target.value) || 1)) })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg border border-tenant-border bg-tenant-surface text-xs text-tenant-text"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-[11px] font-medium text-tenant-muted mb-1">
                  Tarifa (R$) — {formatBrl(band.feeCents)}
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={(band.feeCents / 100).toFixed(2)}
                  onChange={(e) =>
                    handleUpdateBand(band.id, {
                      feeCents: Math.max(0, Math.round((Number(e.target.value) || 0) * 100)),
                    })
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg border border-tenant-border bg-tenant-surface text-xs text-tenant-text"
                />
              </div>
              <div className="sm:col-span-2 flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-tenant-text cursor-pointer">
                  <input
                    type="checkbox"
                    checked={band.active}
                    onChange={(e) => handleUpdateBand(band.id, { active: e.target.checked })}
                  />
                  Ativa
                </label>
              </div>
              <div className="sm:col-span-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => handleRemoveBand(band.id)}
                  aria-label="Remover faixa"
                  className="p-1.5 rounded-lg text-red-600 hover:bg-red-500/10"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!validation.valid && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-700 space-y-1">
          {validation.errors.map((err, i) => (
            <div key={i} className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{err}</span>
            </div>
          ))}
        </div>
      )}

      {validation.warnings.length > 0 && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-800 space-y-1">
          {validation.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Simulador rápido de tarifa por distância */}
      <div className="p-3 rounded-xl bg-tenant-background border border-tenant-border space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <label className="text-xs font-semibold text-tenant-text flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-tenant-primary" />
            Simular distância rodoviária (metros):
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={50000}
              step={100}
              value={simMeters}
              onChange={(e) => setSimMeters(Math.max(0, Math.round(Number(e.target.value) || 0)))}
              className="w-28 px-2.5 py-1 rounded-lg border border-tenant-border bg-tenant-surface text-xs font-mono"
            />
            <span className="text-xs text-tenant-muted">({(simMeters / 1000).toFixed(2)} km)</span>
          </div>
        </div>
        {simQuote && (
          <div className="text-xs">
            {simQuote.eligible ? (
              <span className="text-emerald-700 font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Taxa simulada: {formatBrl(simQuote.finalDeliveryFeeCents)} (Faixa{' '}
                {simQuote.appliedBand?.minMeters}–{simQuote.appliedBand?.maxMeters} m)
              </span>
            ) : (
              <span className="text-red-600 font-semibold">{simQuote.reason}</span>
            )}
          </div>
        )}
      </div>

      {selectedMode === 'distance_band' && (
        <label className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-900 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmActivation}
            onChange={(e) => setConfirmActivation(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Confirmo que revisei as faixas em metros e desejo ativar <strong>distance_band</strong> para o checkout, invalidando cotações anteriores.
          </span>
        </label>
      )}

      {feedback && (
        <div
          className={`p-3 rounded-xl text-xs font-medium ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-800'
              : 'bg-red-500/10 border border-red-500/30 text-red-700'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          disabled={saving || !validation.valid}
          onClick={handleSave}
          className="px-4 py-2 rounded-xl bg-tenant-primary text-white text-xs font-bold disabled:opacity-50"
        >
          {saving ? 'Salvando...' : 'Salvar Regras de Frete'}
        </button>
      </div>
    </div>
  );
}

