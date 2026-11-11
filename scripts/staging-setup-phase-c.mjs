// Fase C (C1 + C2) — Configura loja e cardápio oficial BENZA no ambiente staging.
// Preserva integridade de pedidos históricos e mantém `site_mode = 'prelaunch'` + Pix offline até validação E2E.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function loadEnv(file) {
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv('.env.local');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Variáveis Supabase ausentes em .env.local');
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });
const TENANT_ID = '00000000-0000-0000-0000-000000000001';

async function ensureOfficialPhotoMedia(localPath, filename) {
  const storagePath = `${TENANT_ID}/products/official-${filename}`;
  const buffer = readFileSync(localPath);

  const { error: uploadErr } = await db.storage
    .from('tenant-assets')
    .upload(storagePath, buffer, { contentType: 'image/jpeg', upsert: true });

  if (uploadErr) {
    throw new Error(`Falha ao subir ${filename} para tenant-assets: ${uploadErr.message}`);
  }

  const { data: existing } = await db
    .from('media_assets')
    .select('id')
    .eq('tenant_id', TENANT_ID)
    .eq('storage_path', storagePath)
    .maybeSingle();

  if (existing?.id) {
    return existing.id;
  }

  const { data: created, error: insErr } = await db
    .from('media_assets')
    .insert({
      tenant_id: TENANT_ID,
      bucket: 'tenant-assets',
      storage_path: storagePath,
      original_filename: filename,
      mime_type: 'image/jpeg',
      byte_size: buffer.length,
      asset_source: 'official',
      is_private: false,
    })
    .select('id')
    .single();

  if (insErr || !created?.id) {
    throw new Error(`Falha ao registrar media_assets de ${filename}: ${insErr?.message}`);
  }

  return created.id;
}

