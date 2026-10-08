'use client';

import React, { useState } from 'react';
import {
  Layers,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Edit3,
  CheckCircle2,
  X,
  Save,
  ImageIcon,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ImageUploadField } from '@/components/admin/ImageUploadField';

interface SectionItem {
  id: string;
  type: string;
  name: string;
  order: number;
  isActive: boolean;
  summary: string;
  content: Record<string, any>;
  defaultMockupUrl?: string;
}

const INITIAL_SECTIONS: SectionItem[] = [
  {
    id: 'sec-01',
    type: 'HeroEditorial',
    name: 'Hero Principal',
    order: 1,
    isActive: true,
    summary: 'Banner editorial com título, fotografia gastronômica e CTAs de cardápio',
    defaultMockupUrl: '/assets/brands/benza/mockup-hero-editorial.jpg',
    content: {
      badge: 'Pratos Prontos para Aquecer',
      title: 'A comodidade da boa comida à sua mesa',
      subtitle:
        'Receitas preparadas com atenção aos detalhes, porcionadas e prontas para aquecer no seu dia a dia.',
      primary_cta_label: 'Conheça o Cardápio',
      primary_cta_href: '/produtos',
      secondary_cta_label: 'Nossa Proposta',
      secondary_cta_href: '/sobre',
      highlight_note: 'Modo pré-lançamento ativo — Cardápio inaugural em breve',
      image_url: '/assets/brands/benza/mockup-hero-editorial.jpg',
    },
  },
  {
    id: 'sec-02',
    type: 'BrandStorySection',
    name: 'Manifesto & Proposta',
    order: 2,
    isActive: true,
    summary: 'História, proposta de preparo e fotografia da essência da cozinha',
    defaultMockupUrl: '/assets/brands/benza/mockup-hero-editorial.jpg',
    content: {
      eyebrow: 'Nossa Proposta',
      title: 'Comida bem feita para quem valoriza praticidade',
      lead_paragraph:
        'A BENZA nasceu para oferecer refeições práticas sem abrir mão do sabor de uma comida feita com atenção aos detalhes.',
      description:
        'Nossos pratos são preparados, porcionados e congelados para que você possa desfrutar de uma refeição completa com o simples aquecimento em casa ou no trabalho.',
      cta_label: 'Conheça mais sobre nós',
      cta_href: '/sobre',
      image_url: '/assets/brands/benza/mockup-hero-editorial.jpg',
    },
  },
  {
    id: 'sec-03',
    type: 'ProductShowcaseSection',
    name: 'Vitrine de Pratos',
    order: 3,
    isActive: true,
    summary: 'Destaque dos pratos Feijoada e Lasanha com porções e fotografia',
    content: {
      title: 'Pratos em Destaque',
      subtitle:
        'Porções individuais e para compartilhar, desenvolvidas com equilíbrio nutricional e sabor inigualável.',
      show_variants: true,
      cta_label: 'Ver todo o cardápio',
      cta_href: '/produtos',
    },
  },
  {
    id: 'sec-04',
    type: 'BenefitsSection',
    name: 'Pilares & Benefícios',
    order: 4,
    isActive: true,
    summary: 'Preparo com cuidado, conservação, praticidade e porções sob medida',
    content: {
      title: 'Como Funciona a BENZA',
      subtitle: 'Praticidade, porções pensadas e preparo descomplicado.',
    },
  },
  {
    id: 'sec-05',
    type: 'CTASection',
    name: 'Aviso de Lançamento',
    order: 5,
    isActive: true,
    summary: 'Formulário de captação de e-mails para o lançamento',
    content: {
      title: 'Acompanhe o início das operações',
      description:
        'Cadastre seu e-mail para receber a data de abertura dos primeiros pedidos e novidades.',
      button_label: 'Cadastrar para novidades',
    },
  },
  {
    id: 'sec-06',
    type: 'FAQSection',
    name: 'Dúvidas Frequentes',
    order: 6,
    isActive: true,
    summary: 'Perguntas sobre porções, conservação e aquecimento',
    content: {
      title: 'Perguntas Frequentes',
      subtitle: 'Informações essenciais sobre nossos pratos e atendimento.',
    },
  },
  {
    id: 'sec-07',
    type: 'ContactSection',
    name: 'Fale Conosco',
    order: 7,
    isActive: true,
    summary: 'Canais de atendimento, redes e formulário direto',
    content: {
      title: 'Fale Conosco',
      description: 'Dúvidas ou sugestões? Nossa equipe está pronta para conversar.',
    },
  },
];

