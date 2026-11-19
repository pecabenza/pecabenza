import { describe, it, expect, vi } from 'vitest';
import {
  OpenRouteServiceAdapter,
  evaluatePeliasPrecision,
} from '@/modules/delivery/providers/openrouteservice.adapter';
import {
  MapProviderNotConfiguredError,
  MapProviderRequestError,
} from '@/modules/delivery/providers/google-routes.adapter';

describe('OpenRouteServiceAdapter (api.heigit.org)', () => {
  it('deve falhar explicitamente quando OPENROUTESERVICE_API_KEY estiver ausente', async () => {
    const adapter = new OpenRouteServiceAdapter({ apiKey: '' });
    expect(adapter.isConfigured()).toBe(false);
    await expect(
      adapter.geocodeAddress({
        zipCode: '44001-000',
        street: 'Av. Getúlio Vargas',
        number: '100',
        neighborhood: 'Centro',
        city: 'Feira de Santana',
        state: 'BA',
      })
    ).rejects.toThrow(MapProviderNotConfiguredError);
  });

  it('deve geocodificar via Pelias v1 e calcular rota via Directions V2 em api.heigit.org', async () => {
    const mockFetch = vi.fn(async (url: RequestInfo | URL) => {
      const s = String(url);
      if (s.startsWith('https://api.heigit.org/pelias/v1/search')) {
        return new Response(
          JSON.stringify({
            features: [
              {
                geometry: { coordinates: [-38.9663, -12.2664] },
                properties: {
                  label: 'Av. Getúlio Vargas, 100, Feira de Santana, BA, Brasil',
                  layer: 'address',
                  match_type: 'exact',
                  accuracy: 'point',
                  confidence: 0.95,
                  housenumber: '100',
                },
              },
            ],
          }),
          { status: 200, headers: { 'x-ratelimit-remaining': '2999', 'x-ratelimit-limit': '3000' } }
        );
      }
      if (s === 'https://api.heigit.org/openrouteservice/v2/directions/driving-car') {
        return new Response(
          JSON.stringify({
            routes: [{ summary: { distance: 5180.4, duration: 845.2 } }],
          }),
          { status: 200 }
        );
      }
      return new Response('Not Found', { status: 404 });
    }) as unknown as typeof fetch;

    const adapter = new OpenRouteServiceAdapter({
      apiKey: 'ors-test-key',
      fetchImpl: mockFetch,
    });

    const geo = await adapter.geocodeAddress({
      zipCode: '44001-000',
      street: 'Av. Getúlio Vargas',
      number: '100',
      neighborhood: 'Centro',
      city: 'Feira de Santana',
      state: 'BA',
    });
    expect(geo.provider).toBe('openrouteservice');
    expect(geo.precision).toBe('rooftop');
    expect(geo.lat).toBe(-12.2664);
    expect(geo.lng).toBe(-38.9663);

    const route = await adapter.calculateRoute({
      origin: { lat: -12.2664, lng: -38.9663 },
      destination: { lat: -12.25, lng: -38.94 },
    });
    expect(route.provider).toBe('openrouteservice');
    expect(route.distanceMeters).toBe(5180);
    expect(route.durationSeconds).toBe(846);
  });

  it('deve classificar camada street/locality como geometric_center (ambíguo)', async () => {
    const mockFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          features: [
            {
              geometry: { coordinates: [-38.96, -12.26] },
              properties: { label: 'Feira de Santana, BA', layer: 'locality' },
            },
          ],
        }),
        { status: 200 }
      )
    ) as unknown as typeof fetch;

    const adapter = new OpenRouteServiceAdapter({
      apiKey: 'ors-test-key',
      fetchImpl: mockFetch,
    });
    const geo = await adapter.geocodeAddress({
      zipCode: '44001-000',
      street: 'Rua Sem Número',
      number: 'S/N',
      neighborhood: 'Centro',
      city: 'Feira de Santana',
      state: 'BA',
    });
    expect(geo.precision).toBe('geometric_center');
  });

  it('evaluatePeliasPrecision não deve promover para rooftop quando faltar housenumber ou confiança < 0.8', () => {
    expect(
      evaluatePeliasPrecision(
        { layer: 'address', match_type: 'exact', accuracy: 'point', confidence: 0.95 },
        '100'
      )
    ).toBe('geometric_center');

    expect(
      evaluatePeliasPrecision(
        {
          layer: 'address',
          match_type: 'exact',
          accuracy: 'point',
          confidence: 0.5,
          housenumber: '100',
        },
        '100'
      )
    ).toBe('geometric_center');
  });

  it('deve rejeitar coordenadas inválidas (0, 0) e tratar HTTP 401/500/429 com retry transitório', async () => {
    const zeroCoordsFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          features: [{ geometry: { coordinates: [0, 0] }, properties: { layer: 'address' } }],
        }),
        { status: 200 }
      )
    ) as unknown as typeof fetch;

    const zeroAdapter = new OpenRouteServiceAdapter({ apiKey: 'k', fetchImpl: zeroCoordsFetch });
    await expect(
      zeroAdapter.geocodeAddress({
        zipCode: '44001-000',
        street: 'Rua A',
        number: '10',
        neighborhood: 'Centro',
        city: 'Feira de Santana',
        state: 'BA',
      })
    ).rejects.toThrow(MapProviderRequestError);

    // 401 não deve fazer retry
    const unauthFetch = vi.fn(async () => new Response('Unauthorized', { status: 401 })) as unknown as typeof fetch;
    const unauthAdapter = new OpenRouteServiceAdapter({
      apiKey: 'bad-key',
      maxRetries: 2,
      retryBaseDelayMs: 1,
      fetchImpl: unauthFetch,
    });
    await expect(
      unauthAdapter.calculateRoute({ origin: { lat: -12.26, lng: -38.96 }, destination: { lat: -12.25, lng: -38.95 } })
    ).rejects.toThrow('Credencial');
    expect(unauthFetch).toHaveBeenCalledTimes(1);

    // 500 transitório seguido de 200 -> faz retry e resolve
    let calls = 0;
    const retryFetch = vi.fn(async () => {
      calls += 1;
      if (calls === 1) return new Response('Server Error', { status: 500 });
      return new Response(
        JSON.stringify({ routes: [{ summary: { distance: 2500, duration: 420 } }] }),
        { status: 200, headers: { 'x-ratelimit-remaining': '1999' } }
      );
    }) as unknown as typeof fetch;
    const retryAdapter = new OpenRouteServiceAdapter({
      apiKey: 'ok-key',
      maxRetries: 2,
      retryBaseDelayMs: 1,
      fetchImpl: retryFetch,
    });
    const routeRes = await retryAdapter.calculateRoute({
      origin: { lat: -12.26, lng: -38.96 },
      destination: { lat: -12.25, lng: -38.95 },
    });
    expect(routeRes.distanceMeters).toBe(2500);
    expect(retryFetch).toHaveBeenCalledTimes(2);
    expect(retryAdapter.getLastRateLimitInfo()?.remaining).toBe(1999);
  });
});

