import {
  DELIVERY_CACHE_POLICY,
  type GeocodeAddressInput,
  type GeocodeResult,
  type MapRoutingProvider,
  type RouteCalculationInput,
  type RouteResult,
} from './map-routing.types';
import {
  MapProviderNotConfiguredError,
  MapProviderRequestError,
} from './google-routes.adapter';

export interface OrsRateLimitSnapshot {
  remaining?: number;
  limit?: number;
  reset?: number;
  retryAfterSeconds?: number;
  updatedAt: string;
}

interface PeliasProperties {
  label?: string;
  layer?: string;
  match_type?: string;
  accuracy?: string;
  confidence?: number;
  housenumber?: string;
  street?: string;
  locality?: string;
  localadmin?: string;
  county?: string;
  region?: string;
  region_a?: string;
}

function normalizeCityText(val: string): string {
  return val
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sin1 = Math.sin(dLat / 2);
  const sin2 = Math.sin(dLng / 2);
  const h = sin1 * sin1 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sin2 * sin2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function isValidCoordinatePair(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

/**
 * Critério conservador para precisão Pelias/OpenRouteService:
 * Não presume que 'exact' ou 'point' equivale automaticamente a 'rooftop' sem validar
 * camada 'address', confiança mínima e presença de número predial quando informado.
 */
export function evaluatePeliasPrecision(
  props: PeliasProperties | undefined,
  requestedNumber: string
): GeocodeResult['precision'] {
  if (!props) return 'approximate';

  const layer = (props.layer || '').toLowerCase();
  const matchType = (props.match_type || '').toLowerCase();
  const accuracy = (props.accuracy || '').toLowerCase();
  const confidence = typeof props.confidence === 'number' ? props.confidence : 0;
  const hasRequestedNumber = Boolean(requestedNumber.trim()) && requestedNumber.trim().toUpperCase() !== 'S/N';
  const hasReturnedNumber = Boolean(props.housenumber && props.housenumber.trim());

  if (layer !== 'address') {
    if (layer === 'street' || layer === 'neighbourhood' || layer === 'locality' || layer === 'venue') {
      return 'geometric_center';
    }
    return 'approximate';
  }

  if (hasRequestedNumber && !hasReturnedNumber) {
    // Endereço tinha número, mas o geocodificador retornou sem número confirmado
    return 'geometric_center';
  }

  if (
    (accuracy === 'point' || matchType === 'exact') &&
    confidence >= 0.8
  ) {
    return 'rooftop';
  }

  if (matchType === 'interpolated' && confidence >= 0.7) {
    return 'range_interpolated';
  }

  return 'geometric_center';
}

function isTransientHttpStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Adaptador server-side para OpenRouteService (HeiGIT — api.heigit.org).
 * Inclui timeout, retentativas limitadas para falhas transitórias e monitoramento de headers.
 */
export class OpenRouteServiceAdapter implements MapRoutingProvider {
  readonly name = 'openrouteservice' as const;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly fetchImpl: typeof fetch;
  private lastRateLimit: OrsRateLimitSnapshot | null = null;

  constructor(options: {
    apiKey?: string;
    timeoutMs?: number;
    maxRetries?: number;
    retryBaseDelayMs?: number;
    fetchImpl?: typeof fetch;
  } = {}) {
    this.apiKey = (options.apiKey ?? process.env.OPENROUTESERVICE_API_KEY ?? '').trim();
    this.timeoutMs = options.timeoutMs ?? DELIVERY_CACHE_POLICY.providerTimeoutMs;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 150;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  getLastRateLimitInfo(): OrsRateLimitSnapshot | null {
    return this.lastRateLimit;
  }

  private captureRateLimitHeaders(headers: Headers): void {
    const rem = headers.get('x-ratelimit-remaining');
    const lim = headers.get('x-ratelimit-limit');
    const rst = headers.get('x-ratelimit-reset');
    const retryAfter = headers.get('retry-after');
    if (rem || lim || rst || retryAfter) {
      this.lastRateLimit = {
        remaining: rem !== null ? Number(rem) : undefined,
        limit: lim !== null ? Number(lim) : undefined,
        reset: rst !== null ? Number(rst) : undefined,
        retryAfterSeconds: retryAfter !== null ? Number(retryAfter) : undefined,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  private mapHttpError(status: number, context: string): MapProviderRequestError {
    if (status === 400) {
      return new MapProviderRequestError(
        `Requisição inválida ao OpenRouteService (${context}).`,
        400
      );
    }
    if (status === 401 || status === 403) {
      return new MapProviderRequestError(
        `Credencial ou permissão recusada pelo OpenRouteService (${context}).`,
        status
      );
    }
    if (status === 429) {
      return new MapProviderRequestError(
        `Limite de requisições atingido no OpenRouteService (${context}).`,
        429
      );
    }
    return new MapProviderRequestError(
      `Indisponibilidade temporária (HTTP ${status}) no OpenRouteService (${context}).`,
      status
    );
  }

  private async fetchWithRetry(
    url: string,
    init: RequestInit,
    context: string
  ): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(url, { ...init, signal: controller.signal });
        this.captureRateLimitHeaders(res.headers);
        if (res.ok) {
          return res;
        }
        const err = this.mapHttpError(res.status, context);
        if (!isTransientHttpStatus(res.status) || attempt === this.maxRetries) {
          throw err;
        }
        lastError = err;
      } catch (err: unknown) {
        if (err instanceof MapProviderRequestError && err.statusCode && !isTransientHttpStatus(err.statusCode)) {
          throw err;
        }
        const isAbort = (err as { name?: string })?.name === 'AbortError';
        lastError = isAbort
          ? new MapProviderRequestError(
              `Tempo limite excedido (${this.timeoutMs}ms) no OpenRouteService (${context}).`
            )
          : err;
        if (attempt === this.maxRetries) {
          throw lastError;
        }
      } finally {
        clearTimeout(timer);
      }

      const delay = this.retryBaseDelayMs * Math.pow(2, attempt);
      await sleep(delay);
    }
    throw lastError;
  }

  async geocodeAddress(input: GeocodeAddressInput): Promise<GeocodeResult> {
    if (!this.apiKey) {
      throw new MapProviderNotConfiguredError(
        'OPENROUTESERVICE_API_KEY não configurada no servidor.'
      );
    }

    const queryText = [
      `${input.street.trim()} ${input.number.trim()}`.trim(),
      input.neighborhood.trim(),
      input.city.trim(),
      input.state.trim(),
      input.zipCode.trim(),
      input.country || 'Brasil',
    ]
      .filter(Boolean)
      .join(', ');

    const url = new URL('https://api.heigit.org/pelias/v1/search');
    url.searchParams.set('text', queryText);
    url.searchParams.set('boundary.country', 'BRA');
    if (input.biasCenter && isValidCoordinatePair(input.biasCenter.lat, input.biasCenter.lng)) {
      const radiusKm = Math.min(50, Math.max(5, input.biasCenter.radiusKm ?? 30));
      url.searchParams.set('focus.point.lat', String(input.biasCenter.lat));
      url.searchParams.set('focus.point.lon', String(input.biasCenter.lng));
      url.searchParams.set('boundary.circle.lat', String(input.biasCenter.lat));
      url.searchParams.set('boundary.circle.lon', String(input.biasCenter.lng));
      url.searchParams.set('boundary.circle.radius', String(radiusKm));
    }
    url.searchParams.set('size', '1');
    url.searchParams.set('api_key', this.apiKey);

    const res = await this.fetchWithRetry(
      url.toString(),
      { method: 'GET', headers: { Accept: 'application/json' } },
      'geocodificação'
    );

    const data = (await res.json()) as {
      features?: Array<{
        geometry?: { coordinates?: [number, number] };
        properties?: PeliasProperties;
      }>;
    };

    const feature = data.features?.[0];
    const coords = feature?.geometry?.coordinates;
    if (!coords || coords.length < 2 || !isValidCoordinatePair(coords[1], coords[0])) {
      throw new MapProviderRequestError(
        'Endereço não localizado ou com coordenadas inválidas no OpenRouteService.'
      );
    }

    const [lng, lat] = coords;
    const props = feature?.properties;
    const returnedCity = props?.locality || props?.localadmin || props?.county || '';
    if (
      returnedCity &&
      input.city.trim() &&
      normalizeCityText(returnedCity) !== normalizeCityText(input.city)
    ) {
      throw new MapProviderRequestError(
        `Localização incompatível com o município informado (${returnedCity} ≠ ${input.city}).`
      );
    }

    if (input.biasCenter && isValidCoordinatePair(input.biasCenter.lat, input.biasCenter.lng)) {
      const maxStraightKm = Math.max(15, (input.biasCenter.radiusKm ?? 30) * 1.5);
      const dist = haversineKm(input.biasCenter, { lat, lng });
      if (dist > maxStraightKm) {
        throw new MapProviderRequestError(
          `Coordenada retornada (${dist.toFixed(1)} km) excede o limite geográfico esperado da cidade.`
        );
      }
    }

    return {
      lat,
      lng,
      formattedAddress: props?.label || queryText,
      precision: evaluatePeliasPrecision(props, input.number),
      provider: 'openrouteservice',
    };
  }

  async calculateRoute(input: RouteCalculationInput): Promise<RouteResult> {
    if (!this.apiKey) {
      throw new MapProviderNotConfiguredError(
        'OPENROUTESERVICE_API_KEY não configurada no servidor.'
      );
    }

    if (
      !isValidCoordinatePair(input.origin.lat, input.origin.lng) ||
      !isValidCoordinatePair(input.destination.lat, input.destination.lng)
    ) {
      throw new MapProviderRequestError('Coordenadas de origem ou destino inválidas.', 400);
    }

    const res = await this.fetchWithRetry(
      'https://api.heigit.org/openrouteservice/v2/directions/driving-car',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: this.apiKey,
        },
        body: JSON.stringify({
          coordinates: [
            [input.origin.lng, input.origin.lat],
            [input.destination.lng, input.destination.lat],
          ],
          units: 'm',
        }),
      },
      'cálculo de rota'
    );

    const data = (await res.json()) as {
      routes?: Array<{
        summary?: { distance?: number; duration?: number };
      }>;
    };

    const summary = data.routes?.[0]?.summary;
    if (!summary || typeof summary.distance !== 'number' || summary.distance < 0) {
      throw new MapProviderRequestError(
        'Nenhuma rota rodoviária encontrada entre origem e destino no OpenRouteService.'
      );
    }

    return {
      distanceMeters: Math.round(summary.distance),
      durationSeconds: Math.ceil(summary.duration || 0),
      provider: 'openrouteservice',
    };
  }
}
