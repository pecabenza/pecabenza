'use client';

import React, { useState, useEffect } from 'react';
import {
  Layers,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Edit3,
  CheckCircle2,
  AlertCircle,
  X,
  Save,
  RefreshCw,
  Loader2,
  Trash2,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useSystemDialog } from '@/components/ui/SystemDialogProvider';
import { ImageUploadField } from '@/components/admin/ImageUploadField';
import { SOBRE_SECTION_LABELS } from '@/modules/cms/sobre-defaults';

type PageSlugOption = 'home' | 'sobre' | 'contato';

const PAGE_OPTIONS: { slug: PageSlugOption; label: string; route: string }[] = [
  { slug: 'home', label: 'Página Inicial', route: '/' },
  { slug: 'sobre', label: 'Nossa Proposta', route: '/sobre' },
  { slug: 'contato', label: 'Contato', route: '/contato' },
];

interface SectionItem {
  id: string;
  page_id?: string;
  section_type: string;
  variant: string;
  display_order: number;
  is_active: boolean;
  content: Record<string, any>;
  defaultMockupUrl?: string;
}

export default function AdminSitePage() {
  const { showAlert } = useSystemDialog();
  const [activePage, setActivePage] = useState<PageSlugOption>('home');
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [pageId, setPageId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [editingSection, setEditingSection] = useState<SectionItem | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const showSaved = (msg: string) => {
    setSavedMessage(msg);
    setTimeout(() => setSavedMessage(null), 3500);
  };

  const loadSections = async (pageSlug: PageSlugOption = activePage) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/admin/sections?page=${pageSlug}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setSections(data.sections || []);
        setPageId(data.pageId || '');
      } else {
        setErrorMessage(data.error || 'Erro ao carregar seções da página.');
      }
    } catch {
      setErrorMessage('Erro de comunicação ao carregar seções.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSections(activePage);
  }, [activePage]);

  const handleToggleActive = async (id: string, current: boolean) => {
    try {
      const res = await fetch(`/api/admin/sections/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !current }),
      });
      if (res.ok) {
        setSections(sections.map((s) => (s.id === id ? { ...s, is_active: !current } : s)));
        showSaved(`Seção ${!current ? 'ativada' : 'desativada'} com sucesso.`);
      } else {
        await showAlert({
          title: 'Erro ao atualizar seção',
          message: 'Falha ao alterar visibilidade da seção.',
          variant: 'error',
        });
      }
    } catch {
      await showAlert({
        title: 'Erro ao atualizar seção',
        message: 'Erro ao atualizar seção.',
        variant: 'error',
      });
    }
  };

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sections.length) return;

    const currentSec = sections[index];
    const targetSec = sections[targetIndex];

    const newSections = [...sections];
    newSections[index] = { ...targetSec, display_order: index + 1 };
    newSections[targetIndex] = { ...currentSec, display_order: targetIndex + 1 };

    setSections(newSections);

    try {
      await Promise.all([
        fetch(`/api/admin/sections/${currentSec.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ display_order: targetIndex + 1 }),
        }),
        fetch(`/api/admin/sections/${targetSec.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ display_order: index + 1 }),
        }),
      ]);
      showSaved('Ordem das seções atualizada.');
    } catch {
      await showAlert({
        title: 'Erro de ordenação',
        message: 'Erro ao persistir nova ordenação.',
        variant: 'error',
      });
      loadSections();
    }
  };

  const handleSaveSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSection) return;

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/admin/sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingSection.id,
          page_id: pageId,
          section_type: editingSection.section_type,
          variant: editingSection.variant || 'default',
          display_order: editingSection.display_order,
          is_active: editingSection.is_active,
          content: editingSection.content,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSections(
          sections.map((s) => (s.id === data.section.id ? data.section : s))
        );
        setEditingSection(null);
        showSaved('Conteúdo da seção persistido com sucesso no banco!');
      } else {
        const details = data.details ? data.details.map((d: any) => `${d.field}: ${d.message}`).join(', ') : '';
        setErrorMessage(`${data.error || 'Erro ao salvar seção.'} ${details}`);
      }
    } catch {
      setErrorMessage('Erro de comunicação ao salvar alterações.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-stone-900">
            Páginas & Seções do Site (CMS)
          </h1>
          <p className="text-sm text-stone-500">
            Edite textos, substitua ou remova imagens, oculte e reordene seções das páginas principais.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadSections(activePage)}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Recarregar</span>
          </Button>

          {savedMessage && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{savedMessage}</span>
            </div>
          )}
        </div>
      </div>

      {/* Seletor de Página Principal */}
      <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-stone-200">
        {PAGE_OPTIONS.map((opt) => {
          const isCurrent = activePage === opt.slug;
          return (
            <button
              key={opt.slug}
              type="button"
              onClick={() => setActivePage(opt.slug)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                isCurrent
                  ? 'bg-stone-900 text-white border-stone-900 shadow-xs'
                  : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'
              }`}
            >
              {opt.label}{' '}
              <span className={isCurrent ? 'text-stone-300' : 'text-stone-400'}>
                ({opt.route})
              </span>
            </button>
          );
        })}
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
          <span className="text-sm">Carregando seções do banco de dados...</span>
        </div>
      ) : (
        <div className="space-y-3">
          {sections.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-xl border border-stone-200">
              <p className="text-sm text-stone-500">Nenhuma seção encontrada para esta página.</p>
            </div>
          ) : (
            sections.map((section, index) => (
              <Card
                key={section.id}
                className={`p-4 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  section.is_active ? 'bg-white' : 'bg-stone-50/70 border-dashed opacity-75'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-stone-100 text-stone-600 flex items-center justify-center font-mono text-xs font-bold shrink-0 mt-0.5">
                    {index + 1}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-stone-900 text-sm">
                        {section.content?.title || section.section_type}
                      </h3>
                      <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-stone-100 text-stone-600 border border-stone-200">
                        {SOBRE_SECTION_LABELS[section.section_type] || section.section_type}
                      </span>
                      {!section.is_active && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                          Oculto
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-stone-500 line-clamp-1 mt-0.5">
                      {section.content?.subtitle || section.content?.description || 'Bloco modular configurável'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                  <button
                    onClick={() => handleMove(index, 'up')}
                    disabled={index === 0}
                    className="p-1.5 text-stone-400 hover:text-stone-700 disabled:opacity-30 rounded hover:bg-stone-100"
                    title="Mover para cima"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleMove(index, 'down')}
                    disabled={index === sections.length - 1}
                    className="p-1.5 text-stone-400 hover:text-stone-700 disabled:opacity-30 rounded hover:bg-stone-100"
                    title="Mover para baixo"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <div className="h-4 w-px bg-stone-200 mx-1" />
                  <button
                    onClick={() => handleToggleActive(section.id, section.is_active)}
                    className="p-1.5 text-stone-400 hover:text-stone-700 rounded hover:bg-stone-100"
                    title={section.is_active ? 'Ocultar da Home' : 'Exibir na Home'}
                  >
                    {section.is_active ? <Eye className="w-4 h-4 text-emerald-600" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingSection({ ...section, content: { ...section.content } })}
                    className="gap-1.5 text-xs ml-2"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Editar</span>
                  </Button>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Modal de Edição de Seção com Validação */}
      {editingSection && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl bg-white shadow-xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-stone-200 flex items-center justify-between">
              <div>
                <h2 className="font-heading text-lg font-bold text-stone-900">
                  Editar {editingSection.section_type}
                </h2>
                <p className="text-xs text-stone-500">
                  As alterações são validadas com schemas tipados e salvas no banco de dados.
                </p>
              </div>
              <button
                onClick={() => setEditingSection(null)}
                className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSection} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto flex-1">
              {/* Fotografia da Seção se suportada */}
              {(editingSection.section_type === 'HeroEditorial' ||
                editingSection.section_type === 'BrandStorySection' ||
                editingSection.section_type === 'ImageTextSection' ||
                editingSection.section_type === 'SobreHero' ||
                editingSection.section_type === 'SobreEssencia') && (
                <div className="bg-amber-50/40 p-4 rounded-xl border border-amber-200/50 space-y-3">
                  <ImageUploadField
                    label="Fotografia da Seção"
                    value={editingSection.content.image_url || ''}
                    onChange={(url) =>
                      setEditingSection({
                        ...editingSection,
                        content: {
                          ...editingSection.content,
                          image_url: url,
                          image_hidden: false,
                        },
                      })
                    }
                    defaultImageUrl={editingSection.defaultMockupUrl}
                    category={
                      editingSection.section_type === 'HeroEditorial' ||
                      editingSection.section_type === 'SobreHero'
                        ? 'hero'
                        : 'general'
                    }
                    aspectRatio="wide"
                  />

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-amber-200/50">
                    <label className="flex items-center gap-2 text-xs font-medium text-stone-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(editingSection.content.image_hidden)}
                        onChange={(e) =>
                          setEditingSection({
                            ...editingSection,
                            content: {
                              ...editingSection.content,
                              image_hidden: e.target.checked,
                            },
                          })
                        }
                        className="rounded border-stone-300"
                      />
                      <span>Ocultar fotografia nesta seção</span>
                    </label>

                    {editingSection.content.image_url && (
                      <button
                        type="button"
                        onClick={() =>
                          setEditingSection({
                            ...editingSection,
                            content: { ...editingSection.content, image_url: '' },
                          })
                        }
                        className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Apagar imagem personalizada</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Selo / Eyebrow / Badge */}
              {editingSection.content.badge !== undefined && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-stone-700">Selo Superior (Badge)</label>
                  <input
                    type="text"
                    value={editingSection.content.badge || ''}
                    onChange={(e) =>
                      setEditingSection({
                        ...editingSection,
                        content: { ...editingSection.content, badge: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-800"
                  />
                </div>
              )}

              {editingSection.content.eyebrow !== undefined && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-stone-700">Subtítulo Superior (Eyebrow)</label>
                  <input
                    type="text"
                    value={editingSection.content.eyebrow || ''}
                    onChange={(e) =>
                      setEditingSection({
                        ...editingSection,
                        content: { ...editingSection.content, eyebrow: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-800"
                  />
                </div>
              )}

              {/* Título Principal */}
              {editingSection.content.title !== undefined && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-stone-700">Título Principal</label>
                  <input
                    type="text"
                    value={editingSection.content.title || ''}
                    onChange={(e) =>
                      setEditingSection({
                        ...editingSection,
                        content: { ...editingSection.content, title: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-800"
                    required
                  />
                </div>
              )}

              {/* Subtítulo ou Descrição */}
              {editingSection.content.subtitle !== undefined && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-stone-700">Subtítulo</label>
                  <textarea
                    rows={3}
                    value={editingSection.content.subtitle || ''}
                    onChange={(e) =>
                      setEditingSection({
                        ...editingSection,
                        content: { ...editingSection.content, subtitle: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-800 resize-none"
                  />
                </div>
              )}

              {/* Lead Paragraph se houver (BrandStory) */}
              {editingSection.content.lead_paragraph !== undefined && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-stone-700">Parágrafo de Destaque</label>
                  <textarea
                    rows={2}
                    value={editingSection.content.lead_paragraph || ''}
                    onChange={(e) =>
                      setEditingSection({
                        ...editingSection,
                        content: { ...editingSection.content, lead_paragraph: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-800 resize-none"
                  />
                </div>
              )}

              {/* Descrição Longa */}
              {editingSection.content.description !== undefined && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-stone-700">Descrição / Texto</label>
                  <textarea
                    rows={3}
                    value={editingSection.content.description || ''}
                    onChange={(e) =>
                      setEditingSection({
                        ...editingSection,
                        content: { ...editingSection.content, description: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-800 resize-none"
                  />
                </div>
              )}

              {/* Campos extras das seções de /sobre */}
              {editingSection.content.location_note !== undefined && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-stone-700">Nota de Localização</label>
                  <input
                    type="text"
                    value={editingSection.content.location_note || ''}
                    onChange={(e) =>
                      setEditingSection({
                        ...editingSection,
                        content: { ...editingSection.content, location_note: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-800"
                  />
                </div>
              )}

              {editingSection.content.frozen_title !== undefined && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-stone-200">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-stone-700">Modalidade 1 — Título</label>
                    <input
                      type="text"
                      value={editingSection.content.frozen_title || ''}
                      onChange={(e) =>
                        setEditingSection({
                          ...editingSection,
                          content: { ...editingSection.content, frozen_title: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
                    />
                    <label className="text-xs font-bold uppercase text-stone-700 block">Modalidade 1 — Texto</label>
                    <textarea
                      rows={3}
                      value={editingSection.content.frozen_description || ''}
                      onChange={(e) =>
                        setEditingSection({
                          ...editingSection,
                          content: { ...editingSection.content, frozen_description: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm resize-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-stone-700">Modalidade 2 — Título</label>
                    <input
                      type="text"
                      value={editingSection.content.ready_title || ''}
                      onChange={(e) =>
                        setEditingSection({
                          ...editingSection,
                          content: { ...editingSection.content, ready_title: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
                    />
                    <label className="text-xs font-bold uppercase text-stone-700 block">Modalidade 2 — Texto</label>
                    <textarea
                      rows={3}
                      value={editingSection.content.ready_description || ''}
                      onChange={(e) =>
                        setEditingSection({
                          ...editingSection,
                          content: { ...editingSection.content, ready_description: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm resize-none"
                    />
                  </div>
                </div>
              )}

              {Array.isArray(editingSection.content.items) &&
                editingSection.section_type === 'SobrePilares' && (
                  <div className="space-y-3 pt-2 border-t border-stone-200">
                    <label className="text-xs font-bold uppercase text-stone-700 block">
                      Pilares Exibidos (Cards)
                    </label>
                    {editingSection.content.items.map((item: any, idx: number) => (
                      <div key={idx} className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-2">
                        <input
                          type="text"
                          value={item.title || ''}
                          onChange={(e) => {
                            const nextItems = [...editingSection.content.items];
                            nextItems[idx] = { ...nextItems[idx], title: e.target.value };
                            setEditingSection({
                              ...editingSection,
                              content: { ...editingSection.content, items: nextItems },
                            });
                          }}
                          className="w-full px-3 py-1.5 rounded border border-stone-300 text-xs font-bold bg-white"
                          placeholder="Título do pilar"
                        />
                        <textarea
                          rows={2}
                          value={item.description || ''}
                          onChange={(e) => {
                            const nextItems = [...editingSection.content.items];
                            nextItems[idx] = { ...nextItems[idx], description: e.target.value };
                            setEditingSection({
                              ...editingSection,
                              content: { ...editingSection.content, items: nextItems },
                            });
                          }}
                          className="w-full px-3 py-1.5 rounded border border-stone-300 text-xs bg-white resize-none"
                          placeholder="Descrição do pilar"
                        />
                      </div>
                    ))}
                  </div>
                )}

              {editingSection.content.cta_label !== undefined && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-stone-700">Texto do Link / Botão</label>
                  <input
                    type="text"
                    value={editingSection.content.cta_label || ''}
                    onChange={(e) =>
                      setEditingSection({
                        ...editingSection,
                        content: { ...editingSection.content, cta_label: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-800"
                  />
                </div>
              )}

              {/* CTA Labels */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {editingSection.content.primary_cta_label !== undefined && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase text-stone-700">Botão Principal</label>
                    <input
                      type="text"
                      value={editingSection.content.primary_cta_label || ''}
                      onChange={(e) =>
                        setEditingSection({
                          ...editingSection,
                          content: { ...editingSection.content, primary_cta_label: e.target.value },
                        })
                      }
                      className="w-full px-3.5 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-800"
                    />
                  </div>
                )}

                {editingSection.content.secondary_cta_label !== undefined && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase text-stone-700">Botão Secundário</label>
                    <input
                      type="text"
                      value={editingSection.content.secondary_cta_label || ''}
                      onChange={(e) =>
                        setEditingSection({
                          ...editingSection,
                          content: { ...editingSection.content, secondary_cta_label: e.target.value },
                        })
                      }
                      className="w-full px-3.5 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-800"
                    />
                  </div>
                )}
              </div>

              {/* Rodapé do Modal */}
              <div className="pt-4 border-t border-stone-200 flex items-center justify-end gap-3 sticky bottom-0 bg-white">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingSection(null)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  isLoading={isSaving}
                  className="gap-2 bg-stone-900 text-white hover:bg-stone-800"
                >
                  <Save className="w-4 h-4" />
                  <span>Salvar Alterações</span>
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
