import type { ButtonHTMLAttributes } from 'react';

// Primary: one per screen (Continue, Submit, Keep). Secondary: Say again, Skip. Link: Back, Change.
type Variant = 'primary' | 'secondary' | 'link';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const classes: Record<Variant, string> = {
  primary: 'bo-btn bo-btn-primary',
  secondary: 'bo-btn bo-btn-secondary',
  link: 'bo-link',
};

export function Button({ variant = 'primary', type = 'button', className, ...rest }: ButtonProps) {
  const cls = className ? `${classes[variant]} ${className}` : classes[variant];
  return <button type={type} className={cls} {...rest} />;
}
