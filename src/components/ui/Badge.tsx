import React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'primary' | 'secondary' | 'accent' | 'neutral';
}

export function Badge({ className, variant = 'primary', children, ...props }: BadgeProps) {
  const variants = {
    primary: 'bg-tenant-primary/10 text-tenant-primary border-tenant-primary/20',
    secondary: 'bg-tenant-secondary/15 text-tenant-secondary border-tenant-secondary/30',
    accent: 'bg-tenant-accent/10 text-tenant-accent border-tenant-accent/20',
    neutral: 'bg-black/5 text-tenant-muted border-tenant-border',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
