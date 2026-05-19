/* ── Home screen ─────────────────────────────────────────────────────────── *
 * Route: #/home
 * Shows: hero text, summary stats derived from TASKS, two CTA buttons.
 * Tier-1 surface: text, buttons, stat cards, flex layout.
 * ─────────────────────────────────────────────────────────────────────────── */

/* global TASKS */

function renderHome(/* params */) {
  'use strict';

  const total    = TASKS.length;
  const done     = TASKS.filter(t => t.done).length;
  const pending  = total - done;
  const highPri  = TASKS.filter(t => t.priority === 'high' && !t.done).length;

  const screen = document.createElement('section');
  screen.className = 'screen';
  screen.setAttribute('aria-label', 'Home');

  screen.innerHTML = `
    <div class="home-hero">
      <h1>TaskFlow</h1>
      <p>A simple task manager — open <code>index.html</code> directly, no build required.</p>
    </div>

    <div class="home-stats" role="list" aria-label="Summary stats">
      <div class="stat-card" role="listitem">
        <span class="stat-value">${total}</span>
        <span class="stat-label">Total</span>
      </div>
      <div class="stat-card" role="listitem">
        <span class="stat-value">${pending}</span>
        <span class="stat-label">Pending</span>
      </div>
      <div class="stat-card" role="listitem">
        <span class="stat-value">${done}</span>
        <span class="stat-label">Done</span>
      </div>
      <div class="stat-card" role="listitem">
        <span class="stat-value">${highPri}</span>
        <span class="stat-label">High priority</span>
      </div>
    </div>

    <div class="home-cta">
      <a href="#/list" class="btn btn-primary">View Tasks</a>
      <a href="#/detail?id=1" class="btn btn-secondary">Sample Detail</a>
    </div>
  `;

  return screen;
}
