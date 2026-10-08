import { describe, it, expect } from 'vitest';
import {
  HeroEditorialSchema,
  HeroMinimalSchema,
  BrandStorySchema,
  ProductShowcaseSchema,
  BenefitsSchema,
  FAQSectionSchema,
  CTASectionSchema,
  ContactSectionSchema,
} from '@/modules/cms/schemas';

describe('Validação Zod de Schemas do CMS', () => {
  it('HeroEditorial: aceita conteúdo válido com todos os campos opcionais', () => {
    const validData = {
      badge: 'Gastronomia Artesanal',
      title: 'O sabor da comida feita com carinho',
      subtitle: 'Pratos preparados lentamente para sua casa',
      primary_cta_label: 'Ver Cardápio',
      primary_cta_href: '/produtos',
      secondary_cta_label: 'Sobre Nós',
      secondary_cta_href: '/sobre',
      highlight_note: 'Modo pré-lançamento ativo',
    };

    const result = HeroEditorialSchema.safeParse(validData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe(validData.title);
    }
  });

  it('HeroEditorial: rejeita payload sem título obrigatório', () => {
    const invalidData = {
      badge: 'Sem Título',
      subtitle: 'Apenas subtítulo',
    };

    const result = HeroEditorialSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('BrandStory: aceita payload estruturado e rejeita sem título', () => {
    const valid = {
      eyebrow: 'História',
      title: 'Tradição e Família',
      lead_paragraph: 'Parágrafo inicial',
      description: 'Descrição completa',
    };
    expect(BrandStorySchema.safeParse(valid).success).toBe(true);
    expect(BrandStorySchema.safeParse({}).success).toBe(false);
  });

  it('Benefits: aceita array de itens e define ícones padrão', () => {
    const valid = {
      title: 'Diferenciais da Marca',
      items: [
        {
          title: 'Ingredientes Naturais',
          description: 'Sem aditivos químicos',
        },
      ],
    };

    const result = BenefitsSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items[0].icon).toBe('UtensilsCrossed');
    }
  });

  it('FAQSection: rejeita itens sem pergunta ou resposta', () => {
    const invalid = {
      title: 'FAQ',
      items: [
        {
          question: 'Apenas a pergunta, sem resposta',
        },
      ],
    };

    const result = FAQSectionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('CTASection: atribui valores padrão para campos essenciais', () => {
    const data = {
      title: 'Fique por dentro das novidades',
    };

    const result = CTASectionSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.form_placeholder).toBe('Digite seu melhor e-mail');
      expect(result.data.button_label).toBe('Cadastrar');
    }
  });
});
