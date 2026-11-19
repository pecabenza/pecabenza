'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Ticket,
  Plus,
  Trash2,
  Copy,
  Check,
  Power,
  RefreshCw,
  AlertCircle,
  Edit3,
} from 'lucide-react';
import { formatBrl } from '@/modules/cart/cart.utils';
import type { CouponCampaign, CouponDiscountType } from '@/modules/commerce/coupon.engine';

export default function AdminCouponsPage() {
  const [campaigns, setCampaigns] = useState<CouponCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Formulário de criação/edição
  const [editingId, setEditingId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState<CouponDiscountType>('percentage');
  const [discountValueInput, setDiscountValueInput] = useState('10');
  const [minOrderReais, setMinOrderReais] = useState('');
  const [maxDiscountReais, setMaxDiscountReais] = useState('');
  const [maxUsesInput, setMaxUsesInput] = useState('');
  const [expiresAtInput, setExpiresAtInput] = useState('');
  const [isActive, setIsActive] = useState(true);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/coupons', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar cupons.');
      setCampaigns(data.campaigns || []);
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'Erro ao carregar campanhas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void loadCampaigns(), 0);
    return () => clearTimeout(t);
  }, [loadCampaigns]);

  const resetForm = () => {
    setEditingId(null);
    setCode('');
    setName('');
    setDescription('');
    setDiscountType('percentage');
    setDiscountValueInput('10');
    setMinOrderReais('');
    setMaxDiscountReais('');
    setMaxUsesInput('');
    setExpiresAtInput('');
    setIsActive(true);
  };

  const handleEdit = (c: CouponCampaign) => {
    setEditingId(c.id);
    setCode(c.code);
    setName(c.name);
    setDescription(c.description || '');
    setDiscountType(c.discountType);
    setDiscountValueInput(
      c.discountType === 'percentage'
        ? String(c.discountValue)
        : (c.discountValue / 100).toFixed(2).replace('.', ',')
    );
    setMinOrderReais(c.minOrderCents ? (c.minOrderCents / 100).toFixed(2).replace('.', ',') : '');
    setMaxDiscountReais(
      c.maxDiscountCents ? (c.maxDiscountCents / 100).toFixed(2).replace('.', ',') : ''
    );
    setMaxUsesInput(c.maxUses ? String(c.maxUses) : '');
    setExpiresAtInput(c.expiresAt ? c.expiresAt.slice(0, 16) : '');
    setIsActive(c.isActive);
  };

  const parseReaisToCents = (val: string): number => {
    const clean = val.trim().replace(',', '.');
    if (!clean) return 0;
    const num = Number(clean);
    return Number.isFinite(num) && num > 0 ? Math.round(num * 100) : 0;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const parsedDiscountValue =
        discountType === 'percentage'
          ? Math.floor(Number(discountValueInput.replace(',', '.')))
          : parseReaisToCents(discountValueInput);

      const res = await fetch('/api/admin/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingId || undefined,
          code: code.trim().toUpperCase(),
          name: name.trim(),
          description: description.trim() || undefined,
          discountType,
          discountValue: parsedDiscountValue,
          minOrderCents: parseReaisToCents(minOrderReais) || undefined,
          maxDiscountCents:
            discountType === 'percentage' && parseReaisToCents(maxDiscountReais) > 0
              ? parseReaisToCents(maxDiscountReais)
              : null,
          maxUses: maxUsesInput.trim() ? Math.floor(Number(maxUsesInput)) : null,
          expiresAt: expiresAtInput ? new Date(expiresAtInput).toISOString() : null,
          isActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar cupom.');
      setCampaigns(data.campaigns || []);
      resetForm();
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'Erro ao salvar cupom.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (c: CouponCampaign) => {
    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, isActive: !c.isActive }),
      });
      const data = await res.json();
      if (res.ok) setCampaigns(data.campaigns || []);
    } catch {
      // ignora erro transitório
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/coupons?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok) setCampaigns(data.campaigns || []);
    } catch {
      // ignora erro transitório
    }
  };

  return (
    <div className="space-y-6 pb-16">
      <div className="bg-white rounded-2xl p-5 border border-stone-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-700 flex items-center justify-center shrink-0">
            <Ticket className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black font-heading text-stone-900">
              Cupons & Campanhas Promocionais
            </h1>
            <p className="text-xs text-stone-500">
              Crie cupons de desconto por porcentagem ou valor fixo para o checkout da loja.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadCampaigns()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Atualizar</span>
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Formulário */}
        <form
          onSubmit={handleSave}
          className="lg:col-span-5 bg-white rounded-2xl p-5 border border-stone-200 shadow-xs space-y-4"
        >
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <h2 className="text-sm font-black uppercase tracking-wider text-stone-800">
              {editingId ? 'Editar Campanha' : 'Novo Cupom / Campanha'}
            </h2>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs font-semibold text-stone-500 hover:underline"
              >
                Cancelar edição
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Código do Cupom *
              </label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, ''))}
                placeholder="Ex: BENZA10"
                className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs font-mono uppercase"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Tipo de Desconto
              </label>
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as CouponDiscountType)}
                className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs"
              >
                <option value="percentage">Porcentagem (%)</option>
                <option value="fixed">Valor Fixo (R$)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">
              Nome da Campanha *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Semana do Cliente BENZA"
              className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                {discountType === 'percentage' ? 'Desconto (%) *' : 'Desconto (R$) *'}
              </label>
              <input
                type="text"
                required
                value={discountValueInput}
                onChange={(e) => setDiscountValueInput(e.target.value)}
                placeholder={discountType === 'percentage' ? '10' : '15,00'}
                className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Pedido Mínimo (R$)
              </label>
              <input
                type="text"
                value={minOrderReais}
                onChange={(e) => setMinOrderReais(e.target.value)}
                placeholder="Opcional (ex: 50,00)"
                className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {discountType === 'percentage' && (
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Teto de Desconto (R$)
                </label>
                <input
                  type="text"
                  value={maxDiscountReais}
                  onChange={(e) => setMaxDiscountReais(e.target.value)}
                  placeholder="Opcional (ex: 20,00)"
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs font-mono"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Limite Total de Usos
              </label>
              <input
                type="number"
                min={1}
                value={maxUsesInput}
                onChange={(e) => setMaxUsesInput(e.target.value)}
                placeholder="Ilimitado"
                className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Validade (Opcional)
              </label>
              <input
                type="datetime-local"
                value={expiresAtInput}
                onChange={(e) => setExpiresAtInput(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold text-stone-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-stone-300 text-emerald-600"
            />
            <span>Campanha ativa para uso imediato no checkout</span>
          </label>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            <span>{saving ? 'Salvando...' : editingId ? 'Salvar Alterações' : 'Criar Cupom'}</span>
          </button>
        </form>

        {/* Lista de Campanhas */}
        <div className="lg:col-span-7 bg-white rounded-2xl p-5 border border-stone-200 shadow-xs space-y-4">
          <h2 className="text-sm font-black uppercase tracking-wider text-stone-800 border-b border-stone-100 pb-3">
            Campanhas Cadastradas ({campaigns.length})
          </h2>

          {loading ? (
            <div className="py-10 text-center text-xs text-stone-400">Carregando campanhas...</div>
          ) : campaigns.length === 0 ? (
            <div className="py-12 text-center text-xs text-stone-400 border-2 border-dashed border-stone-200 rounded-xl">
              Nenhum cupom cadastrado ainda. Crie o primeiro ao lado!
            </div>
          ) : (
            <div className="space-y-3">
              {campaigns.map((c) => (
                <div
                  key={c.id}
                  className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    c.isActive
                      ? 'bg-stone-50/70 border-stone-200'
                      : 'bg-stone-100/60 border-stone-200 opacity-75'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-lg bg-stone-900 text-white font-mono text-xs font-bold">
                        {c.code}
                      </span>
                      <span className="text-xs font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                        {c.discountType === 'percentage'
                          ? `${c.discountValue}% OFF`
                          : `${formatBrl(c.discountValue)} OFF`}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          c.isActive
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-stone-200 text-stone-600'
                        }`}
                      >
                        {c.isActive ? 'Ativo' : 'Pausado'}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-stone-900">{c.name}</p>
                    <p className="text-[11px] text-stone-500">
                      Usos: <strong>{c.usedCount}</strong>
                      {c.maxUses ? ` / ${c.maxUses}` : ' (ilimitado)'}
                      {c.minOrderCents ? ` • Mínimo: ${formatBrl(c.minOrderCents)}` : ''}
                      {c.expiresAt
                        ? ` • Expira em ${new Date(c.expiresAt).toLocaleDateString('pt-BR')}`
                        : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(c.code);
                        setCopiedId(c.id);
                        setTimeout(() => setCopiedId(null), 1500);
                      }}
                      title="Copiar código"
                      className="p-2 rounded-lg border border-stone-200 bg-white text-stone-600 hover:text-stone-900"
                    >
                      {copiedId === c.id ? (
                        <Check className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEdit(c)}
                      title="Editar campanha"
                      className="p-2 rounded-lg border border-stone-200 bg-white text-stone-600 hover:text-stone-900"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleToggleActive(c)}
                      title={c.isActive ? 'Pausar campanha' : 'Ativar campanha'}
                      className="p-2 rounded-lg border border-stone-200 bg-white text-stone-600 hover:text-amber-700"
                    >
                      <Power className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(c.id)}
                      title="Excluir campanha"
                      className="p-2 rounded-lg border border-stone-200 bg-white text-stone-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

