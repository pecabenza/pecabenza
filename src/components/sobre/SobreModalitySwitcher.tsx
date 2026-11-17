'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Snowflake, UtensilsCrossed, ArrowRight, Clock } from 'lucide-react';

type ModalityKey = 'frozen' | 'ready';

interface ModalityItem {
  key: ModalityKey;
  label: string;
  badge: string;
  headline: string;
  description: string;
  highlights: string[];
  icon: typeof Snowflake;
}

const MODALITIES: ModalityItem[] = [
  {
    key: 'frozen',
    label: 'Refeições congeladas',
    badge: 'Durante a semana',
    headline: 'Refeições congeladas',
    description:
      'Para aqueles dias em que o tempo é curto, mas a vontade de comer bem continua grande.',
    highlights: [
      'Porções individuais ou para compartilhar, conforme disponibilidade no cardápio',
      'Conservação orientada na embalagem para manter sabor e textura',
      'Aquecimento simples no fogão ou forno no momento em que você precisar',
    ],
    icon: Snowflake,
  },
  {
    key: 'ready',
    label: 'Pratos prontos para consumo',
    badge: 'Finais de semana',
    headline: 'Pratos prontos para consumo',
    description:
      'Nos finais de semana, o sabor da BENZA chega pronto para fazer parte da sua mesa.',
    highlights: [
      'Preparados para servir na hora, com o cuidado da cozinha de verdade',
      'Disponibilidade sujeita à programação da cozinha e aos itens ativos no cardápio',
      'Ideal para reunir a família sem abrir mão da tranquilidade',
    ],
    icon: UtensilsCrossed,
  },
];

export interface SobreModalitySwitcherProps {
  frozenTitle?: string;
  frozenDescription?: string;
  readyTitle?: string;
  readyDescription?: string;
}

export function SobreModalitySwitcher({
  frozenTitle,
  frozenDescription,
  readyTitle,
  readyDescription,
}: SobreModalitySwitcherProps = {}) {
  const [activeKey, setActiveKey] = useState<ModalityKey>('frozen');
  const modalities = MODALITIES.map((m) => {
    if (m.key === 'frozen') {
      return {
        ...m,
        label: frozenTitle || m.label,
        headline: frozenTitle || m.headline,
        description: frozenDescription || m.description,
      };
    }
    return {
      ...m,
      label: readyTitle || m.label,
      headline: readyTitle || m.headline,
      description: readyDescription || m.description,
    };
  });
  const current = modalities.find((m) => m.key === activeKey) || modalities[0];
  const Icon = current.icon;

  return (
    <div className="space-y-6">
      {/* Seletor interativo acessível (Abas / Painéis) */}
      <div
        role="tablist"
        aria-label="Modalidades de refeições"
        className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-1.5 rounded-2xl bg-tenant-background border border-tenant-border/70"
      >
        {modalities.map((mod) => {
          const isSelected = mod.key === activeKey;
          const TabIcon = mod.icon;
          return (
            <button
              key={mod.key}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls={`modality-panel-${mod.key}`}
              id={`modality-tab-${mod.key}`}
              onClick={() => setActiveKey(mod.key)}
              className={`flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-tenant-primary ${
                isSelected
                  ? 'bg-tenant-surface text-tenant-text shadow-sm border border-tenant-border/80'
                  : 'text-tenant-muted hover:text-tenant-text hover:bg-tenant-surface/50 border border-transparent'
              }`}
            >
              <span
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                  isSelected
                    ? 'bg-tenant-primary text-white'
                    : 'bg-tenant-surface border border-tenant-border text-tenant-muted'
                }`}
              >
                <TabIcon className="w-5 h-5" />
              </span>
              <span className="min-w-0">
                <span className="text-[11px] uppercase tracking-wider font-bold text-tenant-secondary block">
                  {mod.badge}
                </span>
                <span className="font-heading font-bold text-base text-tenant-text block truncate">
                  {mod.label}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Painel Ativo */}
      <div
        role="tabpanel"
        id={`modality-panel-${current.key}`}
        aria-labelledby={`modality-tab-${current.key}`}
        className="rounded-2xl bg-tenant-surface border border-tenant-border/70 p-6 sm:p-10 shadow-sm transition-all duration-300"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-tenant-primary/10 text-tenant-primary text-xs font-bold uppercase tracking-wider">
              <Icon className="w-3.5 h-3.5" />
              <span>{current.badge}</span>
            </div>

            <h3 className="font-heading text-2xl sm:text-3xl font-bold text-tenant-text">
              {current.headline}
            </h3>

            <p className="text-base sm:text-lg text-tenant-muted leading-relaxed">
              {current.description}
            </p>

            <div className="pt-2">
              <Link
                href="/produtos"
                className="inline-flex items-center gap-2 text-sm font-bold text-tenant-primary hover:underline group"
              >
                <span>Ver opções disponíveis no cardápio</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          </div>

          <div className="lg:col-span-5 space-y-3 bg-tenant-background rounded-xl p-5 border border-tenant-border/50">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-tenant-secondary">
              <Clock className="w-3.5 h-3.5" />
              <span>Como funciona na prática</span>
            </div>
            <ul className="space-y-3">
              {current.highlights.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2.5 text-sm text-tenant-text/90 leading-relaxed"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-tenant-secondary mt-2 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

