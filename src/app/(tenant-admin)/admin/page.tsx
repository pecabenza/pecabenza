import React from 'react';
import Link from 'next/link';
import { Layers, UtensilsCrossed, Palette, Search, ShieldCheck, Sparkles, Clock } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export default function AdminDashboardPage() {
  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-stone-200 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-2xl font-bold text-stone-900">
              Painel de Controle — BENZA
            </h1>
            <Badge variant="secondary" className="text-[11px]">
              Tenant 01
            </Badge>
          </div>
          <p className="text-sm text-stone-500">
            Ambiente de gestão do site institucional, catálogo e presença digital.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 flex items-center gap-2 text-xs font-semibold text-amber-800">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>Modo: Pré-Lançamento</span>
          </div>
        </div>
      </div>

      {/* Cards de Métricas / Status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 bg-white space-y-2">
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-xs uppercase font-bold tracking-wider">Status do Site</span>
            <Sparkles className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-xl font-bold text-stone-900">Publicado</p>
          <p className="text-xs text-stone-400">Modo pré-lançamento ativo</p>
        </Card>

        <Card className="p-5 bg-white space-y-2">
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-xs uppercase font-bold tracking-wider">Pratos Cadastrados</span>
            <UtensilsCrossed className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-xl font-bold text-stone-900">2 Pratos</p>
          <p className="text-xs text-stone-400">Feijoada e Lasanha (4 variações)</p>
        </Card>

        <Card className="p-5 bg-white space-y-2">
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-xs uppercase font-bold tracking-wider">Seções da Home</span>
            <Layers className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="text-xl font-bold text-stone-900">7 Blocos Ativos</p>
          <p className="text-xs text-stone-400">Hero, Manifesto, Vitrine, FAQ...</p>
        </Card>

        <Card className="p-5 bg-white space-y-2">
          <div className="flex items-center justify-between text-stone-500">
            <span className="text-xs uppercase font-bold tracking-wider">Segurança & RLS</span>
            <ShieldCheck className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-xl font-bold text-stone-900">Homologado</p>
          <p className="text-xs text-stone-400">Isolamento multi-tenant ativo</p>
        </Card>
      </div>

      {/* Ações Rápidas */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-stone-900">Ações Rápidas de Configuração</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            href="/admin/site"
            className="p-5 bg-white rounded-xl border border-stone-200 hover:border-amber-500 hover:shadow-sm transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <Layers className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-stone-900 text-sm mb-1">Editar Seções do Site</h3>
            <p className="text-xs text-stone-500">Altere textos do Hero, Manifesto e blocos da Home.</p>
          </Link>

          <Link
            href="/admin/produtos"
            className="p-5 bg-white rounded-xl border border-stone-200 hover:border-amber-500 hover:shadow-sm transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-stone-900 text-sm mb-1">Gerenciar Cardápio</h3>
            <p className="text-xs text-stone-500">Edite descrições, variações de 500ml/1000ml e fichas técnicas.</p>
          </Link>

          <Link
            href="/admin/identidade"
            className="p-5 bg-white rounded-xl border border-stone-200 hover:border-amber-500 hover:shadow-sm transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <Palette className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-stone-900 text-sm mb-1">Identidade Visual</h3>
            <p className="text-xs text-stone-500">Configure as cores da paleta, logotipo e canais de contato.</p>
          </Link>

          <Link
            href="/admin/seo"
            className="p-5 bg-white rounded-xl border border-stone-200 hover:border-amber-500 hover:shadow-sm transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <Search className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-stone-900 text-sm mb-1">SEO & Metadados</h3>
            <p className="text-xs text-stone-500">Ajuste títulos, descrições para o Google e Open Graph.</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
