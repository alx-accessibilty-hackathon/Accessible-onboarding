// Events out (W5): every event bubbles and is composed, so it leaves the shadow root and
// reaches the host page. `detail` never contains personal data.
export type WidgetEvent =
  | 'ready'
  | 'step-changed'
  | 'saved'
  | 'completed'
  | 'support-requested'
  | 'application-submitted'
  | 'error';

export function emit(fromEl: Element, name: WidgetEvent, detail: object = {}): void {
  const root = fromEl.getRootNode();
  // Inside the custom element the root is a ShadowRoot; in unit tests it's the document.
  const target = root instanceof ShadowRoot ? root.host : fromEl;
  target.dispatchEvent(
    new CustomEvent(`bridge-onboarding:${name}`, { detail, bubbles: true, composed: true }),
  );
}
