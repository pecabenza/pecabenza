'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Mail, Phone, Instagram, MapPin, Send, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { trackEvent } from '@/lib/analytics/events';
import type { ContactSectionContent } from '@/modules/cms/schemas';
import type { TenantSettings } from '@/types/database.types';

interface ContactSectionProps {
  content: ContactSectionContent;
  settings?: TenantSettings;
  tenantId?: string;
}

export function ContactSection({ content, settings, tenantId }: ContactSectionProps) {
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          source_page: 'contact_section',
          consent_given: true,
        }),
      });
      trackEvent('lead_submit', { pagePath: '/contato' });
      setSubmitted(true);
    } catch {
      setSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="py-16 sm:py-24 bg-tenant-surface border-t border-tenant-border/40 transition-colors">
      <Container size="lg">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16">
          {/* Informações de Contato */}
          <div className="lg:col-span-5 space-y-6">
            <div className="space-y-3">
              <h2 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-bold text-tenant-text">
                {content.title}
              </h2>
              {content.description && (
                <p className="text-sm sm:text-base text-tenant-muted leading-relaxed">
                  {content.description}
                </p>
              )}
            </div>

            {settings && (
              <div className="space-y-4 pt-2">
                {settings.contact_email && (
                  <div className="flex items-start gap-3 text-sm text-tenant-text">
                    <div className="p-2 rounded-tenant bg-tenant-primary/10 text-tenant-primary shrink-0 mt-0.5">
                      <Mail className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs uppercase font-semibold text-tenant-muted block">E-mail</span>
                      <a href={`mailto:${settings.contact_email}`} className="hover:text-tenant-primary transition-colors font-medium">
                        {settings.contact_email}
                      </a>
                    </div>
                  </div>
                )}

                {settings.contact_phone && (
                  <div className="flex items-start gap-3 text-sm text-tenant-text">
                    <div className="p-2 rounded-tenant bg-tenant-primary/10 text-tenant-primary shrink-0 mt-0.5">
                      <Phone className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs uppercase font-semibold text-tenant-muted block">Telefone / WhatsApp</span>
                      <span className="font-medium">{settings.contact_phone}</span>
                    </div>
                  </div>
                )}

                {settings.instagram_handle && (
                  <div className="flex items-start gap-3 text-sm text-tenant-text">
                    <div className="p-2 rounded-tenant bg-tenant-primary/10 text-tenant-primary shrink-0 mt-0.5">
                      <Instagram className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs uppercase font-semibold text-tenant-muted block">Instagram</span>
                      <a
                        href={`https://instagram.com/${settings.instagram_handle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-tenant-primary transition-colors font-medium"
                      >
                        @{settings.instagram_handle}
                      </a>
                    </div>
                  </div>
                )}

                {settings.address_summary && (
                  <div className="flex items-start gap-3 text-sm text-tenant-text">
                    <div className="p-2 rounded-tenant bg-tenant-primary/10 text-tenant-primary shrink-0 mt-0.5">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs uppercase font-semibold text-tenant-muted block">Atendimento</span>
                      <span className="text-tenant-muted text-xs leading-relaxed block">{settings.address_summary}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Formulário de Mensagem */}
          <div className="lg:col-span-7">
            <Card className="p-6 sm:p-8 bg-tenant-background border-tenant-border/60">
              {submitted ? (
                <div className="text-center py-12 space-y-3">
                  <CheckCircle2 className="w-12 h-12 text-tenant-primary mx-auto animate-in zoom-in" />
                  <h3 className="font-heading text-xl font-bold text-tenant-text">
                    Mensagem Enviada!
                  </h3>
                  <p className="text-sm text-tenant-muted max-w-sm mx-auto">
                    Agradecemos o contato. Nossa equipe responderá em breve através do e-mail ou telefone informado.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label htmlFor="contact-name" className="text-xs font-semibold uppercase tracking-wider text-tenant-text">
                        Nome
                      </label>
                      <input
                        id="contact-name"
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-tenant bg-tenant-surface border border-tenant-border text-tenant-text text-sm focus:outline-none focus:border-tenant-primary"
                        placeholder="Seu nome"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="contact-email" className="text-xs font-semibold uppercase tracking-wider text-tenant-text">
                        E-mail
                      </label>
                      <input
                        id="contact-email"
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-tenant bg-tenant-surface border border-tenant-border text-tenant-text text-sm focus:outline-none focus:border-tenant-primary"
                        placeholder="seu@email.com"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="contact-phone" className="text-xs font-semibold uppercase tracking-wider text-tenant-text">
                      WhatsApp / Telefone
                    </label>
                    <input
                      id="contact-phone"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-tenant bg-tenant-surface border border-tenant-border text-tenant-text text-sm focus:outline-none focus:border-tenant-primary"
                      placeholder="(11) 99999-9999"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="contact-message" className="text-xs font-semibold uppercase tracking-wider text-tenant-text">
                      Mensagem
                    </label>
                    <textarea
                      id="contact-message"
                      rows={4}
                      required
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-tenant bg-tenant-surface border border-tenant-border text-tenant-text text-sm focus:outline-none focus:border-tenant-primary resize-none"
                      placeholder="Como podemos te ajudar?"
                    />
                  </div>

                  <div className="text-[11px] text-tenant-muted flex items-start gap-1.5 pt-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-tenant-primary shrink-0 mt-0.5" />
                    <span>
                      Seus dados são utilizados exclusivamente para retorno comercial. Ao enviar, você concorda com nossa{' '}
                      <Link href="/privacidade" className="underline hover:text-tenant-primary transition-colors">
                        Política de Privacidade
                      </Link>
                      .
                    </span>
                  </div>

                  <Button type="submit" size="md" isLoading={isSubmitting} className="w-full gap-2">
                    <Send className="w-4 h-4" />
                    <span>Enviar Mensagem</span>
                  </Button>
                </form>
              )}
            </Card>
          </div>
        </div>
      </Container>
    </section>
  );
}
