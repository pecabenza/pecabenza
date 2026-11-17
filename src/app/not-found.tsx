import React from 'react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-tenant-background text-tenant-text px-6 py-16">
      <div className="max-w-md text-center space-y-5">
        <span className="text-xs font-bold uppercase tracking-widest text-tenant-secondary block">
          Página não encontrada
        </span>
        <h1 className="font-heading text-3xl sm:text-4xl font-extrabold text-tenant-text">
          Ops! Este endereço não existe.
        </h1>
        <p className="text-sm text-tenant-muted leading-relaxed">
          O link pode estar desatualizado ou ter sido movido. Você pode voltar para a página inicial ou explorar o cardápio.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Link
            href="/"
            className="w-full sm:w-auto px-5 py-2.5 rounded-tenant bg-tenant-button hover:bg-tenant-buttonHover text-white text-xs font-bold uppercase tracking-wider transition-all"
          >
            Ir para o Início
          </Link>
          <Link
            href="/produtos"
            className="w-full sm:w-auto px-5 py-2.5 rounded-tenant border border-tenant-border bg-tenant-surface text-tenant-text text-xs font-semibold hover:border-tenant-primary transition-all"
          >
            Ver Cardápio
          </Link>
        </div>
      </div>
    </div>
  );
}

