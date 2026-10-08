'use client';

import React, { useState, useRef } from 'react';
import { UploadCloud, Image as ImageIcon, X, RefreshCw, Link as LinkIcon, Info } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface ImageUploadFieldProps {
  label: string;
  value: string;
  onChange: (url: string) => void;
  defaultImageUrl?: string;
  category?: 'logo' | 'hero' | 'products' | 'general';
  helperText?: string;
  aspectRatio?: 'square' | 'video' | 'wide' | 'auto';
  isMockup?: boolean;
  className?: string;
}

export function ImageUploadField({
  label,
  value,
  onChange,
  defaultImageUrl,
  category = 'general',
  helperText,
  aspectRatio = 'square',
  isMockup,
  className = '',
}: ImageUploadFieldProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isCurrentMockup = isMockup ?? (value ? value.includes('mockup') : false);

  const aspectClass = {
    square: 'aspect-square max-w-[200px]',
    video: 'aspect-[16/9] max-w-[340px]',
    wide: 'aspect-[21/9] max-w-[420px]',
    auto: 'min-h-[140px] max-w-[260px]',
  }[aspectRatio];

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', category);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Falha no upload.');
      }

      onChange(data.url);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar imagem.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleApplyUrl = () => {
    if (customUrl.trim()) {
      onChange(customUrl.trim());
      setShowUrlInput(false);
      setCustomUrl('');
    }
  };

  return (
    <div className={`space-y-2.5 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold uppercase tracking-wider text-stone-700">
            {label}
          </label>
          {isCurrentMockup && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
              <Info className="w-3 h-3 text-amber-600" />
              <span>Imagem ilustrativa / mockup</span>
            </span>
          )}
        </div>

        {defaultImageUrl && value !== defaultImageUrl && (
          <button
            type="button"
            onClick={() => onChange(defaultImageUrl)}
            className="text-[11px] font-semibold text-stone-500 hover:text-stone-800 flex items-center gap-1 transition-colors"
            title="Restaurar asset padrão configurado para o tenant"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Restaurar imagem padrão</span>
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row items-start gap-4">
        {/* Preview da Imagem */}
        <div
          className={`relative rounded-xl border-2 border-dashed border-stone-200 bg-stone-50 overflow-hidden flex items-center justify-center w-full ${aspectClass} transition-all group`}
        >
          {value ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={value}
                alt={label}
                className="w-full h-full object-contain p-2"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <div className="absolute inset-0 bg-stone-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="text-xs h-8 bg-white/95 text-stone-900 hover:bg-white"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  Substituir
                </Button>
                <button
                  type="button"
                  onClick={() => onChange('')}
                  className="p-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
                  title="Remover imagem"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <div className="text-center p-4 space-y-2">
              <div className="w-10 h-10 rounded-full bg-stone-200 text-stone-500 mx-auto flex items-center justify-center">
                <ImageIcon className="w-5 h-5" />
              </div>
              <p className="text-[11px] text-stone-500 font-medium">Nenhuma imagem definida</p>
            </div>
          )}

          {isUploading && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-xs flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-5 h-5 text-amber-700 animate-spin" />
              <span className="text-xs font-semibold text-stone-700">Enviando...</span>
            </div>
          )}
        </div>

        {/* Botões de Ação */}
        <div className="flex-1 space-y-2.5 w-full">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="gap-2 text-xs h-9 bg-stone-100 hover:bg-stone-200 border-stone-300 text-stone-800"
            >
              <UploadCloud className="w-3.5 h-3.5 text-stone-600" />
              <span>{value ? 'Substituir por arquivo local' : 'Fazer upload de imagem'}</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowUrlInput(!showUrlInput)}
              className="text-xs h-9 text-stone-600 hover:text-stone-900 gap-1.5"
            >
              <LinkIcon className="w-3.5 h-3.5" />
              <span>Informar URL</span>
            </Button>
          </div>

          {showUrlInput && (
            <div className="flex items-center gap-2 pt-1 animate-in fade-in">
              <input
                type="text"
                placeholder="https://exemplo.com/imagem.jpg ou /assets/..."
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-stone-300 focus:outline-none focus:border-stone-500 bg-white font-mono"
              />
              <Button
                type="button"
                size="sm"
                onClick={handleApplyUrl}
                className="h-8 text-xs bg-stone-900 text-white"
              >
                Aplicar
              </Button>
            </div>
          )}

          {helperText && (
            <p className="text-[11px] text-stone-500 leading-relaxed">{helperText}</p>
          )}

          {isCurrentMockup && (
            <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200/60 leading-relaxed">
              <strong>Nota:</strong> Este arquivo é uma representação ilustrativa (mockup) para homologação estética. Antes do deploy definitivo, substitua pelo arquivo homologado da marca.
            </p>
          )}

          {error && (
            <p className="text-xs text-red-600 font-medium animate-in fade-in">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
