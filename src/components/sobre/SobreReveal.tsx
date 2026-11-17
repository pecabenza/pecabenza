'use client';

import React, { useEffect, useRef, useState } from 'react';

interface SobreRevealProps {
  children: React.ReactNode;
  className?: string;
  delayMs?: number;
}

/**
 * Scroll reveal progressivo (fade-up) sem causar layout shift.
 * Respeita `prefers-reduced-motion` (inclusive via regra global em globals.css)
 * e mantém conteúdo acessível e visível no SSR.
 */
export function SobreReveal({
  children,
  className = '',
  delayMs = 0,
}: SobreRevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) return;

    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.92) return;

    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      if (!cancelled) setVisible(false);
    });

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );

    observer.observe(el);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      style={delayMs > 0 ? { transitionDelay: `${delayMs}ms` } : undefined}
      className={`transition-all duration-700 ease-out will-change-transform ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'
      } ${className}`.trim()}
    >
      {children}
    </div>
  );
}
