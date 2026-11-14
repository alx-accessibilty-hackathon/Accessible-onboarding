// Entry for our own hosted sign-up page (index.html).
import './widget/element';

// Register service worker in production for offline PWA support
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline fallback still works via IndexedDB
    });
  });
}
