'use strict';

(() => {
  const VERSION_URL = './version-v622.json';
  const KEY = 'pozitron_keno_v622_client_build';
  const CHECK_MS = 60_000;
  let reloading = false;

  async function getVersion() {
    const sep = VERSION_URL.includes('?') ? '&' : '?';
    const r = await fetch(`${VERSION_URL}${sep}t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'cache-control': 'no-cache, no-store, must-revalidate',
        pragma: 'no-cache'
      }
    });
    if (!r.ok) throw new Error(`version HTTP ${r.status}`);
    return r.json();
  }

  async function check() {
    if (reloading) return;

    try {
      const fresh = await getVersion();
      const next = String(fresh?.build || '').trim();
      if (!next) return;

      const current = localStorage.getItem(KEY);

      if (!current) {
        localStorage.setItem(KEY, next);
        return;
      }

      if (current !== next) {
        reloading = true;
        localStorage.setItem(KEY, next);

        if ('serviceWorker' in navigator) {
          try {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map(r => r.update().catch(() => {})));
          } catch {}
        }

        const u = new URL(location.href);
        u.searchParams.set('_v', next);
        u.searchParams.set('_t', Date.now());
        location.replace(u.toString());
      }
    } catch (e) {
      console.warn('KENO 6.2.2: проверка версии временно недоступна', e);
    }
  }

  check();
  setInterval(check, CHECK_MS);

  window.addEventListener('focus', check);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
})();