export default function AdminSitePage() {
  const [sections, setSections] = useState<SectionItem[]>(INITIAL_SECTIONS);
  const [editingSection, setEditingSection] = useState<SectionItem | null>(null);
  const [savedNotification, setSavedNotification] = useState(false);

  const toggleActive = (id: string) => {
    setSections(sections.map((s) => (s.id === id ? { ...s, isActive: !s.isActive } : s)));
    showSaved('Status da seção alterado com sucesso');
  };

  const moveSection = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sections.length) return;

    const newSections = [...sections];
    const [moved] = newSections.splice(index, 1);
    newSections.splice(targetIndex, 0, moved);

    setSections(newSections.map((s, idx) => ({ ...s, order: idx + 1 })));
    showSaved('Ordem das seções atualizada');
  };

  const showSaved = (msg?: string) => {
    setSavedNotification(true);
    setTimeout(() => setSavedNotification(false), 3000);
  };

  const handleSaveSection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSection) return;

    setSections(sections.map((s) => (s.id === editingSection.id ? editingSection : s)));
    setEditingSection(null);
    showSaved('Conteúdo da seção salvo com sucesso!');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-stone-900">
            Seções da Página Inicial
          </h1>
          <p className="text-sm text-stone-500">
            Edite os textos, substitua fotografias institucionais e reordene blocos do storefront.
          </p>
        </div>

        {savedNotification && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Alterações salvas com sucesso</span>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {sections.map((section, index) => (
          <Card
            key={section.id}
            className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white transition-all ${
              !section.isActive ? 'opacity-60 bg-stone-50' : ''
            }`}
          >
            <div className="flex items-start sm:items-center gap-4">
              <div className="w-8 h-8 rounded-lg bg-stone-100 text-stone-600 font-mono text-xs font-bold flex items-center justify-center shrink-0">
                0{index + 1}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-stone-900 text-sm">{section.name}</h3>
                  <span className="text-[10px] font-mono uppercase bg-stone-100 text-stone-500 px-2 py-0.5 rounded">
                    {section.type}
                  </span>
                </div>
                <p className="text-xs text-stone-500">{section.summary}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setEditingSection({ ...section, content: { ...section.content } })}
                className="gap-1.5 text-xs h-8 bg-stone-100 hover:bg-stone-200 text-stone-700"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Editar Bloco</span>
              </Button>

              <button
                type="button"
                onClick={() => moveSection(index, 'up')}
                disabled={index === 0}
                className="p-2 rounded hover:bg-stone-100 disabled:opacity-30 disabled:hover:bg-transparent text-stone-600"
                title="Mover para cima"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => moveSection(index, 'down')}
                disabled={index === sections.length - 1}
                className="p-2 rounded hover:bg-stone-100 disabled:opacity-30 disabled:hover:bg-transparent text-stone-600"
                title="Mover para baixo"
              >
                <ArrowDown className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => toggleActive(section.id)}
                className={`p-2 rounded transition-colors ${
                  section.isActive
                    ? 'text-emerald-600 hover:bg-emerald-50'
                    : 'text-stone-400 hover:bg-stone-100'
                }`}
                title={section.isActive ? 'Desativar seção' : 'Ativar seção'}
              >
                {section.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
            </div>
          </Card>
        ))}
      </div>

      {/* MODAL DE EDIÇÃO DE SEÇÃO CMS */}
      {editingSection && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-stone-200 my-8 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-5 border-b border-stone-100 flex items-center justify-between bg-stone-50">
              <div className="space-y-0.5">
                <h2 className="font-heading text-xl font-bold text-stone-900">
                  Editar {editingSection.name}
                </h2>
                <p className="text-xs text-stone-500">
                  Tipo: <span className="font-mono">{editingSection.type}</span> — Atualize textos e fotografia.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setEditingSection(null)}
                className="p-2 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/50 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSection} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* Fotografia da Seção se suportada */}
              {(editingSection.type === 'HeroEditorial' ||
                editingSection.type === 'BrandStorySection' ||
                editingSection.type === 'ImageTextSection') && (
                <div className="bg-amber-50/40 p-4 rounded-xl border border-amber-200/50">
                  <ImageUploadField
                    label="Fotografia Editorial da Seção (Mockup Ilustrativo)"
                    value={editingSection.content.image_url || ''}
                    onChange={(url) =>
                      setEditingSection({
                        ...editingSection,
                        content: { ...editingSection.content, image_url: url },
                      })
                    }
                    defaultImageUrl={editingSection.defaultMockupUrl}
                    isMockup={editingSection.content.image_url?.includes('mockup')}
                    category="hero"
                    aspectRatio="video"
                    helperText="Mockup temporário para desenvolvimento visual. Quando fotografias oficiais da marca estiverem disponíveis, faça o upload do arquivo homologado."
                  />
                </div>
              )}

              {/* Título Principal */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-stone-700">Título da Seção</label>
                <input
                  type="text"
                  required
                  value={editingSection.content.title || ''}
                  onChange={(e) =>
                    setEditingSection({
                      ...editingSection,
                      content: { ...editingSection.content, title: e.target.value },
                    })
                  }
                  className="w-full px-3.5 py-2.5 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-500"
                />
              </div>

              {/* Subtítulo ou Descrição */}
              {(editingSection.content.subtitle !== undefined ||
                editingSection.content.description !== undefined) && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-stone-700">
                    Subtítulo / Descrição
                  </label>
                  <textarea
                    rows={3}
                    value={
                      editingSection.content.subtitle ||
                      editingSection.content.description ||
                      ''
                    }
                    onChange={(e) => {
                      const key =
                        editingSection.content.subtitle !== undefined
                          ? 'subtitle'
                          : 'description';
                      setEditingSection({
                        ...editingSection,
                        content: { ...editingSection.content, [key]: e.target.value },
                      });
                    }}
                    className="w-full px-3.5 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-500"
                  />
                </div>
              )}

              {/* Badge ou Eyebrow se aplicável */}
              {(editingSection.content.badge !== undefined ||
                editingSection.content.eyebrow !== undefined) && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-stone-700">
                    Etiqueta Superior (Badge / Eyebrow)
                  </label>
                  <input
                    type="text"
                    value={
                      editingSection.content.badge ||
                      editingSection.content.eyebrow ||
                      ''
                    }
                    onChange={(e) => {
                      const key =
                        editingSection.content.badge !== undefined ? 'badge' : 'eyebrow';
                      setEditingSection({
                        ...editingSection,
                        content: { ...editingSection.content, [key]: e.target.value },
                      });
                    }}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-500"
                  />
                </div>
              )}

              {/* CTAs para HeroEditorial */}
              {editingSection.type === 'HeroEditorial' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-stone-100">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase text-stone-600">
                      Rótulo do CTA Principal
                    </label>
                    <input
                      type="text"
                      value={editingSection.content.primary_cta_label || ''}
                      onChange={(e) =>
                        setEditingSection({
                          ...editingSection,
                          content: {
                            ...editingSection.content,
                            primary_cta_label: e.target.value,
                          },
                        })
                      }
                      className="w-full px-3 py-2 text-xs rounded border border-stone-300"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase text-stone-600">
                      Rótulo do CTA Secundário
                    </label>
                    <input
                      type="text"
                      value={editingSection.content.secondary_cta_label || ''}
                      onChange={(e) =>
                        setEditingSection({
                          ...editingSection,
                          content: {
                            ...editingSection.content,
                            secondary_cta_label: e.target.value,
                          },
                        })
                      }
                      className="w-full px-3 py-2 text-xs rounded border border-stone-300"
                    />
                  </div>
                </div>
              )}

              {/* Ações */}
              <div className="pt-4 border-t border-stone-100 flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditingSection(null)}
                  className="text-stone-600"
                >
                  Cancelar
                </Button>

                <Button type="submit" className="gap-2 bg-stone-900 text-white hover:bg-stone-800">
                  <Save className="w-4 h-4" />
                  <span>Salvar Conteúdo</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
