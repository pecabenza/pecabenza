import React from 'react';
import { Sparkles } from 'lucide-react';

interface PrelaunchBannerProps {
  bannerText: string;
}

export function PrelaunchBanner({ bannerText }: PrelaunchBannerProps) {
  if (!bannerText) return null;

  return (
    <aside aria-label="Aviso de pré-lançamento" className="bg-tenant-accent text-white py-2.5 px-4 text-xs sm:text-sm font-medium transition-colors">
      <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 text-center">
        <Sparkles className="w-4 h-4 text-tenant-secondary shrink-0 animate-pulse" />
        <span>{bannerText}</span>
      </div>
    </aside>
  );
}
