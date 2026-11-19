import crypto from 'crypto';
import {
  DELIVERY_CACHE_POLICY,
  type GeocodeAddressInput,
  type GeocodeResult,
  type MapProviderType,
  type MapRoutingProvider,
  type RouteCalculationInput,
  type RouteResult,
} from './map-routing.types';
import { GoogleRoutesAdapter } from './google-routes.adapter';
import { MapboxDirectionsAdapter } from './mapbox-directions.adapter';
import { OpenRouteServiceAdapter } from './openrouteservice.adapter';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const geocodeCache = new Map<string, CacheEntry<GeocodeResult>>();
const routeCache = new Map<string, CacheEntry<RouteResult>>();

// Controle de consumo por janela móvel (proteção de orçamento)
const providerCallTimestamps: number[] = [];
const MAX_EXTERNAL_CALLS_PER_MINUTE = 60;

export function clearMapRoutingCaches(): void {
  geocodeCache.clear();
  routeCache.clear();
  providerCallTimestamps.length = 0;
}

export function isHighConfidenceGeocodePrecision(
  precision: GeocodeResult['precision']
): boolean {
  return precision === 'rooftop' || precision === 'range_interpolated';
}

function consumeExternalQuotaOrThrow(): void {
  const now = Date.now();
  const cutoff = now - 60_000;
  while (providerCallTimestamps.length > 0 && providerCallTimestamps[0] < cutoff) {
    providerCallTimestamps.shift();
  }
  if (providerCallTimestamps.length >= MAX_EXTERNAL_CALLS_PER_MINUTE) {
    throw new Error(
      'Limite temporário de consultas ao provedor de mapas atingido. Aguarde alguns instantes.'
    );
  }
  providerCallTimestamps.push(now);
}

function buildGeocodeCacheKey(providerName: string, input: GeocodeAddressInput): string {
  const bias = input.biasCenter
    ? `${input.biasCenter.lat.toFixed(3)},${input.biasCenter.lng.toFixed(3)},${input.biasCenter.radiusKm ?? 30}`
    : 'nobias';
  const raw = [
    providerName,
    input.zipCode.replace(/\D/g, ''),
    input.street.trim().toLowerCase(),
    input.number.trim().toLowerCase(),
    input.neighborhood.trim().toLowerCase(),
    input.city.trim().toLowerCase(),
    input.state.trim().toUpperCase(),
    bias,
  ].join('|');
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function buildRouteCacheKey(providerName: string, input: RouteCalculationInput): string {
  // Arredondamento a 5 casas decimais (~1,1m) evita armazenar endereço pessoal na chave de rota
  const oLat = input.origin.lat.toFixed(5);
  const oLng = input.origin.lng.toFixed(5);
  const dLat = input.destination.lat.toFixed(5);
  const dLng = input.destination.lng.toFixed(5);
  return `${providerName}:${oLat},${oLng}->${dLat},${dLng}:${Boolean(input.includeTraffic)}`;
}

export function createMapRoutingProvider(
  providerName?: MapProviderType
): MapRoutingProvider {
  if (providerName === 'mapbox') {
    return new MapboxDirectionsAdapter();
  }
  if (providerName === 'google') {
    return new GoogleRoutesAdapter();
  }
  if (providerName === 'openrouteservice') {
    return new OpenRouteServiceAdapter();
  }
  // Auto-seleção por credencial configurada no servidor (prioriza OpenRouteService se configurado)
  if ((process.env.OPENROUTESERVICE_API_KEY || '').trim()) {
    return new OpenRouteServiceAdapter();
  }
  if ((process.env.GOOGLE_MAPS_API_KEY || '').trim()) {
    return new GoogleRoutesAdapter();
  }
  return new OpenRouteServiceAdapter();
}

/**
 * Executa geocodificação com cache efêmero e controle de cota/timeout.
 */
export async function geocodeAddressWithCache(
  provider: MapRoutingProvider,
  input: GeocodeAddressInput
): Promise<{ result: GeocodeResult; cached: boolean }> {
  const key = buildGeocodeCacheKey(provider.name, input);
  const now = Date.now();
  const hit = geocodeCache.get(key);
  if (hit && hit.expiresAt > now) {
    return { result: hit.value, cached: true };
  }

  consumeExternalQuotaOrThrow();
  const result = await provider.geocodeAddress(input);
  geocodeCache.set(key, {
    value: result,
    expiresAt: now + DELIVERY_CACHE_POLICY.routeCacheTtlSeconds * 1000,
  });
  return { result, cached: false };
}

/**
 * Executa cálculo de rota rodoviária com cache curto e proteção de cota.
 */
export async function calculateRouteWithCache(
  provider: MapRoutingProvider,
  input: RouteCalculationInput
): Promise<{ result: RouteResult; cached: boolean }> {
  const key = buildRouteCacheKey(provider.name, input);
  const now = Date.now();
  const hit = routeCache.get(key);
  if (hit && hit.expiresAt > now) {
    return { result: hit.value, cached: true };
  }

  consumeExternalQuotaOrThrow();
  const result = await provider.calculateRoute(input);
  routeCache.set(key, {
    value: result,
    expiresAt: now + DELIVERY_CACHE_POLICY.routeCacheTtlSeconds * 1000,
  });
  return { result, cached: false };
}

