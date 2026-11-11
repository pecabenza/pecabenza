'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Bike,
  Plus,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Phone,
  ShieldCheck,
  UserCheck,
  AlertTriangle,
} from 'lucide-react';
import { DRIVER_TYPE_LABELS, DRIVER_AVAILABILITY_LABELS } from '@/modules/delivery/delivery.engine';
import type { DriverWithMetrics } from '@/modules/delivery/delivery.service';

export default function EntregadoresAdminPage() {
  const [drivers, setDrivers] = useState<DriverWithMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal de cadastro
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formType, setFormType] = useState<'internal' | 'freelance' | 'third_party'>('internal');
  const [formVehicle, setFormVehicle] = useState<'motorcycle' | 'car' | 'bicycle' | 'other'>('motorcycle');
  const [formPlate, setFormPlate] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const fetchDrivers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/delivery/drivers?includeInactive=${includeInactive}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar entregadores.');
      setDrivers(data.drivers || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    fetchDrivers();
  }, [fetchDrivers]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/delivery/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          phone: formPhone,
          driverType: formType,
          vehicleType: formVehicle,
          vehiclePlate: formPlate || null,
          notes: formNotes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao cadastrar entregador.');

      setShowCreateModal(false);
      setFormName('');
      setFormPhone('');
      setFormPlate('');
      setFormNotes('');
      await fetchDrivers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (
    driverId: string,
    payload: { availabilityStatus?: 'available' | 'on_route' | 'offline'; isActive?: boolean }
  ) => {
    try {
      const res = await fetch('/api/admin/delivery/drivers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao atualizar status.');
      await fetchDrivers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const activeCount = drivers.filter((d) => d.is_active).length;
  const availableCount = drivers.filter((d) => d.is_active && d.availability_status === 'available').length;
  const onRouteCount = drivers.filter((d) => d.is_active && d.availability_status === 'on_route').length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5">
            <Bike className="w-6 h-6 text-amber-600" />
            Entregadores & Motoboys
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            Gerencie motoboys próprios, diaristas e parceiros terceirizados, disponibilidade e histórico de entregas.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchDrivers}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-stone-300 bg-white text-stone-700 text-sm font-medium hover:bg-stone-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Novo Entregador
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-stone-200 p-4 shadow-sm">
          <span className="text-xs font-medium text-stone-500 uppercase">Entregadores Ativos</span>
          <div className="text-2xl font-bold text-stone-900 mt-1">{activeCount}</div>
        </div>
        <div className="bg-white rounded-xl border border-stone-200 p-4 shadow-sm">
          <span className="text-xs font-medium text-emerald-600 uppercase">Disponíveis na Loja</span>
          <div className="text-2xl font-bold text-emerald-700 mt-1">{availableCount}</div>
        </div>
        <div className="bg-white rounded-xl border border-stone-200 p-4 shadow-sm">
          <span className="text-xs font-medium text-amber-600 uppercase">Em Rota Agora</span>
          <div className="text-2xl font-bold text-amber-700 mt-1">{onRouteCount}</div>
        </div>
      </div>

      {/* Filtro */}
      <div className="flex items-center justify-between">
        <label className="inline-flex items-center gap-2 text-sm text-stone-600 cursor-pointer">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="rounded border-stone-300 text-amber-600 focus:ring-amber-500"
          />
          <span>Mostrar entregadores inativos</span>
        </label>
      </div>

      {/* Lista */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
        {loading && drivers.length === 0 ? (
          <div className="p-8 text-center text-stone-500 text-sm">Carregando entregadores...</div>
        ) : drivers.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <Bike className="w-10 h-10 text-stone-300 mx-auto" />
            <p className="text-stone-600 font-medium">Nenhum entregador cadastrado ainda.</p>
            <p className="text-xs text-stone-400">Cadastre um motoboy próprio ou terceirizado para iniciar despachos.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200 text-xs uppercase text-stone-500 font-semibold">
                  <th className="px-4 py-3">Entregador</th>
                  <th className="px-4 py-3">Vínculo & Veículo</th>
                  <th className="px-4 py-3">Disponibilidade</th>
                  <th className="px-4 py-3 text-center">Entregas / Falhas</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-sm">
                {drivers.map((drv) => (
                  <tr key={drv.id} className={!drv.is_active ? 'bg-stone-50/70 opacity-60' : 'hover:bg-stone-50/50'}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-stone-900">{drv.name}</div>
                      <div className="text-xs text-stone-500 flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3" />
                        <span>{drv.phone}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block px-2 py-0.5 rounded bg-stone-100 text-stone-700 text-xs font-medium">
                        {DRIVER_TYPE_LABELS[drv.driver_type] || drv.driver_type}
                      </span>
                      <div className="text-xs text-stone-500 mt-1">
                        {drv.vehicle_type === 'motorcycle'
                          ? 'Moto'
                          : drv.vehicle_type === 'car'
                          ? 'Carro'
                          : drv.vehicle_type === 'bicycle'
                          ? 'Bicicleta'
                          : 'Outro'}
                        {drv.vehicle_plate ? ` • Placa ${drv.vehicle_plate}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={drv.availability_status}
                        disabled={!drv.is_active}
                        onChange={(e) =>
                          handleUpdateStatus(drv.id, {
                            availabilityStatus: e.target.value as 'available' | 'on_route' | 'offline',
                          })
                        }
                        className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border ${
                          drv.availability_status === 'available'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            : drv.availability_status === 'on_route'
                            ? 'bg-amber-50 border-amber-200 text-amber-700'
                            : 'bg-stone-100 border-stone-200 text-stone-600'
                        }`}
                      >
                        <option value="available">{DRIVER_AVAILABILITY_LABELS.available}</option>
                        <option value="on_route">{DRIVER_AVAILABILITY_LABELS.on_route}</option>
                        <option value="offline">{DRIVER_AVAILABILITY_LABELS.offline}</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="inline-flex items-center gap-3 text-xs">
                        <span className="text-emerald-700 font-semibold flex items-center gap-1">
                          <UserCheck className="w-3.5 h-3.5" />
                          {drv.deliveredCount}
                        </span>
                        <span className="text-red-600 font-semibold flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5" />
                          {drv.failedCount}
                        </span>
                        {drv.activeDeliveriesCount > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">
                            {drv.activeDeliveriesCount} em rota
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleUpdateStatus(drv.id, { isActive: !drv.is_active })}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium border ${
                          drv.is_active
                            ? 'border-stone-200 text-stone-600 hover:bg-stone-100'
                            : 'border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                        }`}
                      >
                        {drv.is_active ? (
                          <>
                            <XCircle className="w-3.5 h-3.5" /> Desativar
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" /> Reativar
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Cadastro */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-stone-900">Cadastrar Entregador</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-stone-400 hover:text-stone-600 text-sm"
              >
                Fechar
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Nome completo *</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex: Carlos Eduardo"
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">WhatsApp / Telefone *</label>
                <input
                  type="text"
                  required
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="Ex: 11999998888"
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Vínculo</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
                  >
                    <option value="internal">Motoboy Próprio</option>
                    <option value="freelance">Avulso / Diarista</option>
                    <option value="third_party">Terceirizado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Veículo</label>
                  <select
                    value={formVehicle}
                    onChange={(e) => setFormVehicle(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
                  >
                    <option value="motorcycle">Moto</option>
                    <option value="car">Carro</option>
                    <option value="bicycle">Bicicleta</option>
                    <option value="other">Outro</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Placa (opcional)</label>
                <input
                  type="text"
                  value={formPlate}
                  onChange={(e) => setFormPlate(e.target.value)}
                  placeholder="Ex: ABC-1D23"
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Observações</label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Ex: Possui baú térmico grande para congelados"
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg border border-stone-300 text-sm font-medium text-stone-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : 'Salvar Entregador'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="text-xs text-stone-400 flex items-center gap-1.5">
        <ShieldCheck className="w-4 h-4 text-emerald-600" />
        <span>Dados de entregadores isolados por estabelecimento via RLS multi-tenant.</span>
      </div>
    </div>
  );
}

