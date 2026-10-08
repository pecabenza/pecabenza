'use client';

import React, { useState } from 'react';
import { Palette, CheckCircle2, Save, Image as ImageIcon } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ImageUploadField } from '@/components/admin/ImageUploadField';

export default function AdminIdentidadePage() {
  const [logoUrl, setLogoUrl] = useState('');
  const [faviconUrl, setFaviconUrl] = useState('');

  const [colors, setColors] = useState({
    primary: '#A84B2C',
    secondary: '#D99B26',
    accent: '#2C1A14',
    background: '#FDFBF7',
    surface: '#FFFFFF',
    text: '#1C1917',
  });

  const [bannerText, setBannerText] = useState('Em breve: pratos prontos congelados para o seu dia a dia e momentos especiais.');
  const [ctaText, setCtaText] = useState('Em breve');
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-stone-900">
            Identidade Visual & Modo Pré-Lançamento
          </h1>
          <p className="text-sm text-stone-500">
            Gerencie o logotipo oficial, favicon, paleta cromática e textos de pré-lançamento.
          </p>
        </div>

        {saved && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Configurações salvas com sucesso</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Gestão de Logotipo e Marca */}
        <Card className="p-6 bg-white space-y-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-amber-700" />
              <h2 className="font-heading text-lg font-bold text-stone-900">
                Logotipo & Favicon da Marca
              </h2>
            </div>
            <p className="text-xs text-stone-500">
              Aguardando o envio dos arquivos oficiais homologados pelo cliente. Enquanto não houver logotipo enviado, o storefront opera com tipografia institucional neutra.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
            <ImageUploadField
              label="Logomarca Principal (Header & Footer)"
              value={logoUrl}
              onChange={setLogoUrl}
              category="logo"
              aspectRatio="wide"
              helperText="Faça upload do arquivo oficial fornecido pelo cliente (SVG ou PNG com fundo transparente)."
            />

            <ImageUploadField
              label="Favicon / Ícone de Aba"
              value={faviconUrl}
              onChange={setFaviconUrl}
              category="logo"
              aspectRatio="square"
              helperText="Ícone quadrado oficial da marca para aba de navegação (formato PNG, SVG ou ICO)."
            />
          </div>
        </Card>

        {/* Cores */}
        <Card className="p-6 bg-white space-y-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Palette className="w-5 h-5 text-amber-700" />
              <h2 className="font-heading text-lg font-bold text-stone-900">
                Paleta de Cores
              </h2>
            </div>
            <p className="text-xs text-stone-500">
              Cores oficiais da identidade gastronômica do Tenant 01 (BENZA).
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-stone-600">Cor Primária (Terracota)</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={colors.primary}
                  onChange={(e) => setColors({ ...colors, primary: e.target.value })}
                  className="w-10 h-10 rounded border border-stone-300 p-0.5 cursor-pointer"
                />
                <input
                  type="text"
                  value={colors.primary}
                  onChange={(e) => setColors({ ...colors, primary: e.target.value })}
                  className="w-full px-3 py-2 rounded border border-stone-300 text-xs font-mono"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-stone-600">Cor Secundária (Mostarda)</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={colors.secondary}
                  onChange={(e) => setColors({ ...colors, secondary: e.target.value })}
                  className="w-10 h-10 rounded border border-stone-300 p-0.5 cursor-pointer"
                />
                <input
                  type="text"
                  value={colors.secondary}
                  onChange={(e) => setColors({ ...colors, secondary: e.target.value })}
                  className="w-full px-3 py-2 rounded border border-stone-300 text-xs font-mono"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-stone-600">Destaque (Marrom Profundo)</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={colors.accent}
                  onChange={(e) => setColors({ ...colors, accent: e.target.value })}
                  className="w-10 h-10 rounded border border-stone-300 p-0.5 cursor-pointer"
                />
                <input
                  type="text"
                  value={colors.accent}
                  onChange={(e) => setColors({ ...colors, accent: e.target.value })}
                  className="w-full px-3 py-2 rounded border border-stone-300 text-xs font-mono"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-stone-600">Fundo (Creme / Marfim)</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={colors.background}
                  onChange={(e) => setColors({ ...colors, background: e.target.value })}
                  className="w-10 h-10 rounded border border-stone-300 p-0.5 cursor-pointer"
                />
                <input
                  type="text"
                  value={colors.background}
                  onChange={(e) => setColors({ ...colors, background: e.target.value })}
                  className="w-full px-3 py-2 rounded border border-stone-300 text-xs font-mono"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-stone-600">Superfície dos Cards (Branco Puro)</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={colors.surface}
                  onChange={(e) => setColors({ ...colors, surface: e.target.value })}
                  className="w-10 h-10 rounded border border-stone-300 p-0.5 cursor-pointer"
                />
                <input
                  type="text"
                  value={colors.surface}
                  onChange={(e) => setColors({ ...colors, surface: e.target.value })}
                  className="w-full px-3 py-2 rounded border border-stone-300 text-xs font-mono"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-stone-600">Texto Principal (Grafite Escuro)</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={colors.text}
                  onChange={(e) => setColors({ ...colors, text: e.target.value })}
                  className="w-10 h-10 rounded border border-stone-300 p-0.5 cursor-pointer"
                />
                <input
                  type="text"
                  value={colors.text}
                  onChange={(e) => setColors({ ...colors, text: e.target.value })}
                  className="w-full px-3 py-2 rounded border border-stone-300 text-xs font-mono"
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Textos de Pré-Lançamento */}
        <Card className="p-6 bg-white space-y-4">
          <div className="space-y-1">
            <h2 className="font-heading text-lg font-bold text-stone-900">
              Comunicação de Pré-Lançamento
            </h2>
            <p className="text-xs text-stone-500">
              Personalize a faixa de aviso no topo do site e o texto do botão nos cards institucionais.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase text-stone-600">
                Texto do Banner Superior (Prelaunch)
              </label>
              <input
                type="text"
                value={bannerText}
                onChange={(e) => setBannerText(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded border border-stone-300 text-sm focus:outline-none focus:border-stone-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase text-stone-600">
                Rótulo do Botão nos Cards (Prelaunch CTA)
              </label>
              <input
                type="text"
                value={ctaText}
                onChange={(e) => setCtaText(e.target.value)}
                className="w-full max-w-xs px-3.5 py-2.5 rounded border border-stone-300 text-sm focus:outline-none focus:border-stone-500"
              />
            </div>
          </div>
        </Card>

        <Button type="submit" className="gap-2 bg-stone-900 text-white hover:bg-stone-800">
          <Save className="w-4 h-4" />
          <span>Salvar Alterações da Identidade</span>
        </Button>
      </form>
    </div>
  );
}
