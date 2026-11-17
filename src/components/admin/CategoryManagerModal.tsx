'use client';

import React, { useState } from 'react';
import {
  X,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Check,
  Edit2,
  FolderKanban,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useSystemDialog } from '@/components/ui/SystemDialogProvider';

export interface AdminCategoryItem {
  id: string;
  name: string;
  slug: string;
  display_order: number;
  is_active: boolean;
}

interface CategoryManagerModalProps {
  isOpen: boolean;
  categories: AdminCategoryItem[];
  onClose: () => void;
  onUpdated: () => void;
}

export function CategoryManagerModal({
  isOpen,
  categories,
  onClose,
  onUpdated,
}: CategoryManagerModalProps) {
  const { showAlert, showConfirm } = useSystemDialog();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  if (!isOpen) return null;

  const sorted = [...categories].sort(
    (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const res = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setNewName('');
        onUpdated();
      } else {
        await showAlert({
          title: 'Erro ao criar categoria',
          message: data?.error || `Erro ao criar categoria (HTTP ${res.status}).`,
          variant: 'error',
        });
      }
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (id: string) => {
    const trimmed = editingName.trim();
    if (!trimmed) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/categories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setEditingId(null);
        onUpdated();
      } else {
        await showAlert({
          title: 'Erro ao renomear',
          message: data?.error || 'Não foi possível renomear a categoria.',
          variant: 'error',
        });
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActive = async (cat: AdminCategoryItem) => {
    setBusyId(cat.id);
    try {
      const res = await fetch(`/api/admin/categories/${cat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !cat.is_active }),
      });
      if (res.ok) onUpdated();
    } finally {
      setBusyId(null);
    }
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sorted.length) return;
    const current = sorted[index];
    const swap = sorted[targetIndex];
    setBusyId(current.id);
    try {
      await Promise.all([
        fetch(`/api/admin/categories/${current.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ display_order: targetIndex + 1 }),
        }),
        fetch(`/api/admin/categories/${swap.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ display_order: index + 1 }),
        }),
      ]);
      onUpdated();
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (cat: AdminCategoryItem) => {
    const confirmed = await showConfirm({
      title: 'Excluir categoria',
      message: `Excluir a categoria "${cat.name}"? Os pratos vinculados não serão excluídos, apenas ficarão sem categoria até você escolher outra.`,
      variant: 'danger',
      confirmLabel: 'Excluir categoria',
      cancelLabel: 'Cancelar',
    });
    if (!confirmed) return;

    setBusyId(cat.id);
    try {
      const res = await fetch(`/api/admin/categories/${cat.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        onUpdated();
      } else {
        const data = await res.json().catch(() => null);
        await showAlert({
          title: 'Erro ao excluir',
          message: data?.error || 'Erro ao excluir categoria.',
          variant: 'error',
        });
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl border border-stone-200">
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50">
          <div className="flex items-center gap-2.5">
            <FolderKanban className="w-5 h-5 text-amber-600" />
            <div>
              <h2 className="font-heading text-lg font-bold text-stone-900">
                Categorias do Cardápio
              </h2>
              <p className="text-xs text-stone-500">
                Organize seções, nomes e ordem de exibição na loja.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-stone-500 hover:bg-stone-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleCreate} className="p-4 border-b border-stone-200 flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nova categoria (ex: Acompanhamentos, Sobremesas, Bebidas)"
            className="flex-1 px-3.5 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-800"
          />
          <Button type="submit" size="sm" disabled={creating || !newName.trim()} className="gap-1.5">
            {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            <span>Criar</span>
          </Button>
        </form>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {sorted.length === 0 ? (
            <p className="text-sm text-stone-500 text-center py-6">
              Nenhuma categoria cadastrada ainda.
            </p>
          ) : (
            sorted.map((cat, idx) => (
              <div
                key={cat.id}
                className="flex items-center justify-between gap-2 p-3 rounded-xl border border-stone-200 bg-stone-50/70"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      disabled={idx === 0 || busyId === cat.id}
                      onClick={() => handleMove(idx, -1)}
                      className="p-0.5 text-stone-400 hover:text-stone-700 disabled:opacity-30"
                      title="Subir na ordem"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === sorted.length - 1 || busyId === cat.id}
                      onClick={() => handleMove(idx, 1)}
                      className="p-0.5 text-stone-400 hover:text-stone-700 disabled:opacity-30"
                      title="Descer na ordem"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                  </div>

                  {editingId === cat.id ? (
                    <div className="flex items-center gap-1.5 flex-1">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="flex-1 px-2.5 py-1 rounded border border-stone-300 text-sm bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => handleRename(cat.id)}
                        className="p-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                        title="Salvar nome"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="p-1.5 rounded bg-stone-200 text-stone-700"
                        title="Cancelar"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="min-w-0">
                      <span className="font-semibold text-sm text-stone-900 block truncate">
                        {cat.name}
                      </span>
                      <span className="text-[11px] text-stone-500">
                        Ordem #{idx + 1} · {cat.is_active ? 'Visível na loja' : 'Oculta'}
                      </span>
                    </div>
                  )}
                </div>

                {editingId !== cat.id && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={busyId === cat.id}
                      onClick={() => handleToggleActive(cat)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${
                        cat.is_active
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}
                    >
                      {cat.is_active ? 'Ativa' : 'Oculta'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(cat.id);
                        setEditingName(cat.name);
                      }}
                      className="p-1.5 rounded-lg border border-stone-200 bg-white text-stone-600 hover:bg-stone-100"
                      title="Renomear"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={busyId === cat.id}
                      onClick={() => handleDelete(cat)}
                      className="p-1.5 rounded-lg border border-stone-200 bg-white text-red-600 hover:bg-red-50"
                      title="Excluir categoria"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

