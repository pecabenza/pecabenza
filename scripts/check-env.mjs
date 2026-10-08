import fs from 'fs';
import path from 'path';

const envPath = path.resolve('e:/projetos/sysfood/.env.local');

if (!fs.existsSync(envPath)) {
  console.log(JSON.stringify({ exists: false }));
  process.exit(0);
}

const content = fs.readFileSync(envPath, 'utf8');
const lines = content.split('\n');

const env = {};
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx !== -1) {
    const key = trimmed.substring(0, idx).trim();
    const val = trimmed.substring(idx + 1).trim().replace(/^["']|["']$/g, '');
    env[key] = val;
  }
}

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'] || '';
const anonKey = env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] || '';
const serviceRoleKey = env['SUPABASE_SERVICE_ROLE_KEY'] || '';
const appEnv = env['APP_ENV'] || '';

const result = {
  exists: true,
  NEXT_PUBLIC_SUPABASE_URL: {
    defined: Boolean(supabaseUrl),
    isUrl: supabaseUrl.startsWith('https://') && supabaseUrl.includes('.supabase.co'),
    isPlaceholder: supabaseUrl.includes('[') || supabaseUrl.includes('ID_DO_PROJETO') || supabaseUrl.includes('placeholder'),
    hasBrackets: supabaseUrl.includes('['),
  },
  NEXT_PUBLIC_SUPABASE_ANON_KEY: {
    defined: Boolean(anonKey),
    length: anonKey.length,
    isJwt: anonKey.startsWith('eyJ'),
    isPlaceholder: anonKey.includes('[') || anonKey.includes('ANON_KEY') || anonKey.includes('placeholder'),
  },
  SUPABASE_SERVICE_ROLE_KEY: {
    defined: Boolean(serviceRoleKey),
    length: serviceRoleKey.length,
    isJwt: serviceRoleKey.startsWith('eyJ'),
    isPlaceholder: serviceRoleKey.includes('[') || serviceRoleKey.includes('SERVICE_ROLE') || serviceRoleKey.includes('placeholder'),
  },
  APP_ENV: {
    defined: Boolean(appEnv),
    value: appEnv,
    isStaging: appEnv === 'staging',
  },
};

console.log(JSON.stringify(result, null, 2));
