export type UploadImageCategory = 'logo' | 'hero' | 'products' | 'general';

export interface ImageOptimizationPreset {
  maxDimension: number;
  quality: number;
}

export const IMAGE_OPTIMIZATION_PRESETS: Record<UploadImageCategory, ImageOptimizationPreset> = {
  logo: { maxDimension: 800, quality: 0.88 },
  hero: { maxDimension: 1600, quality: 0.84 },
  products: { maxDimension: 1200, quality: 0.82 },
  general: { maxDimension: 1400, quality: 0.82 },
};

/**
 * Calcula dimensões proporcionais sem ampliar imagens menores que o limite.
 */
export function calculateTargetDimensions(
  width: number,
  height: number,
  maxDimension: number
): { width: number; height: number } {
  if (width <= 0 || height <= 0 || maxDimension <= 0) {
    return { width: Math.max(1, width), height: Math.max(1, height) };
  }
  const largest = Math.max(width, height);
  if (largest <= maxDimension) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const scale = maxDimension / largest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function formatBytesCompact(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(2).replace('.', ',')} MB`;
}

export interface OptimizedUploadResult {
  file: File;
  originalBytes: number;
  optimizedBytes: number;
  wasOptimized: boolean;
}

/**
 * Redimensiona e converte imagens raster (JPG, PNG, WEBP) para WebP no navegador antes do upload.
 * Em caso de falha ou arquivo `.ico`, retorna o arquivo original de forma segura.
 */
export async function optimizeImageFileForUpload(
  file: File,
  category: UploadImageCategory = 'general'
): Promise<OptimizedUploadResult> {
  const originalBytes = file.size;
  if (
    typeof document === 'undefined' ||
    !file.type.startsWith('image/') ||
    file.type === 'image/x-icon' ||
    file.type === 'image/svg+xml'
  ) {
    return { file, originalBytes, optimizedBytes: originalBytes, wasOptimized: false };
  }

  const preset = IMAGE_OPTIMIZATION_PRESETS[category] || IMAGE_OPTIMIZATION_PRESETS.general;

  try {
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new window.Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Falha ao decodificar imagem.'));
        el.src = objectUrl;
      });

      const target = calculateTargetDimensions(
        img.naturalWidth || img.width,
        img.naturalHeight || img.height,
        preset.maxDimension
      );

      const canvas = document.createElement('canvas');
      canvas.width = target.width;
      canvas.height = target.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return { file, originalBytes, optimizedBytes: originalBytes, wasOptimized: false };
      }

      ctx.drawImage(img, 0, 0, target.width, target.height);

      const webpBlob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((blob) => resolve(blob), 'image/webp', preset.quality)
      );

      if (!webpBlob) {
        return { file, originalBytes, optimizedBytes: originalBytes, wasOptimized: false };
      }

      const wasResized =
        target.width !== (img.naturalWidth || img.width) ||
        target.height !== (img.naturalHeight || img.height);

      // Se já era WebP leve e não precisou redimensionar nem reduziu tamanho, mantém original
      if (file.type === 'image/webp' && !wasResized && webpBlob.size >= originalBytes) {
        return { file, originalBytes, optimizedBytes: originalBytes, wasOptimized: false };
      }

      const baseName = file.name.replace(/\.[^.]+$/, '') || 'imagem';
      const optimizedFile = new File([webpBlob], `${baseName}.webp`, {
        type: 'image/webp',
        lastModified: Date.now(),
      });

      return {
        file: optimizedFile,
        originalBytes,
        optimizedBytes: optimizedFile.size,
        wasOptimized: true,
      };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return { file, originalBytes, optimizedBytes: originalBytes, wasOptimized: false };
  }
}

