/* Preserve each legacy application's runtime and database connections.
   Only in-app HTML navigation is reported to the parent portal. */
(() => {
  'use strict';
  const script = document.currentScript;
  const appId = script?.dataset?.portalApp || '';
  const protocol = location.protocol;
  const inPortal = window.parent !== window && protocol !== 'file:';
  const map = {
    'dashboard.html': 'orders-dashboard',
    'dashboard(3).html': 'orders-dashboard',
    'index.html': 'order-entry',
    'production.html': 'production-board',
    'print.html': 'order-print',
    'print1.html': 'order-print-old',
    'cash_mony.html': 'cash-manager',
    'cash_mony _dashboard.html': 'cash-monitor'
  };
  if (!inPortal) {
    // Navigation convenience, not access control: Firestore rules must enforce real security.
    if (protocol === 'https:' || (protocol === 'http:' && location.hostname)) {
      const target = '../index.html#app=' + encodeURIComponent(appId);
      if (appId) location.replace(target);
    }
    return;
  }
  let lastActivityPing = 0;
  const reportActivity = () => {
    if (Date.now() - lastActivityPing < 8000) return;
    lastActivityPing = Date.now();
    try { window.parent.postMessage({ type:'jar-portal:activity' }, location.origin); } catch (_) {}
  };
  for (const eventName of ['pointerdown','keydown','touchstart','wheel']) {
    document.addEventListener(eventName, reportActivity, {passive:true});
  }
  document.addEventListener('click', e => {
    if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const anchor = e.target.closest?.('a[href]');
    if (!anchor || anchor.hasAttribute('download')) return;
    let url;
    try { url = new URL(anchor.href, location.href); } catch (_) { return; }
    if (url.origin !== location.origin) return;
    const name = decodeURIComponent(url.pathname.split('/').pop() || '');
    if (!map[name]) return;
    e.preventDefault();
    window.parent.postMessage({ type:'jar-portal:navigate', appId:map[name] }, location.origin);
  });
  try {
    window.parent.postMessage({ type:'jar-portal:loaded', appId }, location.origin);
  } catch (_) { /* An app may also work in a standalone container. */ }
})();
