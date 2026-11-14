import type { ReactNode } from 'react';

// Text for screen readers only, e.g. the "Error:" prefix or "Change <step name>".
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="bo-visually-hidden">{children}</span>;
}
