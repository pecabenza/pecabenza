'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Menu, X } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import type { Tenant, TenantBranding, TenantSettings } from '@/types/database.types';

interface StorefrontHeaderProps {
  tenant: Tenant;
  branding: TenantBranding;
  settings: TenantSettings;
}

export function StorefrontHeader({ tenant, branding, settings }: StorefrontHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { label: 'Início', href: '/' },
    { label: 'Cardápio', href: '/produtos' },
    { label: 'Nossa Proposta', href: '/sobre' },
    { label: 'Contato', href: '/contato' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-tenant-background/90 backdrop-blur-md border-b border-tenant-border/50 transition-all">
      <Container size="lg">
        <div className="flex items-center justify-between h-20">
          {/* Logo / Brand Name */}
          <Link href="/" className="flex items-center gap-3 group focus:outline-none">
            {branding.logo_url ? (
              <Image
                src={branding.logo_url}
                alt={tenant.name}
                width={140}
                height={48}
                className="h-10 w-auto object-contain"
                priority
              />
            ) : (
              <div className="flex flex-col">
                <span className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-tenant-primary group-hover:opacity-90 transition-opacity">
                  {tenant.name}
                </span>
                <span className="text-[10px] uppercase tracking-widest text-tenant-muted font-medium">
                  Gastronomia
                </span>
              </div>
            )}
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-tenant-text/80 hover:text-tenant-primary transition-colors py-1"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right Action: Contact / Status */}
          <div className="hidden md:flex items-center gap-4">
            <Link
              href="/contato"
              className="text-xs uppercase font-semibold tracking-wider px-4 py-2 rounded-tenant bg-tenant-surface border border-tenant-border text-tenant-text hover:border-tenant-primary hover:text-tenant-primary transition-all shadow-sm"
            >
              Fale Conosco
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex md:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-tenant text-tenant-text hover:bg-tenant-surface border border-transparent hover:border-tenant-border focus:outline-none"
              aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-tenant-border/60 animate-in fade-in slide-in-from-top-2 duration-200">
            <nav className="flex flex-col gap-2">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-4 py-3 rounded-tenant text-base font-medium text-tenant-text hover:bg-tenant-surface hover:text-tenant-primary transition-colors"
                >
                  {link.label}
                </Link>
              ))}
              <div className="pt-2 px-4">
                <Link
                  href="/contato"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block text-center text-sm font-semibold py-3 rounded-tenant bg-tenant-primary text-white"
                >
                  Fale Conosco
                </Link>
              </div>
            </nav>
          </div>
        )}
      </Container>
    </header>
  );
}
