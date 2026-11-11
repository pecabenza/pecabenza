'use client';

import React, { use, useEffect, useState, useCallback, useRef } from 'react';
import {
  Bike,
  MapPin,
  Phone,
  Navigation,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  DollarSign,
  PackageCheck,
} from 'lucide-react';

interface DriverStop {
  deliveryId: string;
  orderId: string;
  orderNumber: string;
  stopSequence: number;
  deliveryStatus: string;
  deliveryStatusLabel: string;
  customerName: string;
  customerPhone: string;
  paymentMethod: string;
  paymentStatus: string;
  paymentToCollectCents: number;
  formattedPaymentToCollect: string;
  cashChangeForCents?: number | null;
  formattedCashChangeFor?: string | null;
  notes?: string | null;
  itemsSummary: string;
  address?: {
    street: string;
    number: string;
    complement?: string | null;
    neighborhood: string;
    city: string;
    state: string;
    reference?: string | null;
    fullAddressText: string;
    googleMapsUrl: string;
  } | null;
  proofRecipientName?: string | null;
  failureReason?: string | null;
}

interface DriverPortalData {
  expired?: boolean;
  reason?: string;
  tenantName?: string;
  runCode?: string;
  status?: string;
  locationSharingEnabled?: boolean;
  driverName?: string;
  stops?: DriverStop[];
}

