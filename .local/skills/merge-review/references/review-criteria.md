# Review Criteria

Generic code review criteria that apply regardless of project-specific conventions. For Loomy-specific rules, always read the current AGENTS.md file.

## Code Quality

- Clean separation of concerns?
- Proper error handling?
- DRY principle followed?
- Edge cases handled?

## Architecture

- Sound design decisions?
- Performance implications?
- Security concerns (XSS, injection, etc.)?

## Loomy High-Risk Change Checklist

When the diff touches any of the following areas, apply the corresponding checks. Skip sections that are not relevant to the current change.

### IPC Changes (new or modified `ipcMain.handle` / `window.electronAPI.*`)

- [ ] Handler registered in `electron/main.js` (or delegated service)
- [ ] Bridge method exposed in `electron/preload.js` via `contextBridge`
- [ ] Type declaration added/updated in `src/electron.d.ts`
- [ ] Channel naming follows `domain:action` convention (e.g. `opencode:session:list`)
- [ ] Handler returns `{ success, error }` format with try-catch
- [ ] All three files are in the same commit (or same MR)

### Electron Main Process Security

- [ ] Renderer code does NOT import `fs`, `path`, `child_process`, or any Node.js module directly
- [ ] All Node.js operations go through `window.electronAPI.*` preload bridge
- [ ] External URLs opened via `shell.openExternal`, not loaded in main window
- [ ] File path construction uses `path.join`, not string concatenation
- [ ] `contextBridge` exposed methods validate parameters

### State Management (localStorage)

- [ ] New keys follow naming convention: `loomy-*` for tasks, `ohh-*` for settings/workspace
- [ ] No key name collisions with existing keys (check: `loomy-tasks`, `loomy-current-task`, `ohh-model-settings`, `ohh-workspace-dir`, `ohh-theme-*`)
- [ ] Reads handle missing/malformed values gracefully (JSON.parse in try-catch with fallback)
- [ ] State updates in hooks use functional form of setState to avoid stale closures

### Streaming / Event Listeners

- [ ] `ipcRenderer.on` listeners have matching `ipcRenderer.removeListener` in cleanup
- [ ] useEffect cleanup functions remove all registered listeners
- [ ] No listener leaks on component unmount or re-render

### Styling

- [ ] Colors use semantic CSS variables (`bg-background`, `text-foreground`), no hardcoded hex/rgb
- [ ] Basic controls use `rounded-md`, cards/panels use `rounded-lg`
- [ ] Card hover follows convention: base `border-border/60 bg-card/95 transition-all`, hover `hover:border-border hover:bg-accent/8 hover:shadow-sm`
- [ ] No inline `style` attributes or CSS modules
- [ ] `src/components/ui/` contains only generic UI components, no business logic

### Theme System

- [ ] `src/styles/themes.css` not manually edited (generated file)
- [ ] New theme variables defined in `src/styles/themes/*.json`, not in CSS
- [ ] Theme switching logic in `src/lib/theme.js` and `src/lib/theme-loader.js`

## Issue Severity

- **Critical（必须修）**: Bugs, security vulnerabilities, data loss risks, broken functionality, IPC three-file sync missing
- **Important（应该修）**: Architecture problems, missing features, poor error handling, listener leaks
- **Minor（建议改）**: Code style, optimization opportunities, naming inconsistencies

Each issue must include: file:line reference, what's wrong, why it matters.
