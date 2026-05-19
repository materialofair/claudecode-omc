/* ── List screen ─────────────────────────────────────────────────────────── *
 * Route: #/list
 * Shows: filterable task list loaded from window.TASKS (in-file JS array).
 * Tier-1 surface: list rows, badges, flex layout, text.
 * ─────────────────────────────────────────────────────────────────────────── */

/* global TASKS */

function renderList(/* params */) {
  'use strict';

  const screen = document.createElement('section');
  screen.className = 'screen';
  screen.setAttribute('aria-label', 'Task list');

  // ── State ──
  let filter = 'all'; // 'all' | 'pending' | 'done'

  function filteredTasks() {
    if (filter === 'pending') return TASKS.filter(t => !t.done);
    if (filter === 'done')    return TASKS.filter(t => t.done);
    return TASKS;
  }

  // ── Render task rows ──
  function buildTaskList() {
    const tasks = filteredTasks();

    if (tasks.length === 0) {
      return `<div class="empty-state"><p>No tasks in this filter.</p></div>`;
    }

    const rows = tasks.map(task => `
      <li class="task-row ${task.done ? 'task-done' : ''}"
          data-id="${task.id}"
          role="button"
          tabindex="0"
          aria-label="${task.title}, ${task.priority} priority, ${task.done ? 'done' : 'pending'}">
        <span class="task-dot priority-${task.priority}" aria-hidden="true"></span>
        <div class="task-info">
          <span class="task-title">${task.title}</span>
          <span class="task-meta">${task.category} · Due ${task.dueDate}</span>
        </div>
        <span class="task-badge">${task.priority}</span>
      </li>
    `).join('');

    return `<ul class="task-list" aria-label="Tasks">${rows}</ul>`;
  }

  // ── Full render ──
  function render() {
    screen.innerHTML = `
      <div class="list-header">
        <h2>Tasks</h2>
        <div style="display:flex; gap:var(--space-2)">
          <button class="btn btn-secondary ${filter === 'all'     ? 'active' : ''}" data-filter="all">All</button>
          <button class="btn btn-secondary ${filter === 'pending' ? 'active' : ''}" data-filter="pending">Pending</button>
          <button class="btn btn-secondary ${filter === 'done'    ? 'active' : ''}" data-filter="done">Done</button>
        </div>
      </div>
      ${buildTaskList()}
    `;

    // Bind filter buttons
    screen.querySelectorAll('[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        filter = btn.dataset.filter;
        render();
      });
    });

    // Bind task rows → navigate to detail
    screen.querySelectorAll('.task-row').forEach(row => {
      function goDetail() {
        window.location.hash = `#/detail?id=${row.dataset.id}`;
      }
      row.addEventListener('click', goDetail);
      row.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goDetail(); }
      });
    });
  }

  render();
  return screen;
}
