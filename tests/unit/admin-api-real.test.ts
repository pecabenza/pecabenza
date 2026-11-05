import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as verifyAuthGET } from '@/app/api/admin/auth/verify/route';
import { POST as logoutPOST } from '@/app/api/admin/auth/logout/route';
import { GET as sectionsGET, POST as sectionsPOST } from '@/app/api/admin/sections/route';
import { GET as brandingGET, POST as brandingPOST } from '@/app/api/admin/branding/route';
import { GET as productsGET, POST as productsPOST } from '@/app/api/admin/products/route';
import { GET as seoAuditGET } from '@/app/api/seo/audit/route';

// Mocks do Supabase e Tenancy
let mockAuthUser: { id: string; email: string } | null = null;
let mockMemberRole: string | null = 'tenant_admin';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: mockAuthUser },
        error: mockAuthUser ? null : { message: 'Not logged in' },
      })),
      signOut: vi.fn(async () => ({ error: null })),
    },
  })),
}));

const mockDbData = {
  sections: [
    {
      id: 'sec-test-1',
      tenant_id: '00000000-0000-0000-0000-000000000001',
      page_id: 'page-home',
      section_type: 'HeroEditorial',
      variant: 'default',
      display_order: 1,
      is_active: true,
      content: {
        badge: 'Cardápio Ativo',
        title: 'Comida de Verdade',
        subtitle: 'Pratos congelados com sabor autêntico.',
        primary_cta_label: 'Ver Pratos',
        primary_cta_href: '/produtos',
      },
    },
  ],
  products: [
    {
      id: 'prod-test-1',
      tenant_id: '00000000-0000-0000-0000-000000000001',
      name: 'Prato Especial',
      slug: 'prato-especial',
      status: 'active',
      is_featured: true,
      variants: [],
      information: null,
      category: null,
    },
  ],
  branding: {
    tenant_id: '00000000-0000-0000-0000-000000000001',
    logo_url: '/assets/brands/benza/logo-primary.svg',
    favicon_url: '/assets/brands/benza/favicon.svg',
    color_primary: '#A84B2C',
    color_secondary: '#D99B26',
    color_accent: '#2C1A14',
    color_background: '#FDFBF7',
    color_surface: '#FFFFFF',
    color_text: '#1C1917',
    border_radius: '0.75rem',
  },
  settings: {
    tenant_id: '00000000-0000-0000-0000-000000000001',
    prelaunch_banner_text: 'Em breve: pratos congelados',
    prelaunch_cta_text: 'Em breve',
    seo_defaults: {
      default_meta_title: 'Loja',
      default_meta_description: 'Descrição',
    },
  },
};

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => {
    const map = new Map<string, string>([
      ['x-tenant-host', 'benza.localhost:3000'],
      ['host', 'benza.localhost:3000'],
    ]);
    return {
      get: (key: string) => map.get(key) || null,
      has: (key: string) => map.has(key),
      entries: () => map.entries(),
    };
  }),
}));

vi.mock('@/lib/supabase/admin', () => {
  const createChainable = (table: string) => {
    const defaultData =
      table === 'products'
        ? mockDbData.products
        : table === 'product_variants'
        ? []
        : mockDbData.sections;

    const singleData =
      table === 'products'
        ? { ...mockDbData.products[0], id: 'new-id' }
        : table === 'tenant_branding'
        ? mockDbData.branding
        : table === 'tenant_settings'
        ? mockDbData.settings
        : { ...mockDbData.sections[0], id: 'new-id' };

    const queryObj: any = {
      select: vi.fn(() => queryObj),
      insert: vi.fn((data: any) => ({
        ...queryObj,
        select: vi.fn(() => ({
          single: vi.fn(() => ({
            data: singleData,
            error: null,
          })),
        })),
        error: null,
      })),
      update: vi.fn((data: any) => queryObj),
      delete: vi.fn(() => queryObj),
      in: vi.fn(() => queryObj),
      upsert: vi.fn(() => queryObj),
      eq: vi.fn((field: string, val: any) => queryObj),
      order: vi.fn(() => ({
        data: defaultData,
        error: null,
      })),
      maybeSingle: vi.fn(() => {
        if (table === 'tenant_members') {
          return {
            data: mockMemberRole ? { role: mockMemberRole } : null,
            error: null,
          };
        }
        if (table === 'tenant_pages') {
          return { data: { id: 'page-home', slug: 'home', title: 'Home' }, error: null };
        }
        if (table === 'tenant_branding') return { data: mockDbData.branding, error: null };
        if (table === 'tenant_settings') return { data: mockDbData.settings, error: null };
        return { data: null, error: null };
      }),
      single: vi.fn(() => ({
        data: singleData,
        error: null,
      })),
      data: defaultData,
      error: null,
    };
    return queryObj;
  };

  return {
    createAdminClient: vi.fn(() => ({
      from: vi.fn((table: string) => createChainable(table)),
    })),
  };
});

