'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { X, ShoppingBag, Plus, Minus, Trash2, ArrowRight } from 'lucide-react';
import { useCart, formatBrl } from '@/modules/cart/CartContext';
import { resolveCartItemKey } from '@/modules/cart/cart.utils';
import { Button } from '@/components/ui/Button';

export function CartDrawer() {
  const {
    items,
    isOpen,
    closeCart,
    totalItemsCount,
    subtotalInCents,
    formattedSubtotal,
    updateQuantity,
    removeItem,
    clearCart,
  } = useCart();

  const closeButtonRef = React.useRef<HTMLButtonElement>(null);

  // Travar o scroll do body e escutar Escape quando o drawer estiver aberto
  useEffect(() => {
    if (!isOpen) return;

    document.body.style.overflow = 'hidden';

    // Focar no botão fechar quando abrir para acessibilidade
    const timer = setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeCart();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [isOpen, closeCart]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cart-drawer-title"
      className="fixed inset-0 z-50 overflow-hidden animate-in fade-in duration-200"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs transition-opacity"
        onClick={closeCart}
        aria-hidden="true"
      />

      {/* Slide-over panel */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-tenant-surface border-l border-tenant-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
          {/* Header */}
          <div className="p-6 border-b border-tenant-border/60 flex items-center justify-between bg-tenant-surface">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-tenant-primary/10 flex items-center justify-center text-tenant-primary">
                <ShoppingBag className="w-4 h-4" />
              </div>
              <div>
                <h2
                  id="cart-drawer-title"
                  className="font-heading text-lg font-bold text-tenant-text"
                >
                  Sua Sacola
                </h2>
                <span className="text-xs text-tenant-muted">
                  {totalItemsCount === 1 ? '1 item selecionado' : `${totalItemsCount} itens selecionados`}
                </span>
              </div>
            </div>

            <button
              ref={closeButtonRef}
              onClick={closeCart}
              className="p-2 rounded-tenant text-tenant-muted hover:text-tenant-text hover:bg-tenant-background transition-colors focus:outline-hidden focus:ring-2 focus:ring-tenant-primary"
              aria-label="Fechar sacola"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Items List / Empty State */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
                <div className="w-16 h-16 rounded-full bg-tenant-background flex items-center justify-center text-tenant-muted border border-tenant-border">
                  <ShoppingBag className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-heading text-lg font-bold text-tenant-text">
                    Sua sacola está vazia
                  </h3>
                  <p className="text-xs text-tenant-muted max-w-xs leading-relaxed">
                    Explore nosso cardápio de pratos preparados e adicione suas porções favoritas para a semana.
                  </p>
                </div>
                <Link
                  href="/produtos"
                  onClick={closeCart}
                  className="mt-2 inline-flex items-center justify-center px-5 py-2.5 rounded-tenant bg-tenant-primary text-white text-xs font-semibold uppercase tracking-wider hover:brightness-110 transition-all shadow-sm"
                >
                  Explorar Cardápio
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {items.map((item) => {
                  const itemKey = resolveCartItemKey(item);
                  return (
                  <div
                    key={itemKey}
                    className="p-4 rounded-tenant bg-tenant-background border border-tenant-border/60 flex gap-4 transition-all"
                  >
                    {/* Imagem do Produto */}
                    <div className="w-16 h-16 rounded-lg bg-tenant-surface border border-tenant-border relative overflow-hidden shrink-0 flex items-center justify-center">
                      {item.coverImageUrl ? (
                        <Image
                          src={item.coverImageUrl}
                          alt={item.productName}
                          fill
                          className="object-cover"
                          sizes="64px"
                        />
                      ) : (
                        <span className="font-heading font-bold text-tenant-primary text-sm">
                          {item.productName.charAt(0)}
                        </span>
                      )}
                    </div>

                    {/* Informações e Controles */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-heading text-sm font-bold text-tenant-text truncate">
                            {item.productName}
                          </h4>
                          <button
                            onClick={() => removeItem(itemKey)}
                            className="text-stone-400 hover:text-red-600 transition-colors p-0.5"
                            title="Remover item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] font-semibold text-tenant-secondary uppercase tracking-wider">
                            {item.variantName}
                          </span>
                          <span className="text-xs text-tenant-muted font-medium">
                            {formatBrl(item.unitPriceInCents)}
                          </span>
                        </div>
                        {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {item.selectedModifiers.map((mod) => (
                              <li key={`${mod.groupId}-${mod.optionId}`} className="text-[11px] text-tenant-muted">
                                + {mod.optionName}
                                {mod.priceInCents > 0 ? ` (${formatBrl(mod.priceInCents)})` : ''}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-2 mt-1 border-t border-tenant-border/40">
                        {/* Controles de Quantidade */}
                        <div className="flex items-center gap-2 bg-tenant-surface border border-tenant-border rounded-lg px-2 py-1">
                          <button
                            onClick={() => updateQuantity(itemKey, item.quantity - 1)}
                            className="text-tenant-text hover:text-tenant-primary transition-colors p-0.5"
                            aria-label="Diminuir quantidade"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-xs font-bold text-tenant-text w-4 text-center">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(itemKey, item.quantity + 1)}
                            className="text-tenant-text hover:text-tenant-primary transition-colors p-0.5"
                            aria-label="Aumentar quantidade"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Preço Total da Linha */}
                        <span className="font-heading font-bold text-sm text-tenant-text">
                          {formatBrl(item.unitPriceInCents * item.quantity)}
                        </span>
                      </div>
                    </div>
                  </div>
                  );
                })}

                <div className="flex justify-end pt-1">
                  <button
                    onClick={clearCart}
                    className="text-[11px] text-stone-400 hover:text-stone-600 transition-colors underline"
                  >
                    Esvaziar sacola
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer com Subtotal e Checkout */}
          {items.length > 0 && (
            <div className="p-6 border-t border-tenant-border/60 bg-tenant-surface space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-tenant-muted">
                  <span>Subtotal dos itens</span>
                  <span className="font-medium">{formattedSubtotal}</span>
                </div>
                <div className="flex items-center justify-between text-base font-bold text-tenant-text pt-1 border-t border-tenant-border/40">
                  <span className="font-heading">Total</span>
                  <span className="text-lg text-tenant-primary font-heading">
                    {formattedSubtotal}
                  </span>
                </div>
                <p className="text-[11px] text-tenant-muted pt-1">
                  Entrega calculada e agendamento definido no próximo passo.
                </p>
              </div>

              <div className="space-y-2">
                <Link
                  href="/checkout"
                  onClick={closeCart}
                  className="w-full inline-flex items-center justify-center gap-2 py-3.5 px-6 rounded-tenant bg-tenant-primary text-white text-sm font-semibold uppercase tracking-wider hover:brightness-110 transition-all shadow-md group"
                >
                  <span>Finalizar Pedido</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>

                <button
                  type="button"
                  onClick={closeCart}
                  className="w-full py-2 text-xs font-semibold text-tenant-muted hover:text-tenant-text transition-colors text-center"
                >
                  Continuar Escolhendo
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

