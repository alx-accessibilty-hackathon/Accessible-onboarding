import type { ReactNode } from 'react';
import { LiveRegion } from '../a11y/LiveRegion';

// The same frame on every screen (WCAG 3.2.3 / 3.2.6).
export function WidgetFrame({ children }: { children: ReactNode }) {
  return (
    <div className="bo-frame">
      {/* TODO (FB-1): language switch, Simple mode switch, "Get help" (same place on every screen) */}
      <div className="bo-header" />
      {children}
      {/* TODO (FB-7): status bar: "Saved on this phone only" / "Saved to your account" / "Offline" */}
      <LiveRegion />
    </div>
  );
}
