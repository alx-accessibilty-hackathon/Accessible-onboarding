// R1: move focus to the new step's heading, but only after the person moved on themselves.
// Never on first load: the widget must not take focus away from the host page (W3).
export function focusHeading(heading: HTMLElement | null, userNavigated: boolean): void {
  if (!userNavigated || !heading) return;
  heading.focus();
}
