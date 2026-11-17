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
  Pause,
  Play,
  FolderKanban,
  ListPlus,
  Sparkles,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ImageUploadField } from '@/components/admin/ImageUploadField';
import {
  CategoryManagerModal,
  type AdminCategoryItem,
} from '@/components/admin/CategoryManagerModal';
import { useSystemDialog } from '@/components/ui/SystemDialogProvider';
import { hasPromotionalPrice, getDiscountPercentage } from '@/modules/catalog/pricing';

interface ProductVariantState {
  id?: string;
  name: string;
  unit_type: 'ml' | 'l' | 'g' | 'kg' | 'un' | 'cx' | 'portion' | 'other';
  unit_value: number;
  price_in_cents: number;
  compare_at_price_cents?: number | null;
  priceInput?: string;
  compareAtPriceInput?: string;
  is_available: boolean;
}

function formatCentsForInput(cents?: number | null): string {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return '';
  return (cents / 100).toFixed(2).replace('.', ',');
}

function sanitizeDecimalTyping(raw: string): string {
  return raw.replace(/[^\d.,]/g, '');
}

function parseReaisInputToCents(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s+/g, '').replace(',', '.');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

interface ModifierOptionState {
  id?: string;
  name: string;
  price_in_cents: number;
  priceInput?: string;
  is_available: boolean;
}

interface ModifierGroupState {
  id?: string;
  name: string;
  is_required: boolean;
  min_selections: number;
  max_selections: number;
  options: ModifierOptionState[];
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
  modifier_groups: ModifierGroupState[];
  suggested_product_ids: string[];
  ingredients: string;
  allergens: string;
  shelf_life: string;
  after_thawing_instructions: string;
  conservation_instructions: string;
  preparation_instructions: string;
}

