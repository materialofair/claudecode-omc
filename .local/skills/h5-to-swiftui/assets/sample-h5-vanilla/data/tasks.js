/* ── Task data store ─────────────────────────────────────────────────────── *
 * In-file JS array — no network fetch required.
 * Stage 6 behavioral-parity will port this to a Swift @State array.
 * ─────────────────────────────────────────────────────────────────────────── */

window.TASKS = [
  {
    id: 1,
    title: 'Design system tokens',
    description: 'Define all color, spacing, and typography tokens as CSS custom properties so they can be extracted by automated tooling and mapped to SwiftUI theme values.',
    category: 'Design',
    priority: 'high',
    done: false,
    dueDate: '2026-05-22',
    progress: [40, 55, 60, 72, 85, 90, 88, 95],
  },
  {
    id: 2,
    title: 'Implement hash router',
    description: 'Build a minimal client-side router using the hashchange event. Supports three routes: home, list, and detail. No library dependencies.',
    category: 'Engineering',
    priority: 'high',
    done: false,
    dueDate: '2026-05-23',
    progress: [10, 25, 45, 68, 80, 90, 95, 100],
  },
  {
    id: 3,
    title: 'Write unit tests for router',
    description: 'Cover route matching, missing routes, and the detail screen id extraction from the URL hash fragment.',
    category: 'QA',
    priority: 'medium',
    done: true,
    dueDate: '2026-05-20',
    progress: [20, 40, 60, 80, 100, 100, 100, 100],
  },
  {
    id: 4,
    title: 'Canvas sparkline Tier-3 spike',
    description: 'Prototype the canvas-based sparkline widget on the detail screen. This surface is explicitly Tier-3 (high risk) and will require human review before SwiftUI porting.',
    category: 'Research',
    priority: 'medium',
    done: false,
    dueDate: '2026-05-28',
    progress: [5, 10, 15, 20, 30, 35, 42, 50],
  },
  {
    id: 5,
    title: 'Accessibility audit',
    description: 'Check all screens for WCAG 2.2 AA compliance: color contrast ratios, focus management, ARIA labels, and keyboard navigation.',
    category: 'Accessibility',
    priority: 'low',
    done: false,
    dueDate: '2026-06-01',
    progress: [0, 0, 5, 5, 10, 15, 20, 28],
  },
  {
    id: 6,
    title: 'Dark mode tokens',
    description: 'Add @media (prefers-color-scheme: dark) overrides for every CSS custom property in tokens.css.',
    category: 'Design',
    priority: 'low',
    done: true,
    dueDate: '2026-05-19',
    progress: [30, 55, 70, 85, 90, 95, 98, 100],
  },
];
