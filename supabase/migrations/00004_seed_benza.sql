-- ==============================================================================
-- Migration 00004: Seed Inaugural BENZA (Tenant 01) — Versão Homologada (Etapa 1B)
-- Textos revisados: linguagem elegante, sóbria e factual, sem claims não homologados
-- ==============================================================================

DO $$
DECLARE
  v_tenant_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_category_id uuid := gen_random_uuid();
  v_prod_feijoada_id uuid := gen_random_uuid();
  v_prod_lasanha_id uuid := gen_random_uuid();
  v_page_home_id uuid := gen_random_uuid();
  v_page_sobre_id uuid := gen_random_uuid();
  v_page_produtos_id uuid := gen_random_uuid();
  v_page_contato_id uuid := gen_random_uuid();
BEGIN
  -- 1. Inserir Tenant BENZA
  INSERT INTO public.tenants (id, name, slug, status, site_mode)
  VALUES (
    v_tenant_id,
    'BENZA',
    'benza',
    'active',
    'prelaunch'
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    site_mode = EXCLUDED.site_mode;

  -- 2. Domínios
  INSERT INTO public.tenant_domains (tenant_id, hostname, is_primary, is_verified)
  VALUES 
    (v_tenant_id, 'benza.localhost', true, true),
    (v_tenant_id, 'localhost', false, true),
    (v_tenant_id, 'benza.com.br', false, true)
  ON CONFLICT (hostname) DO NOTHING;

  -- 3. Configurações Operacionais (Sem claims agressivos ou não homologados)
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
    'contato@benza.com.br',
    '+55 11 98765-4321',
    '+55 11 98765-4321',
    'benza.gastronomia',
    'São Paulo, SP — Atendimento e encomendas programadas',
    'Em breve: pratos prontos congelados para o seu dia a dia e momentos especiais.',
    'Em breve',
    '{"producao": "Segunda a Quarta", "entregas": "Quinta a Domingo"}'::jsonb,
    '{"default_meta_title": "BENZA — Pratos Prontos e Conforto Gastronômico", "default_meta_description": "Cardápio de pratos preparados e porcionados para aquecer na sua mesa."}'::jsonb
  )
  ON CONFLICT (tenant_id) DO UPDATE SET
    contact_email = EXCLUDED.contact_email,
    prelaunch_banner_text = EXCLUDED.prelaunch_banner_text,
    prelaunch_cta_text = EXCLUDED.prelaunch_cta_text;

  -- 4. Identidade Visual / Branding (Paleta Oficial BENZA)
  INSERT INTO public.tenant_branding (
    tenant_id,
    logo_url,
    favicon_url,
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
    null,
    null,
    'Playfair Display',
    'Plus Jakarta Sans',
    '#A84B2C', -- Terracota acolhedor
    '#D99B26', -- Mostarda / Dourado elegante
    '#2C1A14', -- Marrom profundo
    '#FDFBF7', -- Creme / Marfim suave
    '#FFFFFF', -- Superfície pura
    '#1C1917', -- Texto grafite escuro
    '0.75rem'
  )
  ON CONFLICT (tenant_id) DO UPDATE SET
    color_primary = EXCLUDED.color_primary,
    color_secondary = EXCLUDED.color_secondary,
    color_accent = EXCLUDED.color_accent,
    color_background = EXCLUDED.color_background;

  -- 5. Categoria de Produtos
  INSERT INTO public.product_categories (id, tenant_id, name, slug, display_order, is_active)
  VALUES (v_category_id, v_tenant_id, 'Pratos Principais', 'pratos-principais', 1, true)
  ON CONFLICT (tenant_id, slug) DO NOTHING;

  -- 6. Produto 01: Feijoada
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
    v_prod_feijoada_id,
    v_tenant_id,
    v_category_id,
    'Feijoada BENZA',
    'feijoada-benza',
    'Feijão preto cozido com carnes e temperos clássicos.',
    'A feijoada BENZA é preparada com feijão preto, carnes bovinas e suínas dessalgadas e tempero suave com alho, cebola e louro. Congelada logo após o cozimento para manter o frescor e a textura dos ingredientes, pronta para aquecer.',
    'active',
    true
  )
  ON CONFLICT (tenant_id, slug) DO NOTHING;

  -- Variações Feijoada (500 ml e 1000 ml)
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
    (v_tenant_id, v_prod_feijoada_id, '500 ml (Individual farto)', 'BNZ-FEIJ-500', 'ml', 500, 4800, true, 1),
    (v_tenant_id, v_prod_feijoada_id, '1000 ml (Para compartilhar)', 'BNZ-FEIJ-1000', 'ml', 1000, 8900, true, 2);

  -- Ficha Técnica Feijoada
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
    v_prod_feijoada_id,
    'Feijão preto, carne seca, lombo suíno, costelinha suína, paio, linguiça calabresa, alho, cebola, louro e azeite.',
    'Não contém glúten. Pode conter derivados de soja.',
    'Manter congelado conforme orientação da embalagem. Após descongelar, manter sob refrigeração e consumir em até 24h. Não recongelar.',
    'Em panela: aquecer em fogo brando com 2 a 3 colheres de sopa de água até aquecer completamente, mexendo delicadamente.',
    '{"porcao": "250g", "calorias": "380 kcal", "proteinas": "28g", "gorduras": "16g", "carboidratos": "31g", "sodio": "720mg"}'::jsonb
  );

  -- 7. Produto 02: Lasanha
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
    v_prod_lasanha_id,
    v_tenant_id,
    v_category_id,
    'Lasanha Tradicional',
    'lasanha-tradicional',
    'Massa em camadas com molho de carne e bechamel cremoso.',
    'Receita clássica preparada com massa fresca, molho de tomate cozido lentamente com carne moída, bechamel com toque de noz-moscada e cobertura de queijo para gratinar.',
    'active',
    true
  )
  ON CONFLICT (tenant_id, slug) DO NOTHING;

  -- Variações Lasanha (500 ml e 1000 ml)
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
    (v_tenant_id, v_prod_lasanha_id, '500 ml (Individual)', 'BNZ-LAS-500', 'ml', 500, 4600, true, 1),
    (v_tenant_id, v_prod_lasanha_id, '1000 ml (Duas pessoas)', 'BNZ-LAS-1000', 'ml', 1000, 8500, true, 2);

  -- Ficha Técnica Lasanha
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
    v_prod_lasanha_id,
    'Farinha de trigo enriquecida, ovos, carne bovina moída, tomate, leite integral, manteiga, queijo mozarela, parmesão e temperos.',
    'Contém glúten, leite e ovos. Contém lactose.',
    'Manter congelado conforme orientação da embalagem. Não recongelar após o descongelamento.',
    'Forno pré-aquecido a 180°C por 25 a 30 minutos na própria embalagem forneável (remover tampa plástica antes do forno).',
    '{"porcao": "250g", "calorias": "410 kcal", "proteinas": "22g", "gorduras": "19g", "carboidratos": "38g", "sodio": "640mg"}'::jsonb
  );

  -- 8. Páginas do Tenant
  INSERT INTO public.tenant_pages (id, tenant_id, slug, title, meta_title, meta_description, status, published_at)
  VALUES 
    (v_page_home_id, v_tenant_id, 'home', 'Página Inicial', 'BENZA — Pratos Prontos Congelados', 'Conheça nossos pratos preparados para aquecer na sua mesa.', 'published', now()),
    (v_page_sobre_id, v_tenant_id, 'sobre', 'Nossa Proposta', 'Nossa Proposta | BENZA', 'A dedicação e o cuidado por trás de cada prato preparado pela BENZA.', 'published', now()),
    (v_page_produtos_id, v_tenant_id, 'produtos', 'Cardápio', 'Cardápio de Pratos | BENZA', 'Confira nossa seleção de pratos em porções de 500 ml e 1000 ml.', 'published', now()),
    (v_page_contato_id, v_tenant_id, 'contato', 'Contato', 'Contato | BENZA', 'Fale com a nossa equipe para informações sobre pratos e disponibilidade.', 'published', now())
  ON CONFLICT (tenant_id, slug) DO NOTHING;

  -- 9. Seções da Home (Linguagem elegante, sem claims não homologados)
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
        "badge": "Cardápio Inaugural em Breve",
        "title": "A comodidade da boa comida à sua mesa",
        "subtitle": "Pratos clássicos preparados com cuidado e prontos para aquecer. Porções individuais e para compartilhar, feitas para o seu dia a dia.",
        "primary_cta_label": "Conheça os Pratos",
        "primary_cta_href": "/produtos",
        "secondary_cta_label": "Nossa Proposta",
        "secondary_cta_href": "/sobre",
        "highlight_note": "Abertura de pedidos em breve",
        "image_url": "/assets/brands/benza/mockup-hero-editorial.jpg"
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
        "eyebrow": "Nossa Proposta",
        "title": "Receitas bem executadas para a sua rotina",
        "lead_paragraph": "A BENZA nasceu para oferecer refeições práticas sem abrir mão do sabor de uma comida feita com atenção aos detalhes.",
        "description": "Nossos pratos são preparados, porcionados e congelados para que você possa desfrutar de uma refeição completa com o simples aquecimento em casa ou no trabalho.",
        "cta_label": "Conheça mais sobre nós",
        "cta_href": "/sobre",
        "image_url": "/assets/brands/benza/mockup-hero-editorial.jpg"
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
        "title": "Pratos em Destaque",
        "subtitle": "Conheça as primeiras opções que estarão disponíveis no cardápio inaugural.",
        "show_variants": true,
        "cta_label": "Ver cardápio completo",
        "cta_href": "/produtos"
      }'::jsonb
    ),
    (
      v_tenant_id,
      v_page_home_id,
      'BenefitsSection',
      'grid',
      4,
      true,
      '{
        "title": "Como Funciona a BENZA",
        "subtitle": "Praticidade, porções pensadas e preparo descomplicado.",
        "items": [
          {
            "icon": "UtensilsCrossed",
            "title": "Preparo Clássico",
            "description": "Receitas tradicionais bem executadas, com temperos naturais e sem complicações."
          },
          {
            "icon": "Snowflake",
            "title": "Conservação no Freezer",
            "description": "Pratos congelados com instruções claras de conservação na embalagem."
          },
          {
            "icon": "Clock",
            "title": "Aquecimento Rápido",
            "description": "Prontos para aquecer no fogão ou no forno em poucos minutos."
          },
          {
            "icon": "ShieldCheck",
            "title": "Porções sob Medida",
            "description": "Embalagens práticas de 500 ml e 1000 ml adequadas à sua necessidade."
          }
        ]
      }'::jsonb
    ),
    (
      v_tenant_id,
      v_page_home_id,
      'CTASection',
      'banner',
      5,
      true,
      '{
        "title": "Acompanhe o início das operações",
        "description": "Cadastre seu e-mail para receber a data de abertura dos primeiros pedidos e novidades do cardápio.",
        "form_placeholder": "Digite seu e-mail",
        "button_label": "Cadastrar para novidades",
        "disclaimer": "Não enviamos spam. Apenas avisos sobre o lançamento e novidades da BENZA."
      }'::jsonb
    ),
    (
      v_tenant_id,
      v_page_home_id,
      'FAQSection',
      'accordion',
      6,
      true,
      '{
        "title": "Perguntas Frequentes",
        "subtitle": "Informações essenciais sobre nossos pratos e atendimento.",
        "items": [
          {
            "question": "Como conservar os pratos após o recebimento?",
            "answer": "Armazene sob congelamento conforme orientação da embalagem. Após descongelar, mantenha refrigerado e consuma em até 24 horas."
          },
          {
            "question": "Qual o rendimento das porções de 500 ml e 1000 ml?",
            "answer": "A embalagem de 500 ml foi calculada para uma porção individual generosa. A embalagem de 1000 ml atende duas pessoas confortavelmente."
          },
          {
            "question": "Como é feito o aquecimento?",
            "answer": "As orientações estão indicadas na embalagem de cada prato, podendo ser aquecidos no forno ou em panela conforme o tipo de prato."
          }
        ]
      }'::jsonb
    ),
    (
      v_tenant_id,
      v_page_home_id,
      'ContactSection',
      'split',
      7,
      true,
      '{
        "title": "Fale Conosco",
        "description": "Dúvidas ou sugestões? Nossa equipe está pronta para conversar.",
        "show_form": true,
        "show_social": true
      }'::jsonb
    );

END $$;
