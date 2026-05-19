/* ── Client-side hash router ─────────────────────────────────────────────── *
 * Routes:
 *   #/home           → HomeScreen
 *   #/list           → ListScreen
 *   #/detail?id=<N>  → DetailScreen
 *
 * Plain DOM addEventListener — no library, no framework.
 * Stage 1 will inventory these routes for NavigationStack mapping.
 * ─────────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  /** @type {HTMLElement} */
  const screenRoot = document.getElementById('screen-root');

  // Route table: path prefix → screen factory function
  const routes = {
    '/home':   renderHome,
    '/list':   renderList,
    '/detail': renderDetail,
  };

  /**
   * Parse the current window.location.hash into { path, params }.
   * Hash format: #/path?key=value&key2=value2
   */
  function parseHash() {
    const raw = window.location.hash.replace(/^#/, '') || '/home';
    const [path, qs] = raw.split('?');
    const params = {};
    if (qs) {
      qs.split('&').forEach(pair => {
        const [k, v] = pair.split('=');
        if (k) params[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
      });
    }
    return { path: path || '/home', params };
  }

  /** Update nav link active state */
  function syncNav(path) {
    document.querySelectorAll('.nav-link').forEach(link => {
      const route = link.dataset.route;
      const active = path.startsWith('/' + route);
      link.classList.toggle('active', active);
    });
  }

  /** Dispatch to the correct screen factory */
  function navigate() {
    const { path, params } = parseHash();
    syncNav(path);

    // Find the matching route (longest prefix wins)
    const match = Object.keys(routes).find(r => path === r || path.startsWith(r));
    const factory = match ? routes[match] : null;

    if (!factory) {
      screenRoot.innerHTML = `<div class="empty-state"><p>404 — route not found: <code>${path}</code></p></div>`;
      return;
    }

    // Clear previous content, then render
    screenRoot.innerHTML = '';
    const node = factory(params);
    if (node) screenRoot.appendChild(node);
  }

  // Trigger on hash change and on first load
  window.addEventListener('hashchange', navigate);
  window.addEventListener('DOMContentLoaded', navigate);
}());