describe('Rotas Administrativas Reais (Etapa 1F)', () => {
  beforeEach(() => {
    mockAuthUser = { id: 'user-admin-1', email: 'admin@benza.com.br' };
    mockMemberRole = 'tenant_admin';
    vi.clearAllMocks();
  });

  describe('Autenticação e Verificação de Membro (/api/admin/auth/verify)', () => {
    it('deve aprovar acesso para usuário autenticado com papel de admin no tenant', async () => {
      const req = new NextRequest('http://benza.localhost:3000/api/admin/auth/verify', {
        headers: { host: 'benza.localhost:3000' },
      });

      const res = await verifyAuthGET(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.role).toBe('tenant_admin');
    });

    it('deve rejeitar e barrar usuário autenticado que NÃO pertence ao tenant (tenant errado)', async () => {
      mockMemberRole = null; // Sem vínculo em tenant_members

      const req = new NextRequest('http://benza.localhost:3000/api/admin/auth/verify', {
        headers: { host: 'benza.localhost:3000' },
      });

      const res = await verifyAuthGET(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error).toContain('Acesso negado');
      expect(data.isMember).toBe(false);
    });

    it('deve rejeitar acesso quando usuário não estiver autenticado', async () => {
      mockAuthUser = null;

      const req = new NextRequest('http://benza.localhost:3000/api/admin/auth/verify', {
        headers: { host: 'benza.localhost:3000' },
      });

      const res = await verifyAuthGET(req);
      expect(res.status).toBe(401);
    });

    it('deve encerrar sessão no logout (/api/admin/auth/logout)', async () => {
      const res = await logoutPOST();
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('CMS Persistente (/api/admin/sections)', () => {
    it('deve listar seções do tenant para a página home', async () => {
      const req = new NextRequest('http://benza.localhost:3000/api/admin/sections?page=home', {
        headers: { host: 'benza.localhost:3000' },
      });

      const res = await sectionsGET(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.sections.length).toBeGreaterThan(0);
    });

    it('deve validar e persistir seção com schema estrito Zod', async () => {
      const validPayload = {
        page_id: 'page-home',
        section_type: 'HeroEditorial',
        content: {
          title: 'Novo Título Editorial',
          subtitle: 'Subtítulo válido para teste.',
          primary_cta_label: 'Botão 1',
          primary_cta_href: '/produtos',
        },
      };

      const req = new NextRequest('http://benza.localhost:3000/api/admin/sections', {
        method: 'POST',
        headers: {
          host: 'benza.localhost:3000',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validPayload),
      });

      const res = await sectionsPOST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('deve rejeitar seção com dados malformados pelo schema Zod', async () => {
      const invalidPayload = {
        page_id: 'page-home',
        section_type: 'HeroEditorial',
        content: {
          // Faltando title obrigatório
          subtitle: 'Apenas subtítulo',
        },
      };

      const req = new NextRequest('http://benza.localhost:3000/api/admin/sections', {
        method: 'POST',
        headers: {
          host: 'benza.localhost:3000',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invalidPayload),
      });

      const res = await sectionsPOST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('inválido');
    });
  });

  describe('Identidade Visual e Branding (/api/admin/branding)', () => {
    it('deve persistir paleta de cores e logomarca oficial com validação hexadecimal', async () => {
      const validBranding = {
        logo_url: '/assets/brands/benza/logo-primary.svg',
        favicon_url: '/assets/brands/benza/favicon.svg',
        color_primary: '#A84B2C',
        color_secondary: '#D99B26',
        color_accent: '#2C1A14',
        color_background: '#FDFBF7',
        color_surface: '#FFFFFF',
        color_text: '#1C1917',
        border_radius: '0.75rem',
        prelaunch_banner_text: 'Em breve: cardápio de congelados',
      };

      const req = new NextRequest('http://benza.localhost:3000/api/admin/branding', {
        method: 'POST',
        headers: {
          host: 'benza.localhost:3000',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validBranding),
      });

      const res = await brandingPOST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('deve rejeitar cores fora do padrão hexadecimal', async () => {
      const invalidBranding = {
        color_primary: 'cor-invalida',
        color_secondary: '#D99B26',
        color_accent: '#2C1A14',
        color_background: '#FDFBF7',
        color_surface: '#FFFFFF',
        color_text: '#1C1917',
      };

      const req = new NextRequest('http://benza.localhost:3000/api/admin/branding', {
        method: 'POST',
        headers: {
          host: 'benza.localhost:3000',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invalidBranding),
      });

      const res = await brandingPOST(req);
      expect(res.status).toBe(400);
    });
  });

  describe('Produtos e Ficha Técnica (/api/admin/products)', () => {
    it('deve salvar prato com porções e ficha técnica', async () => {
      const productPayload = {
        name: 'Feijoada Artesanal',
        category_name: 'Pratos Principais',
        status: 'active',
        is_featured: true,
        variants: [
          { name: '500 ml', unit_type: 'ml', unit_value: 500, price_in_cents: 4800, is_available: true },
        ],
        ingredients: 'Feijão preto e carnes.',
        allergens: 'Não contém glúten.',
      };

      const req = new NextRequest('http://benza.localhost:3000/api/admin/products', {
        method: 'POST',
        headers: {
          host: 'benza.localhost:3000',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(productPayload),
      });

      const res = await productsPOST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Auditoria SEO Dinâmica (/api/seo/audit)', () => {
    it('deve auditar o tenant sem palavras-chave ou títulos hardcoded', async () => {
      const req = new NextRequest('http://benza.localhost:3000/api/seo/audit', {
        headers: { host: 'benza.localhost:3000' },
      });

      const res = await seoAuditGET(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.summary.totalAuditedPages).toBeGreaterThan(0);
    });
  });
});

