import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { resolveTenantByHost } from '@/lib/tenancy/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { createSafeErrorResponse } from '@/lib/security/error-response';
import { logger } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB máximo

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
  'image/x-icon',
];

const DISALLOWED_EXTENSIONS = new Set([
  '.exe', '.sh', '.bat', '.cmd', '.php', '.phtml', '.js', '.mjs', '.cjs',
  '.ts', '.py', '.pl', '.rb', '.jar', '.vbs', '.scr', '.msi', '.com', '.bin'
]);

const VALID_CATEGORIES = ['branding', 'products', 'pages', 'general'] as const;
type UploadCategory = typeof VALID_CATEGORIES[number];

export async function POST(request: NextRequest) {
  try {
    // 0. Proteção contra abuso e Rate Limiting (10 uploads por minuto por IP)
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'anonymous';
    const rateLimit = await checkRateLimit(clientIp, {
      limit: 10,
      windowSeconds: 60,
      prefix: 'upload',
    });

    if (!rateLimit.success) {
      logger.warn('Tentativa de upload bloqueada por excesso de requisições', {
        eventType: 'rate_limit_exceeded',
        ipHash: clientIp.substring(0, 5),
      });
      return NextResponse.json(
        { error: 'Limite de uploads temporariamente atingido. Tente novamente em instantes.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.reset) } }
      );
    }

    // 1. Resolução Segura de Tenant pelo Servidor (Host Autorizado / Sessão)
    // NUNCA confiar em tenant_id enviado pelo navegador!
    const host =
      request.headers.get('x-tenant-host') ||
      request.headers.get('host') ||
      'localhost:3000';

    const tenantContext = await resolveTenantByHost(host);
    if (!tenantContext) {
      return NextResponse.json(
        { error: 'Não foi possível determinar o estabelecimento de destino.' },
        { status: 403 }
      );
    }

    const tenantId = tenantContext.tenant.id;

    // 2. Extração e Validação do Arquivo
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const requestedCategory = (formData.get('category') as string) || 'general';
    const category: UploadCategory = VALID_CATEGORIES.includes(requestedCategory as UploadCategory)
      ? (requestedCategory as UploadCategory)
      : 'general';

    if (!file) {
      return NextResponse.json(
        { error: 'Nenhum arquivo enviado.' },
        { status: 400 }
      );
    }

    // Validação estrita de extensão proibida
    const rawExt = path.extname(file.name).toLowerCase();
    if (DISALLOWED_EXTENSIONS.has(rawExt)) {
      logger.warn('Tentativa de upload de extensão executável proibida', {
        eventType: 'security_violation',
        tenantId,
        extension: rawExt,
      });
      return NextResponse.json(
        { error: 'Extensão de arquivo não permitida por políticas de segurança.' },
        { status: 400 }
      );
    }

    // Validação estrita de MIME
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Formato de imagem inválido. Formatos aceitos: JPG, PNG, WEBP, SVG, ICO.' },
        { status: 400 }
      );
    }

    // Validação de Tamanho
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'O arquivo excede o limite máximo permitido de 5 MB.' },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 3. Sanitização e Nome Seguro do Arquivo
    const originalExt = path.extname(file.name) || '.jpg';
    const baseName = path
      .basename(file.name, originalExt)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-');
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const filename = `${baseName}-${uniqueSuffix}${originalExt}`.toLowerCase();

    // 4. Caminho Multi-Tenant Padronizado: tenant-assets/{tenant_id}/{category}/{filename}
    const storagePath = `${tenantId}/${category}/${filename}`;

    // 5. Integração com Supabase Storage (Staging / Produção)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const hasSupabaseCredentials =
      !!supabaseUrl &&
      !!serviceRoleKey &&
      !supabaseUrl.includes('placeholder') &&
      !serviceRoleKey.includes('placeholder');

    if (hasSupabaseCredentials) {
      try {
        const supabase = createAdminClient();

        // Upload no bucket 'tenant-assets'
        const { error: uploadError } = await supabase.storage
          .from('tenant-assets')
          .upload(storagePath, buffer, {
            contentType: file.type,
            upsert: true,
          });

        if (!uploadError) {
          const { data: publicUrlData } = supabase.storage
            .from('tenant-assets')
            .getPublicUrl(storagePath);

          const publicUrl = publicUrlData.publicUrl;

          // Registrar metadados em public.media_assets
          await supabase.from('media_assets').insert({
            tenant_id: tenantId,
            bucket: 'tenant-assets',
            storage_path: storagePath,
            original_filename: file.name,
            mime_type: file.type,
            byte_size: file.size,
            asset_source: 'official',
            is_private: false,
          });

          return NextResponse.json({
            success: true,
            url: publicUrl,
            storage: 'supabase',
            storagePath,
            filename,
            originalName: file.name,
            mimeType: file.type,
            size: file.size,
            tenantId,
          });
        }

        console.warn('[Storage Staging Notice]: Falha no bucket remoto, aplicando fallback local.', uploadError);
      } catch (storageErr) {
        console.warn('[Storage Staging Exception]: Erro de conexão com Supabase Storage, aplicando fallback local.', storageErr);
      }
    }

    // 6. Fallback de Desenvolvimento Local (Exclusivo para dev sem Supabase remoto)
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    await mkdir(uploadsDir, { recursive: true });

    const localFilename = `${category}-${filename}`;
    const filePath = path.join(uploadsDir, localFilename);
    await writeFile(filePath, buffer);

    const publicUrl = `/uploads/${localFilename}`;

    return NextResponse.json({
      success: true,
      url: publicUrl,
      storage: 'local_fallback',
      storagePath: storagePath,
      filename: localFilename,
      originalName: file.name,
      mimeType: file.type,
      size: file.size,
      tenantId,
      notice: 'Armazenado em fallback local. Em produção/staging, Supabase Storage será utilizado automaticamente.',
    });
  } catch (error: any) {
    return createSafeErrorResponse(error, 500, { action: 'upload_file' });
  }
}
