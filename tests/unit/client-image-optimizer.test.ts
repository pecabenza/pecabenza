import { describe, it, expect } from 'vitest';
import {
  calculateTargetDimensions,
  formatBytesCompact,
  IMAGE_OPTIMIZATION_PRESETS,
} from '@/lib/media/client-image-optimizer';

describe('Otimizador de Imagem no Upload (Client-side)', () => {
  it('não deve ampliar imagens menores que o limite da categoria', () => {
    expect(calculateTargetDimensions(800, 600, IMAGE_OPTIMIZATION_PRESETS.products.maxDimension)).toEqual({
      width: 800,
      height: 600,
    });
  });

  it('deve redimensionar proporcionalmente mantendo a maior dimensão no limite', () => {
    expect(calculateTargetDimensions(4000, 3000, 1200)).toEqual({
      width: 1200,
      height: 900,
    });
    expect(calculateTargetDimensions(1800, 3600, 1200)).toEqual({
      width: 600,
      height: 1200,
    });
  });

  it('deve formatar tamanhos de arquivo de forma legível', () => {
    expect(formatBytesCompact(512)).toBe('512 B');
    expect(formatBytesCompact(153600)).toBe('150 KB');
    expect(formatBytesCompact(2 * 1024 * 1024)).toBe('2,00 MB');
  });
});

