import React from 'react';
import Link from 'next/link';
import { Instagram, Mail, Phone } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import type { Tenant, TenantSettings } from '@/types/database.types';

interface StorefrontFooterProps {
  tenant: Tenant;
  settings: TenantSettings;
}

export function StorefrontFooter({ tenant, settings }: StorefrontFooterProps) {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-tenant-accent text-white/90 border-t border-white/10 mt-auto transition-colors">
      <Container size="lg" className="py-12 sm:py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 lg:gap-12">
          {/* Brand Info */}
          <div className="md:col-span-2 space-y-4">
            <span className="font-heading text-2xl font-bold tracking-tight text-white block">
              {tenant.name}
            </span>
            {settings.address_summary && (
              <p className="text-sm text-white/70 max-w-md leading-relaxed">
                {settings.address_summary}
              </p>
            )}
            {settings.business_hours && Object.keys(settings.business_hours).length > 0 && (
              <div className="text-xs text-white/60 space-y-1 pt-2">
                <span className="font-semibold text-white/80 block uppercase tracking-wider">Horários</span>
                {Object.entries(settings.business_hours).map(([key, val]) => (
                  <p key={key}>
                    <span className="capitalize">{key}</span>: {val}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Quick Links */}
          <div className="space-y-3">
            <span className="text-xs uppercase font-semibold tracking-wider text-tenant-secondary block">
              Navegação
            </span>
            <ul className="space-y-2 text-sm text-white/70">
              <li>
                <Link href="/" className="hover:text-white transition-colors">
                  Início
                </Link>
              </li>
              <li>
                <Link href="/produtos" className="hover:text-white transition-colors">
                  Cardápio
                </Link>
              </li>
              <li>
                <Link href="/sobre" className="hover:text-white transition-colors">
                  Nossa Proposta
                </Link>
              </li>
              <li>
                <Link href="/contato" className="hover:text-white transition-colors">
                  Contato
                </Link>
              </li>
              <li>
                <Link href="/privacidade" className="hover:text-white transition-colors">
                  Privacidade (LGPD)
                </Link>
              </li>
              <li>
                <Link href="/termos" className="hover:text-white transition-colors">
                  Termos de Uso
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact Details */}
          <div className="space-y-3">
            <span className="text-xs uppercase font-semibold tracking-wider text-tenant-secondary block">
              Atendimento
            </span>
            <ul className="space-y-2.5 text-sm text-white/70">
              {settings.contact_email && (
                <li className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-tenant-secondary shrink-0" />
                  <a href={`mailto:${settings.contact_email}`} className="hover:text-white transition-colors truncate">
                    {settings.contact_email}
                  </a>
                </li>
              )}
              {settings.contact_phone && (
                <li className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-tenant-secondary shrink-0" />
                  <span>{settings.contact_phone}</span>
                </li>
              )}
              {settings.instagram_handle && (
                <li className="flex items-center gap-2">
                  <Instagram className="w-4 h-4 text-tenant-secondary shrink-0" />
                  <a
                    href={`https://instagram.com/${settings.instagram_handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-white transition-colors"
                  >
                    @{settings.instagram_handle}
                  </a>
                </li>
              )}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/50">
          <p>
            &copy; {currentYear} {tenant.name}. Todos os direitos reservados.
          </p>
          <p className="flex items-center gap-1">
            <span>Presença digital provida com tecnologia SaaS</span>
          </p>
        </div>
      </Container>
    </footer>
  );
}
