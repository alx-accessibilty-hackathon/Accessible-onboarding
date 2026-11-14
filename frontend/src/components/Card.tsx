import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/** Surface container with consistent background, radius and padding. */
export function Card({ className, children, ...rest }: CardProps) {
  const cls = className ? `bo-card ${className}` : 'bo-card';
  return (
    <div className={cls} {...rest}>
      {children}
    </div>
  );
}
