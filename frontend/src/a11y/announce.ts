// W1: one live region, mounted once (LiveRegion.tsx) and never removed.
// Status messages only change its text. Call announce() from anywhere.
let region: HTMLElement | null = null;

export function registerLiveRegion(el: HTMLElement | null): void {
  region = el;
}

export function announce(message: string): void {
  if (!region) return;
  region.textContent = ''; // clear first so a repeated message is read again
  window.setTimeout(() => {
    if (region) region.textContent = message;
  }, 100);
}
