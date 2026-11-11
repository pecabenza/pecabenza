import React from 'react';
import '@/app/globals.css';

export default function TenantAdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-stone-100 text-stone-800 antialiased">{children}</body>
    </html>
  );
}

