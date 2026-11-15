// W1: one live region, mounted once (LiveRegion.tsx) and never removed.
// Status messages only change its text. Call announce() from anywhere.
let region: HTMLElement | null = null;

export function registerLiveRegion(el: HTMLElement | null): void {
  region = el;
}

/** A piece of a message in another language than the widget's (e.g. the Amharic half). */
export interface AnnouncePart {
  text: string;
  lang?: string;
}

export function announce(message: string | AnnouncePart[]): void {
  if (!region) return;
  region.textContent = ''; // clear first so a repeated message is read again
  window.setTimeout(() => {
    if (!region) return;
    if (typeof message === 'string') {
      region.textContent = message;
      return;
    }
    // Each part in its own language, so a screen reader can switch voice.
    for (const part of message) {
      const span = document.createElement('span');
      if (part.lang) span.lang = part.lang;
      span.textContent = `${part.text} `;
      region.appendChild(span);
    }
  }, 100);
}
