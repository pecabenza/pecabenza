import React from 'react';
import { SystemDialogProvider } from '@/components/ui/SystemDialogProvider';

export default function TenantAdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-stone-100 text-stone-800 antialiased">
      <SystemDialogProvider>{children}</SystemDialogProvider>
    </div>
  );
}

