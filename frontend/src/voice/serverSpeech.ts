import { postConsent } from '../api/registrations';
import type { ApiConfig } from '../api/client';
import { getSpeechConsent } from '../a11y/settings';

// What the server can do with a recorded answer (GET /config → speech), set once the partner
// settings are loaded (App.tsx).
let cloud = false;

export function setServerSpeech(speech?: { cloud_available?: boolean } | null): void {
  cloud = !!speech?.cloud_available;
}

/** The server has a cloud speech-to-text service (Addis AI, Azure), used with consent. */
export function serverCloudSpeech(): boolean {
  return cloud;
}

/**
 * Amharic answers go to the server's speech service when it has one: browsers recognise
 * Amharic poorly (Chrome often returns nothing), Addis AI is made for it. English keeps the
 * browser's own recognition, which works well in Chrome.
 */
export function preferServerSpeech(lang: string): boolean {
  return cloud && lang.toLowerCase().startsWith('am');
}

// Registrations whose "yes" to cloud speech the server has (this page load).
const consentSent = new Set<string>();

export function markCloudConsentSent(registrationId: string): void {
  consentSent.add(registrationId);
}

/**
 * The server uses a cloud service only with the learner's recorded consent. The answer is
 * remembered on this device, but may have been given before this registration existed (or on
 * the profile or job pages): send the "yes" once before the first clip.
 */
export async function syncCloudConsent(cfg: ApiConfig, registrationId?: string): Promise<void> {
  if (!registrationId || getSpeechConsent() !== true || consentSent.has(registrationId)) return;
  consentSent.add(registrationId);
  try {
    await postConsent(cfg, registrationId, 'cloud_speech', true, 'tap');
  } catch {
    consentSent.delete(registrationId); // try again with the next clip
  }
}
