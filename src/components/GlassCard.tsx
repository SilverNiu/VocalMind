import React, { ComponentProps } from 'react';
import { cn } from '../lib/utils';

interface GlassCardProps {
  children?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function GlassCard({ children, className, ...props }: GlassCardProps) {
  return (
    <div
      className={cn(
        'bg-white/40 backdrop-blur-xl border border-white/60 shadow-[0_8px_32px_rgba(31,38,135,0.05)] rounded-2xl',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
