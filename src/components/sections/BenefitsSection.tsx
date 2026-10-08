import React from 'react';
import { UtensilsCrossed, Snowflake, Clock, ShieldCheck, Heart, Sparkles, LucideIcon } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Card } from '@/components/ui/Card';
import type { BenefitsContent } from '@/modules/cms/schemas';

interface BenefitsSectionProps {
  content: BenefitsContent;
}

const iconMap: Record<string, LucideIcon> = {
  UtensilsCrossed,
  Snowflake,
  Clock,
  ShieldCheck,
  Heart,
  Sparkles,
};

export function BenefitsSection({ content }: BenefitsSectionProps) {
  return (
    <section className="py-16 sm:py-24 bg-tenant-surface border-y border-tenant-border/40 transition-colors">
      <Container size="lg">
        <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16 space-y-3">
          <h2 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-bold text-tenant-text">
            {content.title}
          </h2>
          {content.subtitle && (
            <p className="text-sm sm:text-base text-tenant-muted">
              {content.subtitle}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
          {content.items.map((item, index) => {
            const IconComponent = iconMap[item.icon] || Sparkles;

            return (
              <Card key={index} className="p-6 bg-tenant-background border-none shadow-none space-y-4">
                <div className="w-12 h-12 rounded-tenant bg-tenant-primary/10 text-tenant-primary flex items-center justify-center shrink-0">
                  <IconComponent className="w-6 h-6" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-heading text-lg font-bold text-tenant-text">
                    {item.title}
                  </h3>
                  <p className="text-sm text-tenant-muted leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