export default function AdminProductsPage() {
  const { showAlert, showConfirm } = useSystemDialog();
  const [products, setProducts] = useState<ProductItemState[]>([]);
  const [categories, setCategories] = useState<AdminCategoryItem[]>([]);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [togglingStatusId, setTogglingStatusId] = useState<string | null>(null);
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
            compare_at_price_cents: v.compare_at_price_cents ?? null,
            priceInput: formatCentsForInput(v.price_in_cents || 0),
            compareAtPriceInput:
              v.compare_at_price_cents && v.compare_at_price_cents > 0
                ? formatCentsForInput(v.compare_at_price_cents)
                : '',
            is_available: v.is_available ?? true,
          })),
          modifier_groups: (p.modifier_groups || []).map((g: any) => ({
            id: g.id,
            name: g.name,
            is_required: Boolean(g.is_required),
            min_selections: Number(g.min_selections) || 0,
            max_selections: Number(g.max_selections) || 1,
            options: (g.options || []).map((o: any) => ({
              id: o.id,
              name: o.name,
              price_in_cents: Number(o.price_in_cents) || 0,
              priceInput: formatCentsForInput(Number(o.price_in_cents) || 0),
              is_available: o.is_available ?? true,
            })),
          })),
          suggested_product_ids: Array.isArray(p.suggested_product_ids) ? p.suggested_product_ids : [],
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
          compare_at_price_cents: null,
          priceInput: '45,00',
          compareAtPriceInput: '',
          is_available: true,
        },
      ],
      modifier_groups: [],
      suggested_product_ids: [],
      ingredients: '',
      allergens: '',
      shelf_life: 'Conforme impresso no rótulo do lote',
      after_thawing_instructions: 'Após descongelar, manter sob refrigeração e consumir em até 24 horas. Não recongelar.',
      conservation_instructions: 'Manter congelado conforme orientação da embalagem.',
      preparation_instructions: 'Aquecer em fogo brando ou forno até aquecer completamente.',
    });
  };

  const handleDeleteProduct = async (id: string, name: string) => {
    const confirmed = await showConfirm({
      title: 'Excluir prato',
      message: `Deseja realmente excluir o prato "${name}"? Se ele já tiver pedidos ou lotes de estoque vinculados, será arquivado com segurança e ocultado do cardápio.`,
      variant: 'danger',
      confirmLabel: 'Sim, excluir',
      cancelLabel: 'Cancelar',
    });
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/admin/products/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setProducts(products.filter((p) => p.id !== id));
        showFeedback(
          data?.archived
            ? data.message || `Prato "${name}" arquivado e ocultado do cardápio.`
            : `Prato "${name}" excluído com sucesso.`
        );
      } else {
        await showAlert({
          title: 'Erro ao excluir',
          message: data?.error || `Erro ao excluir prato (HTTP ${res.status}).`,
          variant: 'error',
        });
      }
    } catch {
      await showAlert({
        title: 'Erro de comunicação',
        message: 'Erro de comunicação ao excluir produto.',
        variant: 'error',
      });
    }
  };

  const handleToggleProductStatus = async (product: ProductItemState) => {
    const nextStatus: 'active' | 'draft' = product.status === 'active' ? 'draft' : 'active';
    setTogglingStatusId(product.id);
    try {
      const res = await fetch(`/api/admin/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setProducts((prev) =>
          prev.map((item) =>
            item.id === product.id ? { ...item, status: nextStatus } : item
          )
        );
        showFeedback(
          nextStatus === 'draft'
            ? `Prato "${product.name}" pausado e ocultado do cardápio.`
            : `Prato "${product.name}" ativado no cardápio.`
        );
      } else {
        await showAlert({
          title: 'Erro ao atualizar status',
          message:
            data?.error ||
            `Não foi possível atualizar o status do prato (HTTP ${res.status}).`,
          variant: 'error',
        });
      }
    } catch {
      await showAlert({
        title: 'Erro de comunicação',
        message: 'Erro de comunicação ao atualizar status do prato.',
        variant: 'error',
      });
    } finally {
      setTogglingStatusId(null);
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    if (!editingProduct.name.trim()) {
      await showAlert({
        title: 'Campo obrigatório',
        message: 'O nome do prato é obrigatório.',
        variant: 'warning',
      });
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
          variants: editingProduct.variants.map(({ priceInput: _p, compareAtPriceInput: _c, ...rest }) => rest),
          ingredients: editingProduct.ingredients || null,
          allergens: editingProduct.allergens || null,
          shelf_life: editingProduct.shelf_life || null,
          after_thawing_instructions: editingProduct.after_thawing_instructions || null,
          conservation_instructions: editingProduct.conservation_instructions || null,
          preparation_instructions: editingProduct.preparation_instructions || null,
          modifier_groups: editingProduct.modifier_groups
            .filter((g) => g.name.trim())
            .map((g, gIdx) => ({
              id: g.id,
              name: g.name.trim(),
              is_required: g.is_required,
              min_selections: g.is_required ? Math.max(1, g.min_selections) : g.min_selections,
              max_selections: Math.max(1, g.max_selections),
              display_order: gIdx + 1,
              options: g.options
                .filter((o) => o.name.trim())
                .map((o, oIdx) => ({
                  id: o.id,
                  name: o.name.trim(),
                  price_in_cents: Math.max(0, o.price_in_cents),
                  is_available: o.is_available,
                  display_order: oIdx + 1,
                })),
            })),
          suggested_product_ids: editingProduct.suggested_product_ids || [],
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
          compare_at_price_cents: null,
          priceInput: '80,00',
          compareAtPriceInput: '',
          is_available: true,
        },
      ],
    });
  };

  const handleRemoveVariant = async (index: number) => {
    if (!editingProduct || editingProduct.variants.length <= 1) {
      await showAlert({
        title: 'Porção obrigatória',
        message: 'O prato deve possuir ao menos uma porção/variação.',
        variant: 'warning',
      });
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

        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCategoryModal(true)}
            className="gap-2"
          >
            <FolderKanban className="w-3.5 h-3.5 text-amber-600" />
            <span>Categorias ({categories.length})</span>
          </Button>

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
                    <Badge
                      variant={product.status === 'active' ? 'primary' : 'neutral'}
                      className={`text-[10px] ${
                        product.status === 'active'
                          ? ''
                          : 'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}
                    >
                      {product.status === 'active' ? 'Ativo' : 'Pausado'}
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
                    disabled={togglingStatusId === product.id}
                    onClick={() => handleToggleProductStatus(product)}
                    className={`h-8 px-2.5 text-xs gap-1.5 ${
                      product.status === 'active'
                        ? 'text-amber-700 hover:text-amber-800 hover:bg-amber-50 border-amber-200'
                        : 'text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 border-emerald-200'
                    }`}
                    title={
                      product.status === 'active'
                        ? 'Pausar produto (ocultar do cardápio)'
                        : 'Ativar produto (exibir no cardápio)'
                    }
                  >
                    {togglingStatusId === product.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : product.status === 'active' ? (
                      <Pause className="w-3.5 h-3.5" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                    <span>{product.status === 'active' ? 'Pausar' : 'Ativar'}</span>
                  </Button>
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
              {(() => {
                const activeVariants = product.variants.filter((v) => v.is_available !== false);
                const inactiveCount = product.variants.length - activeVariants.length;
                return (
                  <div className="pt-2 border-t border-stone-100 flex items-center justify-between gap-2 text-xs text-stone-600">
                    <span className="font-medium text-stone-500 shrink-0">
                      {activeVariants.length} {activeVariants.length === 1 ? 'Variação' : 'Variações'}
                      {inactiveCount > 0 ? ` (+${inactiveCount} inativa${inactiveCount > 1 ? 's' : ''})` : ''}:
                    </span>
                    <span className="font-mono font-semibold text-stone-900 text-right">
                      {activeVariants
                        .map((v) =>
                          hasPromotionalPrice(v)
                            ? `${v.name} (De R$ ${(v.compare_at_price_cents! / 100).toFixed(2)} por R$ ${(v.price_in_cents / 100).toFixed(2)})`
                            : `${v.name} (R$ ${(v.price_in_cents / 100).toFixed(2)})`
                        )
                        .join(' | ')}
                    </span>
                  </div>
                );
              })()}
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
                  {categories.length > 0 ? (
                    <select
                      value={editingProduct.category_id || '__custom__'}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '__custom__') {
                          setEditingProduct({
                            ...editingProduct,
                            category_id: null,
                            category_name: '',
                          });
                        } else {
                          const selected = categories.find((c) => c.id === val);
                          setEditingProduct({
                            ...editingProduct,
                            category_id: val,
                            category_name: selected?.name || '',
                          });
                        }
                      }}
                      className="w-full px-3.5 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-800 bg-white"
                    >
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                      <option value="__custom__">+ Outra / Digitar nova categoria</option>
                    </select>
                  ) : null}
                  {(!editingProduct.category_id || categories.length === 0) && (
                    <input
                      type="text"
                      value={editingProduct.category_name || ''}
                      onChange={(e) =>
                        setEditingProduct({
                          ...editingProduct,
                          category_id: null,
                          category_name: e.target.value,
                        })
                      }
                      className="w-full px-3.5 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-800"
                      placeholder="Ex: Pratos Principais"
                    />
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-stone-700">Status</label>
                  <select
                    value={editingProduct.status}
                    onChange={(e: any) => setEditingProduct({ ...editingProduct, status: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-800 bg-white"
                  >
                    <option value="active">Ativo (Exibido no cardápio)</option>
                    <option value="draft">Pausado / Oculto (Não exibido no cardápio)</option>
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
                  {editingProduct.variants.map((v, idx) => {
                    const discountPct = getDiscountPercentage(v);
                    return (
                      <div key={v.id || idx} className="p-3 bg-stone-50 rounded-lg border border-stone-200 space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                          <div className="sm:col-span-5">
                            <label className="block text-[10px] font-semibold uppercase text-stone-500 mb-0.5">
                              Nome da Porção
                            </label>
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
                          <div className="sm:col-span-2">
                            <label className="block text-[10px] font-semibold uppercase text-stone-500 mb-0.5">
                              Unidade
                            </label>
                            <select
                              value={v.unit_type}
                              onChange={(e: any) => {
                                const newV = [...editingProduct.variants];
                                newV[idx].unit_type = e.target.value;
                                setEditingProduct({ ...editingProduct, variants: newV });
                              }}
                              className="w-full px-2 py-1.5 text-xs rounded border border-stone-300 bg-white"
                            >
                              <option value="ml">ml</option>
                              <option value="l">l</option>
                              <option value="g">g</option>
                              <option value="kg">kg</option>
                              <option value="un">un</option>
                              <option value="portion">Porção</option>
                            </select>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-[10px] font-semibold uppercase text-stone-500 mb-0.5">
                              De (Opcional)
                            </label>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-stone-400">R$</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="0,00"
                                value={
                                  v.compareAtPriceInput ??
                                  (v.compare_at_price_cents && v.compare_at_price_cents > 0
                                    ? formatCentsForInput(v.compare_at_price_cents)
                                    : '')
                                }
                                onChange={(e) => {
                                  const newV = [...editingProduct.variants];
                                  const typed = sanitizeDecimalTyping(e.target.value);
                                  newV[idx].compareAtPriceInput = typed;
                                  newV[idx].compare_at_price_cents = parseReaisInputToCents(typed);
                                  setEditingProduct({ ...editingProduct, variants: newV });
                                }}
                                onBlur={() => {
                                  const newV = [...editingProduct.variants];
                                  const cents = newV[idx].compare_at_price_cents;
                                  newV[idx].compareAtPriceInput =
                                    cents && cents > 0 ? formatCentsForInput(cents) : '';
                                  setEditingProduct({ ...editingProduct, variants: newV });
                                }}
                                className="w-full pl-7 pr-2 py-1.5 text-xs rounded border border-stone-300 bg-white font-mono"
                              />
                            </div>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-[10px] font-semibold uppercase text-stone-500 mb-0.5">
                              Por (Venda)
                            </label>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-stone-400">R$</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                required
                                placeholder="0,00"
                                value={v.priceInput ?? formatCentsForInput(v.price_in_cents)}
                                onChange={(e) => {
                                  const newV = [...editingProduct.variants];
                                  const typed = sanitizeDecimalTyping(e.target.value);
                                  newV[idx].priceInput = typed;
                                  const parsedCents = parseReaisInputToCents(typed);
                                  newV[idx].price_in_cents = parsedCents ?? 0;
                                  setEditingProduct({ ...editingProduct, variants: newV });
                                }}
                                onBlur={() => {
                                  const newV = [...editingProduct.variants];
                                  newV[idx].priceInput = formatCentsForInput(newV[idx].price_in_cents);
                                  setEditingProduct({ ...editingProduct, variants: newV });
                                }}
                                className="w-full pl-7 pr-2 py-1.5 text-xs rounded border border-stone-300 bg-white font-mono"
                              />
                            </div>
                          </div>
                          <div className="sm:col-span-1 text-right self-end pb-1">
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
                        {discountPct && (
                          <div className="flex items-center gap-2 text-[11px] text-emerald-700 font-medium">
                            <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                              -{discountPct}% OFF
                            </span>
                            <span>
                              Exibirá: <span className="line-through text-stone-400">De R$ {(v.compare_at_price_cents! / 100).toFixed(2)}</span>{' '}
                              <strong className="text-stone-900">Por R$ {(v.price_in_cents / 100).toFixed(2)}</strong>
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Complementos / Adicionais (Estilo iFood) */}
              <div className="space-y-3 pt-4 border-t border-stone-200">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-xs uppercase text-stone-900 tracking-wider flex items-center gap-1.5">
                      <ListPlus className="w-4 h-4 text-amber-600" />
                      <span>Complementos & Adicionais (Opcional)</span>
                    </h3>
                    <p className="text-[11px] text-stone-500">
                      Crie grupos de escolha como acompanhamentos, molhos ou talheres.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setEditingProduct({
                        ...editingProduct,
                        modifier_groups: [
                          ...editingProduct.modifier_groups,
                          {
                            name: 'Acompanhamentos',
                            is_required: false,
                            min_selections: 0,
                            max_selections: 2,
                            options: [
                              {
                                name: 'Porção extra',
                                price_in_cents: 800,
                                priceInput: '8,00',
                                is_available: true,
                              },
                            ],
                          },
                        ],
                      })
                    }
                    className="text-xs gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Novo Grupo</span>
                  </Button>
                </div>

                {editingProduct.modifier_groups.length > 0 && (
                  <div className="space-y-4">
                    {editingProduct.modifier_groups.map((grp, gIdx) => (
                      <div
                        key={gIdx}
                        className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-3"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                          <div className="sm:col-span-5 space-y-1">
                            <label className="text-[10px] font-bold uppercase text-stone-500">
                              Nome do Grupo
                            </label>
                            <input
                              type="text"
                              value={grp.name}
                              onChange={(e) => {
                                const next = [...editingProduct.modifier_groups];
                                next[gIdx] = { ...next[gIdx], name: e.target.value };
                                setEditingProduct({ ...editingProduct, modifier_groups: next });
                              }}
                              placeholder="Ex: Escolha o acompanhamento"
                              className="w-full px-2.5 py-1.5 text-xs rounded border border-stone-300 bg-white"
                            />
                          </div>

                          <div className="sm:col-span-2 space-y-1">
                            <label className="text-[10px] font-bold uppercase text-stone-500">
                              Mín.
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={grp.min_selections}
                              onChange={(e) => {
                                const next = [...editingProduct.modifier_groups];
                                next[gIdx] = {
                                  ...next[gIdx],
                                  min_selections: Math.max(0, parseInt(e.target.value, 10) || 0),
                                };
                                setEditingProduct({ ...editingProduct, modifier_groups: next });
                              }}
                              className="w-full px-2.5 py-1.5 text-xs rounded border border-stone-300 bg-white"
                            />
                          </div>

                          <div className="sm:col-span-2 space-y-1">
                            <label className="text-[10px] font-bold uppercase text-stone-500">
                              Máx.
                            </label>
                            <input
                              type="number"
                              min={1}
                              value={grp.max_selections}
                              onChange={(e) => {
                                const next = [...editingProduct.modifier_groups];
                                next[gIdx] = {
                                  ...next[gIdx],
                                  max_selections: Math.max(1, parseInt(e.target.value, 10) || 1),
                                };
                                setEditingProduct({ ...editingProduct, modifier_groups: next });
                              }}
                              className="w-full px-2.5 py-1.5 text-xs rounded border border-stone-300 bg-white"
                            />
                          </div>

                          <div className="sm:col-span-2 flex items-center gap-1.5 pb-1.5">
                            <input
                              type="checkbox"
                              id={`mod-req-${gIdx}`}
                              checked={grp.is_required}
                              onChange={(e) => {
                                const next = [...editingProduct.modifier_groups];
                                next[gIdx] = {
                                  ...next[gIdx],
                                  is_required: e.target.checked,
                                  min_selections: e.target.checked
                                    ? Math.max(1, next[gIdx].min_selections)
                                    : next[gIdx].min_selections,
                                };
                                setEditingProduct({ ...editingProduct, modifier_groups: next });
                              }}
                              className="rounded border-stone-300"
                            />
                            <label
                              htmlFor={`mod-req-${gIdx}`}
                              className="text-xs font-medium text-stone-700"
                            >
                              Obrigatório
                            </label>
                          </div>

                          <div className="sm:col-span-1 text-right pb-1">
                            <button
                              type="button"
                              onClick={() => {
                                const next = [...editingProduct.modifier_groups];
                                next.splice(gIdx, 1);
                                setEditingProduct({ ...editingProduct, modifier_groups: next });
                              }}
                              className="p-1 text-stone-400 hover:text-red-600 rounded"
                              title="Remover grupo"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Opções do grupo */}
                        <div className="space-y-2 pl-2 border-l-2 border-stone-200">
                          {grp.options.map((opt, oIdx) => (
                            <div
                              key={oIdx}
                              className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
                            >
                              <div className="sm:col-span-7">
                                <input
                                  type="text"
                                  value={opt.name}
                                  onChange={(e) => {
                                    const next = [...editingProduct.modifier_groups];
                                    const opts = [...next[gIdx].options];
                                    opts[oIdx] = { ...opts[oIdx], name: e.target.value };
                                    next[gIdx] = { ...next[gIdx], options: opts };
                                    setEditingProduct({ ...editingProduct, modifier_groups: next });
                                  }}
                                  placeholder="Nome da opção (ex: Arroz branco, Farofa)"
                                  className="w-full px-2.5 py-1.5 text-xs rounded border border-stone-300 bg-white"
                                />
                              </div>
                              <div className="sm:col-span-4 relative">
                                <span className="absolute left-2 top-1.5 text-[11px] text-stone-400">
                                  + R$
                                </span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={opt.priceInput ?? formatCentsForInput(opt.price_in_cents)}
                                  onChange={(e) => {
                                    const typed = sanitizeDecimalTyping(e.target.value);
                                    const next = [...editingProduct.modifier_groups];
                                    const opts = [...next[gIdx].options];
                                    opts[oIdx] = {
                                      ...opts[oIdx],
                                      priceInput: typed,
                                      price_in_cents: parseReaisInputToCents(typed) ?? 0,
                                    };
                                    next[gIdx] = { ...next[gIdx], options: opts };
                                    setEditingProduct({ ...editingProduct, modifier_groups: next });
                                  }}
                                  onBlur={() => {
                                    const next = [...editingProduct.modifier_groups];
                                    const opts = [...next[gIdx].options];
                                    opts[oIdx] = {
                                      ...opts[oIdx],
                                      priceInput: formatCentsForInput(opts[oIdx].price_in_cents),
                                    };
                                    next[gIdx] = { ...next[gIdx], options: opts };
                                    setEditingProduct({ ...editingProduct, modifier_groups: next });
                                  }}
                                  className="w-full pl-9 pr-2 py-1.5 text-xs rounded border border-stone-300 bg-white font-mono"
                                />
                              </div>
                              <div className="sm:col-span-1 text-right">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = [...editingProduct.modifier_groups];
                                    const opts = [...next[gIdx].options];
                                    opts.splice(oIdx, 1);
                                    next[gIdx] = { ...next[gIdx], options: opts };
                                    setEditingProduct({ ...editingProduct, modifier_groups: next });
                                  }}
                                  className="p-1 text-stone-400 hover:text-red-600 rounded"
                                  title="Remover opção"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => {
                              const next = [...editingProduct.modifier_groups];
                              next[gIdx] = {
                                ...next[gIdx],
                                options: [
                                  ...next[gIdx].options,
                                  { name: '', price_in_cents: 0, priceInput: '0,00', is_available: true },
                                ],
                              };
                              setEditingProduct({ ...editingProduct, modifier_groups: next });
                            }}
                            className="text-[11px] font-semibold text-amber-700 hover:underline inline-flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Adicionar opção neste grupo</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sugestões ("Peça também" / "Combina com") */}
              <div className="space-y-3 pt-4 border-t border-stone-200">
                <div>
                  <h3 className="font-bold text-xs uppercase text-stone-900 tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-600" />
                    <span>Sugestões ("Peça também")</span>
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    Escolha pratos ou acompanhamentos sugeridos na página deste produto.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 rounded-xl border border-stone-200 bg-stone-50">
                  {products
                    .filter((p) => p.id !== editingProduct.id)
                    .map((candidate) => {
                      const checked = editingProduct.suggested_product_ids.includes(candidate.id);
                      return (
                        <label
                          key={candidate.id}
                          className="flex items-center gap-2 p-2 rounded-lg bg-white border border-stone-200 text-xs cursor-pointer hover:border-amber-400"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const nextIds = e.target.checked
                                ? [...editingProduct.suggested_product_ids, candidate.id]
                                : editingProduct.suggested_product_ids.filter(
                                    (id) => id !== candidate.id
                                  );
                              setEditingProduct({
                                ...editingProduct,
                                suggested_product_ids: nextIds,
                              });
                            }}
                            className="rounded border-stone-300"
                          />
                          <span className="font-medium text-stone-800 truncate">
                            {candidate.name}
                          </span>
                        </label>
                      );
                    })}
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

      <CategoryManagerModal
        isOpen={showCategoryModal}
        categories={categories}
        onClose={() => setShowCategoryModal(false)}
        onUpdated={loadProducts}
      />
    </div>
  );
}
