import { createAdminClient } from '@/lib/supabase/admin';
import type { TenantPage, TenantPageSection } from '@/types/database.types';

const MOCK_HOME_SECTIONS: TenantPageSection[] = [
  {
    id: 'sec-01',
    tenant_id: '00000000-0000-0000-0000-000000000001',
    page_id: 'page-home',
    section_type: 'HeroEditorial',
    variant: 'editorial',
    display_order: 1,
    is_active: true,
    content: {
      badge: 'Cardápio Inaugural em Breve',
      title: 'O sabor e o conforto em sua mesa',
      subtitle: 'Receitas clássicas preparadas com cuidado e atenção, prontas para aquecer e acolher a sua rotina e momentos especiais.',
      primary_cta_label: 'Conheça o Cardápio',
      primary_cta_href: '/produtos',
      secondary_cta_label: 'Nossa Proposta',
      secondary_cta_href: '/sobre',
      highlight_note: 'Modo pré-lançamento ativo — Cardápio inaugural em breve',
      image_url: '/assets/brands/benza/mockup-hero-editorial.jpg',
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'sec-02',
    tenant_id: '00000000-0000-0000-0000-000000000001',
    page_id: 'page-home',
    section_type: 'BrandStorySection',
    variant: 'split',
    display_order: 2,
    is_active: true,
    content: {
      eyebrow: 'Nossa Proposta',
      title: 'Cozinhar com dedicação para quem valoriza a boa mesa',
      lead_paragraph: 'Acreditamos que uma refeição prática não precisa abrir mão do cuidado. Nossos pratos unem receitas tradicionais ao conforto da cozinha de verdade.',
      description: 'Cada porção é preparada em lotes monitorados e imediatamente congelada, mantendo o frescor e os sabores originais prontos para o aquecimento.',
      cta_label: 'Leia nossa história completa',
      cta_href: '/sobre',
      image_url: '/assets/brands/benza/mockup-hero-editorial.jpg',
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'sec-03',
    tenant_id: '00000000-0000-0000-0000-000000000001',
    page_id: 'page-home',
    section_type: 'ProductShowcaseSection',
    variant: 'cards',
    display_order: 3,
    is_active: true,
    content: {
      title: 'Pratos em Destaque',
      subtitle: 'Porções individuais e para compartilhar, desenvolvidas com equilíbrio e sabor acolhedor.',
      show_variants: true,
      cta_label: 'Ver todo o cardápio',
      cta_href: '/produtos',
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'sec-04',
    tenant_id: '00000000-0000-0000-0000-000000000001',
    page_id: 'page-home',
    section_type: 'BenefitsSection',
    variant: 'grid',
    display_order: 4,
    is_active: true,
    content: {
      title: 'Por que escolher a BENZA',
      subtitle: 'Atenção dedicada do preparo ao momento em que o prato chega à sua mesa.',
      items: [
        {
          icon: 'UtensilsCrossed',
          title: 'Receitas Clássicas',
          description: 'Elaboração cuidadosa com temperos naturais e respeito ao tempo de cada prato.',
        },
        {
          icon: 'Snowflake',
          title: 'Conservação Congelada',
          description: 'Pratos congelados logo após o preparo com orientações de conservação na embalagem.',
        },
        {
          icon: 'Clock',
          title: 'Praticidade Real',
          description: 'Prontos para aquecer no fogão ou forno em poucos minutos, sem perda de sabor.',
        },
        {
          icon: 'ShieldCheck',
          title: 'Embalagens Seguras',
          description: 'Recipientes higiênicos livres de BPA projetados para conservar sabor e aroma.',
        },
      ],
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'sec-05',
    tenant_id: '00000000-0000-0000-0000-000000000001',
    page_id: 'page-home',
    section_type: 'CTASection',
    variant: 'banner',
    display_order: 5,
    is_active: true,
    content: {
      title: 'Fique por dentro do nosso lançamento oficial',
      description: 'Cadastre seu e-mail para receber o aviso inaugural de abertura de pedidos e novidades do nosso cardápio.',
      form_placeholder: 'Digite seu melhor e-mail',
      button_label: 'Quero ser avisado',
      disclaimer: 'Não enviamos spam. Apenas avisos relevantes sobre nossos pratos e disponibilidade.',
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'sec-06',
    tenant_id: '00000000-0000-0000-0000-000000000001',
    page_id: 'page-home',
    section_type: 'FAQSection',
    variant: 'accordion',
    display_order: 6,
    is_active: true,
    content: {
      title: 'Dúvidas Frequentes',
      subtitle: 'Tudo o que você precisa saber sobre nossos pratos, porções e conservação.',
      items: [
        {
          question: 'Como os pratos devem ser armazenados?',
          answer: 'Os pratos devem ser mantidos congelados conforme orientação da embalagem. Após descongelar, recomendamos manter sob refrigeração e consumir em até 24 horas.',
        },
        {
          question: 'Qual o rendimento das porções de 500 ml e 1000 ml?',
          answer: 'A embalagem de 500 ml atende perfeitamente uma pessoa com generosidade. A versão de 1000 ml é ideal para compartilhar entre duas pessoas.',
        },
        {
          question: 'Como funciona o modo de aquecimento?',
          answer: 'Cada prato acompanha instruções claras na embalagem e na ficha informativa. Podem ser aquecidos em panela, banho-maria ou forno convencional.',
        },
      ],
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'sec-07',
    tenant_id: '00000000-0000-0000-0000-000000000001',
    page_id: 'page-home',
    section_type: 'ContactSection',
    variant: 'split',
    display_order: 7,
    is_active: true,
    content: {
      title: 'Fale com nossa equipe',
      description: 'Estamos à disposição para esclarecer dúvidas, receber sugestões e ouvir você.',
      show_form: true,
      show_social: true,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export async function getTenantPageWithSections(tenantId: string, slug: string): Promise<TenantPage | null> {
  try {
    const supabase = createAdminClient();
    const { data: pageData, error: pageError } = await supabase
      .from('tenant_pages')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle();

    if (pageError || !pageData) {
      if (slug === 'home') {
        return {
          id: 'page-home',
          tenant_id: tenantId,
          slug: 'home',
          title: 'Página Inicial',
          meta_title: 'BENZA — Pratos Prontos Congelados',
          meta_description: 'Pratos preparados e congelados para aquecer e servir no seu dia a dia.',
          og_media_id: null,
          status: 'published',
          published_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          sections: MOCK_HOME_SECTIONS,
        };
      }
      return null;
    }

    const { data: sectionsData } = await supabase
      .from('tenant_page_sections')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('page_id', pageData.id)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    return {
      ...pageData,
      sections: sectionsData || [],
    };
  } catch {
    if (slug === 'home') {
      return {
        id: 'page-home',
        tenant_id: tenantId,
        slug: 'home',
        title: 'Página Inicial',
        meta_title: 'BENZA — Pratos Prontos Congelados',
        meta_description: 'Pratos preparados e congelados para aquecer e servir no seu dia a dia.',
        og_media_id: null,
        status: 'published',
        published_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        sections: MOCK_HOME_SECTIONS,
      };
    }
    return null;
  }
}

export async function getTenantPages(tenantId: string): Promise<TenantPage[]> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('tenant_pages')
      .select('*')
      .eq('tenant_id', tenantId);

    if (error || !data || data.length === 0) {
      return [
        {
          id: 'page-home',
          tenant_id: tenantId,
          slug: 'home',
          title: 'Página Inicial',
          meta_title: 'BENZA — Pratos Prontos Congelados',
          meta_description: 'Pratos preparados e congelados para aquecer e servir no seu dia a dia.',
          og_media_id: null,
          status: 'published',
          published_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 'page-sobre',
          tenant_id: tenantId,
          slug: 'sobre',
          title: 'Nossa Proposta',
          meta_title: 'Nossa Proposta | BENZA',
          meta_description: 'A dedicação e o cuidado por trás de cada prato preparado pela BENZA.',
          og_media_id: null,
          status: 'published',
          published_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 'page-produtos',
          tenant_id: tenantId,
          slug: 'produtos',
          title: 'Cardápio de Pratos',
          meta_title: 'Cardápio de Pratos | BENZA',
          meta_description: 'Conheça nosso cardápio de pratos preparados e porcionados da BENZA.',
          og_media_id: null,
          status: 'published',
          published_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];
    }

    return data;
  } catch {
    return [];
  }
}
