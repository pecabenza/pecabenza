import React from 'react';
import Link from 'next/link';
import { Instagram, ArrowUpRight } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import type { SocialSectionContent } from '@/modules/cms/schemas';

interface SocialSectionProps {
  content: SocialSectionContent;
}

export function SocialSection({ content }: SocialSectionProps) {
  return (
    <section className="py-16 bg-tenant-background border-t border-tenant-border/40 transition-colors">
      <Container size="lg" className="text-center space-y-6">
        <div className="space-y-2">
          <span className="text-xs uppercase tracking-widest text-tenant-secondary font-bold block">
            Instagram
          </span>
          <h2 className="font-heading text-2xl sm:text-3xl font-bold text-tenant-text">
            {content.title}
          </h2>
        </div>

        {content.handle && (
          <div>
            <a
              href={content.instagram_url || `https://instagram.com/${content.handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-tenant-surface border border-tenant-border text-tenant-text text-sm font-semibold hover:border-tenant-primary hover:text-tenant-primary transition-all shadow-sm group"
            >
              <Instagram className="w-4 h-4 text-tenant-primary" />
              <span>@{content.handle}</span>
              <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform text-tenant-muted" />
            </a>
          </div>
        )}
      </Container>
    </section>
  );
}