export default function DriverPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);

  const [portal, setPortal] = useState<DriverPortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Modal de comprovação / ocorrência
  const [proofStop, setProofStop] = useState<DriverStop | null>(null);
  const [recipientName, setRecipientName] = useState('');
  const [relationship, setRelationship] = useState<'recipient' | 'concierge' | 'family' | 'other'>('recipient');
  const [paymentCollected, setPaymentCollected] = useState(false);
  const [proofNotes, setProofNotes] = useState('');

  const [failureStop, setFailureStop] = useState<DriverStop | null>(null);
  const [failureAction, setFailureAction] = useState<'failed_attempt' | 'returned_to_store'>('failed_attempt');
  const [failureReason, setFailureReason] = useState('');

  const geoWatchRef = useRef<number | null>(null);
  const lastPingSentRef = useRef<number>(0);

  const fetchPortal = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/driver/${token}`);
      const data = await res.json();
      if (res.status === 410) {
        setPortal({ expired: true, reason: data.error, runCode: data.runCode, status: data.status });
        return;
      }
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao carregar rota.');
      }
      setPortal(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchPortal();
  }, [fetchPortal]);

  // Compartilhamento opcional e voluntário de GPS enquanto autorizado e rota ativa
  useEffect(() => {
    if (!portal || portal.expired || !portal.locationSharingEnabled) {
      if (geoWatchRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(geoWatchRef.current);
        geoWatchRef.current = null;
      }
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return;
    }

    geoWatchRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const now = Date.now();
        // Envia no máximo a cada 15 segundos para economizar bateria/dados
        if (now - lastPingSentRef.current < 15000) return;
        lastPingSentRef.current = now;

        try {
          await fetch(`/api/driver/${token}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'ping_location',
              latitude: Number(pos.coords.latitude.toFixed(6)),
              longitude: Number(pos.coords.longitude.toFixed(6)),
              accuracyMeters: Math.round(pos.coords.accuracy || 0),
            }),
          });
        } catch {
          // silencioso
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );

    return () => {
      if (geoWatchRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(geoWatchRef.current);
        geoWatchRef.current = null;
      }
    };
  }, [portal?.locationSharingEnabled, portal?.expired, token]);

  const sendAction = async (payload: Record<string, any>) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/driver/${token}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar atualização.');
      await fetchPortal();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-8 text-center shadow-sm max-w-sm w-full space-y-3">
          <RefreshCw className="w-8 h-8 text-amber-600 animate-spin mx-auto" />
          <p className="text-sm font-semibold text-stone-700">Carregando rota de entrega...</p>
        </div>
      </div>
    );
  }

  if (portal?.expired) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-8 text-center shadow-sm max-w-md w-full space-y-4 border border-stone-200">
          <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
          <h1 className="text-xl font-bold text-stone-900">Rota Encerrada</h1>
          <p className="text-sm text-stone-600">
            {portal.reason || 'Todas as entregas desta rota foram concluídas e o rastreamento foi encerrado.'}
          </p>
          {portal.runCode && (
            <span className="inline-block px-3 py-1 rounded-full bg-stone-100 text-stone-600 text-xs font-mono">
              Romaneio {portal.runCode}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (!portal || error) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-8 text-center shadow-sm max-w-md w-full space-y-3 border border-red-200">
          <AlertTriangle className="w-10 h-10 text-red-500 mx-auto" />
          <h1 className="text-lg font-bold text-stone-900">Link Inválido ou Indisponível</h1>
          <p className="text-xs text-stone-500">{error || 'Não foi possível localizar esta rota.'}</p>
        </div>
      </div>
    );
  }

  const stops = portal.stops || [];

  return (
    <div className="min-h-screen bg-stone-100 pb-12 font-sans">
      {/* Cabeçalho Mobile */}
      <header className="bg-stone-900 text-white px-4 py-4 sticky top-0 z-30 shadow">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div>
            <span className="text-[11px] uppercase tracking-wider text-amber-400 font-bold block">
              {portal.tenantName} • {portal.runCode}
            </span>
            <h1 className="text-base font-bold flex items-center gap-2">
              <Bike className="w-4 h-4 text-amber-400" />
              Olá, {portal.driverName}
            </h1>
          </div>

          <button
            onClick={fetchPortal}
            className="p-2 rounded-lg bg-stone-800 text-stone-300 hover:text-white"
            aria-label="Atualizar rota"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-xl mx-auto p-4 space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Controle Explícito de Privacidade GPS (LGPD) */}
        <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Navigation
                className={`w-5 h-5 mt-0.5 shrink-0 ${
                  portal.locationSharingEnabled ? 'text-emerald-600 animate-pulse' : 'text-stone-400'
                }`}
              />
              <div>
                <span className="text-sm font-bold text-stone-900 block">
                  Compartilhar Localização em Rota
                </span>
                <span className="text-xs text-stone-500">
                  Opcional. Encerra automaticamente ao concluir a última entrega.
                </span>
              </div>
            </div>

            <button
              type="button"
              disabled={submitting}
              onClick={() =>
                sendAction({
                  type: 'toggle_location',
                  enabled: !portal.locationSharingEnabled,
                })
              }
              className={`px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 transition-colors ${
                portal.locationSharingEnabled
                  ? 'bg-emerald-600 text-white'
                  : 'bg-stone-200 text-stone-700'
              }`}
            >
              {portal.locationSharingEnabled ? 'Ativo' : 'Ativar'}
            </button>
          </div>
        </div>

        {/* Lista de Paradas */}
        <div className="space-y-4">
          {stops.map((stop) => {
            const isFinal = ['delivered', 'returned_to_store', 'cancelled', 'failed_attempt'].includes(
              stop.deliveryStatus
            );

            return (
              <div
                key={stop.deliveryId}
                className={`bg-white rounded-2xl border p-4 shadow-sm space-y-3 ${
                  stop.deliveryStatus === 'delivered'
                    ? 'border-emerald-200 bg-emerald-50/30'
                    : stop.deliveryStatus === 'failed_attempt'
                    ? 'border-red-200 bg-red-50/30'
                    : 'border-stone-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-amber-600 text-white font-bold text-xs flex items-center justify-center">
                      #{stop.stopSequence}
                    </span>
                    <div>
                      <span className="font-bold text-stone-900 text-sm block">
                        {stop.orderNumber} — {stop.customerName}
                      </span>
                      <span className="text-[11px] text-stone-500">{stop.deliveryStatusLabel}</span>
                    </div>
                  </div>
                </div>

                {/* Endereço + Navegação */}
                {stop.address && (
                  <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-2 text-xs">
                    <div className="flex items-start gap-2 text-stone-800">
                      <MapPin className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">{stop.address.fullAddressText}</p>
                        {stop.address.reference && (
                          <p className="text-stone-500 mt-0.5">Ref: {stop.address.reference}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <a
                        href={stop.address.googleMapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-center py-2 px-3 rounded-lg bg-stone-900 text-white font-semibold"
                      >
                        Abrir no Maps
                      </a>
                      {stop.customerPhone && (
                        <a
                          href={`tel:${stop.customerPhone}`}
                          className="inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-stone-300 bg-white text-stone-800 font-semibold"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          Ligar
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Itens & Cobrança */}
                <div className="text-xs text-stone-600 space-y-1">
                  <p>
                    <strong>Itens:</strong> {stop.itemsSummary}
                  </p>
                  {stop.notes && (
                    <p className="text-amber-800 bg-amber-50 p-2 rounded-lg">
                      <strong>Obs:</strong> {stop.notes}
                    </p>
                  )}
                </div>

                {stop.paymentToCollectCents > 0 ? (
                  <div className="p-3 rounded-xl bg-amber-100 border border-amber-300 text-amber-950 text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold">
                      <DollarSign className="w-4 h-4" />
                      <span>COBRAR NA ENTREGA: {stop.formattedPaymentToCollect}</span>
                    </div>
                    {stop.formattedCashChangeFor && (
                      <span className="font-semibold">Troco p/ {stop.formattedCashChangeFor}</span>
                    )}
                  </div>
                ) : (
                  <div className="p-2 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    Pedido já pago antecipadamente
                  </div>
                )}

                {/* Ações do Entregador */}
                {!isFinal ? (
                  <div className="grid grid-cols-1 gap-2 pt-1">
                    {stop.deliveryStatus === 'assigned' && (
                      <button
                        disabled={submitting}
                        onClick={() =>
                          sendAction({
                            type: 'progress',
                            deliveryId: stop.deliveryId,
                            toStatus: 'in_transit',
                          })
                        }
                        className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                      >
                        <PackageCheck className="w-4 h-4" />
                        Saí para esta Entrega
                      </button>
                    )}

                    {(stop.deliveryStatus === 'picked_up' || stop.deliveryStatus === 'in_transit') && (
                      <button
                        disabled={submitting}
                        onClick={() =>
                          sendAction({
                            type: 'progress',
                            deliveryId: stop.deliveryId,
                            toStatus: 'arrived',
                          })
                        }
                        className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold"
                      >
                        Cheguei no Endereço
                      </button>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        disabled={submitting}
                        onClick={() => {
                          setProofStop(stop);
                          setRecipientName(stop.customerName);
                          setPaymentCollected(stop.paymentToCollectCents > 0);
                          setProofNotes('');
                        }}
                        className="py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center justify-center gap-1"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Entregue
                      </button>

                      <button
                        disabled={submitting}
                        onClick={() => {
                          setFailureStop(stop);
                          setFailureAction('failed_attempt');
                          setFailureReason('');
                        }}
                        className="py-2.5 rounded-xl bg-red-100 text-red-700 text-xs font-bold flex items-center justify-center gap-1"
                      >
                        <XCircle className="w-4 h-4" />
                        Ocorrência
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-stone-600 pt-1">
                    {stop.proofRecipientName && (
                      <span>Recebido por: <strong>{stop.proofRecipientName}</strong></span>
                    )}
                    {stop.failureReason && (
                      <span className="text-red-700">Motivo: <strong>{stop.failureReason}</strong></span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="pt-4 text-center text-[11px] text-stone-400 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Acesso temporário restrito a esta rota • LGPD</span>
        </div>
      </main>

      {/* Modal Comprovante */}
      {proofStop && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-stone-900">
              Comprovante — {proofStop.orderNumber}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Nome de quem recebeu *
                </label>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Relação</label>
                <select
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
                >
                  <option value="recipient">Próprio Cliente</option>
                  <option value="concierge">Portaria / Zelador</option>
                  <option value="family">Familiar / Morador</option>
                  <option value="other">Outro</option>
                </select>
              </div>
              {proofStop.paymentToCollectCents > 0 && (
                <label className="flex items-center gap-2 text-xs font-semibold text-amber-900 bg-amber-50 p-3 rounded-lg">
                  <input
                    type="checkbox"
                    checked={paymentCollected}
                    onChange={(e) => setPaymentCollected(e.target.checked)}
                    className="rounded border-amber-400 text-emerald-600"
                  />
                  <span>Confirmo que recebi {proofStop.formattedPaymentToCollect}</span>
                </label>
              )}
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Observação (opcional)</label>
                <input
                  type="text"
                  value={proofNotes}
                  onChange={(e) => setProofNotes(e.target.value)}
                  placeholder="Ex: Deixado com porteiro Sr. José"
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setProofStop(null)}
                className="px-4 py-2 rounded-xl border border-stone-300 text-xs font-semibold text-stone-600"
              >
                Voltar
              </button>
              <button
                disabled={submitting || recipientName.trim().length < 2}
                onClick={async () => {
                  const target = proofStop;
                  setProofStop(null);
                  await sendAction({
                    type: 'confirm_proof',
                    deliveryId: target.deliveryId,
                    recipientName,
                    relationship,
                    paymentCollected,
                    notes: proofNotes || null,
                  });
                }}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold"
              >
                Confirmar Entrega
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ocorrência */}
      {failureStop && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-stone-900">
              Registrar Ocorrência — {failureStop.orderNumber}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Situação</label>
                <select
                  value={failureAction}
                  onChange={(e) => setFailureAction(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
                >
                  <option value="failed_attempt">Cliente Ausente / Tentativa Frustrada</option>
                  <option value="returned_to_store">Retornando para a Loja</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Motivo *</label>
                <textarea
                  rows={3}
                  value={failureReason}
                  onChange={(e) => setFailureReason(e.target.value)}
                  placeholder="Ex: Interfone sem resposta após 10 min e ligações não atendidas."
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setFailureStop(null)}
                className="px-4 py-2 rounded-xl border border-stone-300 text-xs font-semibold text-stone-600"
              >
                Voltar
              </button>
              <button
                disabled={submitting || failureReason.trim().length < 5}
                onClick={async () => {
                  const target = failureStop;
                  setFailureStop(null);
                  await sendAction({
                    type: 'record_failure',
                    deliveryId: target.deliveryId,
                    action: failureAction,
                    failureReason,
                  });
                }}
                className="px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-bold"
              >
                Salvar Ocorrência
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

