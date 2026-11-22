'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Zap,
  ChefHat,
  Flame,
  ShoppingBag,
  Layers,
  UtensilsCrossed,
  Package,
  ClipboardList,
  Truck,
  Bike,
  Store,
  Palette,
  Search,
  ExternalLink,
  Menu,
  X,
  LogOut,
  Ticket,
  Users,
  Wallet,
  Maximize2,
  Minimize2,
  Power,
} from 'lucide-react';
import type { TenantRole } from '@/types/database.types';
import { useSystemDialog } from '@/components/ui/SystemDialogProvider';

interface AdminLayoutShellProps {
  tenantName: string;
  tenantSlug: string;
  role: TenantRole;
  logoUrl?: string | null;
  sidebarColor?: string | null;
  children: React.ReactNode;
}

export function AdminLayoutShell({
  tenantName,
  tenantSlug,
  role,
  logoUrl,
  sidebarColor,
  children,
}: AdminLayoutShellProps) {
  const { showConfirm } = useSystemDialog();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isStoreOpen, setIsStoreOpen] = useState<boolean | null>(null);
  const [enforceSchedule, setEnforceSchedule] = useState(false);
  const [togglingStore, setTogglingStore] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/admin/store-status', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data && typeof data.isStoreOpen === 'boolean') {
          setIsStoreOpen(data.isStoreOpen);
          setEnforceSchedule(Boolean(data.enforceSchedule));
        }
      })
      .catch(() => {
        // silencioso
      });
    return () => {
      active = false;
    };
  }, []);

  const handleToggleStoreStatus = async () => {
    if (isStoreOpen === null || togglingStore) return;
    const nextState = !isStoreOpen;
    if (!nextState) {
      const confirmed = await showConfirm({
        title: 'Pausar pedidos online',
        message:
          'Deseja pausar os pedidos online agora? Clientes verão a loja como pausada até você reabrir.',
        variant: 'warning',
        confirmLabel: 'Sim, pausar loja',
        cancelLabel: 'Cancelar',
      });
      if (!confirmed) return;
    }
    setTogglingStore(true);
    try {
      const res = await fetch('/api/admin/store-status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isStoreOpen: nextState }),
      });
      if (res.ok) {
        setIsStoreOpen(nextState);
      }
    } catch {
      // ignora erro transitório
    } finally {
      setTogglingStore(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = async () => {
    if (!isFullscreen) {
      setIsFullscreen(true);
      setSidebarOpen(false);
      try {
        if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        }
      } catch {
        // Mesmo se o navegador bloquear Fullscreen API, mantém modo expandido sem sidebar
      }
    } else {
      setIsFullscreen(false);
      try {
        if (document.fullscreenElement && document.exitFullscreen) {
          await document.exitFullscreen();
        }
      } catch {
        // ignora erro ao sair
      }
    }
  };

  const effectiveSidebarBg = sidebarColor || '#1C1917';
  const effectiveLogoUrl =
    !logoError && (logoUrl || (tenantSlug === 'benza' ? '/assets/brands/benza/logo-white.svg' : null));

  const navigation = [
    { name: 'Visão Geral', href: '/admin', icon: LayoutDashboard },
    { name: 'Pedido Rápido (PDV)', href: '/admin/pedido-rapido', icon: Zap },
    { name: 'KDS Cozinha', href: '/admin/kds', icon: Flame },
    { name: 'Operação', href: '/admin/operacao', icon: ChefHat },
    { name: 'Expedição & Rotas', href: '/admin/expedicao', icon: Truck },
    { name: 'Entregadores', href: '/admin/entregadores', icon: Bike },
    { name: 'Financeiro', href: '/admin/financeiro', icon: Wallet, adminOnly: true },
    { name: 'Configurações da Loja', href: '/admin/configuracoes/loja', icon: Store },
    { name: 'Estações & Fluxo', href: '/admin/configuracoes/operacao', icon: Layers },
    { name: 'Usuários & Senha', href: '/admin/usuarios', icon: Users },
    { name: 'Pedidos', href: '/admin/pedidos', icon: ShoppingBag },
    { name: 'Cupons & Campanhas', href: '/admin/cupons', icon: Ticket },
    { name: 'Seções & CMS', href: '/admin/site', icon: Layers },
    { name: 'Cardápio & Pratos', href: '/admin/produtos', icon: UtensilsCrossed },
    { name: 'Estoque & Congelados', href: '/admin/estoque', icon: Package },
    { name: 'Fichas & Produção', href: '/admin/producao', icon: ClipboardList },
    { name: 'Identidade & Cores', href: '/admin/identidade', icon: Palette },
    { name: 'SEO & Metadados', href: '/admin/seo', icon: Search },
  ].filter((item) => !item.adminOnly || role === 'tenant_admin');

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch('/api/admin/auth/logout', { method: 'POST' });
    } catch {
      // continua para redirecionamento
    }
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-stone-100 flex flex-col md:flex-row text-stone-800 font-sans">
      {/* Mobile Header */}
      {!isFullscreen && (
        <div
          className="md:hidden flex items-center justify-between text-white px-4 py-3 border-b border-white/10 sticky top-0 z-50"
          style={{ backgroundColor: effectiveSidebarBg }}
        >
          <div className="flex items-center gap-2">
            {effectiveLogoUrl ? (
              <img
                src={effectiveLogoUrl}
                alt={tenantName}
                onError={() => setLogoError(true)}
                className="h-9 w-auto max-w-[160px] object-contain brightness-0 invert"
              />
            ) : (
              <span className="font-bold tracking-tight text-amber-500 font-heading text-lg">
                {tenantName}
              </span>
            )}
            <span className="text-[11px] bg-black/25 px-2 py-0.5 rounded text-stone-300 capitalize">
              {role.replace('tenant_', '')}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-1.5 rounded bg-stone-800 text-stone-300 hover:text-white"
              aria-label="Ver em tela cheia"
              title="Ver em tela cheia"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded bg-stone-800 text-stone-300"
              aria-label="Alternar navegação"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      )}

      {/* Sidebar Desktop e Mobile Drawer */}
      <aside
        className={`${sidebarOpen ? 'flex' : 'hidden'} ${
          isFullscreen ? 'md:hidden' : 'md:flex'
        } flex-col justify-between w-full md:w-64 text-stone-300 flex-shrink-0 fixed md:sticky top-0 left-0 h-dvh md:h-screen overflow-hidden z-40`}
        style={{ backgroundColor: effectiveSidebarBg }}
      >
        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
          <div className="hidden md:flex items-center justify-between">
            <div className="space-y-1">
              {effectiveLogoUrl ? (
                <img
                  src={effectiveLogoUrl}
                  alt={tenantName}
                  onError={() => setLogoError(true)}
                  className="h-14 w-auto max-w-[210px] object-contain brightness-0 invert"
                />
              ) : (
                <span className="font-heading text-xl font-bold tracking-tight text-white block">
                  {tenantName}
                </span>
              )}
              <span className="text-xs text-white-400 block">Gestão comercial</span>
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
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive
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
        <div
          className="shrink-0 p-4 border-t border-white/10 space-y-1.5"
          style={{ backgroundColor: effectiveSidebarBg }}
        >
          <button
            type="button"
            onClick={toggleFullscreen}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-stone-300 hover:text-white rounded hover:bg-stone-800 transition-colors"
          >
            <span>Ver em Tela Cheia</span>
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <Link
            href="/"
            target="_blank"
            className="flex items-center justify-between px-3 py-2 text-xs font-semibold text-stone-400 hover:text-white rounded hover:bg-stone-800 transition-colors"
          >
            <span>Ver Loja Pública</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
          <div className="pt-2">
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-stone-400 hover:text-red-400 rounded hover:bg-stone-800 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{isLoggingOut ? 'Saindo...' : 'Sair da Sessão'}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto relative">
        <div className="flex flex-wrap items-center justify-end gap-2 mb-3">
          {isStoreOpen !== null && (
            <button
              type="button"
              onClick={handleToggleStoreStatus}
              disabled={togglingStore}
              title={
                isStoreOpen
                  ? 'Clique para pausar as vendas online'
                  : 'Clique para abrir as vendas online'
              }
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold shadow-sm transition-colors disabled:opacity-60 ${
                isStoreOpen
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                  : 'bg-red-50 border-red-200 text-red-800 hover:bg-red-100'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              <span>
                {togglingStore
                  ? 'Atualizando...'
                  : isStoreOpen
                  ? `Loja Aberta${enforceSchedule ? ' (Horário Auto)' : ''}`
                  : 'Loja Pausada · Abrir'}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Sair da tela cheia' : 'Expandir para tela cheia'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 text-xs font-semibold shadow-sm transition-colors"
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 text-amber-600" />
                <span>Sair da Tela Cheia</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-stone-500" />
                <span>Tela Cheia</span>
              </>
            )}
          </button>
        </div>
        <div
          className={
            isFullscreen
              ? 'max-w-none mx-auto'
              : pathname.startsWith('/admin/kds') ||
                pathname === '/admin/operacao' ||
                pathname === '/admin/pedido-rapido'
              ? 'max-w-[1800px] mx-auto'
              : 'max-w-6xl mx-auto'
          }
        >
          {children}
        </div>
      </main>
    </div>
  );
}

