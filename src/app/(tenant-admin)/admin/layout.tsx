'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Layers,
  UtensilsCrossed,
  Palette,
  Search,
  ExternalLink,
  Menu,
  X,
  LogOut,
} from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navigation = [
    { name: 'Visão Geral', href: '/admin', icon: LayoutDashboard },
    { name: 'Seções & CMS', href: '/admin/site', icon: Layers },
    { name: 'Cardápio & Pratos', href: '/admin/produtos', icon: UtensilsCrossed },
    { name: 'Identidade & Cores', href: '/admin/identidade', icon: Palette },
    { name: 'SEO & Metadados', href: '/admin/seo', icon: Search },
  ];

  return (
    <div className="min-h-screen bg-stone-100 flex flex-col md:flex-row text-stone-800 font-sans">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between bg-stone-900 text-white px-4 py-3 border-b border-stone-800 sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <span className="font-bold tracking-tight text-amber-500 font-heading text-lg">
            SaaS Admin
          </span>
          <span className="text-xs bg-stone-800 px-2 py-0.5 rounded text-stone-400">
            Tenant 01
          </span>
        </div>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-1.5 rounded bg-stone-800 text-stone-300"
          aria-label="Alternar navegação"
        >
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Sidebar Desktop e Mobile Drawer */}
      <aside
        className={`${
          sidebarOpen ? 'block' : 'hidden'
        } md:block w-full md:w-64 bg-stone-900 text-stone-300 flex-shrink-0 flex flex-col justify-between fixed md:sticky top-0 md:top-0 h-auto md:h-screen z-40`}
      >
        <div className="p-6 space-y-6">
          <div className="hidden md:flex items-center justify-between">
            <div>
              <span className="font-heading text-xl font-bold tracking-tight text-white block">
                Painel do Tenant
              </span>
              <span className="text-xs text-stone-500">Gestão Institucional & CMS</span>
            </div>
          </div>

          <nav className="space-y-1.5 pt-2">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-amber-600/20 text-amber-400 border border-amber-500/30'
                      : 'hover:bg-stone-800 text-stone-300 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Rodapé da Sidebar */}
        <div className="p-4 border-t border-stone-800 space-y-2">
          <Link
            href="/"
            target="_blank"
            className="flex items-center justify-between px-3 py-2 text-xs font-semibold text-stone-400 hover:text-white rounded hover:bg-stone-800 transition-colors"
          >
            <span>Ver Site Público</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
          <div className="pt-2">
            <button
              onClick={() => {
                window.location.href = '/admin/login';
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-stone-400 hover:text-red-400 rounded hover:bg-stone-800 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair da Sessão</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
