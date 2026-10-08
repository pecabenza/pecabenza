'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  UtensilsCrossed,
  Plus,
  Edit2,
  ExternalLink,
  CheckCircle2,
  X,
  Save,
  Trash2,
  Info,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ImageUploadField } from '@/components/admin/ImageUploadField';

interface ProductVariantState {
  id: string;
  name: string;
  unit_type: string;
  unit_value: number;
  price_in_cents: number;
}

interface ProductItemState {
  id: string;
  name: string;
  slug: string;
  category: string;
  status: 'active' | 'draft';
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
  temp_min?: string;
  temp_max?: string;
  shelf_life: string;
  after_thawing: string;
  conservation_instructions: string;
  preparation_instructions: string;
}

const INITIAL_PRODUCTS: ProductItemState[] = [
  {
    id: '01',
    name: 'Feijoada BENZA',
    slug: 'feijoada-benza',
    category: 'Pratos Principais',
    status: 'active',
    is_featured: true,
    cover_image_url: '/assets/brands/benza/products/mockup-feijoada.jpg',
    defaultImageUrl: '/assets/brands/benza/products/mockup-feijoada.jpg',
    asset_source: 'mockup',
    is_mockup: true,
    short_description: 'Feijão preto cozido com carnes e temperos clássicos.',
    full_description: 'A feijoada BENZA é preparada com feijão preto, carnes bovinas e suínas dessalgadas e tempero com alho, cebola e louro. Congelada após o preparo para consumo prático.',
    variants: [
      { id: 'v1', name: '500 ml (Individual farto)', unit_type: 'ml', unit_value: 500, price_in_cents: 4800 },
      { id: 'v2', name: '1000 ml (Para compartilhar)', unit_type: 'ml', unit_value: 1000, price_in_cents: 8900 },
    ],
    ingredients: 'Feijão preto, carne seca, lombo suíno, costelinha suína, paio, linguiça calabresa, alho, cebola, louro e azeite.',
    allergens: 'Não contém glúten. Pode conter derivados de soja.',
    temp_min: '',
    temp_max: '',
    shelf_life: 'Conforme impresso no rótulo do lote',
    after_thawing: 'Após descongelar, manter sob refrigeração e consumir em até 24 horas. Não recongelar.',
    conservation_instructions: 'Manter congelado conforme orientação da embalagem.',
    preparation_instructions: 'Aquecer em fogo brando em panela com 2 colheres de água até aquecer completamente, mexendo delicadamente.',
  },
  {
    id: '02',
    name: 'Lasanha Tradicional',
    slug: 'lasanha-tradicional',
    category: 'Pratos Principais',
    status: 'active',
    is_featured: true,
    cover_image_url: '/assets/brands/benza/products/mockup-lasanha.jpg',
    defaultImageUrl: '/assets/brands/benza/products/mockup-lasanha.jpg',
    asset_source: 'mockup',
    is_mockup: true,
    short_description: 'Massa em camadas com molho de carne, bechamel e queijo.',
    full_description: 'Receita tradicional de lasanha em camadas intercaladas com molho de carne, bechamel e queijo para gratinar.',
    variants: [
      { id: 'v3', name: '500 ml (Individual)', unit_type: 'ml', unit_value: 500, price_in_cents: 4600 },
      { id: 'v4', name: '1000 ml (Duas pessoas)', unit_type: 'ml', unit_value: 1000, price_in_cents: 8500 },
    ],
    ingredients: 'Farinha de trigo, ovos, carne bovina moída, tomate, leite integral, manteiga, queijo mozarela, parmesão e temperos.',
    allergens: 'Contém glúten, leite e ovos. Contém lactose.',
    temp_min: '',
    temp_max: '',
    shelf_life: 'Conforme impresso no rótulo do lote',
    after_thawing: 'Após descongelar, manter sob refrigeração e consumir em até 24 horas. Não recongelar.',
    conservation_instructions: 'Manter congelado conforme orientação da embalagem.',
    preparation_instructions: 'Forno pré-aquecido a 180°C por 25 a 30 minutos na própria embalagem forneável (remover tampa plástica).',
  },
];

