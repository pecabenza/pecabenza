'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Truck,
  RefreshCw,
  MapPin,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Copy,
  MessageSquare,
  Navigation,
  UserCheck,
  XCircle,
  ShieldAlert,
  Send,
  Bike,
} from 'lucide-react';
import { DELIVERY_STATUS_LABELS } from '@/modules/delivery/delivery.engine';
import type {
  DispatchQueueOrder,
  ActiveDeliveryRunSummary,
  DriverWithMetrics,
} from '@/modules/delivery/delivery.service';

export default function ExpedicaoAdminPage() {
  const [readyOrders, setReadyOrders] = useState<DispatchQueueOrder[]>([]);
  const [failedDeliveries, setFailedDeliveries] = useState<DispatchQueueOrder[]>([]);
  const [activeRuns, setActiveRuns] = useState<ActiveDeliveryRunSummary[]>([]);
  const [drivers, setDrivers] = useState<DriverWithMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Seleção de pedidos para montar romaneio (preserva sequência selecionada)
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [routeNotes, setRouteNotes] = useState('');
  const [dispatching, setDispatching] = useState(false);

  // Link recém-gerado após despacho
  const [dispatchedResult, setDispatchedResult] = useState<{
    runCode: string;
    driverName: string;
    portalUrl: string;
    whatsappMessage: string;
    driverPhone?: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Modal de Comprovante / Ocorrência Admin
  const [proofModalDeliveryId, setProofModalDeliveryId] = useState<string | null>(null);
  const [proofRecipientName, setProofRecipientName] = useState('');
  const [proofRelationship, setProofRelationship] = useState<'recipient' | 'concierge' | 'family' | 'other'>('recipient');
  const [proofPaymentCollected, setProofPaymentCollected] = useState(false);

  const [failureModalDeliveryId, setFailureModalDeliveryId] = useState<string | null>(null);
  const [failureReason, setFailureReason] = useState('');
  const [failureAction, setFailureAction] = useState<'failed_attempt' | 'returned_to_store'>('failed_attempt');
  const [submittingAction, setSubmittingAction] = useState(false);

  const fetchBoard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/delivery/dispatch');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar painel de expedição.');
      setReadyOrders(data.readyOrders || []);
      setFailedDeliveries(data.failedOrReturnedDeliveries || []);
      setActiveRuns(data.activeRuns || []);
      setDrivers(data.drivers || []);

      if (!selectedDriverId && data.drivers?.length > 0) {
        const firstAvail = data.drivers.find((d: DriverWithMetrics) => d.availability_status === 'available');
        if (firstAvail) setSelectedDriverId(firstAvail.id);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedDriverId]);

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  const toggleSelectOrder = (orderId: string) => {
    setSelectedOrderIds((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId]
    );
  };

  const moveSelectedOrder = (orderId: string, direction: 'up' | 'down') => {
    setSelectedOrderIds((prev) => {
      const idx = prev.indexOf(orderId);
      if (idx === -1) return prev;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(targetIdx, 0, item);
      return copy;
    });
  };

  const handleDispatchRun = async () => {
    if (selectedOrderIds.length === 0 || !selectedDriverId) return;
    setDispatching(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/delivery/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId: selectedDriverId,
          orderIds: selectedOrderIds,
          routeStrategy: 'neighborhood_group',
          tokenExpiresHours: 12,
          notes: routeNotes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao despachar romaneio.');

      const driverObj = drivers.find((d) => d.id === selectedDriverId);
      setDispatchedResult({
        runCode: data.runCode,
        driverName: data.driverName,
        portalUrl: data.portalUrl,
        whatsappMessage: data.whatsappMessage,
        driverPhone: driverObj?.phone,
      });
      setSelectedOrderIds([]);
      setRouteNotes('');
      await fetchBoard();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDispatching(false);
    }
  };

  const handleDeliveryAction = async (deliveryId: string, payload: Record<string, any>) => {
    setSubmittingAction(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/delivery/orders/${deliveryId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao executar ação.');
      await fetchBoard();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleCloseRun = async (runId: string) => {
    try {
      const res = await fetch(`/api/admin/delivery/runs/${runId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete' }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Erro ao encerrar rota.');
      }
      await fetchBoard();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const copyPortalLink = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Totais do lote selecionado para conferência de troco e baú
  const allDispatchable = [...readyOrders, ...failedDeliveries.filter((f) => f.delivery?.delivery_status === 'failed_attempt')];
  const selectedOrdersData = selectedOrderIds
    .map((id) => allDispatchable.find((o) => o.orderId === id))
    .filter(Boolean) as DispatchQueueOrder[];

  const totalToCollectSelected = selectedOrdersData.reduce((acc, o) => acc + o.amountToCollectCents, 0);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5">
            <Truck className="w-6 h-6 text-amber-600" />
            Expedição, Rotas & Entregas
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            Agrupe pedidos prontos em romaneios, atribua motoboys e acompanhe cada entrega até o comprovante.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/admin/entregadores"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-stone-300 bg-white text-stone-700 text-sm font-medium hover:bg-stone-50"
          >
            <Bike className="w-4 h-4 text-amber-600" />
            Gerenciar Motoboys
          </Link>

          <button
            onClick={fetchBoard}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-stone-900 text-white text-sm font-medium hover:bg-stone-800"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Card de Link Gerado para o Entregador */}
      {dispatchedResult && (
        <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-900 font-bold">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span>
                Romaneio {dispatchedResult.runCode} despachado com {dispatchedResult.driverName}!
              </span>
            </div>
            <button
              onClick={() => setDispatchedResult(null)}
              className="text-xs text-emerald-700 hover:underline"
            >
              Dispensar
            </button>
          </div>
          <p className="text-xs text-emerald-800">
            Envie o link abaixo para o motoboy acessar as paradas, confirmar entregas e compartilhar localização se desejar:
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              readOnly
              value={dispatchedResult.portalUrl}
              className="flex-1 px-3 py-2 rounded-lg bg-white border border-emerald-300 text-xs font-mono text-stone-700"
            />
            <button
              onClick={() => copyPortalLink(dispatchedResult.portalUrl)}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-white border border-emerald-300 text-emerald-800 text-xs font-semibold hover:bg-emerald-100"
            >
              <Copy className="w-3.5 h-3.5" />
              {copiedLink ? 'Copiado!' : 'Copiar Link'}
            </button>
            {dispatchedResult.driverPhone && (
              <a
                href={`https://wa.me/55${dispatchedResult.driverPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
                  dispatchedResult.whatsappMessage
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Enviar WhatsApp
              </a>
            )}
          </div>
        </div>
      )}

      {/* Grid Principal: Fila Pronta para Despacho x Painel de Montagem */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna Esquerda (2/3): Pedidos Prontos na Expedição */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-stone-900">
                  Aguardando Despacho ({readyOrders.length})
                </h2>
                <p className="text-xs text-stone-500">
                  Ordenados por prioridade de agendamento e proximidade de bairro/CEP.
                </p>
              </div>
            </div>

            {readyOrders.length === 0 ? (
              <div className="p-8 text-center text-stone-500 text-sm">
                Nenhum pedido de entrega pronto aguardando despacho no momento.
              </div>
            ) : (
              <div className="divide-y divide-stone-100">
                {readyOrders.map((ord) => {
                  const isSelected = selectedOrderIds.includes(ord.orderId);
                  const stopIndex = selectedOrderIds.indexOf(ord.orderId);
                  return (
                    <div
                      key={ord.orderId}
                      onClick={() => toggleSelectOrder(ord.orderId)}
                      className={`p-4 cursor-pointer transition-colors flex items-start gap-3 ${
                        isSelected ? 'bg-amber-50/70' : 'hover:bg-stone-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="mt-1 rounded border-stone-300 text-amber-600 focus:ring-amber-500"
                      />
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-stone-900">{ord.orderNumber}</span>
                            <span className="text-sm text-stone-700 font-medium">{ord.customerName}</span>
                            {isSelected && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-600 text-white text-[11px] font-bold">
                                Parada #{stopIndex + 1}
                              </span>
                            )}
                            {ord.scheduleType === 'scheduled' && ord.scheduledFor && (
                              <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 text-[11px] font-semibold flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Agendado {new Date(ord.scheduledFor).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-mono font-semibold text-stone-800">
                            {ord.formattedTotal}
                          </span>
                        </div>

                        {ord.address && (
                          <div className="text-xs text-stone-600 flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                            <span>
                              <strong>{ord.address.neighborhood}</strong> — {ord.address.street}, {ord.address.number}
                              {ord.address.complement ? ` (${ord.address.complement})` : ''}
                            </span>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-500 pt-1">
                          <span>{ord.itemsSummary}</span>
                          {ord.amountToCollectCents > 0 ? (
                            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-semibold">
                              Cobrar na entrega: {ord.formattedAmountToCollect} ({ord.paymentMethod})
                              {ord.cashChangeForCents ? ` • Troco p/ R$ ${(ord.cashChangeForCents / 100).toFixed(2)}` : ''}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium">
                              Pago antecipado
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Ocorrências & Retornos Sanitários (Etapa 3D + 3E) */}
          {failedDeliveries.length > 0 && (
            <div className="bg-white rounded-xl border border-red-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-red-50 border-b border-red-200 flex items-center gap-2 text-red-900 font-bold text-sm">
                <ShieldAlert className="w-4 h-4 text-red-600" />
                Ocorrências & Retornos Pendentes ({failedDeliveries.length})
              </div>
              <div className="divide-y divide-stone-100">
                {failedDeliveries.map((item) => {
                  const deliv = item.delivery!;
                  return (
                    <div key={item.orderId} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-stone-900">{item.orderNumber}</span>
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-800">
                            {DELIVERY_STATUS_LABELS[deliv.delivery_status]}
                          </span>
                          <span className="text-xs text-stone-500">Tentativas: {deliv.attempt_count}</span>
                        </div>
                        <p className="text-xs text-stone-600">
                          Motivo: <strong>{deliv.failure_reason || 'Não informado'}</strong>
                        </p>
                        {deliv.sanitary_quarantine_required && (
                          <p className="text-xs text-amber-800 font-medium">
                            Produto congelado retornou da rota. Realize inspeção sanitária (Quarentena ou Descarte).
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {deliv.delivery_status === 'failed_attempt' && (
                          <button
                            onClick={() => toggleSelectOrder(item.orderId)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                              selectedOrderIds.includes(item.orderId)
                                ? 'bg-amber-600 text-white border-amber-600'
                                : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'
                            }`}
                          >
                            {selectedOrderIds.includes(item.orderId) ? 'Selecionado p/ Nova Rota' : 'Re-despachar'}
                          </button>
                        )}

                        {deliv.sanitary_quarantine_required && (
                          <>
                            <button
                              disabled={submittingAction}
                              onClick={() =>
                                handleDeliveryAction(deliv.id, {
                                  type: 'sanitary_quarantine',
                                  sanitaryAction: 'quarantine',
                                  reason: deliv.failure_reason || 'Retorno de entrega para quarentena',
                                })
                              }
                              className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700"
                            >
                              Enviar p/ Quarentena (3D)
                            </button>
                            <button
                              disabled={submittingAction}
                              onClick={() =>
                                handleDeliveryAction(deliv.id, {
                                  type: 'sanitary_quarantine',
                                  sanitaryAction: 'discard_loss',
                                  reason: deliv.failure_reason || 'Descarte por perda de cadeia de frio',
                                })
                              }
                              className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700"
                            >
                              Registrar Descarte
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Coluna Direita (1/3): Montagem de Romaneio */}
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-5 space-y-4 h-fit sticky top-6">
          <h2 className="font-bold text-stone-900 border-b border-stone-100 pb-3">
            Montar Romaneio de Saída
          </h2>

          {selectedOrdersData.length === 0 ? (
            <p className="text-xs text-stone-500 py-4 text-center">
              Clique nos pedidos prontos ao lado para agrupar uma rota de entrega.
            </p>
          ) : (
            <div className="space-y-2">
              <span className="text-xs font-semibold text-stone-600 block">
                Sequência de Paradas ({selectedOrdersData.length}):
              </span>
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {selectedOrdersData.map((ord, idx) => (
                  <div
                    key={ord.orderId}
                    className="flex items-center justify-between gap-2 p-2 rounded-lg bg-stone-50 border border-stone-200 text-xs"
                  >
                    <div className="truncate">
                      <span className="font-bold text-amber-700 mr-1.5">#{idx + 1}</span>
                      <span className="font-semibold text-stone-800">{ord.orderNumber}</span>
                      <span className="text-stone-500 ml-1">({ord.address?.neighborhood || 'Entrega'})</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => moveSelectedOrder(ord.orderId, 'up')}
                        disabled={idx === 0}
                        className="p-1 rounded hover:bg-stone-200 disabled:opacity-30"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSelectedOrder(ord.orderId, 'down')}
                        disabled={idx === selectedOrdersData.length - 1}
                        className="p-1 rounded hover:bg-stone-200 disabled:opacity-30"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {totalToCollectSelected > 0 && (
                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  <strong>Conferência do Baú:</strong> Motoboy precisa receber{' '}
                  <strong>R$ {(totalToCollectSelected / 100).toFixed(2)}</strong> na entrega.
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Entregador *</label>
            <select
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
            >
              <option value="">Selecione um motoboy...</option>
              {drivers.map((drv) => (
                <option key={drv.id} value={drv.id}>
                  {drv.name} (
                  {drv.availability_status === 'available'
                    ? 'Disponível'
                    : drv.availability_status === 'on_route'
                    ? 'Em Rota'
                    : 'Offline'}
                  )
                </option>
              ))}
            </select>
            {drivers.length === 0 && (
              <Link href="/admin/entregadores" className="text-xs text-amber-700 hover:underline mt-1 block">
                + Cadastrar primeiro entregador
              </Link>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Instruções da Rota (opcional)</label>
            <input
              type="text"
              value={routeNotes}
              onChange={(e) => setRouteNotes(e.target.value)}
              placeholder="Ex: Levar maquininha POS 02 + gelo reutilizável"
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
            />
          </div>

          <button
            disabled={dispatching || selectedOrderIds.length === 0 || !selectedDriverId}
            onClick={handleDispatchRun}
            className="w-full py-2.5 px-4 rounded-xl bg-amber-600 text-white text-sm font-bold hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
          >
            <Send className="w-4 h-4" />
            {dispatching ? 'Despachando...' : 'Despachar Romaneio & Gerar Link'}
          </button>
        </div>
      </div>

      {/* Seção: Rotas Ativas */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-stone-900">
          Rotas em Andamento ({activeRuns.length})
        </h2>

        {activeRuns.length === 0 ? (
          <div className="bg-white rounded-xl border border-stone-200 p-6 text-center text-stone-500 text-sm">
            Nenhuma rota ativa em trânsito no momento.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeRuns.map((item) => (
              <div key={item.run.id} className="bg-white rounded-xl border border-stone-200 shadow-sm p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-stone-900">{item.run.run_code}</span>
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-xs font-semibold">
                        {item.run.status === 'dispatched' ? 'Despachado' : 'Em Rota'}
                      </span>
                      {item.run.location_sharing_enabled && (
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[11px] font-semibold flex items-center gap-1">
                          <Navigation className="w-3 h-3 animate-pulse" />
                          GPS Autorizado
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-stone-500 mt-1">
                      Entregador: <strong>{item.driver?.name || 'Não atribuído'}</strong>
                    </p>
                  </div>

                  <button
                    onClick={() => handleCloseRun(item.run.id)}
                    className="text-xs px-2.5 py-1 rounded border border-stone-300 text-stone-600 hover:bg-stone-100"
                  >
                    Encerrar Rota
                  </button>
                </div>

                {item.latestLocation && (
                  <div className="text-xs bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 flex items-center justify-between">
                    <span className="text-emerald-800">
                      Último sinal GPS:{' '}
                      {new Date(item.latestLocation.recordedAt).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <a
                      href={`https://www.google.com/maps?q=${item.latestLocation.latitude},${item.latestLocation.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-700 font-semibold underline"
                    >
                      Abrir no Mapa
                    </a>
                  </div>
                )}

                <div className="space-y-2.5">
                  {item.stops.map((stop) => {
                    const isFinal = ['delivered', 'returned_to_store', 'cancelled'].includes(
                      stop.delivery.delivery_status
                    );
                    return (
                      <div key={stop.delivery.id} className="p-3 rounded-lg bg-stone-50 border border-stone-200 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-stone-800">
                            Parada #{stop.delivery.stop_sequence} • {stop.orderNumber} ({stop.customerName})
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded font-semibold ${
                              stop.delivery.delivery_status === 'delivered'
                                ? 'bg-emerald-100 text-emerald-800'
                                : stop.delivery.delivery_status === 'failed_attempt'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {DELIVERY_STATUS_LABELS[stop.delivery.delivery_status]}
                          </span>
                        </div>

                        {stop.address && (
                          <p className="text-[11px] text-stone-500">
                            {stop.address.street}, {stop.address.number} — {stop.address.neighborhood}
                          </p>
                        )}

                        {!isFinal && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {stop.delivery.delivery_status === 'assigned' && (
                              <button
                                onClick={() =>
                                  handleDeliveryAction(stop.delivery.id, {
                                    type: 'progress',
                                    toStatus: 'in_transit',
                                  })
                                }
                                className="px-2.5 py-1 rounded bg-blue-600 text-white text-[11px] font-semibold hover:bg-blue-700"
                              >
                                Em Trânsito
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setProofModalDeliveryId(stop.delivery.id);
                                setProofRecipientName(stop.customerName);
                                setProofPaymentCollected(stop.delivery.payment_to_collect_cents > 0);
                              }}
                              className="px-2.5 py-1 rounded bg-emerald-600 text-white text-[11px] font-semibold hover:bg-emerald-700 flex items-center gap-1"
                            >
                              <UserCheck className="w-3 h-3" />
                              Confirmar Entrega
                            </button>
                            <button
                              onClick={() => {
                                setFailureModalDeliveryId(stop.delivery.id);
                                setFailureReason('');
                                setFailureAction('failed_attempt');
                              }}
                              className="px-2.5 py-1 rounded bg-red-100 text-red-700 text-[11px] font-semibold hover:bg-red-200 flex items-center gap-1"
                            >
                              <XCircle className="w-3 h-3" />
                              Ocorrência
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Comprovante de Entrega (Admin) */}
      {proofModalDeliveryId && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-stone-900">Confirmar Comprovante de Entrega</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Nome de quem recebeu *</label>
                <input
                  type="text"
                  value={proofRecipientName}
                  onChange={(e) => setProofRecipientName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Relação</label>
                <select
                  value={proofRelationship}
                  onChange={(e) => setProofRelationship(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
                >
                  <option value="recipient">Próprio Cliente</option>
                  <option value="concierge">Portaria / Zelador</option>
                  <option value="family">Familiar / Morador</option>
                  <option value="other">Outro</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-xs text-stone-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={proofPaymentCollected}
                  onChange={(e) => setProofPaymentCollected(e.target.checked)}
                  className="rounded border-stone-300 text-emerald-600"
                />
                <span>Pagamento na entrega conferido / recebido</span>
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setProofModalDeliveryId(null)}
                className="px-4 py-2 rounded-lg border border-stone-300 text-sm text-stone-600"
              >
                Cancelar
              </button>
              <button
                disabled={submittingAction || !proofRecipientName.trim()}
                onClick={async () => {
                  const id = proofModalDeliveryId;
                  setProofModalDeliveryId(null);
                  await handleDeliveryAction(id, {
                    type: 'confirm_proof',
                    recipientName: proofRecipientName,
                    relationship: proofRelationship,
                    paymentCollected: proofPaymentCollected,
                  });
                }}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
              >
                Confirmar Entrega
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ocorrência / Falha */}
      {failureModalDeliveryId && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-stone-900">Registrar Ocorrência de Entrega</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Tipo de Ocorrência</label>
                <select
                  value={failureAction}
                  onChange={(e) => setFailureAction(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
                >
                  <option value="failed_attempt">Tentativa Frustrada (manter para re-despacho)</option>
                  <option value="returned_to_store">Retornou à Loja (aciona verificação sanitária)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Motivo detalhado *</label>
                <textarea
                  rows={3}
                  value={failureReason}
                  onChange={(e) => setFailureReason(e.target.value)}
                  placeholder="Ex: Porteiro informou que cliente viajou; telefone não atendeu."
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setFailureModalDeliveryId(null)}
                className="px-4 py-2 rounded-lg border border-stone-300 text-sm text-stone-600"
              >
                Cancelar
              </button>
              <button
                disabled={submittingAction || failureReason.trim().length < 5}
                onClick={async () => {
                  const id = failureModalDeliveryId;
                  setFailureModalDeliveryId(null);
                  await handleDeliveryAction(id, {
                    type: 'record_failure',
                    action: failureAction,
                    failureReason,
                  });
                }}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700"
              >
                Registrar Ocorrência
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

