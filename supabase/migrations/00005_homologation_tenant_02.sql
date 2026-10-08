-- ==============================================================================
-- Migration 00005: Tenant 02 de Homologação Multi-Tenant (Cacau & Flor)
-- ==============================================================================

DO $$
DECLARE
  v_tenant_id uuid := '00000000-0000-0000-0000-000000000002'::uuid;
  v_category_id uuid := gen_random_uuid();
  v_prod_bolo_id uuid := gen_random_uuid();
  v_page_home_id uuid := gen_random_uuid();
  v_page_sobre_id uuid := gen_random_uuid();
  v_page_produtos_id uuid := gen_random_uuid();
  v_page_contato_id uuid := gen_random_uuid();
BEGIN
  -- 1. Inserir Tenant 02 (Cacau & Flor)
  INSERT INTO public.tenants (id, name, slug, status, site_mode)
  VALUES (
    v_tenant_id,
    'Cacau & Flor',
    'cacau-flor',
    'active',
    'prelaunch'
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    site_mode = EXCLUDED.site_mode;

  -- 2. Domínios do Tenant 02
  INSERT INTO public.tenant_domains (tenant_id, hostname, is_primary, is_verified)
  VALUES 
    (v_tenant_id, 'cacauflor.localhost', true, true),
    (v_tenant_id, 'cacauflor.com.br', false, true)
  ON CONFLICT (hostname) DO NOTHING;

  -- 3. Configurações Operacionais do Tenant 02
  INSERT INTO public.tenant_settings (
    tenant_id,
    contact_email,
    contact_phone,
    contact_whatsapp,
    instagram_handle,
    address_summary,
    prelaunch_banner_text,
    prelaunch_cta_text,
    business_hours,
    seo_defaults
  ) VALUES (
    v_tenant_id,
    'encomendas@cacauflor.com.br',
    '+55 11 91234-5678',
    '+55 11 91234-5678',
    'cacauflor.confeitaria',
    'Belo Horizonte, MG — Confeitaria botânica sob encomenda',
    'Em breve: doces finos e bolos afetivos para celebrar seus momentos.',
    'Em breve',
    '{"atendimento": "Terça a Sábado, das 09h às 18h"}'::jsonb,
    '{"default_meta_title": "Cacau & Flor — Confeitaria Afetiva", "default_meta_description": "Bolos artesanais, doces finos e sabores botânicos sob encomenda."}'::jsonb
  )
  ON CONFLICT (tenant_id) DO UPDATE SET
    contact_email = EXCLUDED.contact_email,
    prelaunch_banner_text = EXCLUDED.prelaunch_banner_text;

  -- 4. Identidade Visual Distinta (Paleta Verde Oliva & Lavanda)
  INSERT INTO public.tenant_branding (
    tenant_id,
    font_family_heading,
    font_family_body,
    color_primary,
    color_secondary,
    color_accent,
    color_background,
    color_surface,
    color_text,
    border_radius
  ) VALUES (
    v_tenant_id,
    'Playfair Display',
    'Plus Jakarta Sans',
    '#4A583B', -- Verde Oliva
    '#8B6B88', -- Lavanda / Ameixa
    '#2B3322', -- Oliva Profundo
    '#F9F8F5', -- Creme Baunilha
    '#FFFFFF', -- Branco
    '#1A2016', -- Grafite Verdejante
    '1rem'     -- Cantos mais arredondados
  )
  ON CONFLICT (tenant_id) DO UPDATE SET
    color_primary = EXCLUDED.color_primary,
    color_secondary = EXCLUDED.color_secondary,
    color_accent = EXCLUDED.color_accent;

  -- 5. Categoria de Produtos do Tenant 02
  INSERT INTO public.product_categories (id, tenant_id, name, slug, display_order, is_active)
  VALUES (v_category_id, v_tenant_id, 'Bolos Especiais', 'bolos-especiais', 1, true)
  ON CONFLICT (tenant_id, slug) DO NOTHING;

  -- 6. Produto Inaugural do Tenant 02: Bolo de Nozes com Baba de Moça
  INSERT INTO public.products (
    id,
    tenant_id,
    category_id,
    name,
    slug,
    short_description,
    full_description,
    status,
    is_featured
  ) VALUES (
    v_prod_bolo_id,
    v_tenant_id,
    v_category_id,
    'Bolo de Nozes com Baba de Moça',
    'bolo-de-nozes-baba-de-moca',
    'Massa úmida de nozes chilenas intercalada com clássica baba de moça aveludada.',
    'Uma das receitas mais nobres e queridas da nossa confeitaria. Massa amanteigada enriquecida com farinha de nozes frescas moídas na hora, recheada com baba de moça tradicional cozida em tacho de cobre e finalizada com merengue tostado e flores comestíveis.',
    'active',
    true
  )
  ON CONFLICT (tenant_id, slug) DO NOTHING;

  -- Variações em Gramas (500 g e 1000 g)
  INSERT INTO public.product_variants (
    tenant_id,
    product_id,
    name,
    sku,
    unit_type,
    unit_value,
    price_in_cents,
    is_available,
    display_order
  ) VALUES 
    (v_tenant_id, v_prod_bolo_id, '500 g (Aproximadamente 4 a 6 fatias)', 'CCF-BOLO-500', 'g', 500, 6800, true, 1),
    (v_tenant_id, v_prod_bolo_id, '1000 g (Aproximadamente 10 a 12 fatias)', 'CCF-BOLO-1000', 'g', 1000, 12500, true, 2);

  -- Ficha Técnica
  INSERT INTO public.product_information (
    tenant_id,
    product_id,
    ingredients,
    allergens,
    conservation_instructions,
    preparation_instructions,
    nutritional_info
  ) VALUES (
    v_tenant_id,
    v_prod_bolo_id,
    'Nozes chilenas, farinha de trigo enriquecida, gemas pasteurizadas, açúcar demerara, leite de coco artesanal, ovos caipiras e baunilha natural em fava.',
    'Contém glúten, ovos, nozes e leite. Pode conter traços de amêndoas e castanhas.',
    'Conservar refrigerado de 2°C a 6°C por até 5 dias.',
    'Retirar da geladeira 20 minutos antes de servir para atingir a textura perfeita de maciez da massa e aveludado do recheio.',
    '{"porcao": "100g", "calorias": "340 kcal", "proteinas": "6g", "gorduras": "18g", "carboidratos": "42g"}'::jsonb
  );

  -- 7. Páginas do Tenant 02
  INSERT INTO public.tenant_pages (id, tenant_id, slug, title, meta_title, meta_description, status, published_at)
  VALUES 
    (v_page_home_id, v_tenant_id, 'home', 'Início', 'Cacau & Flor — Confeitaria Afetiva', 'Doces finos e bolos artesanais sob encomenda.', 'published', now()),
    (v_page_sobre_id, v_tenant_id, 'sobre', 'O Atelier', 'Sobre o Atelier | Cacau & Flor', 'Conheça nosso atelier botânico de confeitaria.', 'published', now()),
    (v_page_produtos_id, v_tenant_id, 'produtos', 'Cardápio Doce', 'Cardápio de Bolos | Cacau & Flor', 'Nossas criações doces preparadas para celebrar a vida.', 'published', now()),
    (v_page_contato_id, v_tenant_id, 'contato', 'Encomendas', 'Contato e Encomendas | Cacau & Flor', 'Fale com nossa chef pâtissière para encomendas especiais.', 'published', now())
  ON CONFLICT (tenant_id, slug) DO NOTHING;

  -- 8. Seções da Home do Tenant 02 (Conteúdo e layout exclusivos da Cacau & Flor)
  INSERT INTO public.tenant_page_sections (tenant_id, page_id, section_type, variant, display_order, is_active, content)
  VALUES 
    (
      v_tenant_id,
      v_page_home_id,
      'HeroEditorial',
      'editorial',
      1,
      true,
      '{
        "badge": "Confeitaria Botânica & Afetiva",
        "title": "Açúcar, afeto e flores em celebrações inesquecíveis",
        "subtitle": "Bolos desenhados como pequenas obras de arte, com massas delicadas, nozes nobres e recheios aromáticos que perfumam a sua mesa.",
        "primary_cta_label": "Ver Cardápio Doce",
        "primary_cta_href": "/produtos",
        "secondary_cta_label": "Conhecer o Atelier",
        "secondary_cta_href": "/sobre",
        "highlight_note": "Agenda de encomendas aberta em breve"
      }'::jsonb
    ),
    (
      v_tenant_id,
      v_page_home_id,
      'BrandStorySection',
      'split',
      2,
      true,
      '{
        "eyebrow": "Nossa Filosofia",
        "title": "A doçura no ponto exato, sem excessos",
        "lead_paragraph": "Acreditamos que a confeitaria de excelência encontra equilíbrio entre acidez, crocância e texturas acetinadas.",
        "description": "Utilizamos exclusivamente nozes nobres, fava de baunilha de verdade e frutas da estação selecionadas de pequenos produtores.",
        "cta_label": "Conheça nossa trajetória",
        "cta_href": "/sobre"
      }'::jsonb
    ),
    (
      v_tenant_id,
      v_page_home_id,
      'ProductShowcaseSection',
      'cards',
      3,
      true,
      '{
        "title": "Criações em Destaque",
        "subtitle": "Receitas autorais para momentos especiais em família.",
        "show_variants": true,
        "cta_label": "Ver todos os bolos",
        "cta_href": "/produtos"
      }'::jsonb
    );

END $$;
