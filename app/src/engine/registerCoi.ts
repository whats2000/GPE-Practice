/**
 * Register the COI service worker (gzuidhof/coi-serviceworker), which
 * synthesizes COOP + COEP headers client-side. GitHub Pages can't send these
 * headers, but emception needs `crossOriginIsolated === true` to use
 * SharedArrayBuffer.
 *
 * On the first ever page load, the SW registers and the page is reloaded once
 * to pick up the synthesized headers. After that, every subsequent visit has
 * isolation immediately.
 */
export async function registerCoiServiceWorker(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  if (import.meta.env.MODE === 'test') return

  try {
    await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}coi-serviceworker.js`)
  } catch (e) {
    console.warn('[gpe] coi-serviceworker failed to register:', e)
  }
}
