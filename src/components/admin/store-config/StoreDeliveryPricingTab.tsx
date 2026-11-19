'use client';

import React, { useState } from 'react';
import {
  Truck,
  Info,
  MapPin,
  Navigation,
  CheckCircle2,
  AlertTriangle,
  Calculator,
} from 'lucide-react';
import { parseStrictCurrencyCents } from './StoreCurrencyUtils';
import type {
  DistanceRoundingMode,
  DeliveryContingencyPolicy,
} from '@/modules/delivery/delivery-pricing.engine';
import type { DeliverySimulationResult } from '@/modules/delivery/delivery-quote.service';
import { LocationPinPicker } from '@/components/maps/LocationPinPicker';

interface StoreDeliveryPricingTabProps {
  deliveryFeeReais: string;
  freeThresholdReais: string;
  minOrderReais: string;
  estDeliveryMin: number;
  estPickupMin: number;
  onChangeDeliveryFeeReais: (v: string) => void;
  onChangeFreeThresholdReais: (v: string) => void;
  onChangeMinOrderReais: (v: string) => void;
  onChangeEstDeliveryMin: (v: number) => void;
  onChangeEstPickupMin: (v: number) => void;
}

function formatCentsBrl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function StoreDeliveryPricingTab({
  deliveryFeeReais,
  freeThresholdReais,
  minOrderReais,
  estDeliveryMin,
  estPickupMin,
  onChangeDeliveryFeeReais,
  onChangeFreeThresholdReais,
  onChangeMinOrderReais,
  onChangeEstDeliveryMin,
  onChangeEstPickupMin,
}: StoreDeliveryPricingTabProps) {
  // ETAPA 3 — Origem Geográfica do Restaurante
  const [originZip, setOriginZip] = useState('');
  const [originStreet, setOriginStreet] = useState('');
  const [originNumber, setOriginNumber] = useState('');
  const [originNeighborhood, setOriginNeighborhood] = useState('');
  const [originCity, setOriginCity] = useState('Feira de Santana');
  const [originState, setOriginState] = useState('BA');
  const [originCoords, setOriginCoords] = useState<{
    lat: number;
    lng: number;
    formattedAddress: string;
    precision: string;
    isHighConfidence: boolean;
  } | null>(null);
  const [originVerified, setOriginVerified] = useState(false);
  const [originLoading, setOriginLoading] = useState(false);
  const [originError, setOriginError] = useState<string | null>(null);

  // ETAPA 5 — Parâmetros de Distância e Simulador Administrativo
  const [simBaseReais, setSimBaseReais] = useState('5.00');
  const [simPerKmReais, setSimPerKmReais] = useState('1.50');
  const [simMinReais, setSimMinReais] = useState('6.00');
  const [simMaxReais, setSimMaxReais] = useState('30.00');
  const [simMaxDistKm, setSimMaxDistKm] = useState('10');
  const [simRounding, setSimRounding] = useState<DistanceRoundingMode>('tenth_km');
  const [simFreeMaxDistKm, setSimFreeMaxDistKm] = useState('5');
  const [simMaxSubsidyReais, setSimMaxSubsidyReais] = useState('12.00');
  const [simContingency, setSimContingency] = useState<DeliveryContingencyPolicy>('block_on_failure');

  const [destZip, setDestZip] = useState('');
  const [destStreet, setDestStreet] = useState('');
  const [destNumber, setDestNumber] = useState('');
  const [destNeighborhood, setDestNeighborhood] = useState('');
  const [destCity, setDestCity] = useState('Feira de Santana');
  const [destState, setDestState] = useState('BA');
  const [simSubtotalReais, setSimSubtotalReais] = useState('60.00');
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [simResult, setSimResult] = useState<DeliverySimulationResult | null>(null);

  const resetOriginVerification = () => {
    if (originVerified) setOriginVerified(false);
    if (originCoords) setOriginCoords(null);
  };

  const handleGeocodeOrigin = async () => {
    setOriginLoading(true);
    setOriginError(null);
    setOriginVerified(false);
    try {
      const res = await fetch('/api/admin/delivery-origin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zipCode: originZip,
          street: originStreet,
          number: originNumber,
          neighborhood: originNeighborhood,
          city: originCity,
          state: originState,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao geocodificar endereço de origem.');
      }
      setOriginCoords(data);
    } catch (err: unknown) {
      setOriginCoords(null);
      setOriginError((err as { message?: string })?.message || 'Erro ao geocodificar origem.');
    } finally {
      setOriginLoading(false);
    }
  };

  const handleSimulate = async (confirmedPinOverride?: { lat: number; lng: number } | null) => {
    setSimError(null);
    if (!confirmedPinOverride) {
      setSimResult(null);
    }

    if (!originCoords || !originVerified) {
      setSimError('Geocodifique e confirme o ponto de coleta da origem antes de simular.');
      return;
    }

    const baseP = parseStrictCurrencyCents(simBaseReais, { fieldLabel: 'Tarifa Base' });
    const kmP = parseStrictCurrencyCents(simPerKmReais, { fieldLabel: 'Valor por km' });
    const minP = parseStrictCurrencyCents(simMinReais, { fieldLabel: 'Taxa Mínima' });
    const maxP = parseStrictCurrencyCents(simMaxReais, { fieldLabel: 'Teto da Taxa' });
    const subP = parseStrictCurrencyCents(simSubtotalReais, { fieldLabel: 'Subtotal Simulado' });
    const fixedP = parseStrictCurrencyCents(deliveryFeeReais, { fieldLabel: 'Taxa Fixa' });
    const freeThreshP = parseStrictCurrencyCents(freeThresholdReais, {
      fieldLabel: 'Frete Grátis Acima',
      allowEmpty: true,
      minCents: 1,
    });
    const subsidyP = parseStrictCurrencyCents(simMaxSubsidyReais, {
      fieldLabel: 'Subsídio Máximo',
      allowEmpty: true,
    });

    const firstErr = [baseP, kmP, minP, maxP, subP, fixedP, freeThreshP, subsidyP].find(
      (r) => !r.valid
    );
    if (firstErr) {
      setSimError(firstErr.error || 'Parâmetro monetário inválido na simulação.');
      return;
    }

    const maxDist = Number(simMaxDistKm.replace(',', '.'));
    if (!Number.isFinite(maxDist) || maxDist <= 0) {
      setSimError('Raio máximo de atendimento deve ser maior que zero.');
      return;
    }

    const freeMaxDistNum = simFreeMaxDistKm.trim()
      ? Number(simFreeMaxDistKm.replace(',', '.'))
      : null;

    setSimLoading(true);
    try {
      const res = await fetch('/api/admin/delivery-quote/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: { lat: originCoords.lat, lng: originCoords.lng },
          confirmedPin: confirmedPinOverride || undefined,
          destination: {
            zipCode: destZip,
            street: destStreet,
            number: destNumber,
            neighborhood: destNeighborhood,
            city: destCity,
            state: destState,
          },
          simulatedSubtotalCents: subP.cents || 0,
          config: {
            pricingMode: 'distance',
            pricingRuleVersion: 1,
            originVerified: true,
            fixedDeliveryFeeCents: fixedP.cents || 0,
            baseDeliveryFeeCents: baseP.cents || 0,
            perKmFeeCents: kmP.cents || 0,
            minDeliveryFeeCents: minP.cents || 0,
            maxDeliveryFeeCents: maxP.cents || 0,
            maxDeliveryDistanceKm: maxDist,
            distanceRoundingMode: simRounding,
            freeDeliveryThresholdCents: freeThreshP.cents,
            freeDeliveryMaxDistanceKm:
              freeMaxDistNum && freeMaxDistNum > 0 ? freeMaxDistNum : null,
            maxDeliverySubsidyCents: subsidyP.cents,
            contingencyPolicy: simContingency,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao simular entrega.');
      }
      setSimResult(data);
    } catch (err: unknown) {
      setSimError((err as { message?: string })?.message || 'Erro ao simular entrega.');
    } finally {
      setSimLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Card 1: Configuração Comercial Ativa (Taxa Fixa) */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-5 space-y-5">
        <div className="border-b border-stone-100 pb-3">
          <h3 className="font-bold text-stone-900 flex items-center gap-2">
            <Truck className="w-4 h-4 text-amber-600" />
            Taxas, Pedido Mínimo & Prazos Ativos
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            Todos os campos monetários exigem formato válido (ex.: 12,00). Entradas inválidas bloqueiam o salvamento para evitar taxa zero acidental.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Taxa Fixa de Entrega (R$) *
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={deliveryFeeReais}
              onChange={(e) => onChangeDeliveryFeeReais(e.target.value)}
              placeholder="12,00"
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Frete Grátis Acima (R$)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={freeThresholdReais}
              onChange={(e) => onChangeFreeThresholdReais(e.target.value)}
              placeholder="Opcional"
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Pedido Mínimo (R$) *
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={minOrderReais}
              onChange={(e) => onChangeMinOrderReais(e.target.value)}
              placeholder="30,00"
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm font-mono"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Tempo Estimado Entrega (min)
            </label>
            <input
              type="number"
              min={5}
              max={300}
              value={estDeliveryMin}
              onChange={(e) => onChangeEstDeliveryMin(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Tempo Estimado Retirada (min)
            </label>
            <input
              type="number"
              min={5}
              max={300}
              value={estPickupMin}
              onChange={(e) => onChangeEstPickupMin(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Informativo de Segurança */}
      <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 flex items-start gap-3 text-xs text-stone-700">
        <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-stone-900">
            Modo ativo no checkout: Taxa Fixa (<code className="font-mono">fixed</code>)
          </p>
          <p>
            Abaixo você pode validar a origem da cozinha e simular cotações por distância real sem alterar a operação ativa do checkout.
          </p>
        </div>
      </div>

      {/* Card 2: Origem Geográfica do Restaurante (ETAPA 3) */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-5 space-y-4">
        <div className="border-b border-stone-100 pb-3">
          <h3 className="font-bold text-stone-900 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-amber-600" />
            Origem de Coleta do Restaurante (Fase C)
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            Geocodifique no servidor e confirme explicitamente que o ponto corresponde ao local real de saída dos pedidos.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-stone-700 mb-1">CEP *</label>
            <input
              type="text"
              value={originZip}
              onChange={(e) => {
                setOriginZip(e.target.value);
                resetOriginVerification();
              }}
              placeholder="44001-000"
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-xs font-mono"
            />
          </div>
          <div className="sm:col-span-3">
            <label className="block text-xs font-semibold text-stone-700 mb-1">Rua / Avenida *</label>
            <input
              type="text"
              value={originStreet}
              onChange={(e) => {
                setOriginStreet(e.target.value);
                resetOriginVerification();
              }}
              placeholder="Av. Getúlio Vargas"
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-xs"
            />
          </div>
          <div className="sm:col-span-1">
            <label className="block text-xs font-semibold text-stone-700 mb-1">Número *</label>
            <input
              type="text"
              value={originNumber}
              onChange={(e) => {
                setOriginNumber(e.target.value);
                resetOriginVerification();
              }}
              placeholder="100"
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-xs"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-stone-700 mb-1">Bairro *</label>
            <input
              type="text"
              value={originNeighborhood}
              onChange={(e) => {
                setOriginNeighborhood(e.target.value);
                resetOriginVerification();
              }}
              placeholder="Centro"
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-xs"
            />
          </div>
          <div className="sm:col-span-3">
            <label className="block text-xs font-semibold text-stone-700 mb-1">Cidade *</label>
            <input
              type="text"
              value={originCity}
              onChange={(e) => {
                setOriginCity(e.target.value);
                resetOriginVerification();
              }}
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-xs"
            />
          </div>
          <div className="sm:col-span-1">
            <label className="block text-xs font-semibold text-stone-700 mb-1">UF *</label>
            <input
              type="text"
              maxLength={2}
              value={originState}
              onChange={(e) => {
                setOriginState(e.target.value.toUpperCase());
                resetOriginVerification();
              }}
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-xs uppercase"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={originLoading}
            onClick={handleGeocodeOrigin}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-stone-900 text-white text-xs font-bold hover:bg-stone-800 disabled:opacity-50"
          >
            <Navigation className="w-3.5 h-3.5" />
            {originLoading ? 'Geocodificando...' : 'Geocodificar Origem'}
          </button>
        </div>

        {originError && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{originError}</span>
          </div>
        )}

        {originCoords && (
          <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-2.5 text-xs">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-bold text-stone-900">{originCoords.formattedAddress}</p>
                <p className="font-mono text-stone-600">
                  Lat: {originCoords.lat.toFixed(6)} | Lng: {originCoords.lng.toFixed(6)} | Precisão:{' '}
                  <strong>{originCoords.precision}</strong>
                </p>
              </div>
            </div>
            <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-stone-800">
              <input
                type="checkbox"
                checked={originVerified}
                onChange={(e) => setOriginVerified(e.target.checked)}
                className="rounded border-stone-300 text-emerald-600"
              />
              <span>Confirmo que o ponto localizado corresponde exatamente ao local de coleta da cozinha</span>
            </label>
            <LocationPinPicker
              initialCoords={{ lat: originCoords.lat, lng: originCoords.lng }}
              addressLabel={originCoords.formattedAddress}
              confirmed={originVerified}
              onChangeCoords={(next) => {
                setOriginCoords({ ...originCoords, lat: next.lat, lng: next.lng });
                setOriginVerified(false);
              }}
              onConfirm={(next) => {
                setOriginCoords({ ...originCoords, lat: next.lat, lng: next.lng });
                setOriginVerified(true);
              }}
            />
          </div>
        )}
      </div>

      {/* Card 3: Simulador Administrativo de Frete por Distância (ETAPA 5) */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-5 space-y-4">
        <div className="border-b border-stone-100 pb-3">
          <h3 className="font-bold text-stone-900 flex items-center gap-2">
            <Calculator className="w-4 h-4 text-amber-600" />
            Simulador Administrativo de Frete por Distância
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            Teste parâmetros e endereços reais sem criar pedidos nem efetuar cobranças.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-stone-700 mb-1">Tarifa Base (R$)</label>
            <input
              type="text"
              value={simBaseReais}
              onChange={(e) => setSimBaseReais(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-stone-700 mb-1">Por km (R$)</label>
            <input
              type="text"
              value={simPerKmReais}
              onChange={(e) => setSimPerKmReais(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-stone-700 mb-1">Taxa Mínima (R$)</label>
            <input
              type="text"
              value={simMinReais}
              onChange={(e) => setSimMinReais(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-stone-700 mb-1">Teto da Taxa (R$)</label>
            <input
              type="text"
              value={simMaxReais}
              onChange={(e) => setSimMaxReais(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-stone-700 mb-1">Raio Máximo (km)</label>
            <input
              type="text"
              value={simMaxDistKm}
              onChange={(e) => setSimMaxDistKm(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-stone-700 mb-1">Arredondamento</label>
            <select
              value={simRounding}
              onChange={(e) => setSimRounding(e.target.value as DistanceRoundingMode)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 text-xs bg-white"
            >
              <option value="tenth_km">0,1 km (teto)</option>
              <option value="ceil_km">1 km (teto)</option>
              <option value="exact">Exato</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-stone-700 mb-1">Frete Grátis até (km)</label>
            <input
              type="text"
              value={simFreeMaxDistKm}
              onChange={(e) => setSimFreeMaxDistKm(e.target.value)}
              placeholder="Opcional"
              className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-stone-700 mb-1">Subsídio Máx (R$)</label>
            <input
              type="text"
              value={simMaxSubsidyReais}
              onChange={(e) => setSimMaxSubsidyReais(e.target.value)}
              placeholder="Opcional"
              className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 text-xs font-mono"
            />
          </div>
        </div>

        <div className="pt-3 border-t border-stone-100 grid grid-cols-1 sm:grid-cols-6 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-semibold text-stone-700 mb-1">CEP Destino *</label>
            <input
              type="text"
              value={destZip}
              onChange={(e) => setDestZip(e.target.value)}
              placeholder="44002-000"
              className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 text-xs font-mono"
            />
          </div>
          <div className="sm:col-span-3">
            <label className="block text-[11px] font-semibold text-stone-700 mb-1">Rua Destino *</label>
            <input
              type="text"
              value={destStreet}
              onChange={(e) => setDestStreet(e.target.value)}
              placeholder="Rua Castro Alves"
              className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 text-xs"
            />
          </div>
          <div className="sm:col-span-1">
            <label className="block text-[11px] font-semibold text-stone-700 mb-1">Nº *</label>
            <input
              type="text"
              value={destNumber}
              onChange={(e) => setDestNumber(e.target.value)}
              placeholder="250"
              className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 text-xs"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-semibold text-stone-700 mb-1">Bairro *</label>
            <input
              type="text"
              value={destNeighborhood}
              onChange={(e) => setDestNeighborhood(e.target.value)}
              placeholder="Kalilândia"
              className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 text-xs"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-semibold text-stone-700 mb-1">Cidade *</label>
            <input
              type="text"
              value={destCity}
              onChange={(e) => setDestCity(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 text-xs"
            />
          </div>
          <div className="sm:col-span-1">
            <label className="block text-[11px] font-semibold text-stone-700 mb-1">UF *</label>
            <input
              type="text"
              maxLength={2}
              value={destState}
              onChange={(e) => setDestState(e.target.value.toUpperCase())}
              className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 text-xs uppercase"
            />
          </div>
          <div className="sm:col-span-1">
            <label className="block text-[11px] font-semibold text-stone-700 mb-1">Subtotal (R$)</label>
            <input
              type="text"
              value={simSubtotalReais}
              onChange={(e) => setSimSubtotalReais(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 text-xs font-mono"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={simLoading}
            onClick={() => handleSimulate()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 disabled:opacity-50"
          >
            <Calculator className="w-3.5 h-3.5" />
            {simLoading ? 'Calculando rota...' : 'Simular Cotação de Entrega'}
          </button>

          <select
            value={simContingency}
            onChange={(e) => setSimContingency(e.target.value as DeliveryContingencyPolicy)}
            className="px-2.5 py-2 rounded-lg border border-stone-300 text-xs bg-white"
            aria-label="Política de contingência"
          >
            <option value="block_on_failure">Contingência: Bloquear se rota falhar</option>
            <option value="neighborhood_fallback">Contingência: Tabela por Bairro (Plano B)</option>
            <option value="fixed_fallback">Contingência: Taxa fixa se rota falhar</option>
          </select>
        </div>

        {simError && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{simError}</span>
          </div>
        )}

        {simResult && (
          <div
            className={`p-4 rounded-xl border text-xs space-y-2 ${
              simResult.eligible
                ? 'bg-emerald-50/70 border-emerald-200'
                : 'bg-amber-50 border-amber-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-stone-900">
                {simResult.eligible ? 'Entrega Elegível' : 'Entrega Não Elegível'}
              </span>
              {simResult.destinationPrecision && (
                <span className="font-mono text-[11px] text-stone-600">
                  Precisão: {simResult.destinationPrecision}
                </span>
              )}
            </div>
            {simResult.destinationFormattedAddress && (
              <p className="text-stone-600">{simResult.destinationFormattedAddress}</p>
            )}
            {simResult.reason && <p className="text-red-700 font-semibold">{simResult.reason}</p>}
            {simResult.ambiguousAddress && simResult.destinationCoords && (
              <div className="pt-2">
                <LocationPinPicker
                  initialCoords={simResult.destinationCoords}
                  addressLabel={simResult.destinationFormattedAddress}
                  confirmed={false}
                  onChangeCoords={() => {}}
                  onConfirm={(pin) => handleSimulate(pin)}
                />
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-stone-200/70">
              <div>
                <span className="text-stone-500 block">Distância</span>
                <strong>
                  {simResult.quote.distanceKm !== null
                    ? `${simResult.quote.distanceKm.toFixed(2)} km`
                    : '—'}
                </strong>
              </div>
              <div>
                <span className="text-stone-500 block">Tempo Rota</span>
                <strong>
                  {simResult.quote.durationMinutes !== null
                    ? `${simResult.quote.durationMinutes} min`
                    : '—'}
                </strong>
              </div>
              <div>
                <span className="text-stone-500 block">Base + Km + Adic.</span>
                <strong>
                  {formatCentsBrl(simResult.quote.baseFeeCents)} +{' '}
                  {formatCentsBrl(simResult.quote.distanceFeeCents)} +{' '}
                  {formatCentsBrl(simResult.quote.surchargeCents)}
                </strong>
              </div>
              <div>
                <span className="text-stone-500 block">Subsídio / Final</span>
                <strong>
                  -{formatCentsBrl(simResult.quote.subsidyCents)} →{' '}
                  {formatCentsBrl(simResult.quote.finalDeliveryFeeCents)}
                </strong>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
