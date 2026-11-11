import React from 'react';
import type { Metadata } from 'next';
import '@/app/globals.css';

export const metadata: Metadata = {
  title: 'Acesso Administrativo | PeçaBenza',
  description: 'Autenticação segura para gestão do estabelecimento.',
};

export default function AdminAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-stone-100 text-stone-900 antialiased">{children}</body>
    </html>
  );
}

