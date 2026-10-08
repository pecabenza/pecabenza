import React from 'react';
import { HeroEditorial } from './HeroEditorial';
import { HeroMinimal } from './HeroMinimal';
import { BrandStorySection } from './BrandStorySection';
import { ProductShowcaseSection } from './ProductShowcaseSection';
import { BenefitsSection } from './BenefitsSection';
import { ImageTextSection } from './ImageTextSection';
import { CTASection } from './CTASection';
import { FAQSection } from './FAQSection';
import { ContactSection } from './ContactSection';
import { SocialSection } from './SocialSection';
import {
  HeroEditorialSchema,
  HeroMinimalSchema,
  BrandStorySchema,
  ProductShowcaseSchema,
  BenefitsSchema,
  ImageTextSchema,
  CTASectionSchema,
  FAQSectionSchema,
  ContactSectionSchema,
  SocialSectionSchema,
} from '@/modules/cms/schemas';
import type { TenantPageSection, Product, TenantSettings } from '@/types/database.types';

interface SectionRendererProps {
  section: TenantPageSection;
  products?: Product[];
  settings?: TenantSettings;
  tenantId?: string;
  prelaunchCtaText?: string;
}

export function SectionRenderer({
  section,
  products = [],
  settings,
  tenantId,
  prelaunchCtaText,
}: SectionRendererProps) {
  if (!section.is_active) return null;

  try {
    switch (section.section_type) {
      case 'HeroEditorial': {
        const parsed = HeroEditorialSchema.parse(section.content);
        return <HeroEditorial content={parsed} />;
      }
      case 'HeroMinimal': {
        const parsed = HeroMinimalSchema.parse(section.content);
        return <HeroMinimal content={parsed} />;
      }
      case 'BrandStorySection': {
        const parsed = BrandStorySchema.parse(section.content);
        return <BrandStorySection content={parsed} />;
      }
      case 'ProductShowcaseSection': {
        const parsed = ProductShowcaseSchema.parse(section.content);
        return (
          <ProductShowcaseSection
            content={parsed}
            products={products}
            ctaButtonText={prelaunchCtaText}
          />
        );
      }
      case 'BenefitsSection': {
        const parsed = BenefitsSchema.parse(section.content);
        return <BenefitsSection content={parsed} />;
      }
      case 'ImageTextSection': {
        const parsed = ImageTextSchema.parse(section.content);
        return <ImageTextSection content={parsed} />;
      }
      case 'CTASection': {
        const parsed = CTASectionSchema.parse(section.content);
        return <CTASection content={parsed} tenantId={tenantId} />;
      }
      case 'FAQSection': {
        const parsed = FAQSectionSchema.parse(section.content);
        return <FAQSection content={parsed} />;
      }
      case 'ContactSection': {
        const parsed = ContactSectionSchema.parse(section.content);
        return <ContactSection content={parsed} settings={settings} tenantId={tenantId} />;
      }
      case 'SocialSection': {
        const parsed = SocialSectionSchema.parse(section.content);
        return <SocialSection content={parsed} />;
      }
      default: {
        console.warn(`[CMS] Tipo de seção não reconhecido: ${section.section_type}`);
        return null;
      }
    }
  } catch (error) {
    console.error(`[CMS] Erro de validação na seção ${section.section_type} (ID: ${section.id}):`, error);
    return null;
  }
}
