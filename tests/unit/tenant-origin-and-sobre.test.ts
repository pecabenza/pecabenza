import { describe, it, expect } from 'vitest';
import { getTenantPublicOrigin } from '@/lib/tenancy/origin';
import { DEFAULT_DEV_CONTEXT } from '@/lib/tenancy/context';
import type { TenantFullContext } from '@/types/database.types';

describe('getTenantPublicOrigin', () => {
  it('usa http:// para domínio primário localhost/subdomínio local', () => {
    const origin = getTenantPublicOrigin(DEFAULT_DEV_CONTEXT);
    expect(origin).toBe('http://benza.localhost');
  });

  it('usa https:// para domínio de produção primário e verificado', () => {
    const ctx: TenantFullContext = {
      ...DEFAULT_DEV_CONTEXT,
      domains: [
        {
          id: 'd1',
          tenant_id: DEFAULT_DEV_CONTEXT.tenant.id,
          hostname: 'preview.pecabenza.com.br',
          is_primary: false,
          is_verified: true,
          created_at: '',
        },
        {
          id: 'd2',
          tenant_id: DEFAULT_DEV_CONTEXT.tenant.id,
          hostname: 'pecabenza.com.br',
          is_primary: true,
          is_verified: true,
          created_at: '',
        },
      ],
    };

    expect(getTenantPublicOrigin(ctx)).toBe('https://pecabenza.com.br');
  });

  it('ignora domínio não verificado quando existe domínio verificado', () => {
    const ctx: TenantFullContext = {
      ...DEFAULT_DEV_CONTEXT,
      domains: [
        {
          id: 'd1',
          tenant_id: DEFAULT_DEV_CONTEXT.tenant.id,
          hostname: 'atacante.com',
          is_primary: true,
          is_verified: false,
          created_at: '',
        },
        {
          id: 'd2',
          tenant_id: DEFAULT_DEV_CONTEXT.tenant.id,
          hostname: 'benza.com.br',
          is_primary: false,
          is_verified: true,
          created_at: '',
        },
      ],
    };

    expect(getTenantPublicOrigin(ctx)).toBe('https://benza.com.br');
  });
});