export default function AdminProductsPage() {
  const [products, setProducts] = useState<ProductItemState[]>(INITIAL_PRODUCTS);
  const [editingProduct, setEditingProduct] = useState<ProductItemState | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const showFeedback = (msg: string) => {
    setFeedbackMessage(msg);
    setTimeout(() => setFeedbackMessage(null), 3500);
  };

  const handleEdit = (product: ProductItemState) => {
    setIsNew(false);
    setEditingProduct({ ...product, variants: [...product.variants.map((v) => ({ ...v }))] });
  };

  const handleCreateNew = () => {
    setIsNew(true);
    setEditingProduct({
      id: `p-${Date.now()}`,
      name: '',
      slug: '',
      category: 'Pratos Principais',
      status: 'active',
      is_featured: false,
      cover_image_url: '',
      asset_source: 'pending',
      is_mockup: false,
      short_description: '',
      full_description: '',
      variants: [
        { id: `v-${Date.now()}-1`, name: '500 ml (Individual)', unit_type: 'ml', unit_value: 500, price_in_cents: 4500 },
      ],
      ingredients: '',
      allergens: '',
      temp_min: '',
      temp_max: '',
      shelf_life: 'Sob consulta de lote',
      after_thawing: 'Consumir em até 24 horas após descongelamento.',
      conservation_instructions: 'Manter congelado conforme orientação da embalagem.',
      preparation_instructions: '',
    });
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    if (!editingProduct.name.trim()) {
      alert('O nome do prato é obrigatório.');
      return;
    }

    const slug =
      editingProduct.slug.trim() ||
      editingProduct.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    const isCurrentMockup = editingProduct.cover_image_url.includes('mockup');
    const assetSource: 'mockup' | 'official' | 'pending' = isCurrentMockup
      ? 'mockup'
      : editingProduct.cover_image_url
      ? 'official'
      : 'pending';

    const finalProduct: ProductItemState = {
      ...editingProduct,
      slug,
      is_mockup: isCurrentMockup,
      asset_source: assetSource,
    };

    if (isNew) {
      setProducts([finalProduct, ...products]);
      showFeedback(`Prato "${finalProduct.name}" cadastrado com sucesso!`);
    } else {
      setProducts(products.map((p) => (p.id === finalProduct.id ? finalProduct : p)));
      showFeedback(`Prato "${finalProduct.name}" atualizado com sucesso!`);
    }

    setEditingProduct(null);
  };

  const handleAddVariant = () => {
    if (!editingProduct) return;
    setEditingProduct({
      ...editingProduct,
      variants: [
        ...editingProduct.variants,
        {
          id: `v-${Date.now()}`,
          name: '1000 ml (Para compartilhar)',
          unit_type: 'ml',
          unit_value: 1000,
          price_in_cents: 8000,
        },
      ],
    });
  };

  const handleRemoveVariant = (variantId: string) => {
    if (!editingProduct) return;
    setEditingProduct({
      ...editingProduct,
      variants: editingProduct.variants.filter((v) => v.id !== variantId),
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-stone-900">
            Cardápio & Pratos Cadastrados
          </h1>
          <p className="text-sm text-stone-500">
            Gerencie fotografias homologadas, porções em ml e ficha técnica com conservação parametrizada.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {feedbackMessage && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{feedbackMessage}</span>
            </div>
          )}

          <Button
            size="sm"
            onClick={handleCreateNew}
            className="gap-2 bg-stone-900 text-white hover:bg-stone-800 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Prato</span>
          </Button>
        </div>
      </div>

      {/* Grid de Pratos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {products.map((p) => (
          <Card
            key={p.id}
            className="p-6 bg-white space-y-5 border border-stone-200 shadow-xs hover:border-amber-600/40 transition-all flex flex-col justify-between"
          >
            <div className="space-y-4">
              {/* Foto e Cabeçalho do Prato */}
              <div className="flex items-start gap-4">
                <div className="w-24 h-24 rounded-xl overflow-hidden bg-stone-100 border border-stone-200 shrink-0 relative">
                  {p.cover_image_url ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.cover_image_url}
                        alt={p.name}
                        className="w-full h-full object-cover"
                      />
                      {p.is_mockup && (
                        <div className="absolute bottom-0 inset-x-0 bg-stone-900/80 text-[9px] text-amber-200 font-bold text-center py-0.5">
                          Mockup
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-stone-400">
                      <UtensilsCrossed className="w-8 h-8 opacity-40" />
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="secondary" className="text-[10px]">
                      {p.category}
                    </Badge>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        p.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-stone-100 text-stone-600'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          p.status === 'active' ? 'bg-emerald-500' : 'bg-stone-400'
                        }`}
                      />
                      {p.status === 'active' ? 'Ativo' : 'Rascunho'}
                    </span>
                  </div>

                  <h3 className="font-heading text-lg font-bold text-stone-900 truncate">
                    {p.name}
                  </h3>

                  {p.short_description && (
                    <p className="text-xs text-stone-500 line-clamp-2 leading-relaxed">
                      {p.short_description}
                    </p>
                  )}
                </div>
              </div>

              {/* Variações Cadastradas */}
              <div className="space-y-1.5 pt-2 border-t border-stone-100">
                <span className="text-[11px] uppercase font-bold text-stone-400 block tracking-wider">
                  Porções Disponíveis
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {p.variants.map((v) => (
                    <div
                      key={v.id}
                      className="text-xs text-stone-700 bg-stone-50 px-3 py-2 rounded-lg border border-stone-200/60 flex items-center justify-between"
                    >
                      <span className="font-medium truncate">{v.name}</span>
                      <span className="font-semibold text-amber-900 ml-2 shrink-0">
                        R$ {(v.price_in_cents / 100).toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Conservação Cadastrada */}
              <div className="text-[11px] text-stone-500 bg-stone-50 p-2.5 rounded-lg border border-stone-200/50 space-y-1">
                <div className="font-semibold text-stone-700">Conservação & Validade:</div>
                <p>{p.conservation_instructions}</p>
              </div>
            </div>

            {/* Ações Inferiores */}
            <div className="pt-3 border-t border-stone-100 flex items-center justify-between gap-3">
              <Link
                href={`/produtos/${p.slug}`}
                target="_blank"
                className="inline-flex items-center gap-1.5 text-xs text-stone-500 hover:text-amber-800 transition-colors font-medium"
              >
                <span>Ver no site</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>

              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleEdit(p)}
                className="gap-1.5 text-xs h-8 bg-stone-100 hover:bg-stone-200 text-stone-800"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Editar Prato</span>
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* MODAL DE EDIÇÃO / CRIAÇÃO DE PRATO */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-stone-200 my-8 overflow-hidden animate-in fade-in zoom-in-95">
            {/* Cabeçalho do Modal */}
            <div className="px-6 py-5 border-b border-stone-100 flex items-center justify-between bg-stone-50">
              <div className="space-y-0.5">
                <h2 className="font-heading text-xl font-bold text-stone-900">
                  {isNew ? 'Cadastrar Novo Prato' : `Editar: ${editingProduct.name}`}
                </h2>
                <p className="text-xs text-stone-500">
                  Substitua a imagem, porções, ficha técnica e condições de conservação.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="p-2 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/50 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Formulário */}
            <form onSubmit={handleSaveProduct} className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              {/* Upload da Foto de Capa do Prato */}
              <div className="bg-amber-50/40 p-4 rounded-xl border border-amber-200/50">
                <ImageUploadField
                  label="Imagem do Prato (Ilustrativa / Mockup)"
                  value={editingProduct.cover_image_url}
                  onChange={(url) => setEditingProduct({ ...editingProduct, cover_image_url: url })}
                  defaultImageUrl={editingProduct.defaultImageUrl}
                  isMockup={editingProduct.cover_image_url.includes('mockup')}
                  category="products"
                  aspectRatio="square"
                  helperText="Mockup temporário para desenvolvimento visual. Quando fotografias homologadas estiverem disponíveis, faça o upload do arquivo oficial."
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
                    className="w-full px-3.5 py-2.5 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-500"
                    placeholder="Ex: Feijoada BENZA"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-stone-700">Categoria</label>
                  <select
                    value={editingProduct.category}
                    onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-stone-300 text-sm bg-white focus:outline-none focus:border-stone-500"
                  >
                    <option value="Pratos Principais">Pratos Principais</option>
                    <option value="Massas & Risotos">Massas & Risotos</option>
                    <option value="Sopas & Caldos">Sopas & Caldos</option>
                    <option value="Sobremesas">Sobremesas</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-stone-700">Status de Publicação</label>
                  <select
                    value={editingProduct.status}
                    onChange={(e) =>
                      setEditingProduct({
                        ...editingProduct,
                        status: e.target.value as 'active' | 'draft',
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-lg border border-stone-300 text-sm bg-white focus:outline-none focus:border-stone-500"
                  >
                    <option value="active">Ativo (Visível no cardápio)</option>
                    <option value="draft">Rascunho (Oculto)</option>
                  </select>
                </div>
              </div>

              {/* Descrições */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-stone-700">
                    Descrição Curta (Exibida nos cards)
                  </label>
                  <textarea
                    rows={2}
                    value={editingProduct.short_description}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, short_description: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-500"
                    placeholder="Descrição objetiva do prato..."
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-stone-700">
                    Descrição Completa (Página do prato)
                  </label>
                  <textarea
                    rows={3}
                    value={editingProduct.full_description}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, full_description: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-500"
                    placeholder="Detalhes sobre ingredientes e preparo..."
                  />
                </div>
              </div>

              {/* Variações / Porções & Preços */}
              <div className="space-y-3 pt-2 border-t border-stone-100">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase text-stone-700">
                    Porções & Preços Cadastrados
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={handleAddVariant}
                    className="text-xs h-7 gap-1 bg-stone-100 text-stone-700 hover:bg-stone-200"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Adicionar Porção</span>
                  </Button>
                </div>

                <div className="space-y-2">
                  {editingProduct.variants.map((v, idx) => (
                    <div
                      key={v.id}
                      className="flex items-center gap-2 p-3 bg-stone-50 rounded-lg border border-stone-200"
                    >
                      <input
                        type="text"
                        placeholder="Nome (ex: 500 ml)"
                        value={v.name}
                        onChange={(e) => {
                          const updated = [...editingProduct.variants];
                          updated[idx].name = e.target.value;
                          setEditingProduct({ ...editingProduct, variants: updated });
                        }}
                        className="flex-1 px-2.5 py-1.5 text-xs rounded border border-stone-300 bg-white"
                      />

                      <div className="flex items-center gap-1 w-28">
                        <span className="text-xs text-stone-500 font-bold">R$</span>
                        <input
                          type="number"
                          step="0.50"
                          placeholder="48.00"
                          value={(v.price_in_cents / 100).toFixed(2)}
                          onChange={(e) => {
                            const updated = [...editingProduct.variants];
                            updated[idx].price_in_cents = Math.round(
                              parseFloat(e.target.value || '0') * 100
                            );
                            setEditingProduct({ ...editingProduct, variants: updated });
                          }}
                          className="w-full px-2 py-1.5 text-xs rounded border border-stone-300 bg-white font-mono"
                        />
                      </div>

                      {editingProduct.variants.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveVariant(v.id)}
                          className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                          title="Remover porção"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Ficha Técnica & Protocolo de Conservação Parametrizável */}
              <div className="space-y-4 pt-2 border-t border-stone-100">
                <div className="space-y-1">
                  <h3 className="font-heading text-sm font-bold text-stone-900">
                    Ficha Técnica & Protocolo de Conservação
                  </h3>
                  <p className="text-xs text-stone-500">
                    Campos opcionais e configuráveis por produto. Sem temperaturas ou regras hardcoded.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-xs font-bold uppercase text-stone-600">Ingredientes</label>
                    <textarea
                      rows={2}
                      value={editingProduct.ingredients}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, ingredients: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-stone-300 text-xs focus:outline-none focus:border-stone-500"
                      placeholder="Lista detalhada de ingredientes..."
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-xs font-bold uppercase text-stone-600">Alérgenos</label>
                    <input
                      type="text"
                      value={editingProduct.allergens}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, allergens: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-stone-300 text-xs focus:outline-none focus:border-stone-500"
                      placeholder="Ex: Não contém glúten. Pode conter traços de leite."
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-xs font-bold uppercase text-stone-600">
                      Instruções de Conservação
                    </label>
                    <input
                      type="text"
                      value={editingProduct.conservation_instructions}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, conservation_instructions: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-stone-300 text-xs focus:outline-none focus:border-stone-500"
                      placeholder="Ex: Manter congelado conforme orientação da embalagem."
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase text-stone-600">Validade do Produto</label>
                    <input
                      type="text"
                      value={editingProduct.shelf_life}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, shelf_life: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-stone-300 text-xs focus:outline-none focus:border-stone-500"
                      placeholder="Ex: Conforme indicado no rótulo do lote"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase text-stone-600">Após Descongelar</label>
                    <input
                      type="text"
                      value={editingProduct.after_thawing}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, after_thawing: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-stone-300 text-xs focus:outline-none focus:border-stone-500"
                      placeholder="Ex: Consumir em até 24h. Não recongelar."
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-xs font-bold uppercase text-stone-600">
                      Instruções de Aquecimento
                    </label>
                    <textarea
                      rows={2}
                      value={editingProduct.preparation_instructions}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, preparation_instructions: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-stone-300 text-xs focus:outline-none focus:border-stone-500"
                      placeholder="Instruções de aquecimento recomendadas..."
                    />
                  </div>
                </div>
              </div>

              {/* Botões do Rodapé */}
              <div className="pt-4 border-t border-stone-100 flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditingProduct(null)}
                  className="text-stone-600"
                >
                  Cancelar
                </Button>

                <Button type="submit" className="gap-2 bg-stone-900 text-white hover:bg-stone-800">
                  <Save className="w-4 h-4" />
                  <span>Salvar Prato</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