async function run() {
  console.log('=== Fase C (C1 + C2) — Staging BENZA ===');

  // 1. C1 — Configurações comerciais (mantendo site_mode = 'prelaunch' e Pix desabilitado)
  const { error: tErr } = await db
    .from('tenants')
    .update({ site_mode: 'prelaunch' })
    .eq('id', TENANT_ID);
  if (tErr) throw new Error(`Erro ao garantir site_mode prelaunch: ${tErr.message}`);

  const { error: csErr } = await db
    .from('tenant_commerce_settings')
    .upsert(
      {
        tenant_id: TENANT_ID,
        delivery_enabled: true,
        pickup_enabled: true,
        fixed_delivery_fee_cents: 1200,
        free_delivery_threshold_cents: 18000,
        min_order_value_cents: 3500,
        asap_enabled: true,
        scheduled_enabled: true,
        estimated_delivery_time_min: 45,
        estimated_pickup_time_min: 25,
      },
      { onConflict: 'tenant_id' }
    );
  if (csErr) throw new Error(`Erro ao salvar tenant_commerce_settings: ${csErr.message}`);

  const businessHoursPayload = {
    is_store_open: true,
    pause_reason: null,
    enforce_schedule: false,
    timezone: 'America/Sao_Paulo',
    weekly_hours: {
      sun: { open: '11:00', close: '21:00', closed: false },
      mon: { open: '11:00', close: '19:00', closed: false },
      tue: { open: '11:00', close: '19:00', closed: false },
      wed: { open: '11:00', close: '19:00', closed: false },
      thu: { open: '11:00', close: '21:30', closed: false },
      fri: { open: '11:00', close: '22:00', closed: false },
      sat: { open: '11:00', close: '22:00', closed: false },
    },
    enabled_payment_methods: ['cash', 'card_on_delivery'],
    producao: 'Segunda a Quarta',
    entregas: 'Quinta a Domingo',
  };

  const { error: bhErr } = await db
    .from('tenant_settings')
    .update({ business_hours: businessHoursPayload })
    .eq('tenant_id', TENANT_ID);
  if (bhErr) throw new Error(`Erro ao salvar business_hours: ${bhErr.message}`);

  const { error: pmErr } = await db
    .from('tenant_payment_settings')
    .update({ pix_enabled: false })
    .eq('tenant_id', TENANT_ID);
  if (pmErr) throw new Error(`Erro ao ajustar pix_enabled = false: ${pmErr.message}`);

  console.log('✓ C1 aplicado: comércio configurado (Dinheiro + Cartão na entrega, Pix off, prelaunch preservado).');

  // 2. C2 — Limpeza segura de produtos e variantes sintéticas de testes anteriores
  const { data: allProds } = await db
    .from('products')
    .select('id, name, slug, status')
    .eq('tenant_id', TENANT_ID);

  const syntheticProdIds = (allProds || [])
    .filter((p) => /3B|Teste/i.test(p.name))
    .map((p) => p.id);

  if (syntheticProdIds.length > 0) {
    await db
      .from('products')
      .update({ status: 'archived', is_featured: false })
      .eq('tenant_id', TENANT_ID)
      .in('id', syntheticProdIds);

    await db
      .from('product_variants')
      .update({ is_available: false })
      .eq('tenant_id', TENANT_ID)
      .in('product_id', syntheticProdIds);
  }

  const { data: allVars } = await db
    .from('product_variants')
    .select('id, product_id, name')
    .eq('tenant_id', TENANT_ID);

  const syntheticVarIds = (allVars || [])
    .filter((v) => /FEFO|Descarte|3B|Teste|Retorno\s*3E/i.test(v.name))
    .map((v) => v.id);

  if (syntheticVarIds.length > 0) {
    await db
      .from('product_variants')
      .update({ is_available: false })
      .eq('tenant_id', TENANT_ID)
      .in('id', syntheticVarIds);

    await db
      .from('product_variant_stock_settings')
      .update({ track_inventory: false })
      .eq('tenant_id', TENANT_ID)
      .in('variant_id', syntheticVarIds);
  }

  console.log(`✓ C2 limpeza: ${syntheticProdIds.length} produto(s) teste arquivados e ${syntheticVarIds.length} variante(s) sintética(s) ocultadas.`);

  // 3. C2 — Upload de fotos oficiais & Cardápio BENZA (Feijoada, Lasanha, Rabada, Escondidinho)
  const { data: cat } = await db
    .from('product_categories')
    .select('id')
    .eq('tenant_id', TENANT_ID)
    .eq('slug', 'pratos-principais')
    .maybeSingle();

  const categoryId = cat?.id || null;

  const photoIds = {
    feijoada: await ensureOfficialPhotoMedia('public/assets/brands/benza/products/mockup-feijoada.jpg', 'feijoada-benza.jpg'),
    lasanha: await ensureOfficialPhotoMedia('public/assets/brands/benza/products/mockup-lasanha.jpg', 'lasanha-tradicional.jpg'),
    rabada: await ensureOfficialPhotoMedia('public/assets/brands/benza/products/mockup-rabada.jpg', 'rabada-benza.jpg'),
    escondidinho: await ensureOfficialPhotoMedia('public/assets/brands/benza/products/mockup-escondidinho.jpg', 'escondidinho-benza.jpg'),
  };

  const OFFICIAL_MENU = [
    {
      name: 'Feijoada BENZA',
      slug: 'feijoada-benza',
      short_description: 'Feijão preto cozido lentamente com carnes nobres dessalgadas e temperos clássicos.',
      full_description: 'A feijoada BENZA é preparada com feijão preto selecionado, carne seca, lombo, costelinha suína e paio, em cocção lenta com alho, cebola e louro. Ultracongelada logo após o preparo.',
      cover_media_id: photoIds.feijoada,
      is_featured: true,
      variants: [
        { name: '500 ml (Individual farto)', sku: 'BNZ-FEIJ-500', unit_type: 'ml', unit_value: 500, price_in_cents: 4800, display_order: 1 },
        { name: '1000 ml (Para compartilhar)', sku: 'BNZ-FEIJ-1000', unit_type: 'ml', unit_value: 1000, price_in_cents: 8900, display_order: 2 },
      ],
      info: {
        ingredients: 'Feijão preto, carne seca, lombo suíno, costelinha suína, paio, linguiça calabresa, alho, cebola, louro e azeite.',
        allergens: 'Não contém glúten. Pode conter derivados de soja.',
        conservation_instructions: 'Manter congelado a -18°C.',
        preparation_instructions: 'Aquecer em fogo brando por 12 a 15 minutos com 2 colheres de água, mexendo delicadamente.',
      },
    },
    {
      name: 'Lasanha Tradicional',
      slug: 'lasanha-tradicional',
      short_description: 'Massa artesanal fresca intercalada com ragu bolonhesa e molho bechamel cremoso.',
      full_description: 'Lasanha clássica em camadas generosas de massa fresca, ragu bovino cozido por horas, molho bechamel artesanal e gratinada com mozarela e parmesão.',
      cover_media_id: photoIds.lasanha,
      is_featured: true,
      variants: [
        { name: '500 ml (Individual)', sku: 'BNZ-LAS-500', unit_type: 'ml', unit_value: 500, price_in_cents: 4600, display_order: 1 },
        { name: '1000 ml (Duas pessoas)', sku: 'BNZ-LAS-1000', unit_type: 'ml', unit_value: 1000, price_in_cents: 8500, display_order: 2 },
      ],
      info: {
        ingredients: 'Farinha de trigo, ovos, carne bovina moída, tomate italiano, leite integral, manteiga, mozarela, parmesão e temperos.',
        allergens: 'Contém glúten, leite e ovos. Contém lactose.',
        conservation_instructions: 'Manter congelado a -18°C.',
        preparation_instructions: 'Levar ao forno pré-aquecido a 180°C por 25 a 30 minutos na embalagem forneável sem a tampa.',
      },
    },
    {
      name: 'Rabada BENZA',
      slug: 'rabada-benza',
      short_description: 'Rabada bovina cozida até desmanchar, em caldo encorpado e aromático.',
      full_description: 'Corte nobre cozido lentamente em vinho tinto, tomates frescos, ervas e especiarias até atingir maciez extrema, finalizado com notas frescas para servir com polenta ou arroz.',
      cover_media_id: photoIds.rabada,
      is_featured: true,
      variants: [
        { name: '500 g (Individual)', sku: 'BNZ-RAB-500', unit_type: 'g', unit_value: 500, price_in_cents: 5400, display_order: 1 },
        { name: '1000 g (Para compartilhar)', sku: 'BNZ-RAB-1000', unit_type: 'g', unit_value: 1000, price_in_cents: 9800, display_order: 2 },
      ],
      info: {
        ingredients: 'Rabo bovino, cebola, alho, tomate, vinho tinto seco, salsão, cenoura, tomilho, louro e pimenta-do-reino.',
        allergens: 'Não contém glúten.',
        conservation_instructions: 'Manter congelado a -18°C.',
        preparation_instructions: 'Aquecer em panela tampada em fogo baixo por 12 a 15 minutos ou em banho-maria.',
      },
    },
    {
      name: 'Escondidinho BENZA',
      slug: 'escondidinho-benza',
      short_description: 'Carne seca desfiada e refogada sob creme aveludado de mandioca gratinado.',
      full_description: 'Recheio suculento de carne seca dessalgada na casa com cebola roxa e manteiga de garrafa, coberto por purê cremoso de mandioca amarela e queijo gratinado.',
      cover_media_id: photoIds.escondidinho,
      is_featured: true,
      variants: [
        { name: '500 g (Individual)', sku: 'BNZ-ESC-500', unit_type: 'g', unit_value: 500, price_in_cents: 4400, display_order: 1 },
        { name: '1000 g (Para compartilhar)', sku: 'BNZ-ESC-1000', unit_type: 'g', unit_value: 1000, price_in_cents: 8200, display_order: 2 },
      ],
      info: {
        ingredients: 'Mandioca amarela, carne seca bovina, requeijão cremoso, manteiga de garrafa, cebola, alho, queijo coalho e salsinha.',
        allergens: 'Contém leite e derivados. Não contém glúten.',
        conservation_instructions: 'Manter congelado a -18°C.',
        preparation_instructions: 'Forno pré-aquecido a 190°C por 25 minutos ou micro-ondas por 6 a 8 minutos.',
      },
    },
  ];

  const today = new Date().toISOString().split('T')[0];
  const expDate = new Date(Date.now() + 45 * 86400000).toISOString().split('T')[0];

  for (const dish of OFFICIAL_MENU) {
    const { data: existingProd } = await db
      .from('products')
      .select('id')
      .eq('tenant_id', TENANT_ID)
      .eq('slug', dish.slug)
      .maybeSingle();

    let productId = existingProd?.id;

    if (productId) {
      const { error: uErr } = await db
        .from('products')
        .update({
          name: dish.name,
          category_id: categoryId,
          short_description: dish.short_description,
          full_description: dish.full_description,
          cover_media_id: dish.cover_media_id,
          asset_source: 'official',
          is_mockup: false,
          status: 'active',
          is_featured: dish.is_featured,
        })
        .eq('id', productId)
        .eq('tenant_id', TENANT_ID);
      if (uErr) throw new Error(`Erro ao atualizar ${dish.name}: ${uErr.message}`);
    } else {
      const { data: createdProd, error: cErr } = await db
        .from('products')
        .insert({
          tenant_id: TENANT_ID,
          category_id: categoryId,
          name: dish.name,
          slug: dish.slug,
          short_description: dish.short_description,
          full_description: dish.full_description,
          cover_media_id: dish.cover_media_id,
          asset_source: 'official',
          is_mockup: false,
          status: 'active',
          is_featured: dish.is_featured,
        })
        .select('id')
        .single();
      if (cErr || !createdProd) throw new Error(`Erro ao criar ${dish.name}: ${cErr?.message}`);
      productId = createdProd.id;
    }

    // Ficha técnica
    const { data: existingInfo } = await db
      .from('product_information')
      .select('id')
      .eq('tenant_id', TENANT_ID)
      .eq('product_id', productId)
      .maybeSingle();

    if (existingInfo?.id) {
      const { error: infoErr } = await db
        .from('product_information')
        .update({
          ingredients: dish.info.ingredients,
          allergens: dish.info.allergens,
          conservation_instructions: dish.info.conservation_instructions,
          preparation_instructions: dish.info.preparation_instructions,
          shelf_life: '45 dias sob congelamento (-18°C)',
          after_thawing_instructions: 'Após descongelar, manter refrigerado e consumir em até 24h.',
        })
        .eq('id', existingInfo.id);
      if (infoErr) throw new Error(`Erro product_information update ${dish.name}: ${infoErr.message}`);
    } else {
      const { error: infoErr } = await db.from('product_information').insert({
        tenant_id: TENANT_ID,
        product_id: productId,
        ingredients: dish.info.ingredients,
        allergens: dish.info.allergens,
        conservation_instructions: dish.info.conservation_instructions,
        preparation_instructions: dish.info.preparation_instructions,
        shelf_life: '45 dias sob congelamento (-18°C)',
        after_thawing_instructions: 'Após descongelar, manter refrigerado e consumir em até 24h.',
      });
      if (infoErr) throw new Error(`Erro product_information insert ${dish.name}: ${infoErr.message}`);
    }

    // Variantes & Estoque Inicial
    for (const v of dish.variants) {
      const { data: existingVar } = await db
        .from('product_variants')
        .select('id')
        .eq('tenant_id', TENANT_ID)
        .eq('product_id', productId)
        .eq('name', v.name)
        .maybeSingle();

      let variantId = existingVar?.id;

      if (variantId) {
        const { error: uVarErr } = await db
          .from('product_variants')
          .update({
            sku: v.sku,
            unit_type: v.unit_type,
            unit_value: v.unit_value,
            price_in_cents: v.price_in_cents,
            is_available: true,
            display_order: v.display_order,
          })
          .eq('id', variantId)
          .eq('tenant_id', TENANT_ID);
        if (uVarErr) throw new Error(`Erro update variante ${v.name}: ${uVarErr.message}`);
      } else {
        const { data: createdVar, error: vErr } = await db
          .from('product_variants')
          .insert({
            tenant_id: TENANT_ID,
            product_id: productId,
            name: v.name,
            sku: v.sku,
            unit_type: v.unit_type,
            unit_value: v.unit_value,
            price_in_cents: v.price_in_cents,
            is_available: true,
            display_order: v.display_order,
          })
          .select('id')
          .single();
        if (vErr || !createdVar) throw new Error(`Erro variante ${v.name}: ${vErr?.message}`);
        variantId = createdVar.id;
      }

      // Configura controle de estoque ativo explicitamente (sem depender de constraint upsert)
      const { data: existingStockSetting } = await db
        .from('product_variant_stock_settings')
        .select('id')
        .eq('tenant_id', TENANT_ID)
        .eq('variant_id', variantId)
        .maybeSingle();

      if (existingStockSetting?.id) {
        const { error: ssErr } = await db
          .from('product_variant_stock_settings')
          .update({ track_inventory: true, min_stock_level: 3 })
          .eq('id', existingStockSetting.id);
        if (ssErr) throw new Error(`Erro update stock setting ${v.sku}: ${ssErr.message}`);
      } else {
        const { error: ssErr } = await db
          .from('product_variant_stock_settings')
          .insert({
            tenant_id: TENANT_ID,
            variant_id: variantId,
            track_inventory: true,
            min_stock_level: 3,
          });
        if (ssErr) throw new Error(`Erro insert stock setting ${v.sku}: ${ssErr.message}`);
      }

      const { data: batches, error: bSelErr } = await db
        .from('inventory_batches')
        .select('id, current_quantity, reserved_quantity')
        .eq('tenant_id', TENANT_ID)
        .eq('batch_type', 'finished_product')
        .eq('variant_id', variantId)
        .eq('status', 'active')
        .gte('expiration_date', today);

      if (bSelErr) throw new Error(`Erro consulta batches ${v.sku}: ${bSelErr.message}`);

      const totalAvail = (batches || []).reduce(
        (acc, b) => acc + Math.max(0, Number(b.current_quantity) - Number(b.reserved_quantity)),
        0
      );

      if (totalAvail < 5) {
        const batchCode = `PILOTO-${v.sku}-${today.replace(/-/g, '')}`;
        const { data: existingBatch } = await db
          .from('inventory_batches')
          .select('id')
          .eq('tenant_id', TENANT_ID)
          .eq('batch_type', 'finished_product')
          .eq('batch_code', batchCode)
          .maybeSingle();

        if (existingBatch?.id) {
          const { error: bUpdErr } = await db
            .from('inventory_batches')
            .update({
              current_quantity: 20,
              reserved_quantity: 0,
              status: 'active',
              expiration_date: expDate,
            })
            .eq('id', existingBatch.id);
          if (bUpdErr) throw new Error(`Erro update lote ${batchCode}: ${bUpdErr.message}`);
        } else {
          const { error: bInsErr } = await db.from('inventory_batches').insert({
            tenant_id: TENANT_ID,
            batch_type: 'finished_product',
            variant_id: variantId,
            batch_code: batchCode,
            manufacture_date: today,
            expiration_date: expDate,
            initial_quantity: 20,
            current_quantity: 20,
            reserved_quantity: 0,
            unit_cost_cents: Math.round(v.price_in_cents * 0.38),
            storage_location: 'freezer_principal',
            status: 'active',
            notes: 'Lote inicial do MVP Operacional Fase C',
          });
          if (bInsErr) throw new Error(`Erro insert lote ${batchCode}: ${bInsErr.message}`);
        }
      }
    }
  }

  console.log('✓ C2 cardápio oficial atualizado (Feijoada, Lasanha, Rabada, Escondidinho) com fotos e estoque inicial.');
}

run().catch((err) => {
  console.error('Erro na preparação Fase C:', err);
  process.exit(1);
});
