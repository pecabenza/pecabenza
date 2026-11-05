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
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ImageUploadField } from '@/components/admin/ImageUploadField';

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

  const loadSections = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/admin/sections?page=home');
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
    loadSections();
  }, []);

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
        alert('Falha ao alterar visibilidade da seção.');
      }
    } catch {
      alert('Erro ao atualizar seção.');
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
      alert('Erro ao persistir nova ordenação.');
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
            Seções da Página Inicial
          </h1>
          <p className="text-sm text-stone-500">
            Gerencie o conteúdo, visibilidade e a ordem dos blocos institucionais da Home.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={loadSections}
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
                        {section.section_type}
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
                editingSection.section_type === 'ImageTextSection') && (
                <div className="bg-amber-50/40 p-4 rounded-xl border border-amber-200/50">
                  <ImageUploadField
                    label="Fotografia da Seção"
                    value={editingSection.content.image_url || ''}
                    onChange={(url) =>
                      setEditingSection({
                        ...editingSection,
                        content: { ...editingSection.content, image_url: url },
                      })
                    }
                    defaultImageUrl={editingSection.defaultMockupUrl}
                    category={editingSection.section_type === 'HeroEditorial' ? 'hero' : 'general'}
                    aspectRatio="wide"
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
