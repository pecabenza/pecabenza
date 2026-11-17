import React from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Portal do Entregador — Entrega em Rota',
  description: 'Acompanhamento de paradas e comprovação de entregas.',
};

export default function DriverPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-stone-100 text-stone-900 antialiased">{children}</div>;
}

