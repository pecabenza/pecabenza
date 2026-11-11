// Fase C — Diagnóstico SOMENTE LEITURA da prontidão operacional do tenant no staging.
// Uso: node scripts/staging-readiness-report.mjs [tenant-slug]
// Não executa INSERT/UPDATE/DELETE. Mascara campos sensíveis (chaves/segredos).
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function loadEnv(file) {
  try {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
}
loadEnv('.env.local');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes em .env.local');
  process.exit(1);
}
const slug = process.argv[2] || 'benza';
const db = createClient(url, key, { auth: { persistSession: false } });

const SENSITIVE = /(key|secret|token|encrypted|password)/i;
const mask = (row) =>
  row && Object.fromEntries(Object.entries(row).map(([k, v]) => [k, SENSITIVE.test(k) && v ? '***' : v]));

async function q(label, promise) {
  const { data, error } = await promise;
  if (error) return { label, error: error.message };
  return { label, data };
}

const { data: tenant, error: tErr } = await db
  .from('tenants')
  .select('id, slug, name, site_mode')
  .eq('slug', slug)
  .maybeSingle();
if (tErr || !tenant) {
  console.error('Tenant não encontrado:', slug, tErr?.message);
  process.exit(1);
}
const tid = tenant.id;

const results = await Promise.all([
  q('tenant_commerce_settings', db.from('tenant_commerce_settings').select('*').eq('tenant_id', tid).maybeSingle()),
  q('tenant_settings.business_hours', db.from('tenant_settings').select('business_hours').eq('tenant_id', tid).maybeSingle()),
  q('tenant_payment_settings', db.from('tenant_payment_settings').select('*').eq('tenant_id', tid).maybeSingle()),
  q('products', db.from('products').select('id, name, slug, status, cover_media_id').eq('tenant_id', tid).order('name')),
  q('product_variants', db.from('product_variants').select('id, product_id, name, price_in_cents, is_available, unit_value, unit_type').eq('tenant_id', tid)),
  q('product_variant_stock_settings', db.from('product_variant_stock_settings').select('variant_id, track_inventory').eq('tenant_id', tid)),
  q('inventory_batches(active finished_product)', db.from('inventory_batches').select('variant_id, current_quantity, reserved_quantity, expiration_date').eq('tenant_id', tid).eq('batch_type', 'finished_product').eq('status', 'active')),
  q('orders(últimos 10)', db.from('orders').select('order_number, status, payment_status, payment_method, order_channel, total_cents, created_at').eq('tenant_id', tid).order('created_at', { ascending: false }).limit(10)),
]);

const byLabel = Object.fromEntries(results.map((r) => [r.label, r]));
const products = byLabel['products'].data || [];
const variants = byLabel['product_variants'].data || [];
const stock = byLabel['product_variant_stock_settings'].data || [];
const batches = byLabel['inventory_batches(active finished_product)'].data || [];

const tracked = new Set(stock.filter((s) => s.track_inventory).map((s) => s.variant_id));
const available = new Map();
for (const b of batches) {
  available.set(b.variant_id, (available.get(b.variant_id) || 0) + Math.max(0, Number(b.current_quantity) - Number(b.reserved_quantity)));
}

const catalog = products.map((p) => ({
  produto: p.name,
  status: p.status,
  foto: p.cover_media_id ? 'sim' : 'NÃO',
  variantes: variants
    .filter((v) => v.product_id === p.id)
    .map((v) => ({
      nome: v.name,
      preco: (v.price_in_cents / 100).toFixed(2),
      porcao: `${v.unit_value ?? '-'} ${v.unit_type ?? ''}`.trim(),
      disponivel: v.is_available,
      controla_estoque: tracked.has(v.id),
      saldo: tracked.has(v.id) ? available.get(v.id) || 0 : 'n/a',
    })),
}));

console.log(JSON.stringify({
  tenant,
  commerceSettings: byLabel['tenant_commerce_settings'],
  businessHours: byLabel['tenant_settings.business_hours'],
  paymentSettings: { ...byLabel['tenant_payment_settings'], data: mask(byLabel['tenant_payment_settings'].data) },
  catalog,
  recentOrders: byLabel['orders(últimos 10)'],
}, null, 2));

