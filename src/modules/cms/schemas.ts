import { z } from "zod";

export const HeroEditorialSchema = z.object({
  badge: z.string().optional(),
  title: z.string().min(1, "O título é obrigatório"),
  subtitle: z.string().optional(),
  primary_cta_label: z.string().optional(),
  primary_cta_href: z.string().optional(),
  secondary_cta_label: z.string().optional(),
  secondary_cta_href: z.string().optional(),
  highlight_note: z.string().optional(),
  background_image_url: z.string().optional(),
  image_url: z.string().optional(),
});

export const HeroMinimalSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  cta_label: z.string().optional(),
  cta_href: z.string().optional(),
});

export const BrandStorySchema = z.object({
  eyebrow: z.string().optional(),
  title: z.string().min(1),
  lead_paragraph: z.string().optional(),
  description: z.string().optional(),
  cta_label: z.string().optional(),
  cta_href: z.string().optional(),
  image_url: z.string().optional(),
});

export const ProductShowcaseSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  show_variants: z.boolean().default(true),
  cta_label: z.string().optional(),
  cta_href: z.string().optional(),
});

export const BenefitItemSchema = z.object({
  icon: z.string().default("UtensilsCrossed"),
  title: z.string().min(1),
  description: z.string().min(1),
});

export const BenefitsSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  items: z.array(BenefitItemSchema).default([]),
});

export const ImageTextSchema = z.object({
  eyebrow: z.string().optional(),
  title: z.string().min(1),
  description: z.string().min(1),
  image_url: z.string().optional(),
  image_position: z.enum(["left", "right"]).default("right"),
  cta_label: z.string().optional(),
  cta_href: z.string().optional(),
});

export const CTASectionSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  form_placeholder: z.string().default("Digite seu melhor e-mail"),
  button_label: z.string().default("Cadastrar"),
  disclaimer: z.string().optional(),
});

export const FAQItemSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
});

export const FAQSectionSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  items: z.array(FAQItemSchema).default([]),
});

export const ContactSectionSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  show_form: z.boolean().default(true),
  show_social: z.boolean().default(true),
});

export const SocialSectionSchema = z.object({
  title: z.string().min(1),
  handle: z.string().optional(),
  instagram_url: z.string().optional(),
  images: z.array(z.string()).default([]),
});

export type HeroEditorialContent = z.infer<typeof HeroEditorialSchema>;
export type HeroMinimalContent = z.infer<typeof HeroMinimalSchema>;
export type BrandStoryContent = z.infer<typeof BrandStorySchema>;
export type ProductShowcaseContent = z.infer<typeof ProductShowcaseSchema>;
export type BenefitsContent = z.infer<typeof BenefitsSchema>;
export type ImageTextContent = z.infer<typeof ImageTextSchema>;
export type CTASectionContent = z.infer<typeof CTASectionSchema>;
export type FAQSectionContent = z.infer<typeof FAQSectionSchema>;
export type ContactSectionContent = z.infer<typeof ContactSectionSchema>;
export type SocialSectionContent = z.infer<typeof SocialSectionSchema>;
