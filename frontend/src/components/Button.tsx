import { forwardRef, type ButtonHTMLAttributes } from 'react';

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

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', type = 'button', className, ...rest },
  ref,
) {
  const cls = className ? `${classes[variant]} ${className}` : classes[variant];
  return <button ref={ref} type={type} className={cls} {...rest} />;
});
