import type { ReactNode } from 'react';
import { Icon } from './Icon';

type BannerVariant = 'error' | 'info' | 'success';

interface BannerProps {
  variant: BannerVariant;
  children: ReactNode;
  /** Called when the user dismisses the banner. Omit to hide the dismiss button. */
  onDismiss?: () => void;
  className?: string;
}

const iconName: Record<BannerVariant, string> = {
  error: 'error',
  info: 'info',
  success: 'check_circle',
};

const variantClass: Record<BannerVariant, string> = {
  error: 'bo-banner bo-banner-error',
  info: 'bo-banner bo-banner-info',
  success: 'bo-banner bo-banner-success',
};

/**
 * Banner for inline messages.
 * Errors use role="alert" (assertive); info/success use role="status" (polite).
 */
export function Banner({ variant, children, onDismiss, className }: BannerProps) {
  const role = variant === 'error' ? 'alert' : 'status';
  const cls = className ? `${variantClass[variant]} ${className}` : variantClass[variant];

  return (
    <div className={cls} role={role}>
      <Icon name={iconName[variant]} className="bo-banner-icon" />
      <div className="bo-banner-body">{children}</div>
      {onDismiss && (
        <button
          type="button"
          className="bo-banner-dismiss"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <Icon name="close" />
        </button>
      )}
    </div>
  );
}
