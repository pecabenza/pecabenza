import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Sanitiza URL ou path relativo de imagem, rejeitando protocolos perigosos (ex: javascript:, data:).
 */
export function sanitizeProductImageUrl(url?: string | null): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('/assets/') || trimmed.startsWith('/uploads/')) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return trimmed;
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Extrai bucket e storage_path a partir de URL pública do Supabase Storage
 * ou preserva referência estática/externa autorizada.
 */
export function parseStorageReference(url: string): {
  bucket: string;
  storagePath: string;
  filename: string;
} {
  const supabasePublicMarker = '/storage/v1/object/public/';
  const idx = url.indexOf(supabasePublicMarker);

  if (idx !== -1) {
    const afterMarker = url.slice(idx + supabasePublicMarker.length);
    const slashIdx = afterMarker.indexOf('/');
    if (slashIdx !== -1) {
      const bucket = afterMarker.slice(0, slashIdx);
      const storagePath = decodeURIComponent(afterMarker.slice(slashIdx + 1));
      const parts = storagePath.split('/');
      return {
        bucket,
        storagePath,
        filename: parts[parts.length - 1] || 'product-image',
      };
    }
  }

  const parts = url.split('/');
  return {
    bucket: 'external-reference',
    storagePath: url,
    filename: parts[parts.length - 1] || 'product-image',
  };
}

/**
 * Resolve ou cria um registro em `public.media_assets` para o tenant,
 * retornando o `media_asset.id` seguro para gravar em `products.cover_media_id`.
 */
export async function resolveOrCreateCoverMediaId(
  adminClient: SupabaseClient<any, 'public', any>,
  tenantId: string,
  coverImageUrl?: string | null,
  assetSource: 'official' | 'mockup' | 'pending' = 'official'
): Promise<string | null> {
  const sanitized = sanitizeProductImageUrl(coverImageUrl);
  if (!sanitized) return null;

  const { bucket, storagePath, filename } = parseStorageReference(sanitized);

  // 1. Verifica se já existe registro em media_assets para este tenant e storage_path
  const { data: existing } = await adminClient
    .from('media_assets')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('storage_path', storagePath)
    .maybeSingle();

  if (existing?.id) {
    return existing.id;
  }

  // 2. Cria registro em media_assets respeitando isolamento por tenant
  const ext = filename.split('.').pop()?.toLowerCase();
  const mimeType =
    ext === 'png'
      ? 'image/png'
      : ext === 'webp'
      ? 'image/webp'
      : 'image/jpeg';

  const { data: created, error } = await adminClient
    .from('media_assets')
    .insert({
      tenant_id: tenantId,
      bucket,
      storage_path: storagePath,
      original_filename: filename.slice(0, 255),
      mime_type: mimeType,
      byte_size: 0,
      asset_source: assetSource,
      is_private: false,
    })
    .select('id')
    .single();

  if (error || !created?.id) {
    throw new Error(`Falha ao registrar mídia do produto: ${error?.message || 'erro desconhecido'}`);
  }

  return created.id;
}

/**
 * Converte registro de `media_assets` em URL pública utilizável pelo storefront e admin.
 */
export function resolveMediaAssetUrl(
  adminClient: SupabaseClient<any, 'public', any>,
  asset: { bucket?: string | null; storage_path?: string | null } | null | undefined
): string | null {
  if (!asset?.storage_path) return null;
  const path = asset.storage_path;

  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('/')) {
    return path;
  }

  const bucket = asset.bucket || 'tenant-assets';
  const { data } = adminClient.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || null;
}

/**
 * Hidrata uma lista de produtos do banco (`cover_media_id`) com `cover_image_url` resolvida via `media_assets`.
 */
export async function hydrateProductsWithCoverUrls<
  T extends { id: string; tenant_id: string; cover_media_id?: string | null; cover_image_url?: string | null }
>(
  adminClient: SupabaseClient<any, 'public', any>,
  tenantId: string,
  products: T[]
): Promise<T[]> {
  const mediaIds = Array.from(
    new Set(products.map((p) => p.cover_media_id).filter((id): id is string => Boolean(id)))
  );

  if (mediaIds.length === 0) {
    return products.map((p) => ({
      ...p,
      cover_image_url: p.cover_image_url || null,
    }));
  }

  const { data: assets } = await adminClient
    .from('media_assets')
    .select('id, bucket, storage_path')
    .eq('tenant_id', tenantId)
    .in('id', mediaIds);

  const assetMap = new Map<string, { bucket?: string | null; storage_path?: string | null }>(
    (assets || []).map((a: any) => [a.id, a])
  );

  return products.map((p) => {
    const asset = p.cover_media_id ? assetMap.get(p.cover_media_id) : null;
    const resolvedUrl = resolveMediaAssetUrl(adminClient, asset);
    return {
      ...p,
      cover_image_url: resolvedUrl || p.cover_image_url || null,
    };
  });
}

