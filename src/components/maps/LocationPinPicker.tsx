'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  MapPin,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';

interface LocationPinPickerProps {
  initialCoords: { lat: number; lng: number };
  addressLabel?: string;
  confirmed: boolean;
  onChangeCoords: (coords: { lat: number; lng: number }) => void;
  onConfirm: (coords: { lat: number; lng: number }) => void;
}

declare global {
  interface Window {
    L?: any;
  }
}

const STEP_DEG = 0.00045; // ~50 metros por ajuste acessível

export function LocationPinPicker({
  initialCoords,
  addressLabel,
  confirmed,
  onChangeCoords,
  onConfirm,
}: LocationPinPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  const [coords, setCoords] = useState(initialCoords);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);

  useEffect(() => {
    setCoords(initialCoords);
    if (markerRef.current && mapInstanceRef.current) {
      markerRef.current.setLatLng([initialCoords.lat, initialCoords.lng]);
      mapInstanceRef.current.setView([initialCoords.lat, initialCoords.lng], 16);
    }
  }, [initialCoords.lat, initialCoords.lng]);

  useEffect(() => {
    let cancelled = false;

    async function ensureLeaflet(): Promise<any> {
      if (typeof window === 'undefined') return null;
      if (window.L) return window.L;

      if (!document.getElementById('leaflet-css-cdn')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css-cdn';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      await new Promise<void>((resolve, reject) => {
        const existing = document.getElementById('leaflet-js-cdn') as HTMLScriptElement | null;
        if (existing && window.L) {
          resolve();
          return;
        }
        const script = existing || document.createElement('script');
        script.id = 'leaflet-js-cdn';
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Falha ao carregar Leaflet'));
        if (!existing) document.body.appendChild(script);
      });

      return window.L;
    }

    ensureLeaflet()
      .then((L) => {
        if (cancelled || !L || !mapContainerRef.current) return;
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }

        const map = L.map(mapContainerRef.current).setView([coords.lat, coords.lng], 16);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map);

        const marker = L.marker([coords.lat, coords.lng], { draggable: true }).addTo(map);

        const updatePosition = (lat: number, lng: number) => {
          const next = { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
          setCoords(next);
          onChangeCoords(next);
        };

        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          updatePosition(pos.lat, pos.lng);
        });

        map.on('click', (ev: any) => {
          marker.setLatLng(ev.latlng);
          updatePosition(ev.latlng.lat, ev.latlng.lng);
        });

        mapInstanceRef.current = map;
        markerRef.current = marker;
        setMapReady(true);
      })
      .catch(() => {
        if (!cancelled) setMapError(true);
      });

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
      }
    };
  }, []);

  const nudge = (dLat: number, dLng: number) => {
    const next = {
      lat: Number((coords.lat + dLat).toFixed(6)),
      lng: Number((coords.lng + dLng).toFixed(6)),
    };
    setCoords(next);
    onChangeCoords(next);
    if (markerRef.current && mapInstanceRef.current) {
      markerRef.current.setLatLng([next.lat, next.lng]);
      mapInstanceRef.current.panTo([next.lat, next.lng]);
    }
  };

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3.5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold text-stone-900">
          <MapPin className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Confirmar Localização no Mapa</span>
        </div>
        {confirmed ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
            <CheckCircle2 className="w-3 h-3" />
            Ponto confirmado
          </span>
        ) : (
          <span className="text-[11px] text-amber-700 font-semibold">
            Arraste o pino, clique no mapa ou use os botões abaixo
          </span>
        )}
      </div>

      {addressLabel && <p className="text-xs text-stone-600">{addressLabel}</p>}

      {!mapError ? (
        <div
          ref={mapContainerRef}
          className="w-full h-56 rounded-lg border border-stone-200 bg-stone-100 z-0"
          aria-label="Mapa interativo para ajustar o marcador da localização"
        >
          {!mapReady && (
            <div className="w-full h-full flex items-center justify-center text-xs text-stone-500">
              Carregando mapa OpenStreetMap...
            </div>
          )}
        </div>
      ) : (
        <div className="p-3 rounded-lg bg-stone-50 border border-stone-200 text-xs text-stone-600">
          Visualização do mapa indisponível offline. Você ainda pode ajustar pelas setas acessíveis ou confirmar o ponto calculado.
        </div>
      )}

      {/* Controles acessíveis para quem não consegue arrastar o pino */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-1.5" role="group" aria-label="Ajuste fino acessível do marcador">
          <button
            type="button"
            onClick={() => nudge(STEP_DEG, 0)}
            aria-label="Mover marcador para o norte (~50m)"
            className="p-1.5 rounded border border-stone-300 bg-white hover:bg-stone-50 text-stone-700"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => nudge(-STEP_DEG, 0)}
            aria-label="Mover marcador para o sul (~50m)"
            className="p-1.5 rounded border border-stone-300 bg-white hover:bg-stone-50 text-stone-700"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => nudge(0, -STEP_DEG)}
            aria-label="Mover marcador para o oeste (~50m)"
            className="p-1.5 rounded border border-stone-300 bg-white hover:bg-stone-50 text-stone-700"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => nudge(0, STEP_DEG)}
            aria-label="Mover marcador para o leste (~50m)"
            className="p-1.5 rounded border border-stone-300 bg-white hover:bg-stone-50 text-stone-700"
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setCoords(initialCoords);
              onChangeCoords(initialCoords);
              if (markerRef.current && mapInstanceRef.current) {
                markerRef.current.setLatLng([initialCoords.lat, initialCoords.lng]);
                mapInstanceRef.current.setView([initialCoords.lat, initialCoords.lng], 16);
              }
            }}
            aria-label="Restaurar posição sugerida"
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded border border-stone-300 bg-white hover:bg-stone-50 text-[11px] font-medium text-stone-700"
          >
            <RotateCcw className="w-3 h-3" />
            Restaurar
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono text-stone-500">
            {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
          </span>
          <button
            type="button"
            onClick={() => onConfirm(coords)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Confirmar neste ponto
          </button>
        </div>
      </div>
    </div>
  );
}

