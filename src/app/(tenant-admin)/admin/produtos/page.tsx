'use client';

import React, { useState, useEffect } from 'react';
import {
  UtensilsCrossed,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  Save,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ImageUploadField } from '@/components/admin/ImageUploadField';

interface ProductVariantState {
  id?: string;
  name: string;
  unit_type: 'ml' | 'l' | 'g' | 'kg' | 'un' | 'cx' | 'portion' | 'other';
  unit_value: number;
  price_in_cents: number;
  is_available: boolean;
}

interface ProductItemState {
  id: string;
  name: string;
  slug: string;
  category_id?: string | null;
  category_name?: string;
  category?: { id: string; name: string } | null;
  status: 'active' | 'draft' | 'archived';
  is_featured: boolean;
  cover_image_url: string;
  defaultImageUrl?: string;
  asset_source: 'mockup' | 'official' | 'pending';
  is_mockup: boolean;
  short_description: string;
  full_description: string;
  variants: ProductVariantState[];
  ingredients: string;
  allergens: string;
  shelf_life: string;
  after_thawing_instructions: string;
  conservation_instructions: string;
  preparation_instructions: string;
}

export default function AdminProductsPage() {
  const [products, setProducts] = useState<ProductItemState[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductItemState | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const showFeedback = (msg: string) => {
    setFeedbackMessage(msg);
    setTimeout(() => setFeedbackMessage(null), 3500);
  };

  const loadProducts = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/admin/products');
      const data = await res.json();
      if (res.ok && data.success) {
        const formatted: ProductItemState[] = (data.products || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          category_id: p.category_id,
          category_name: p.category?.name || 'Pratos Principais',
          category: p.category,
          status: p.status,
          is_featured: p.is_featured,
          cover_image_url: p.cover_image_url || '',
          defaultImageUrl: p.cover_image_url || '',
          asset_source: p.asset_source || 'official',
          is_mockup: Boolean(p.is_mockup),
          short_description: p.short_description || '',
          full_description: p.full_description || '',
          variants: (p.variants || []).map((v: any) => ({
            id: v.id,
            name: v.name,
            unit_type: v.unit_type || 'ml',
            unit_value: Number(v.unit_value) || 500,
            price_in_cents: v.price_in_cents || 0,
            is_available: v.is_available ?? true,
          })),
          ingredients: p.information?.ingredients || '',
          allergens: p.information?.allergens || '',
          shelf_life: p.information?.shelf_life || '',
          after_thawing_instructions: p.information?.after_thawing_instructions || '',
          conservation_instructions: p.information?.conservation_instructions || '',
          preparation_instructions: p.information?.preparation_instructions || '',
        }));

        setProducts(formatted);
        setCategories(data.categories || []);
      } else {
        setErrorMessage(data.error || 'Erro ao carregar cardápio.');
      }
    } catch {
      setErrorMessage('Erro de comunicação ao carregar produtos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const handleEdit = (product: ProductItemState) => {
    setIsNew(false);
    setEditingProduct({
      ...product,
      variants: product.variants.map((v) => ({ ...v })),
    });
  };

  const handleCreateNew = () => {
    setIsNew(true);
    setEditingProduct({
      id: `p-temp-${Date.now()}`,
      name: '',
      slug: '',
      category_id: categories[0]?.id || null,
      category_name: categories[0]?.name || 'Pratos Principais',
      status: 'active',
      is_featured: false,
      cover_image_url: '',
      asset_source: 'official',
      is_mockup: false,
      short_description: '',
      full_description: '',
      variants: [
        {
          id: `v-temp-${Date.now()}`,
          name: '500 ml (Individual)',
          unit_type: 'ml',
          unit_value: 500,
          price_in_cents: 4500,
          is_available: true,
        },
      ],
      ingredients: '',
      allergens: '',
      shelf_life: 'Conforme impresso no rótulo do lote',
      after_thawing_instructions: 'Após descongelar, manter sob refrigeração e consumir em até 24 horas. Não recongelar.',
      conservation_instructions: 'Manter congelado conforme orientação da embalagem.',
      preparation_instructions: 'Aquecer em fogo brando ou forno até aquecer completamente.',
    });
  };

  const handleDeleteProduct = async (id: string, name: string) => {
    if (!confirm(`Deseja realmente excluir o prato "${name}"?`)) return;

    try {
      const res = await fetch(`/api/admin/products/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setProducts(products.filter((p) => p.id !== id));
        showFeedback(`Prato "${name}" excluído com sucesso.`);
      } else {
        alert('Erro ao excluir prato.');
      }
    } catch {
      alert('Erro de comunicação ao excluir produto.');
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    if (!editingProduct.name.trim()) {
      alert('O nome do prato é obrigatório.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: isNew ? undefined : editingProduct.id,
          name: editingProduct.name,
          slug: editingProduct.slug || undefined,
          category_id: editingProduct.category_id,
          category_name: editingProduct.category_name,
          status: editingProduct.status,
          is_featured: editingProduct.is_featured,
          cover_image_url: editingProduct.cover_image_url || null,
          asset_source: editingProduct.cover_image_url?.includes('mockup') ? 'mockup' : 'official',
          is_mockup: editingProduct.cover_image_url?.includes('mockup'),
          short_description: editingProduct.short_description || null,
          full_description: editingProduct.full_description || null,
          variants: editingProduct.variants,
          ingredients: editingProduct.ingredients || null,
          allergens: editingProduct.allergens || null,
          shelf_life: editingProduct.shelf_life || null,
          after_thawing_instructions: editingProduct.after_thawing_instructions || null,
          conservation_instructions: editingProduct.conservation_instructions || null,
          preparation_instructions: editingProduct.preparation_instructions || null,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setEditingProduct(null);
        showFeedback(isNew ? 'Novo prato cadastrado com sucesso!' : 'Prato atualizado com sucesso no banco!');
        loadProducts();
      } else {
        const details = data.details ? data.details.map((d: any) => `${d.field}: ${d.message}`).join(', ') : '';
        setErrorMessage(`${data.error || 'Erro ao salvar produto.'} ${details}`);
      }
    } catch {
      setErrorMessage('Erro de comunicação ao persistir produto.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddVariant = () => {
    if (!editingProduct) return;
    setEditingProduct({
      ...editingProduct,
      variants: [
        ...editingProduct.variants,
        {
          id: `v-temp-${Date.now()}`,
          name: '1000 ml (Para compartilhar)',
          unit_type: 'ml',
          unit_value: 1000,
          price_in_cents: 8000,
          is_available: true,
        },
      ],
    });
  };

  const handleRemoveVariant = (index: number) => {
    if (!editingProduct || editingProduct.variants.length <= 1) {
      alert('O prato deve possuir ao menos uma porção/variação.');
      return;
    }
    const newVariants = [...editingProduct.variants];
    newVariants.splice(index, 1);
    setEditingProduct({ ...editingProduct, variants: newVariants });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-stone-900">
            Cardápio & Fichas Técnicas
          </h1>
          <p className="text-sm text-stone-500">
            Gerencie receitas, porções, preços e informações alimentares com persistência direta no banco de dados.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={loadProducts}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Recarregar</span>
          </Button>

          <Button
            onClick={handleCreateNew}
            size="sm"
            className="gap-2 bg-stone-900 text-white hover:bg-stone-800"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Prato</span>
          </Button>

          {feedbackMessage && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{feedbackMessage}</span>
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
          <span className="text-sm">Carregando catálogo do banco de dados...</span>
        </div>
      ) : products.length === 0 ? (
        <Card className="p-12 text-center bg-white space-y-3 border-dashed">
          <UtensilsCrossed className="w-8 h-8 text-stone-400 mx-auto" />
          <h3 className="font-bold text-stone-900 text-sm">Nenhum prato cadastrado ainda</h3>
          <p className="text-xs text-stone-500 max-w-sm mx-auto">
            Cadastre os pratos do seu estabelecimento para compor o cardápio institucional e futuro comércio eletrônico.
          </p>
          <Button onClick={handleCreateNew} size="sm" className="mt-2">
            Cadastrar Primeiro Prato
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {products.map((product) => (
            <Card key={product.id} className="p-5 bg-white space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-heading font-bold text-stone-900 text-base">
                      {product.name}
                    </h3>
                    <Badge variant={product.status === 'active' ? 'primary' : 'neutral'} className="text-[10px]">
                      {product.status === 'active' ? 'Ativo' : 'Rascunho'}
                    </Badge>
                  </div>
                  <p className="text-xs text-stone-500 mt-1 line-clamp-2">
                    {product.short_description || 'Sem descrição cadastrada'}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEdit(product)}
                    className="p-2 h-8 w-8 text-stone-600"
                    title="Editar prato"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDeleteProduct(product.id, product.name)}
                    className="p-2 h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                    title="Excluir prato"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {/* Porções e Variações */}
              <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-xs text-stone-600">
                <span className="font-medium text-stone-500">
                  {product.variants.length} {product.variants.length === 1 ? 'Variação' : 'Variações'}:
                </span>
                <span className="font-mono font-semibold text-stone-900">
                  {product.variants
                    .map((v) => `${v.name} (R$ ${(v.price_in_cents / 100).toFixed(2)})`)
                    .join(' | ')}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal de Criação / Edição de Prato */}
      {editingProduct && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-3xl bg-white shadow-xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-stone-200 flex items-center justify-between">
              <div>
                <h2 className="font-heading text-lg font-bold text-stone-900">
                  {isNew ? 'Cadastrar Novo Prato' : `Editar: ${editingProduct.name}`}
                </h2>
                <p className="text-xs text-stone-500">
                  Defina fotos, porções, preços e ficha técnica nutricional.
                </p>
              </div>
              <button
                onClick={() => setEditingProduct(null)}
                className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-6 space-y-6 max-h-[75vh] overflow-y-auto flex-1">
              {/* Foto de Capa do Prato */}
              <div className="bg-amber-50/40 p-4 rounded-xl border border-amber-200/50">
                <ImageUploadField
                  label="Fotografia do Prato"
                  value={editingProduct.cover_image_url}
                  onChange={(url) => setEditingProduct({ ...editingProduct, cover_image_url: url })}
                  category="products"
                  aspectRatio="square"
                  helperText="Fotografia real do prato preparado para exibição no cardápio."
                />
              </div>

              {/* Informações Básicas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-bold uppercase text-stone-700">Nome do Prato</label>
                  <input
                    type="text"
                    required
                    value={editingProduct.name}
                    onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-800"
                    placeholder="Ex: Feijoada Tradicional"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-stone-700">Categoria</label>
                  <input
                    type="text"
                    value={editingProduct.category_name || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, category_name: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-800"
                    placeholder="Ex: Pratos Principais"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-stone-700">Status</label>
                  <select
                    value={editingProduct.status}
                    onChange={(e: any) => setEditingProduct({ ...editingProduct, status: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-800 bg-white"
                  >
                    <option value="active">Ativo (Exibido no cardápio)</option>
                    <option value="draft">Rascunho (Oculto)</option>
                  </select>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-bold uppercase text-stone-700">Descrição Curta</label>
                  <input
                    type="text"
                    value={editingProduct.short_description}
                    onChange={(e) => setEditingProduct({ ...editingProduct, short_description: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-800"
                    placeholder="Resumo em uma linha para os cards de destaque"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-bold uppercase text-stone-700">Descrição Detalhada</label>
                  <textarea
                    rows={3}
                    value={editingProduct.full_description}
                    onChange={(e) => setEditingProduct({ ...editingProduct, full_description: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-800 resize-none"
                    placeholder="Conte a história do prato, métodos de cozimento e particularidades."
                  />
                </div>
              </div>

              {/* Variações / Porções e Preços */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase text-stone-700">
                    Porções, Gramaturas e Preços
                  </label>
                  <Button type="button" size="sm" variant="outline" onClick={handleAddVariant} className="text-xs">
                    + Adicionar Porção
                  </Button>
                </div>

                <div className="space-y-2">
                  {editingProduct.variants.map((v, idx) => (
                    <div key={v.id || idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-3 bg-stone-50 rounded-lg border border-stone-200 items-center">
                      <div className="sm:col-span-5">
                        <input
                          type="text"
                          required
                          value={v.name}
                          onChange={(e) => {
                            const newV = [...editingProduct.variants];
                            newV[idx].name = e.target.value;
                            setEditingProduct({ ...editingProduct, variants: newV });
                          }}
                          placeholder="Nome da porção (Ex: 500 ml Individual)"
                          className="w-full px-3 py-1.5 text-xs rounded border border-stone-300 bg-white"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <select
                          value={v.unit_type}
                          onChange={(e: any) => {
                            const newV = [...editingProduct.variants];
                            newV[idx].unit_type = e.target.value;
                            setEditingProduct({ ...editingProduct, variants: newV });
                          }}
                          className="w-full px-2 py-1.5 text-xs rounded border border-stone-300 bg-white"
                        >
                          <option value="ml">Mililitros (ml)</option>
                          <option value="l">Litros (l)</option>
                          <option value="g">Gramas (g)</option>
                          <option value="kg">Quilos (kg)</option>
                          <option value="un">Unidade (un)</option>
                          <option value="portion">Porção</option>
                        </select>
                      </div>
                      <div className="sm:col-span-3">
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-stone-400">R$</span>
                          <input
                            type="number"
                            step="0.01"
                            required
                            value={(v.price_in_cents / 100).toFixed(2)}
                            onChange={(e) => {
                              const newV = [...editingProduct.variants];
                              newV[idx].price_in_cents = Math.round(parseFloat(e.target.value || '0') * 100);
                              setEditingProduct({ ...editingProduct, variants: newV });
                            }}
                            className="w-full pl-8 pr-2 py-1.5 text-xs rounded border border-stone-300 bg-white font-mono"
                          />
                        </div>
                      </div>
                      <div className="sm:col-span-1 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveVariant(idx)}
                          className="p-1 text-stone-400 hover:text-red-600 rounded"
                          title="Remover porção"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Ficha Técnica e Alimentos */}
              <div className="space-y-4 pt-4 border-t border-stone-200">
                <h3 className="font-bold text-xs uppercase text-stone-900 tracking-wider">
                  Ficha Técnica & Instruções ao Consumidor
                </h3>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-stone-700">Ingredientes</label>
                  <textarea
                    rows={2}
                    value={editingProduct.ingredients}
                    onChange={(e) => setEditingProduct({ ...editingProduct, ingredients: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-lg border border-stone-300 text-sm resize-none"
                    placeholder="Ex: Feijão preto, carne seca, lombo suíno..."
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-stone-700">Alérgenos</label>
                  <input
                    type="text"
                    value={editingProduct.allergens}
                    onChange={(e) => setEditingProduct({ ...editingProduct, allergens: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-lg border border-stone-300 text-sm"
                    placeholder="Ex: Contém glúten. Contém derivados de soja."
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase text-stone-700">Instruções de Conservação</label>
                    <input
                      type="text"
                      value={editingProduct.conservation_instructions}
                      onChange={(e) => setEditingProduct({ ...editingProduct, conservation_instructions: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-lg border border-stone-300 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase text-stone-700">Modo de Preparo / Aquecimento</label>
                    <input
                      type="text"
                      value={editingProduct.preparation_instructions}
                      onChange={(e) => setEditingProduct({ ...editingProduct, preparation_instructions: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-lg border border-stone-300 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Botões do Rodapé */}
              <div className="pt-4 border-t border-stone-200 flex items-center justify-end gap-3 sticky bottom-0 bg-white">
                <Button type="button" variant="outline" onClick={() => setEditingProduct(null)}>
                  Cancelar
                </Button>
                <Button type="submit" isLoading={isSaving} className="gap-2 bg-stone-900 text-white hover:bg-stone-800">
                  <Save className="w-4 h-4" />
                  <span>Salvar Prato</span>
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
