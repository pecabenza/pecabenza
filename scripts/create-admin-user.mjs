// Cria ou atualiza um usuário administrador no Supabase Auth (staging/prod) e vincula ao tenant em `tenant_members`.
// Uso: node scripts/create-admin-user.mjs <email> [senha-opcional] [tenant-slug]
// Se a senha não for informada, gera uma senha aleatória segura em memória (nunca salva em arquivo).
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

function loadEnv(file) {
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv('.env.local');

const email = (process.argv[2] || '').trim().toLowerCase();
const providedPassword = process.argv[3];
const tenantSlug = (process.argv[4] || 'benza').trim();

if (!email || !email.includes('@')) {
  console.error('Uso: node scripts/create-admin-user.mjs <email> [senha-opcional] [tenant-slug]');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  console.error('Variáveis Supabase ausentes em .env.local');
  process.exit(1);
}

const password =
  providedPassword && providedPassword.length >= 8
    ? providedPassword
    : `Benza#${randomBytes(6).toString('base64url')}9!`;

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const publicClient = createClient(url, anonKey, { auth: { persistSession: false } });

async function run() {
  const { data: tenant, error: tErr } = await admin
    .from('tenants')
    .select('id, slug, name')
    .eq('slug', tenantSlug)
    .single();

  if (tErr || !tenant) {
    throw new Error(`Tenant "${tenantSlug}" não encontrado: ${tErr?.message}`);
  }

  const { data: listData, error: lErr } = await admin.auth.admin.listUsers();
  if (lErr) throw new Error(`Falha ao listar auth.users: ${lErr.message}`);

  const existing = (listData?.users || []).find((u) => u.email?.toLowerCase() === email);
  let userId;

  if (existing) {
    const { data: upd, error: uErr } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    if (uErr || !upd?.user) throw new Error(`Falha ao atualizar usuário: ${uErr?.message}`);
    userId = upd.user.id;
    console.log(`✓ Usuário existente atualizado no Auth: ${email} (${userId})`);
  } else {
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: 'tenant_admin', tenant_slug: tenantSlug },
    });
    if (cErr || !created?.user) throw new Error(`Falha ao criar usuário: ${cErr?.message}`);
    userId = created.user.id;
    console.log(`✓ Usuário criado no Auth: ${email} (${userId})`);
  }

  // Vincular em tenant_members como tenant_admin ativo
  const { data: existingMember } = await admin
    .from('tenant_members')
    .select('id')
    .eq('tenant_id', tenant.id)
    .eq('user_id', userId)
    .maybeSingle();

  if (existingMember?.id) {
    const { error: mUpdErr } = await admin
      .from('tenant_members')
      .update({ role: 'tenant_admin', is_active: true })
      .eq('id', existingMember.id);
    if (mUpdErr) throw new Error(`Falha ao atualizar tenant_members: ${mUpdErr.message}`);
  } else {
    const { error: mInsErr } = await admin.from('tenant_members').insert({
      tenant_id: tenant.id,
      user_id: userId,
      role: 'tenant_admin',
      is_active: true,
    });
    if (mInsErr) throw new Error(`Falha ao vincular tenant_members: ${mInsErr.message}`);
  }
  console.log(`✓ Vínculo tenant_admin ativo confirmado para "${tenant.name}" (${tenant.slug}).`);

  // Teste real de autenticação signInWithPassword com chave anon
  const { data: signInData, error: signInErr } = await publicClient.auth.signInWithPassword({
    email,
    password,
  });
  if (signInErr || !signInData?.user) {
    throw new Error(`Falha na verificação signInWithPassword: ${signInErr?.message}`);
  }
  await publicClient.auth.signOut();

  console.log('✓ Login validado com sucesso via Supabase Auth (signInWithPassword).');
  console.log(`E-mail: ${email}`);
  console.log(`Senha inicial: ${password}`);
}

run().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});

