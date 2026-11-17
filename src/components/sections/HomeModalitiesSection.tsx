import React from 'react';
import { Container } from '@/components/ui/Container';
import { SobreReveal } from '@/components/sobre/SobreReveal';
import { SobreModalitySwitcher } from '@/components/sobre/SobreModalitySwitcher';

export function HomeModalitiesSection() {
  return (
    <section className="py-16 sm:py-24 bg-tenant-surface border-y border-tenant-border/50 transition-colors">
      <Container size="lg" className="space-y-10">
        <SobreReveal className="max-w-2xl space-y-2.5">
          <span className="text-xs uppercase font-bold tracking-widest text-tenant-secondary block">
            Modalidades de consumo
          </span>
          <h2 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-bold text-tenant-text">
            Pronto hoje ou congelado para depois
          </h2>
          <p className="text-sm sm:text-base text-tenant-muted leading-relaxed">
            Escolha a opção que melhor acompanha a sua semana, conforme os pratos ativos no cardápio.
          </p>
        </SobreReveal>

        <SobreReveal delayMs={70}>
          <SobreModalitySwitcher />
        </SobreReveal>
      </Container>
    </section>
  );
}

