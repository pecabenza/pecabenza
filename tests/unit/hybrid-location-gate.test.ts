import { describe, it, expect, vi } from 'vitest';
import {
  OpenRouteServiceAdapter,
} from '@/modules/delivery/providers/openrouteservice.adapter';
import {
  computeCanonicalAddressHash,
  validateConfirmedCoordinates,
} from '@/modules/delivery/delivery-pricing.engine';
import { DeliveryQuoteService } from '@/modules/delivery/delivery-quote.service';
import type { MapRoutingProvider } from '@/modules/delivery/providers/map-routing.types';

describe('Gate C.6 — Localização Híbrida (boundary.circle, Município, Pino Confirmado e Cobertura)', () => {
  it('deve enviar boundary.circle e focus.point ao Pelias e rejeitar município divergente', async () => {
    let capturedUrl = '';
    const mockFetch = vi.fn(async (url: RequestInfo | URL) => {
      capturedUrl = String(url);
      return new Response(
        JSON.stringify({
          features: [
            {
              geometry: { coordinates: [-38.5, -12.9] },
              properties: {
                label: 'Estrada do Papagaio, Salvador, BA',
                layer: 'street',
                locality: 'Salvador',
              },
            },
          ],
        }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;

    const adapter = new OpenRouteServiceAdapter({ apiKey: 'ors-key', fetchImpl: mockFetch });
    await expect(
      adapter.geocodeAddress({
        zipCode: '44000-000',
        street: 'Estrada do Papagaio',
        number: '1200',
        neighborhood: 'Papagaio',
        city: 'Feira de Santana',
        state: 'BA',
        biasCenter: { lat: -12.2616, lng: -38.9656, radiusKm: 25 },
      })
    ).rejects.toThrow('incompatível com o município');

    expect(capturedUrl).toContain('boundary.circle.lat=-12.2616');
    expect(capturedUrl).toContain('boundary.circle.lon=-38.9656');
    expect(capturedUrl).toContain('boundary.circle.radius=25');
    expect(capturedUrl).toContain('focus.point.lat=-12.2616');
  });

  it('validateConfirmedCoordinates deve rejeitar (0,0) e pino fora do raio máximo no servidor', () => {
    const origin = { lat: -12.2616, lng: -38.9656 };

    expect(
      validateConfirmedCoordinates({
        origin,
        destination: { lat: 0, lng: 0 },
        maxCoverageKm: 10,
      }).valid
    ).toBe(false);

    // Salvador (~100 km de Feira de Santana) -> bloqueado para raio de 10 km
    const farCheck = validateConfirmedCoordinates({
      origin,
      destination: { lat: -12.9714, lng: -38.5014 },
      maxCoverageKm: 10,
    });
    expect(farCheck.valid).toBe(false);
    expect(farCheck.reason).toContain('fora da área máxima');

    // Centro próximo (~1.5 km) -> válido
    expect(
      validateConfirmedCoordinates({
        origin,
        destination: { lat: -12.255, lng: -38.958 },
        maxCoverageKm: 10,
      }).valid
    ).toBe(true);
  });

  it('computeCanonicalAddressHash deve alterar o hash quando o pino confirmado mudar', () => {
    const base = {
      zipCode: '44001-000',
      street: 'Av. Getúlio Vargas',
      number: '850',
      neighborhood: 'Centro',
      city: 'Feira de Santana',
      state: 'BA',
    };
    const h1 = computeCanonicalAddressHash({ ...base, confirmedCoords: { lat: -12.261, lng: -38.965 } });
    const h2 = computeCanonicalAddressHash({ ...base, confirmedCoords: { lat: -12.265, lng: -38.961 } });
    const hNoPin = computeCanonicalAddressHash(base);

    expect(h1).not.toBe(h2);
    expect(h1).not.toBe(hNoPin);
  });

  it('simulateAdminQuote com confirmedPin deve calcular rota rodoviária no servidor mesmo para rua sem número no Pelias', async () => {
    const calculateRouteMock = vi.fn(async () => ({
      distanceMeters: 4200,
      durationSeconds: 540,
      provider: 'openrouteservice' as const,
    }));
    const provider: MapRoutingProvider = {
      name: 'openrouteservice',
      geocodeAddress: vi.fn(async () => ({
        lat: -12.25,
        lng: -38.95,
        formattedAddress: 'Rua Sem Número, Feira de Santana',
        precision: 'geometric_center' as const,
        provider: 'openrouteservice' as const,
      })),
      calculateRoute: calculateRouteMock,
    };

    const res = await DeliveryQuoteService.simulateAdminQuote({
      origin: { lat: -12.2616, lng: -38.9656 },
      destination: {
        zipCode: '44002-000',
        street: 'Rua Castro Alves',
        number: '1200',
        neighborhood: 'Kalilândia',
        city: 'Feira de Santana',
        state: 'BA',
      },
      confirmedPin: { lat: -12.255, lng: -38.958 },
      simulatedSubtotalCents: 6000,
      config: {
        pricingMode: 'distance',
        pricingRuleVersion: 1,
        originVerified: true,
        fixedDeliveryFeeCents: 1200,
        baseDeliveryFeeCents: 500,
        perKmFeeCents: 150,
        minDeliveryFeeCents: 600,
        maxDeliveryFeeCents: 3000,
        maxDeliveryDistanceKm: 10,
        distanceRoundingMode: 'tenth_km',
        freeDeliveryThresholdCents: 18000,
        freeDeliveryMaxDistanceKm: 5,
        maxDeliverySubsidyCents: 1200,
        contingencyPolicy: 'block_on_failure',
      },
      provider,
    });

    expect(res.eligible).toBe(true);
    expect(res.quote.distanceKm).toBe(4.2);
    expect(res.quote.finalDeliveryFeeCents).toBe(1130); // 500 + 4.2 * 150
    expect(calculateRouteMock).toHaveBeenCalledTimes(1);
  });
});

