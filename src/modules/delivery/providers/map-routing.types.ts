export interface GeocodeAddressInput {
  zipCode: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  country?: string;
  biasCenter?: {
    lat: number;
    lng: number;
    radiusKm?: number;
  };
}

export type MapProviderType = 'google' | 'mapbox' | 'openrouteservice';

export interface GeocodeResult {
  lat: number;
  lng: number;
  formattedAddress: string;
  precision: 'rooftop' | 'range_interpolated' | 'geometric_center' | 'approximate';
  provider: MapProviderType;
}

export interface RouteCalculationInput {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  avoidTolls?: boolean;
  includeTraffic?: boolean;
}

export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  provider: MapProviderType;
  polyLine?: string;
}

export interface GeocodingProvider {
  readonly name: MapProviderType;
  geocodeAddress(input: GeocodeAddressInput): Promise<GeocodeResult>;
}

export interface RouteCalculationProvider {
  readonly name: MapProviderType;
  calculateRoute(input: RouteCalculationInput): Promise<RouteResult>;
}

export interface MapRoutingProvider extends GeocodingProvider, RouteCalculationProvider {}

/**
 * Política recomendada de cache para respeitar termos contratuais e controlar custos:
 * - Geocodificação: cache temporário/chaveado conforme contrato do provedor (Google: armazenar place_id/coordenadas conforme ToS; Mapbox: distinguir endpoint temporário vs permanente).
 * - Rota rodoviária: cache curto em memória/Redis por par (origem, destino arredondado) sem persistência indevida de PII.
 * - Cotação comercial: persistida em delivery_quotes com expires_at próprio (ex.: 15 min) e vínculo a cart_hash + address_hash.
 */
export const DELIVERY_CACHE_POLICY = {
  routeCacheTtlSeconds: 300,
  commercialQuoteTtlSeconds: 900,
  providerTimeoutMs: 4000,
} as const;

