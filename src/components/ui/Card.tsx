import React from 'react';
import { cn } from '@/lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverEffect?: boolean;
}

export function Card({ className, hoverEffect = false, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'bg-tenant-surface rounded-tenant border border-tenant-border/60 shadow-sm transition-all duration-300 overflow-hidden',
        hoverEffect && 'hover:shadow-md hover:border-tenant-primary/30 hover:-translate-y-0.5',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
