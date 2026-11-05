'use client';

import React, { useState, useEffect } from 'react';
import { Palette, CheckCircle2, Save, Image as ImageIcon, RefreshCw, Loader2, AlertCircle } from 'lucide-react';
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
    borderRadius: '0.75rem',
  });

  const [bannerText, setBannerText] = useState('');
  const [ctaText, setCtaText] = useState('Em breve');
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadBranding = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/admin/branding');
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.branding) {
          setLogoUrl(data.branding.logo_url || '');
          setFaviconUrl(data.branding.favicon_url || '');
          setColors({
            primary: data.branding.color_primary || '#A84B2C',
            secondary: data.branding.color_secondary || '#D99B26',
            accent: data.branding.color_accent || '#2C1A14',
            background: data.branding.color_background || '#FDFBF7',
            surface: data.branding.color_surface || '#FFFFFF',
            text: data.branding.color_text || '#1C1917',
            borderRadius: data.branding.border_radius || '0.75rem',
          });
        }
        if (data.settings) {
          setBannerText(data.settings.prelaunch_banner_text || '');
          setCtaText(data.settings.prelaunch_cta_text || 'Em breve');
        }
      } else {
        setErrorMessage(data.error || 'Erro ao carregar identidade visual.');
      }
    } catch {
      setErrorMessage('Erro de comunicação ao carregar configurações de branding.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBranding();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/admin/branding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logo_url: logoUrl || null,
          favicon_url: faviconUrl || null,
          color_primary: colors.primary,
          color_secondary: colors.secondary,
          color_accent: colors.accent,
          color_background: colors.background,
          color_surface: colors.surface,
          color_text: colors.text,
          border_radius: colors.borderRadius,
          prelaunch_banner_text: bannerText,
          prelaunch_cta_text: ctaText,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3500);
      } else {
        const details = data.details ? data.details.map((d: any) => `${d.field}: ${d.message}`).join(', ') : '';
        setErrorMessage(`${data.error || 'Falha ao salvar identidade.'} ${details}`);
      }
    } catch {
      setErrorMessage('Erro de comunicação ao salvar identidade visual.');
    } finally {
      setIsSaving(false);
    }
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

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={loadBranding}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Recarregar</span>
          </Button>

          {saved && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Configurações persistidas com sucesso!</span>
            </div>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-xs text-red-800 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-stone-500 flex flex-col items-center justify-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-amber-600" />
          <span className="text-sm">Carregando dados de identidade do banco de dados...</span>
        </div>
      ) : (
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
                Logomarca oficial exibida no cabeçalho e rodapé. Caso nenhum arquivo esteja cadastrado, o storefront exibe a tipografia institucional da marca.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
              <ImageUploadField
                label="Logomarca Principal (Header & Footer)"
                value={logoUrl}
                onChange={setLogoUrl}
                defaultImageUrl="/assets/brands/benza/logo-primary.svg"
                category="logo"
                aspectRatio="wide"
                helperText="Arquivo oficial da marca em SVG ou PNG em alta definição."
              />

              <ImageUploadField
                label="Ícone da Marca (Favicon)"
                value={faviconUrl}
                onChange={setFaviconUrl}
                defaultImageUrl="/assets/brands/benza/favicon.svg"
                category="logo"
                aspectRatio="square"
                helperText="Ícone quadrado exibido na aba do navegador (SVG, ICO ou PNG)."
              />
            </div>
          </Card>

          {/* Paleta Cromática Semântica */}
          <Card className="p-6 bg-white space-y-6">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-amber-700" />
                <h2 className="font-heading text-lg font-bold text-stone-900">
                  Paleta de Cores do Estabelecimento
                </h2>
              </div>
              <p className="text-xs text-stone-500">
                Cores injetadas dinamicamente no SSR via variáveis CSS para evitar FOUC.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 pt-2">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-stone-700 flex items-center justify-between">
                  <span>Cor Primária</span>
                  <span className="font-mono text-[11px] text-stone-500">{colors.primary}</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={colors.primary}
                    onChange={(e) => setColors({ ...colors, primary: e.target.value })}
                    className="w-10 h-10 rounded-lg cursor-pointer border border-stone-300 p-0.5 bg-white"
                  />
                  <input
                    type="text"
                    value={colors.primary}
                    onChange={(e) => setColors({ ...colors, primary: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm font-mono focus:outline-none focus:border-stone-800"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-stone-700 flex items-center justify-between">
                  <span>Cor Secundária</span>
                  <span className="font-mono text-[11px] text-stone-500">{colors.secondary}</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={colors.secondary}
                    onChange={(e) => setColors({ ...colors, secondary: e.target.value })}
                    className="w-10 h-10 rounded-lg cursor-pointer border border-stone-300 p-0.5 bg-white"
                  />
                  <input
                    type="text"
                    value={colors.secondary}
                    onChange={(e) => setColors({ ...colors, secondary: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm font-mono focus:outline-none focus:border-stone-800"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-stone-700 flex items-center justify-between">
                  <span>Cor de Destaque</span>
                  <span className="font-mono text-[11px] text-stone-500">{colors.accent}</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={colors.accent}
                    onChange={(e) => setColors({ ...colors, accent: e.target.value })}
                    className="w-10 h-10 rounded-lg cursor-pointer border border-stone-300 p-0.5 bg-white"
                  />
                  <input
                    type="text"
                    value={colors.accent}
                    onChange={(e) => setColors({ ...colors, accent: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm font-mono focus:outline-none focus:border-stone-800"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-stone-700 flex items-center justify-between">
                  <span>Cor de Fundo</span>
                  <span className="font-mono text-[11px] text-stone-500">{colors.background}</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={colors.background}
                    onChange={(e) => setColors({ ...colors, background: e.target.value })}
                    className="w-10 h-10 rounded-lg cursor-pointer border border-stone-300 p-0.5 bg-white"
                  />
                  <input
                    type="text"
                    value={colors.background}
                    onChange={(e) => setColors({ ...colors, background: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm font-mono focus:outline-none focus:border-stone-800"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-stone-700 flex items-center justify-between">
                  <span>Cor de Superfície (Cards)</span>
                  <span className="font-mono text-[11px] text-stone-500">{colors.surface}</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={colors.surface}
                    onChange={(e) => setColors({ ...colors, surface: e.target.value })}
                    className="w-10 h-10 rounded-lg cursor-pointer border border-stone-300 p-0.5 bg-white"
                  />
                  <input
                    type="text"
                    value={colors.surface}
                    onChange={(e) => setColors({ ...colors, surface: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm font-mono focus:outline-none focus:border-stone-800"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-stone-700 flex items-center justify-between">
                  <span>Cor de Texto Principal</span>
                  <span className="font-mono text-[11px] text-stone-500">{colors.text}</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={colors.text}
                    onChange={(e) => setColors({ ...colors, text: e.target.value })}
                    className="w-10 h-10 rounded-lg cursor-pointer border border-stone-300 p-0.5 bg-white"
                  />
                  <input
                    type="text"
                    value={colors.text}
                    onChange={(e) => setColors({ ...colors, text: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm font-mono focus:outline-none focus:border-stone-800"
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Textos de Pré-Lançamento */}
          <Card className="p-6 bg-white space-y-6">
            <div className="space-y-1">
              <h2 className="font-heading text-lg font-bold text-stone-900">
                Avisos do Modo Pré-Lançamento
              </h2>
              <p className="text-xs text-stone-500">
                Configurações da barra superior informativa enquanto a loja virtual não abre pedidos transacionais.
              </p>
            </div>

            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-stone-700">
                  Texto da Faixa de Pré-Lançamento (Topo do Site)
                </label>
                <input
                  type="text"
                  value={bannerText}
                  onChange={(e) => setBannerText(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-800"
                  placeholder="Em breve: pratos prontos congelados para o seu dia a dia e momentos especiais."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-stone-700">
                  Texto do Botão dos Cards de Prato
                </label>
                <input
                  type="text"
                  value={ctaText}
                  onChange={(e) => setCtaText(e.target.value)}
                  className="w-full max-w-xs px-3.5 py-2.5 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-800"
                  placeholder="Em breve"
                />
              </div>
            </div>
          </Card>

          <div className="flex justify-end pt-4">
            <Button
              type="submit"
              isLoading={isSaving}
              className="gap-2 bg-stone-900 text-white hover:bg-stone-800 px-6 py-2.5"
            >
              <Save className="w-4 h-4" />
              <span>Salvar Identidade Visual</span>
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
