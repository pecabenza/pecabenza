'use client';

import React, { useState } from 'react';
import { formatBrl } from '@/modules/cart/CartContext';

interface OrderCourierCostCardProps {
  orderId: string;
  deliveryFeeCents: number;
  initialCostCents?: number | null;
  initialProvider?: '99' | 'uber' | 'own_driver' | 'other' | null;
  initialDistanceMeters?: number | null;
  initialNotes?: string | null;
}

export function OrderCourierCostCard({
  orderId,
  deliveryFeeCents,
  initialCostCents,
  initialProvider,
  initialDistanceMeters,
  initialNotes,
}: OrderCourierCostCardProps) {
  const [costReais, setCostReais] = useState(
    initialCostCents !== null && initialCostCents !== undefined
      ? (initialCostCents / 100).toFixed(2)
      : ''
  );
  const [provider, setProvider] = useState<'99' | 'uber' | 'own_driver' | 'other'>(
    initialProvider || '99'
  );
  const [distanceMeters, setDistanceMeters] = useState(
    initialDistanceMeters !== null && initialDistanceMeters !== undefined
      ? String(initialDistanceMeters)
      : ''
  );
  const [notes, setNotes] = useState(initialNotes || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const parsedCostCents = costReais.trim()
    ? Math.max(0, Math.round(Number(costReais.replace(',', '.')) * 100))
    : null;
  const differenceCents =
    parsedCostCents !== null && Number.isFinite(parsedCostCents)
      ? deliveryFeeCents - parsedCostCents
      : null;

  const handleSave = async () => {
    if (parsedCostCents === null || !Number.isFinite(parsedCostCents)) {
      setMessage('Informe o custo real pago em reais.');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/courier-cost`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actualCourierCostCents: parsedCostCents,
          courierProvider: provider,
          courierActualDistanceMeters: distanceMeters.trim()
            ? Math.max(0, Math.round(Number(distanceMeters)))
            : null,
          courierCostNotes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data?.error || 'Erro ao salvar custo real.');
        return;
      }
      setMessage('Custo operacional registrado com sucesso.');
    } catch {
      setMessage('Erro de conexão ao salvar custo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 rounded-xl border border-tenant-border bg-tenant-surface space-y-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold text-tenant-text">
          Custo Real da Corrida (99 / Uber) — Operacional
        </span>
        <span className="text-tenant-muted">
          Taxa cobrada do cliente: <strong className="text-tenant-text">{formatBrl(deliveryFeeCents)}</strong>
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div>
          <label className="block text-[11px] text-tenant-muted mb-1">Serviço</label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as '99' | 'uber' | 'own_driver' | 'other')}
            className="w-full px-2.5 py-1.5 rounded-lg border border-tenant-border bg-tenant-background text-xs"
          >
            <option value="99">99</option>
            <option value="uber">Uber</option>
            <option value="own_driver">Entregador Próprio</option>
            <option value="other">Outro</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-tenant-muted mb-1">Custo pago (R$)</label>
          <input
            type="number"
            min={0}
            step={0.1}
            value={costReais}
            onChange={(e) => setCostReais(e.target.value)}
            placeholder="Ex: 12.30"
            className="w-full px-2.5 py-1.5 rounded-lg border border-tenant-border bg-tenant-background text-xs"
          />
        </div>
        <div>
          <label className="block text-[11px] text-tenant-muted mb-1">Distância real (m)</label>
          <input
            type="number"
            min={0}
            step={100}
            value={distanceMeters}
            onChange={(e) => setDistanceMeters(e.target.value)}
            placeholder="Ex: 7700"
            className="w-full px-2.5 py-1.5 rounded-lg border border-tenant-border bg-tenant-background text-xs"
          />
        </div>
      </div>

      <input
        type="text"
        maxLength={300}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Observação operacional (opcional, máx. 300 caracteres)"
        className="w-full px-2.5 py-1.5 rounded-lg border border-tenant-border bg-tenant-background text-xs"
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          {differenceCents !== null && (
            <span
              className={`font-bold ${
                differenceCents >= 0 ? 'text-emerald-700' : 'text-red-600'
              }`}
            >
              Diferença operacional: {differenceCents >= 0 ? '+' : ''}
              {formatBrl(differenceCents)}
            </span>
          )}
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="px-3 py-1.5 rounded-lg bg-tenant-primary text-white font-bold disabled:opacity-50"
        >
          {saving ? 'Salvando...' : 'Registrar custo'}
        </button>
      </div>

      {message && <p className="text-[11px] text-tenant-muted">{message}</p>}
    </div>
  );
}

