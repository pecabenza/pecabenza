'use client';

import React, { useState } from 'react';
import Image from 'next/image';

interface SafeProductImageProps {
  src: string | null | undefined;
  alt: string;
  categoryLabel?: string;
  sizes: string;
  priority?: boolean;
  className?: string;
  overlayClassName?: string;
  fallbackSubtitle?: string;
}

/**
 * Renderiza a imagem do produto com fallback em 2 níveis:
 * 1. Tenta via otimizador `next/image`.
 * 2. Se o proxy `/_next/image` falhar (ex: timeout de rede), tenta carregar a URL direta (`unoptimized`).
 * 3. Se a URL direta também falhar ou estiver ausente, exibe fallback tipográfico da marca sem ícone quebrado.
 */
export function SafeProductImage({
  src,
  alt,
  categoryLabel,
  sizes,
  priority = false,
  className = '',
  overlayClassName,
  fallbackSubtitle,
}: SafeProductImageProps) {
  const [stage, setStage] = useState<'optimized' | 'direct' | 'fallback'>('optimized');

  if (!src || stage === 'fallback') {
    return (
      <div className="text-center space-y-1.5 p-5">
        <span className="text-xs uppercase tracking-widest text-tenant-muted font-semibold block">
          {categoryLabel || 'Prato'}
        </span>
        <p className="font-heading text-xl sm:text-2xl font-bold text-tenant-text line-clamp-2">
          {alt}
        </p>
        {fallbackSubtitle && (
          <p className="text-xs text-tenant-muted pt-1">{fallbackSubtitle}</p>
        )}
      </div>
    );
  }

  return (
    <>
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        loading={priority ? undefined : 'lazy'}
        unoptimized={stage === 'direct'}
        onError={() => {
          setStage((prev) => (prev === 'optimized' ? 'direct' : 'fallback'));
        }}
        className={className}
        sizes={sizes}
      />
      {overlayClassName && <div className={overlayClassName} />}
    </>
  );
}

