import React from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Acesso Administrativo | PeçaBenza',
  description: 'Autenticação segura para gestão do estabelecimento.',
};

export default function AdminAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-stone-100 text-stone-900 antialiased">{children}</div>;
}

