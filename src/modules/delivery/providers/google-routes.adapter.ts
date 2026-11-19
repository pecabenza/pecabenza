import {
  DELIVERY_CACHE_POLICY,
  type GeocodeAddressInput,
  type GeocodeResult,
  type MapRoutingProvider,
  type RouteCalculationInput,
  type RouteResult,
} from './map-routing.types';

export class MapProviderNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MapProviderNotConfiguredError';
  }
}

export class MapProviderRequestError extends Error {
  constructor(message: string, public readonly statusCode?: number) {
    super(message);
    this.name = 'MapProviderRequestError';
  }
}

function mapGoogleLocationTypeToPrecision(
  locationType?: string
): GeocodeResult['precision'] {
  switch (locationType) {
    case 'ROOFTOP':
      return 'rooftop';
    case 'RANGE_INTERPOLATED':
      return 'range_interpolated';
    case 'GEOMETRIC_CENTER':
      return 'geometric_center';
    default:
      return 'approximate';
  }
}

function parseGoogleDurationSeconds(durationStr?: string): number {
  if (!durationStr) return 0;
  const match = durationStr.match(/^(\d+(?:\.\d+)?)s$/);
  return match ? Math.ceil(Number(match[1])) : 0;
}

/**
 * Adaptador server-side para Google Maps Platform (Geocoding API + Routes API v2).
 * Não utiliza tráfego em tempo real (TRAFFIC_UNAWARE) para manter custo previsível.
 */
export class GoogleRoutesAdapter implements MapRoutingProvider {
  readonly name = 'google' as const;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: {
    apiKey?: string;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  } = {}) {
    this.apiKey = (options.apiKey ?? process.env.GOOGLE_MAPS_API_KEY ?? '').trim();
    this.timeoutMs = options.timeoutMs ?? DELIVERY_CACHE_POLICY.providerTimeoutMs;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async geocodeAddress(input: GeocodeAddressInput): Promise<GeocodeResult> {
    if (!this.apiKey) {
      throw new MapProviderNotConfiguredError(
        'GOOGLE_MAPS_API_KEY não configurada no servidor.'
      );
    }

    const formattedQuery = [
      `${input.street.trim()}, ${input.number.trim()}`,
      input.neighborhood.trim(),
      `${input.city.trim()} - ${input.state.trim()}`,
      input.zipCode.trim(),
      input.country || 'Brasil',
    ]
      .filter(Boolean)
      .join(', ');

    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', formattedQuery);
    url.searchParams.set('language', 'pt-BR');
    url.searchParams.set('region', 'br');
    url.searchParams.set('key', this.apiKey);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await this.fetchImpl(url.toString(), {
        method: 'GET',
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new MapProviderRequestError(
          `Erro HTTP ${res.status} ao geocodificar endereço no Google Maps.`,
          res.status
        );
      }

      const data = (await res.json()) as {
        status?: string;
        error_message?: string;
        results?: Array<{
          formatted_address?: string;
          geometry?: {
            location?: { lat?: number; lng?: number };
            location_type?: string;
          };
        }>;
      };

      if (data.status === 'ZERO_RESULTS' || !data.results || data.results.length === 0) {
        throw new MapProviderRequestError(
          'Endereço não localizado pelo serviço de geocodificação.'
        );
      }

      if (data.status && data.status !== 'OK') {
        throw new MapProviderRequestError(
          data.error_message || `Falha na geocodificação Google (${data.status}).`
        );
      }

      const top = data.results[0];
      const lat = top.geometry?.location?.lat;
      const lng = top.geometry?.location?.lng;
      if (typeof lat !== 'number' || typeof lng !== 'number') {
        throw new MapProviderRequestError('Coordenadas geográficas ausentes na resposta.');
      }

      return {
        lat,
        lng,
        formattedAddress: top.formatted_address || formattedQuery,
        precision: mapGoogleLocationTypeToPrecision(top.geometry?.location_type),
        provider: 'google',
      };
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') {
        throw new MapProviderRequestError('Tempo limite excedido ao geocodificar endereço.');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async calculateRoute(input: RouteCalculationInput): Promise<RouteResult> {
    if (!this.apiKey) {
      throw new MapProviderNotConfiguredError(
        'GOOGLE_MAPS_API_KEY não configurada no servidor.'
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await this.fetchImpl(
        'https://routes.googleapis.com/directions/v2:computeRoutes',
        {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.apiKey,
            'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration',
          },
          body: JSON.stringify({
            origin: {
              location: {
                latLng: { latitude: input.origin.lat, longitude: input.origin.lng },
              },
            },
            destination: {
              location: {
                latLng: { latitude: input.destination.lat, longitude: input.destination.lng },
              },
            },
            travelMode: 'DRIVE',
            routingPreference: input.includeTraffic ? 'TRAFFIC_AWARE' : 'TRAFFIC_UNAWARE',
            languageCode: 'pt-BR',
            units: 'METRIC',
          }),
        }
      );

      if (!res.ok) {
        throw new MapProviderRequestError(
          `Erro HTTP ${res.status} ao calcular rota no Google Routes API.`,
          res.status
        );
      }

      const data = (await res.json()) as {
        routes?: Array<{
          distanceMeters?: number;
          duration?: string;
        }>;
      };

      const route = data.routes?.[0];
      if (!route || typeof route.distanceMeters !== 'number') {
        throw new MapProviderRequestError(
          'Nenhuma rota rodoviária encontrada entre origem e destino.'
        );
      }

      return {
        distanceMeters: route.distanceMeters,
        durationSeconds: parseGoogleDurationSeconds(route.duration),
        provider: 'google',
      };
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') {
        throw new MapProviderRequestError('Tempo limite excedido ao calcular rota rodoviária.');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
