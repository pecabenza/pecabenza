import React from 'react';
import Link from 'next/link';
import { UtensilsCrossed, ShoppingBag, CheckCircle2, ArrowRight } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { SobreReveal } from '@/components/sobre/SobreReveal';

const ORDER_STEPS = [
  {
    step: '01',
    title: 'Escolha seu prato e porção',
    description:
      'Navegue pelo cardápio, veja ingredientes e selecione a porção ideal e eventuais complementos.',
    icon: UtensilsCrossed,
  },
  {
    step: '02',
    title: 'Adicione à sacola',
    description:
      'Monte seu pedido com quantas opções desejar e revise os itens em tempo real na sacola.',
    icon: ShoppingBag,
  },
  {
    step: '03',
    title: 'Finalize pelo canal da loja',
    description:
      'Informe seus dados, escolha entrega ou retirada e conclua o pagamento conforme as opções ativas.',
    icon: CheckCircle2,
  },
];

export function HomeOrderStepsSection() {
  return (
    <section className="py-16 sm:py-24 bg-tenant-background transition-colors">
      <Container size="lg" className="space-y-10">
        <SobreReveal className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <span className="text-xs uppercase font-bold tracking-widest text-tenant-secondary block">
              Seu pedido, do seu jeito
            </span>
            <h2 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-bold text-tenant-text">
              Como pedir em 3 passos simples
            </h2>
          </div>

          <Link
            href="/produtos"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-tenant-primary hover:underline shrink-0"
          >
            <span>Explorar cardápio</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </SobreReveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {ORDER_STEPS.map((item, idx) => {
            const Icon = item.icon;
            return (
              <SobreReveal key={item.step} delayMs={idx * 70}>
                <div className="h-full p-6 sm:p-7 rounded-2xl bg-tenant-surface border border-tenant-border/70 space-y-4 hover:border-tenant-primary/40 hover:shadow-sm transition-all">
                  <div className="flex items-center justify-between">
                    <div className="w-11 h-11 rounded-xl bg-tenant-primary/10 text-tenant-primary flex items-center justify-center">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="font-heading text-2xl font-extrabold text-tenant-border">
                      {item.step}
                    </span>
                  </div>

                  <h3 className="font-heading text-lg font-bold text-tenant-text">
                    {item.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-tenant-muted leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </SobreReveal>
            );
          })}
        </div>
      </Container>
    </section>
  );
}

