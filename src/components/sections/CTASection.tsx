'use client';

import React, { useState } from 'react';
import { Mail, CheckCircle2 } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import type { CTASectionContent } from '@/modules/cms/schemas';

interface CTASectionProps {
  content: CTASectionContent;
  tenantId?: string;
}

export function CTASection({ content, tenantId }: CTASectionProps) {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          name: email.split('@')[0],
          source_page: 'home_cta',
          tenant_id: tenantId,
        }),
      });

      if (res.ok) {
        setSubmitted(true);
      }
    } catch {
      // Falha silenciosa com fallback de UX
      setSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="py-16 sm:py-24 bg-tenant-accent text-white transition-colors relative overflow-hidden">
      <Container size="md" className="text-center space-y-6 relative z-10">
        <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight">
          {content.title}
        </h2>

        {content.description && (
          <p className="text-base sm:text-lg text-white/80 max-w-xl mx-auto leading-relaxed">
            {content.description}
          </p>
        )}

        {submitted ? (
          <div className="p-6 rounded-tenant bg-white/10 border border-white/20 max-w-md mx-auto flex items-center justify-center gap-3 animate-in fade-in">
            <CheckCircle2 className="w-5 h-5 text-tenant-secondary shrink-0" />
            <span className="text-sm font-medium">
              Agradecemos seu interesse! Entraremos em contato assim que abrirmos os pedidos.
            </span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="max-w-md mx-auto space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Mail className="w-4 h-4 text-tenant-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={content.form_placeholder}
                  className="w-full pl-10 pr-4 py-3 rounded-tenant bg-white text-tenant-text placeholder:text-tenant-muted text-sm focus:outline-none focus:ring-2 focus:ring-tenant-secondary shadow-sm"
                />
              </div>
              <Button
                type="submit"
                variant="secondary"
                size="md"
                isLoading={isSubmitting}
                className="whitespace-nowrap"
              >
                {content.button_label}
              </Button>
            </div>
            {content.disclaimer && (
              <p className="text-xs text-white/60">
                {content.disclaimer}
              </p>
            )}
          </form>
        )}
      </Container>
    </section>
  );
}
