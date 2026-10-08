'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Card } from '@/components/ui/Card';
import type { FAQSectionContent } from '@/modules/cms/schemas';

interface FAQSectionProps {
  content: FAQSectionContent;
}

export function FAQSection({ content }: FAQSectionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleItem = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section className="py-16 sm:py-24 bg-tenant-background transition-colors">
      <Container size="md" className="space-y-12">
        <div className="text-center space-y-3">
          <h2 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-bold text-tenant-text">
            {content.title}
          </h2>
          {content.subtitle && (
            <p className="text-sm sm:text-base text-tenant-muted">
              {content.subtitle}
            </p>
          )}
        </div>

        <div className="space-y-4">
          {content.items.map((item, index) => {
            const isOpen = openIndex === index;

            return (
              <Card
                key={index}
                className="overflow-hidden border border-tenant-border/60 bg-tenant-surface transition-all"
              >
                <button
                  type="button"
                  onClick={() => toggleItem(index)}
                  className="w-full py-4 px-6 text-left flex items-center justify-between gap-4 focus:outline-none"
                  aria-expanded={isOpen}
                >
                  <span className="font-heading text-base sm:text-lg font-bold text-tenant-text">
                    {item.question}
                  </span>
                  <ChevronDown
                    className={`w-5 h-5 text-tenant-muted transition-transform duration-200 shrink-0 ${
                      isOpen ? 'rotate-180 text-tenant-primary' : ''
                    }`}
                  />
                </button>

                {isOpen && (
                  <div className="px-6 pb-6 pt-2 text-sm sm:text-base text-tenant-muted leading-relaxed border-t border-tenant-border/40 animate-in fade-in duration-200">
                    {item.answer}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
