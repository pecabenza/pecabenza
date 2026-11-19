import type {
  GeocodeAddressInput,
  GeocodeResult,
  MapRoutingProvider,
  RouteCalculationInput,
  RouteResult,
} from './map-routing.types';

/**
 * Adaptador preparado para Mapbox (Geocoding + Directions API).
 * Fase B: não executa chamadas HTTP externas até homologação da Fase C.
 */
export class MapboxDirectionsAdapter implements MapRoutingProvider {
  readonly name = 'mapbox' as const;

  constructor(private readonly config: { accessToken?: string; enabled?: boolean } = {}) {}

  async geocodeAddress(_input: GeocodeAddressInput): Promise<GeocodeResult> {
    if (!this.config.enabled || !this.config.accessToken) {
      throw new Error('Mapbox Geocoding não habilitado neste ambiente (Fase C pendente).');
    }
    throw new Error('Chamada externa Mapbox Geocoding bloqueada até homologação da Fase C.');
  }

  async calculateRoute(_input: RouteCalculationInput): Promise<RouteResult> {
    if (!this.config.enabled || !this.config.accessToken) {
      throw new Error('Mapbox Directions API não habilitada neste ambiente (Fase C pendente).');
    }
    throw new Error('Chamada externa Mapbox Directions bloqueada até homologação da Fase C.');
  }
}

