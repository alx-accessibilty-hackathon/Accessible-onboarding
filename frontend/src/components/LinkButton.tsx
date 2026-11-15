import type { AnchorHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary';

interface LinkButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: Variant;
  children: ReactNode;
}

const classes: Record<Variant, string> = {
  primary: 'bo-btn bo-btn-primary',
  secondary: 'bo-btn bo-btn-secondary',
};

/** An `<a>` element styled like a button. */
export function LinkButton({ variant = 'primary', className, children, ...rest }: LinkButtonProps) {
  const cls = className
    ? `${classes[variant]} bo-link-btn ${className}`
    : `${classes[variant]} bo-link-btn`;
  return (
    <a className={cls} {...rest}>
      {children}
    </a>
  );
}
