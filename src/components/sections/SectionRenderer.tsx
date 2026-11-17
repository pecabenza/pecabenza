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
import { HomeModalitiesSection } from './HomeModalitiesSection';
import { HomeOrderStepsSection } from './HomeOrderStepsSection';
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
import type {
  TenantPageSection,
  Product,
  ProductCategory,
  TenantSettings,
  SiteMode,
} from '@/types/database.types';

interface SectionRendererProps {
  section: TenantPageSection;
  products?: Product[];
  categories?: ProductCategory[];
  settings?: TenantSettings;
  tenantId?: string;
  prelaunchCtaText?: string;
  siteMode?: SiteMode | null;
}

function safeParseSection(section: TenantPageSection): unknown | null {
  try {
    switch (section.section_type) {
      case 'HeroEditorial':
        return HeroEditorialSchema.parse(section.content);
      case 'HeroMinimal':
        return HeroMinimalSchema.parse(section.content);
      case 'BrandStorySection':
        return BrandStorySchema.parse(section.content);
      case 'ProductShowcaseSection':
        return ProductShowcaseSchema.parse(section.content);
      case 'BenefitsSection':
        return BenefitsSchema.parse(section.content);
      case 'ImageTextSection':
        return ImageTextSchema.parse(section.content);
      case 'CTASection':
        return CTASectionSchema.parse(section.content);
      case 'FAQSection':
        return FAQSectionSchema.parse(section.content);
      case 'ContactSection':
        return ContactSectionSchema.parse(section.content);
      case 'SocialSection':
        return SocialSectionSchema.parse(section.content);
      case 'HomeModalitiesSection':
      case 'HomeOrderStepsSection':
        return {};
      default:
        console.warn(`[CMS] Tipo de seção não reconhecido: ${section.section_type}`);
        return null;
    }
  } catch (error) {
    console.error(`[CMS] Erro de validação na seção ${section.section_type} (ID: ${section.id}):`, error);
    return null;
  }
}

export function SectionRenderer({
  section,
  products = [],
  categories = [],
  settings,
  tenantId,
  prelaunchCtaText,
  siteMode = 'commerce',
}: SectionRendererProps) {
  if (!section.is_active) return null;

  const parsed = safeParseSection(section);
  if (!parsed) return null;

  switch (section.section_type) {
    case 'HeroEditorial':
      return <HeroEditorial content={parsed as ReturnType<typeof HeroEditorialSchema.parse>} />;
    case 'HeroMinimal':
      return <HeroMinimal content={parsed as ReturnType<typeof HeroMinimalSchema.parse>} />;
    case 'BrandStorySection':
      return <BrandStorySection content={parsed as ReturnType<typeof BrandStorySchema.parse>} />;
    case 'ProductShowcaseSection':
      return (
        <ProductShowcaseSection
          content={parsed as ReturnType<typeof ProductShowcaseSchema.parse>}
          products={products}
          categories={categories}
          ctaButtonText={prelaunchCtaText}
          siteMode={siteMode}
        />
      );
    case 'BenefitsSection':
      return <BenefitsSection content={parsed as ReturnType<typeof BenefitsSchema.parse>} />;
    case 'ImageTextSection':
      return <ImageTextSection content={parsed as ReturnType<typeof ImageTextSchema.parse>} />;
    case 'CTASection':
      return <CTASection content={parsed as ReturnType<typeof CTASectionSchema.parse>} tenantId={tenantId} />;
    case 'FAQSection':
      return <FAQSection content={parsed as ReturnType<typeof FAQSectionSchema.parse>} />;
    case 'ContactSection':
      return (
        <ContactSection
          content={parsed as ReturnType<typeof ContactSectionSchema.parse>}
          settings={settings}
          tenantId={tenantId}
        />
      );
    case 'SocialSection':
      return <SocialSection content={parsed as ReturnType<typeof SocialSectionSchema.parse>} />;
    case 'HomeModalitiesSection':
      return <HomeModalitiesSection />;
    case 'HomeOrderStepsSection':
      return <HomeOrderStepsSection />;
    default:
      return null;
  }
}
