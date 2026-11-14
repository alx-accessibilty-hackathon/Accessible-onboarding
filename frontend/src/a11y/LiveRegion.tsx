import { useEffect, useRef } from 'react';
import { registerLiveRegion } from './announce';

// Mounted once in WidgetFrame. Screen readers read its text changes without moving focus.
export function LiveRegion() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    registerLiveRegion(ref.current);
    return () => registerLiveRegion(null);
  }, []);

  return <div ref={ref} role="status" aria-live="polite" className="bo-visually-hidden" />;
}
