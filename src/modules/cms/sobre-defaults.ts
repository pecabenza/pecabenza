export interface DefaultPageSectionSeed {
  section_type: string;
  variant: string;
  display_order: number;
  is_active: boolean;
  content: Record<string, any>;
}

export const SOBRE_SECTION_LABELS: Record<string, string> = {
  SobreHero: 'Seção 1 — Hero Cinematográfico',
  SobreEssencia: 'Seção 2 — Nossa Essência',
  SobreModalidades: 'Seção 3 — Sua Rotina, Seu Jeito',
  SobreSabores: 'Seção 4 — Sabores que Conquistam',
  SobrePilares: 'Seção 5 — Cuidado em Cada Etapa',
  SobreCTA: 'Seção 6 — CTA Final',
};

export const DEFAULT_SOBRE_SECTIONS: DefaultPageSectionSeed[] = [
  {
    section_type: 'SobreHero',
    variant: 'editorial',
    display_order: 1,
    is_active: true,
    content: {
      badge: 'BENZA — Cozinha de verdade',
      title: 'Comida de verdade. Para a vida de verdade.',
      subtitle:
        'Sabores que acolhem, receitas feitas com cuidado e praticidade para acompanhar sua rotina.',
      primary_cta_label: 'Conhecer o cardápio',
      secondary_cta_label: 'Nossa essência',
      image_url: '',
      image_hidden: false,
    },
  },
  {
    section_type: 'SobreEssencia',
    variant: 'split',
    display_order: 2,
    is_active: true,
    content: {
      eyebrow: 'Nossa Essência',
      title: 'O sabor de casa, no seu tempo.',
      description:
        'A BENZA nasceu para aproximar o prazer de uma boa refeição da praticidade que a vida pede. Acreditamos que comer bem não precisa ser complicado. Por isso, valorizamos receitas conhecidas, ingredientes bem preparados e o cuidado que transforma uma refeição em um momento especial.',
      location_note:
        'Operação em Feira de Santana, Bahia — pensada para o dia a dia e os encontros à mesa.',
      image_url: '',
      image_hidden: false,
    },
  },
  {
    section_type: 'SobreModalidades',
    variant: 'tabs',
    display_order: 3,
    is_active: true,
    content: {
      eyebrow: 'Sua rotina, seu jeito',
      title: 'Duas formas de receber a BENZA à mesa',
      subtitle:
        'Cada modalidade acompanha o ritmo da sua semana e respeita a disponibilidade dos itens ativos no cardápio.',
      frozen_title: 'Refeições congeladas',
      frozen_description:
        'Para aqueles dias em que o tempo é curto, mas a vontade de comer bem continua grande.',
      ready_title: 'Pratos prontos para consumo',
      ready_description:
        'Nos finais de semana, o sabor da BENZA chega pronto para fazer parte da sua mesa.',
    },
  },
  {
    section_type: 'SobreSabores',
    variant: 'carousel',
    display_order: 4,
    is_active: true,
    content: {
      eyebrow: 'Sabores que conquistam',
      title: 'Pratos do nosso cardápio',
      cta_label: 'Ver cardápio completo',
    },
  },
  {
    section_type: 'SobrePilares',
    variant: 'grid',
    display_order: 5,
    is_active: true,
    content: {
      eyebrow: 'Cuidado em cada etapa',
      title: 'Transparência e atenção aos detalhes',
      items: [
        {
          title: 'Preparo cuidadoso',
          description:
            'Receitas executadas com atenção ao ponto dos ingredientes e temperos equilibrados para manter o sabor de casa.',
        },
        {
          title: 'Porções práticas',
          description:
            'Embalagens dimensionadas por capacidade volumétrica (como 500 ml e 1000 ml, conforme o prato) para acompanhar o tamanho da sua mesa.',
        },
        {
          title: 'Conservação orientada',
          description:
            'Orientações objetivas na embalagem para conservação e aquecimento sem complicar o seu dia a dia.',
        },
        {
          title: 'Informações claras para o consumidor',
          description:
            'Lista de ingredientes, alertas de alérgenos e instruções de preparo disponíveis com transparência em cada prato.',
        },
      ],
    },
  },
  {
    section_type: 'SobreCTA',
    variant: 'banner',
    display_order: 6,
    is_active: true,
    content: {
      title: 'Seu próximo momento à mesa merece sabor de verdade.',
      description: 'Descubra nossos pratos e escolha o que combina com a sua rotina.',
      primary_cta_label: 'Explorar cardápio',
      secondary_cta_label: 'Falar com a BENZA',
    },
  },
];

export const DEFAULT_CONTATO_SECTIONS: DefaultPageSectionSeed[] = [
  {
    section_type: 'ContactSection',
    variant: 'default',
    display_order: 1,
    is_active: true,
    content: {
      title: 'Fale Conosco',
      description:
        'Tire suas dúvidas sobre nossos pratos, porções, conservação e entregas.',
      show_form: true,
      show_social: true,
    },
  },
];

