/* ── Detail screen ───────────────────────────────────────────────────────── *
 * Route: #/detail?id=<N>
 * Shows: task card with image placeholder, metadata chips, description,
 *        and a canvas-based progress sparkline (Tier-3 surface).
 *
 * The sparkline uses <canvas> with plain 2D context drawing.
 * Stage 1 route inventory will capture this screen.
 * Stage 3 NavigationStack will map it as a pushed detail view.
 * Stage risk-triage.json will flag the canvas section as Tier-3.
 * ─────────────────────────────────────────────────────────────────────────── */

/* global TASKS */

function renderDetail(params) {
  'use strict';

  const id   = parseInt(params.id, 10);
  const task = TASKS.find(t => t.id === id);

  const screen = document.createElement('section');
  screen.className = 'screen';
  screen.setAttribute('aria-label', 'Task detail');

  if (!task) {
    screen.innerHTML = `
      <a href="#/list" class="detail-back">← Back to list</a>
      <div class="empty-state">
        <p>Task #${id} not found.</p>
        <a href="#/list" class="btn btn-secondary">Go to list</a>
      </div>
    `;
    return screen;
  }

  // ── Static markup for Tier-1 surfaces ──
  screen.innerHTML = `
    <a href="#/list" class="detail-back">← Back to list</a>

    <article class="detail-card">
      <!-- Image placeholder — maps to AsyncImage in SwiftUI -->
      <div class="detail-image-placeholder" aria-label="Task cover image placeholder">
        Cover image
      </div>

      <div class="detail-body">
        <h1 class="detail-title">${task.title}</h1>

        <div class="detail-meta-row">
          <span class="detail-chip">${task.category}</span>
          <span class="detail-chip priority-chip" data-priority="${task.priority}">${task.priority} priority</span>
          <span class="detail-chip">${task.done ? '✓ Done' : 'Pending'}</span>
          <span class="detail-chip">Due ${task.dueDate}</span>
        </div>

        <p class="detail-desc">${task.description}</p>
      </div>
    </article>

    <!-- TIER3: canvas custom drawing -->
    <div class="sparkline-section">
      <h3>Progress history (last 8 entries)</h3>
      <canvas id="sparkline-canvas"
              width="600"
              height="80"
              aria-label="Progress sparkline chart"
              role="img">
        Progress values: ${task.progress.join(', ')}
      </canvas>
    </div>

    <div style="display:flex; gap:var(--space-3); flex-wrap:wrap;">
      <a href="#/list" class="btn btn-secondary">← All tasks</a>
      <a href="#/home" class="btn btn-secondary">Home</a>
    </div>
  `;

  // ── Canvas sparkline — Tier-3 surface ─────────────────────────────────────
  // This tiny canvas draw is the explicit Tier-3 region.
  // risk-triage.json should flag #sparkline-canvas as requiring human review
  // before any SwiftUI port attempt (Charts.framework vs custom Path).
  // <!-- TIER3: canvas custom drawing -->
  drawSparkline(screen.querySelector('#sparkline-canvas'), task.progress);

  return screen;
}

/**
 * Draw a minimal line sparkline onto the given canvas element.
 * Uses only the 2D canvas API — no library.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {number[]} values  Array of progress percentages (0–100)
 */
function drawSparkline(canvas, values) {
  'use strict';

  if (!canvas || !canvas.getContext) return;

  const ctx    = canvas.getContext('2d');
  const dpr    = window.devicePixelRatio || 1;
  const w      = canvas.clientWidth  || 600;
  const h      = canvas.clientHeight || 80;

  // Resize for device pixel ratio
  canvas.width  = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  const pad    = 12;
  const min    = 0;
  const max    = 100;
  const rangeX = w - pad * 2;
  const rangeY = h - pad * 2;

  // Map a value to canvas coordinates
  function xAt(i) { return pad + (i / (values.length - 1)) * rangeX; }
  function yAt(v) { return pad + (1 - (v - min) / (max - min)) * rangeY; }

  // Detect dark mode for color
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const lineColor = dark ? '#0a84ff' : '#007aff';
  const fillFrom  = dark ? 'rgba(10,132,255,0.25)' : 'rgba(0,122,255,0.12)';
  const dotColor  = dark ? '#ffffff' : '#007aff';

  // Area fill
  ctx.beginPath();
  ctx.moveTo(xAt(0), yAt(values[0]));
  for (let i = 1; i < values.length; i++) {
    ctx.lineTo(xAt(i), yAt(values[i]));
  }
  ctx.lineTo(xAt(values.length - 1), h - pad);
  ctx.lineTo(xAt(0), h - pad);
  ctx.closePath();
  ctx.fillStyle = fillFrom;
  ctx.fill();

  // Line stroke
  ctx.beginPath();
  ctx.moveTo(xAt(0), yAt(values[0]));
  for (let i = 1; i < values.length; i++) {
    ctx.lineTo(xAt(i), yAt(values[i]));
  }
  ctx.strokeStyle = lineColor;
  ctx.lineWidth   = 2;
  ctx.lineJoin    = 'round';
  ctx.stroke();

  // Data point dots
  ctx.fillStyle = dotColor;
  values.forEach((v, i) => {
    ctx.beginPath();
    ctx.arc(xAt(i), yAt(v), 3, 0, Math.PI * 2);
    ctx.fill();
  });

  // Last value label
  const lastX = xAt(values.length - 1);
  const lastY = yAt(values[values.length - 1]);
  ctx.fillStyle   = lineColor;
  ctx.font        = `bold ${11 * dpr / dpr}px -apple-system, sans-serif`;
  ctx.textAlign   = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${values[values.length - 1]}%`, lastX - 4, lastY - 4);
}
