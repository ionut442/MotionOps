# Phase 02 Verification

Date: 2026-07-13

## P2-001 Resizable Plugin Shell

Status: DONE.

### Existing UI Architecture Found

- React 19 and Vite 7 render `src/ui/index.tsx` into the shared `index.html` root.
- The UI process sends typed messages with `parent.postMessage({ pluginMessage }, "*")`.
- The plugin process owns `figma.showUI`, `figma.ui.onmessage`, `figma.ui.postMessage`, and all Figma API access.
- Shared runtime message validation already lived in `src/shared/messages.ts`; P2-001 extended that bridge instead of adding a second bus.
- The previous visible UI was the Phase 0 Motion API Lab surface. P2-001 replaces the production surface with a reusable shell and leaves feature workflows unimplemented.

### Files Added Or Changed

- `src/shared/pluginWindow.ts`
- `src/shared/messages.ts`
- `src/plugin/main.ts`
- `src/plugin/windowResize.ts`
- `src/ui/App.tsx`
- `src/ui/styles.css`
- `tests/pluginWindow.test.ts`
- `tests/windowResize.test.ts`
- `tests/messages.test.ts`
- `tests/ui/smoke.spec.ts`
- `tests/ui/motion-api-lab.spec.ts`
- `tests/buildArtifacts.test.mjs`
- `docs/implementation/TASK_LEDGER.md`
- `docs/implementation/DECISIONS.md`
- `docs/implementation/KNOWN_LIMITATIONS.md`
- `docs/verification/PHASE-02.md`

### Shell Structure

- Header region: product identity and plugin connection status.
- Navigation region: static placeholder only.
- Main workspace region: static placeholder and the only scrollable primary content region.
- Context region: static placeholder, right side at wide widths and below the main area at narrow supported widths.
- Footer region: diagnostic request/message text only.
- Resize handle: lower-right accessible button with `aria-label="Resize plugin window"`.

### Sizing And Resize Contract

- Default size: `1080x760`.
- Minimum size: `760x560`.
- Maximum policy: no explicit maximum is applied in P2-001; dimensions are only finite-number validated, rounded to integers, and clamped to the minimum.
- UI emits `RESIZE_PLUGIN_WINDOW` with `requestId` and serializable `{ width, height }` payload.
- Plugin handles resize requests with `figma.ui.resize(width, height)` after shared normalization.
- Malformed messages are rejected by existing message validation. Resize failures become safe plugin errors and do not crash message handling.

### Responsive And Accessibility Behavior

- Wide layout uses navigation, main, and context columns; main receives the largest flexible share.
- Narrow supported layout uses navigation plus main in the first row and moves context below them.
- `body` and root fill the plugin viewport, prevent horizontal document scrolling, and keep main overflow contained.
- Global focus-visible styling and reduced-motion rules are present.
- The resize handle is keyboard-focusable and named, but keyboard resizing is not implemented in P2-001.

### Tests Run

| Command | Result | Notes |
|---|---|---|
| `rtk npm run verify` before coding | PASS | Baseline Phase 1 gate passed: 24 files, 271 tests; build-artifacts 2 tests. |
| `rtk npm run test -- tests/pluginWindow.test.ts tests/windowResize.test.ts tests/messages.test.ts` | PASS | 3 files, 17 tests. |
| Node REPL compact validation | PASS | Fractional, below-minimum, and negative size normalization cases passed. |
| `rtk npm run typecheck` | PASS | App/test and plugin TypeScript configs passed. |
| `rtk npm run lint` | PASS | ESLint passed. |
| `rtk npm run test` | PASS | 26 files, 282 tests. |
| `rtk npm run test:ui -- tests/ui/smoke.spec.ts tests/ui/motion-api-lab.spec.ts` | PASS | 5 Chromium shell tests passed. |
| `rtk npm run build` | PASS | Production plugin/UI build passed and inlined 1 script and 1 stylesheet. |
| `rtk npm run test:build-artifacts` | PASS | 2 Node build-artifact tests passed. |
| `rtk npm run verify` | PASS | Final canonical gate passed after docs and implementation. |

### Standalone Visual Review

Performed with standalone Vite UI at `http://127.0.0.1:5173/` using Playwright viewport inspection.

| Viewport | Result |
|---|---|
| `1080x760` default | No horizontal overflow, shell height matched viewport, wide density, main/context visible, resize handle visible/focusable. |
| `760x560` minimum | No horizontal overflow, shell height matched viewport, narrow density, main/context visible, resize handle visible/focusable. |
| `820x620` narrow | No horizontal overflow, shell height matched viewport, narrow density, main/context visible, resize handle visible/focusable. |

One development-server console error was observed for a missing resource with HTTP 404, likely favicon-related. No app runtime exception was observed.

### Scope Confirmation

- P2-002 was not started.
- No workspace navigation behavior was implemented.
- No application state machine was implemented.
- No Scope, Inspector, Edit, Sequence, or Review functionality was implemented.
- No feature-specific controls or fake Motion data were rendered.
- No live Figma Motion tests were run.
- No analytics, telemetry, or network call was added.
- No commit or push was performed.

## P2-002 Five-Workspace Navigation

Status: DONE.

### Existing Navigation Found

- The P2-001 shell had semantic header, navigation, main, context, footer, and resize regions.
- The navigation and main workspace regions contained static placeholders only.
- No competing workspace router, application state machine, feature-specific controls, Figma global access, Motion adapter import, analytics, network request, or plugin message existed for workspace switching.
- P2-001 was already `DONE`; P2-002 was updated from the placeholder ledger title to five-workspace navigation. P2-003 was materialized as `NOT_STARTED` only to preserve the dependency boundary.

### Files Added Or Changed

- `src/ui/workspaces.ts`
- `src/ui/App.tsx`
- `src/ui/styles.css`
- `tests/workspaces.test.ts`
- `tests/ui/smoke.spec.ts`
- `tests/buildArtifacts.test.mjs`
- `docs/implementation/TASK_LEDGER.md`
- `docs/implementation/DECISIONS.md`
- `docs/verification/PHASE-02.md`

### Workspace Model And Ordering

- `src/ui/workspaces.ts` defines `WorkspaceId`, `WorkspaceDefinition`, `WorkspaceNavigationState`, `WORKSPACES`, `INITIAL_WORKSPACE_ID`, stable tab/panel ID helpers, index lookup, and safe external parsing.
- Workspace order is Scope, Inspect, Edit, Sequence, Review.
- Scope is the deterministic initial workspace.
- Workspace identity is serializable and uses typed IDs only.

### Navigation Semantics And State

- The shell navigation now renders a vertical ARIA tablist.
- Each workspace item is a tab with `aria-selected`, `aria-controls`, stable tab ID, visible text label, visible focus state, and roving `tabIndex`.
- The active workspace renders one neutral `tabpanel` labelled by the active tab.
- Active-workspace ownership is local React `useState`; it is intentionally session-only and resets to Scope after refresh or reopen.
- No plugin-data persistence, local storage, backend storage, plugin message, Motion adapter call, Figma API call, analytics event, or network request was added.

### Keyboard And Responsive Behavior

- `Tab` reaches the active tab, and a second `Tab` reaches the active panel.
- `ArrowDown`/`ArrowRight` activate the next workspace; `ArrowUp`/`ArrowLeft` activate the previous workspace.
- Arrow navigation wraps at first and last workspace.
- `Home` activates Scope. `End` activates Review.
- `Enter` and `Space` activate the focused tab without changing the policy.
- Responsive review covered `1080x760`, `820x620`, and `760x560`; all five labels remained visible/reachable, active state was shape/text-decoration based as well as color, focus outlines were visible, no horizontal document overflow appeared, main did not overlap navigation, and the resize handle remained visible.

### Tests Run

| Command | Result | Notes |
|---|---|---|
| `rtk npm run verify` before coding | PASS | Baseline gate passed: 26 files, 282 tests; build-artifacts 2 tests. |
| Node REPL compact validation | PASS | Five IDs, Scope initial, unique labels/IDs, stable tab/panel IDs, wrapped previous/next transitions. |
| `rtk npm run test -- tests/workspaces.test.ts` | PASS | 1 file, 5 tests. |
| `rtk npm run test:ui -- tests/ui/smoke.spec.ts` | PASS | 8 Chromium tests after the panel accessible-name assertion was aligned to tab labelling. |
| `rtk npm run typecheck` | PASS | App/test and plugin TypeScript configs passed. |
| `rtk npm run lint` | PASS | ESLint passed. |
| `rtk npm run test` | PASS | 27 files, 287 tests. |
| `rtk npm run build` | PASS | Production plugin/UI build passed and inlined 1 script and 1 stylesheet. |
| `rtk npm run test:build-artifacts` | PASS | 2 Node build-artifact tests passed and assert production navigation labels. |
| `rtk npm run verify` | PASS | Final canonical gate passed after docs and implementation. |

### Standalone Visual Review

Performed through the existing standalone Playwright UI setup at `http://127.0.0.1:4173/`.

| Viewport | Result |
|---|---|
| `1080x760` default | All five labels visible and reachable; Scope initially active; tabs switch panels; focus visible; no horizontal overflow; nav/main/context/footer stable; resize handle visible. |
| `820x620` narrow | All five labels visible and reachable; active state clear without relying only on color; no horizontal overflow; main did not overlap navigation; context stayed below main. |
| `760x560` minimum | All five labels visible and reachable; keyboard navigation worked; active panel changed correctly; no horizontal overflow; resize handle remained visible. |

The existing development-server favicon 404 remains harmless if observed. No application runtime exception was observed.

### Scope Confirmation

- P2-003 was not started.
- No application state machine, document state, selection state, scan state, draft state, write state, QA state, standards state, or reducer was added.
- No Scope, Inspect, Edit, Sequence, Review feature functionality was implemented.
- No Motion scanning, Motion adapter import, raw Motion type, Figma API call, node lookup, analytics event, network call, or plugin message was added for navigation.
- No live Figma Motion tests were run.
- The pending live-Figma desktop resize verification from P2-001 remains documented and was not reopened.
- No commit or push was performed.

## P2-003 Application State Machine

Status: DONE.

### Initial Consistency Check

- `TASK_LEDGER.md` defined P2-003 as "Implement application state machine" with dependency P2-002.
- P2-001 and P2-002 were `DONE` before implementation.
- P2-003 was the only task moved forward. P2-004 was materialized as `NOT_STARTED` to preserve the header/status boundary.
- Pre-change `rtk npm run verify` was attempted and timed out after 120 seconds before implementation; no source failure was observed in that truncated run.
- Existing UI state ownership was local shell state only: connection status, last plugin message/request, window size, resize drag state, and local active workspace.
- No competing application reducer or lifecycle state machine existed.
- `App.tsx` contained no hidden feature-specific state and did not import Figma globals or the Motion adapter.
- Workspace navigation remained session-local per DEC-041 and was not moved into the lifecycle machine.

### Files Added Or Changed

- `src/ui/applicationState.ts`
- `src/ui/applicationStateContext.ts`
- `src/ui/ApplicationStateProvider.tsx`
- `src/ui/index.tsx`
- `tests/applicationState.test.ts`
- `tests/applicationStateProvider.test.tsx`
- `tests/ui/smoke.spec.ts`
- `docs/implementation/TASK_LEDGER.md`
- `docs/implementation/DECISIONS.md`
- `docs/implementation/KNOWN_LIMITATIONS.md`
- `docs/verification/PHASE-02.md`

### State And Event Model

- `ApplicationState` is a discriminated union with statuses `initializing`, `synced`, `draft`, `applying`, `stale`, and `error`.
- Draft state may carry only an optional `draftId`; applying state carries `operationId` and `startedFrom: "draft"`.
- Stale state carries a small generic `ApplicationStaleReason` and previous stable status.
- Error state carries a safe serializable `ApplicationStateError` with stable code, summary, recoverability, and optional stage.
- Events are a closed union for initialization success/failure, draft change/clear, apply start/success/failure, document stale, sync restored/failed, and reset.
- State and events contain no raw `Error`, React node, callback, Figma object, Motion snapshot, selection, scope, scan result, change plan, QA result, standards data, clipboard data, sequencer state, or resize interaction state.

### Transition Policy

| Current state | Valid events | Result |
|---|---|---|
| `initializing` | `INITIALIZATION_SUCCEEDED` | `synced` |
| `initializing` | `INITIALIZATION_FAILED` | `error` |
| `synced` | `DRAFT_CHANGED` | `draft` |
| `synced` | `DOCUMENT_STALE` | `stale` from `synced` |
| `draft` | `DRAFT_CHANGED` | updated `draft` |
| `draft` | `DRAFT_CLEARED` | `synced` |
| `draft` | `APPLY_STARTED` | `applying` with operation ID |
| `draft` | `DOCUMENT_STALE` | `stale` from `draft` |
| `applying` | `APPLY_SUCCEEDED` | `synced` |
| `applying` | `APPLY_FAILED` | `error` from draft recovery point |
| `applying` | `DOCUMENT_STALE` | `stale` from `applying` |
| `stale` | `SYNC_RESTORED` | `synced` |
| `stale` | `SYNC_FAILED` | `error` from stale recovery point |
| recoverable `error` | `SYNC_RESTORED` | `synced` |
| any state | `RESET` | `initializing` |

Invalid transitions return `{ ok: false, state, error }`, preserve the original state object, and include the current status plus attempted event type. Invalid transitions are not silently ignored and do not automatically move the lifecycle into `error`.

### React Integration

- `ApplicationStateProvider` wraps the production app in `src/ui/index.tsx`.
- `useApplicationState` exposes the current lifecycle state.
- `useApplicationStateDispatch` sends typed events and returns the transition result, including invalid-transition failures.
- Tests may inject a deterministic `initialState`.
- Provider instances do not share mutable state.
- The provider has no persistence, network behavior, plugin messaging, global singleton, automatic event dispatch, visible controls, or Figma dependency.

### Session And Navigation Policy

- Lifecycle state is session-only. It is not stored in local storage, plugin data, backend storage, or reopened plugin state.
- Plugin reopen starts at `initializing`; interrupted apply state is not restored.
- Workspace navigation remains a separate local state system owned by `App.tsx`.
- Navigation switching does not alter lifecycle state; lifecycle events do not switch workspaces.
- No workspace is disabled, badged, or rendered with lifecycle status in P2-003.

### Tests Run

| Command | Result | Notes |
|---|---|---|
| `rtk npm run verify` before coding | TIMEOUT | Timed out after 120 seconds before source edits; recorded as pre-existing inconclusive timeout. |
| Node REPL transition-table validation | PASS | 6 states, 11 events, 66 combinations mapped with explicit valid/invalid outcomes. |
| `rtk npm run test -- tests/applicationState.test.ts tests/applicationStateProvider.test.tsx` | PASS | 2 files, 23 tests. |
| `rtk npm run typecheck` | PASS | App/test and plugin TypeScript configs passed. |
| `rtk npm run lint` | PASS | ESLint passed. |
| `rtk npm run test` | PASS | 29 files, 310 tests. |
| `rtk npm run build` | PASS | Production plugin/UI build passed and inlined 1 script and 1 stylesheet. |
| `rtk npm run test:build-artifacts` | PASS | 2 Node build-artifact tests passed. |
| `rtk npm run verify` | PASS | All 5 canonical stages passed: typecheck, lint, automated tests, production build, build-artifacts. |
| `rtk npm run test:ui -- tests/ui/smoke.spec.ts` | PASS | 8 Chromium shell/navigation tests passed. |

### Standalone Visual Review

Performed through the existing standalone Playwright UI setup at `http://127.0.0.1:4173/`.

| Viewport | Result |
|---|---|
| `1080x760` default | Shell rendered; Scope was active; all five tabs existed; switching to Inspect and back to Scope worked; no horizontal overflow; main did not overlap nav; resize handle visible; no runtime errors; no lifecycle/debug/feature controls leaked. |
| `820x620` narrow | Shell rendered; Scope was active; all five tabs existed; switching worked; no horizontal overflow; main did not overlap nav; resize handle visible; no runtime errors; no lifecycle/debug/feature controls leaked. |
| `760x560` minimum | Shell rendered; Scope was active; all five tabs existed; switching worked; no horizontal overflow; main did not overlap nav; resize handle visible; no runtime errors; no lifecycle/debug/feature controls leaked. |

### Scope Confirmation

- P2-004 was not started.
- No global header or document-status presentation was implemented.
- No Scope scanning, selection synchronization, Motion reads, editing, QA, sequencer, or feature-specific workspace state was implemented.
- No status UI, debug lifecycle controls, badges, disabled workspaces, analytics, network call, local storage, plugin data, Figma API access, or Motion adapter usage was added.
- No live Figma Motion tests were run.
- No commit or push was performed.

## P2-004 Global Header And Document Status

Status: DONE.

### Initial Consistency Check

- `TASK_LEDGER.md` defined P2-004 as "Implement global header and document status" with dependency P2-003.
- P2-001, P2-002, and P2-003 were `DONE` before implementation.
- P2-004 was the only task moved forward. P2-005 was materialized as `NOT_STARTED` to preserve the context/change-preview drawer boundary.
- Pre-change `rtk npm run verify` passed: all 5 canonical stages, 29 files, 310 tests, and 2 build-artifact tests.
- The shell header was still the static P2-001 placeholder: product eyebrow, "Production Shell" heading, and plugin connection badge.
- Lifecycle state existed through the P2-003 provider, but had no visible production presentation.
- Active workspace remained owned by local P2-002 navigation state in `App.tsx`.
- No competing header or document-status component existed.
- No hidden Scope, selection, standards, settings, or target-count behavior existed.

### Files Added Or Changed

- `src/ui/components/GlobalHeader.tsx`
- `src/ui/components/DocumentStatus.tsx`
- `src/ui/documentStatusPresentation.ts`
- `src/ui/App.tsx`
- `src/ui/styles.css`
- `tests/globalHeader.test.tsx`
- `tests/ui/smoke.spec.ts`
- `tests/buildArtifacts.test.mjs`
- `docs/implementation/TASK_LEDGER.md`
- `docs/implementation/DECISIONS.md`
- `docs/implementation/KNOWN_LIMITATIONS.md`
- `docs/verification/PHASE-02.md`

### Header Structure

- `GlobalHeader` owns the visible shell header composition.
- Product identity renders `MotionOps` as the heading.
- Workspace context accepts `activeWorkspace` as a typed prop and derives its label from `getWorkspaceById()`.
- `DocumentStatus` renders the lifecycle presentation from `getDocumentStatusPresentation()`.
- The old plugin connection badge moved to the footer diagnostic line so the global header presents document lifecycle status rather than plugin transport status.

### Lifecycle Status Mapping

| Lifecycle state | Label | Tone | Description |
|---|---|---|---|
| `initializing` | Initializing | neutral | Preparing the MotionOps interface. |
| `synced` | Synced | positive | No pending local changes are known. |
| `draft` | Draft changes | attention | Local changes have not been applied to Figma. |
| `applying` | Applying | progress | A confirmed operation is being applied. |
| `stale` | Stale | warning | The known document state has changed and must be refreshed before applying. |
| `error` | Error | critical | Safe lifecycle error summary from P2-003. |

- `applying` and `initializing` expose `aria-busy`.
- Status presentation uses visible text plus marker shape/border/tone. Error, stale, and draft are distinguishable without relying on color alone.
- `synced` wording does not claim cloud synchronization.
- `draft` wording describes local unapplied changes and does not claim the Figma document already changed.

### Privacy And Scope

- Error status shows only the safe lifecycle summary; no raw Error object, stack trace, file/page/layer/text data, Motion values, or raw thrown message channel was added.
- Stale status shows a generic status and safe stale-reason category only; it does not embed `MotionStateGuard`, fingerprints, raw stale differences, or rebase/rescan behavior.
- Operation IDs are not shown in ordinary UI.
- The header sends no plugin messages, reads no Figma global, imports no Motion adapter, performs no node lookup, and adds no analytics, network call, storage, or persistence.

### Responsive Behavior

- Wide layout uses product identity, active workspace context, and document status in one header row.
- Narrow supported layout wraps document status to a second row while keeping product identity and workspace visible.
- Tested supported dimensions are `1080x760`, `820x620`, and `760x560`.
- Header content uses constrained grid tracks, wrapping, and truncation so product identity, workspace, and status remain visible without horizontal document overflow.

### Tests Run

| Command | Result | Notes |
|---|---|---|
| `rtk npm run verify` before coding | PASS | Baseline gate passed: 29 files, 310 tests; build-artifacts 2 tests. |
| Node REPL status-map validation | PASS | 6 lifecycle statuses mapped to label, tone, and busy state. |
| `rtk npm run test -- tests/globalHeader.test.tsx tests/applicationState.test.ts tests/applicationStateProvider.test.tsx` | PASS | 3 files, 35 tests before documentation updates. |
| `rtk npm run typecheck` | PASS | App/test and plugin TypeScript configs passed. |
| `rtk npm run lint` | PASS | ESLint passed. |
| `rtk npm run test` | PASS | 30 files, 322 tests. |
| `rtk npm run build` | PASS | Production plugin/UI build passed and inlined 1 script and 1 stylesheet. |
| `rtk npm run test:build-artifacts` | PASS | 2 Node build-artifact tests passed. |
| `rtk npm run verify` | PASS | All 5 canonical stages passed: typecheck, lint, automated tests, production build, build-artifacts. |
| `rtk npm run test:ui -- tests/ui/smoke.spec.ts` | PASS | 8 Chromium header/navigation/shell tests passed. |

### Standalone Visual Review

Performed through the existing standalone Playwright UI setup at `http://127.0.0.1:4173/`.

| Viewport | Result |
|---|---|
| `1080x760` default | MotionOps identity visible; Scope active; document status visible as Initializing; Review and Scope navigation updated header workspace; no horizontal overflow; resize handle visible; no future header controls; no runtime errors. |
| `820x620` narrow | MotionOps identity visible; workspace and status visible after header wrap; navigation updated header workspace; no horizontal overflow; resize handle visible; no future header controls; no runtime errors. |
| `760x560` minimum | MotionOps identity, Scope workspace, and Initializing status remained visible; navigation updated header workspace; no horizontal overflow; resize handle visible; no future header controls; no runtime errors. |

### Scope Confirmation

- P2-005 was not started.
- No context/change-preview drawer behavior was implemented.
- No selection breadcrumb, target count, Rescan button, selection-sync toggle, standards selector, settings button, account menu, or external link was added.
- No Scope scanning, selection synchronization, Motion reads, editing, standards management, settings, or feature workflow was added.
- No Figma API, Motion adapter import, live Figma test, analytics, network call, commit, or push was performed.

## P2-005 Context/Change-Preview Drawer Shell

Status: DONE.

### Initial Consistency Check

- `TASK_LEDGER.md` had P2-001, P2-002, P2-003, and P2-004 marked `DONE`.
- P2-005 was `NOT_STARTED`; P2-006 did not yet have a ledger row and was materialized only as `NOT_STARTED` after P2-005 was completed.
- Pre-change `rtk npm run verify` passed: all 5 canonical stages, 30 files, 322 tests, and 2 build-artifact tests.
- The production shell already rendered the global header, five-workspace navigation, main workspace, footer, and resize handle.
- Workspace navigation was session-local state in `App.tsx`.
- Application lifecycle remained owned by `ApplicationStateProvider`.
- Resize interaction remained shell-local and still emitted typed resize messages only through the existing bridge.
- Existing drawer infrastructure found: only the P2-001 static `shell-context` aside with `Context region` placeholder. No reusable drawer component, drawer store, modal, overlay, or competing ownership existed.
- `App.tsx` did not hide feature-specific context state, did not import Figma globals, and did not import the Motion adapter.

### Files Added Or Changed

- `src/ui/components/ContextDrawerShell.tsx`
- `src/ui/contextDrawerMode.ts`
- `src/ui/App.tsx`
- `src/ui/styles.css`
- `tests/contextDrawerShell.test.tsx`
- `tests/ui/smoke.spec.ts`
- `tests/buildArtifacts.test.mjs`
- `eslint.config.js`
- `docs/implementation/TASK_LEDGER.md`
- `docs/implementation/DECISIONS.md`
- `docs/verification/PHASE-02.md`

### Drawer Component API

- `ContextDrawerShell` accepts controlled `open`, `mode`, `title`, optional `description`, `children`, optional `footer`, and `onClose`.
- `ContextDrawerMode` is a closed union: `context | change-preview`.
- `getContextDrawerModePresentation()` maps both modes exhaustively and deterministically.
- `isContextDrawerMode()` rejects arbitrary external mode strings.
- The drawer accepts no Motion snapshots, raw Figma objects, change plans, compatibility results, selected nodes, scope data, or broad catch-all payload.

### Shell Integration

- `App` now exposes an optional `contextDrawer` slot.
- Production default passes no drawer content, so no empty context region renders.
- When content is supplied, the drawer sits in the existing shell body after navigation and main workspace.
- Header, navigation, main workspace, footer, and resize handle remain independent and visible while the drawer is open.

### Responsive Behavior

- Closed production state uses the navigation/main two-column shell and no drawer surface.
- Wide open state uses a trailing drawer column with main workspace kept flexible and usable.
- Narrow open state uses an absolute trailing overlay constrained to leave the navigation column usable.
- Drawer content has an independent scroll container.
- Reduced-motion handling remains inherited from the shell; P2-005 adds no required animation.
- No backdrop is used, so closed state leaves no invisible interaction blocker.

### Accessibility Behavior

- Open drawer uses complementary semantics with title-associated accessible naming.
- Optional description is associated only when present.
- Close control is keyboard reachable and has a clear accessible name.
- Escape requests close while open; unrelated keys do not.
- Closed drawer returns `null`, so its content is not visible, focusable, or pointer-interactive.
- The drawer is not marked `aria-modal` and focus is not trapped because the desktop treatment is a docked aside.
- Status or meaning does not depend on color alone: mode text and title are visible.

### State Ownership

- Drawer open/close is controlled by the caller.
- No global drawer singleton, imperative registry, command bus, persistence, local storage, plugin data, analytics, network call, plugin message, Figma global access, or Motion adapter import was added.
- Drawer state was not moved into the P2-003 lifecycle machine.
- Workspace navigation does not open the drawer; lifecycle transitions do not open the drawer; opening the drawer does not switch workspace or dispatch lifecycle events.

### Tests Run

| Command | Result | Notes |
|---|---|---|
| `rtk npm run verify` before coding | PASS | Baseline gate passed: 30 files, 322 tests; build-artifacts 2 tests. |
| `rtk npm run test -- tests/contextDrawerShell.test.tsx` | PASS | 1 file, 14 tests. Covers closed/open behavior, title/content/description/footer slots, close button, Escape, unrelated keys, repeated renders, mode mapping, no default Apply/Reset/change-plan UI, two isolated instances, shell independence, production no-empty-drawer default, and no Figma/plugin/storage/network side effects. |
| `rtk npm run test -- tests/contextDrawerShell.test.tsx tests/globalHeader.test.tsx tests/applicationState.test.ts tests/applicationStateProvider.test.tsx tests/workspaces.test.ts` | PASS | 5 files, 54 tests. |
| `rtk npm run test:ui -- tests/ui/smoke.spec.ts` | PASS | 8 Chromium shell/header/navigation/responsive/runtime tests. |
| `rtk npm run typecheck` | PASS | App/test and plugin TypeScript configs passed. |
| `rtk npm run lint` | PASS | ESLint passed. `.playwright-test-results` is now ignored so Playwright cleanup cannot break lint discovery. |
| `rtk npm run test` | PASS | 31 files, 336 tests. |
| `rtk npm run build` | PASS | Production plugin/UI build passed and inlined 1 script and 1 stylesheet. |
| `rtk npm run test:build-artifacts` | PASS | 2 Node build-artifact tests passed after the production build. |
| `rtk npm run verify` | PASS | Final canonical gate passed after docs and implementation: typecheck, lint, automated tests, production build, build-artifacts. |

### Standalone Production Review

Performed through the existing standalone Playwright UI setup.

| Viewport | Result |
|---|---|
| `1080x760` default | Shell rendered; MotionOps header rendered; Scope active; five-workspace navigation worked; no empty drawer visible; no placeholder panel; no backdrop; resize handle visible; no horizontal overflow; no vertical clipping regression; no P2-006 Scope functionality; no change-plan or Apply UI; no runtime errors. |
| `820x620` narrow | Shell rendered; header and document status remained visible after wrap; navigation worked; no empty drawer visible; no placeholder panel; no backdrop; resize handle visible; no horizontal overflow; no vertical clipping regression; no Scope controls; no change-plan or Apply UI; no runtime errors. |
| `760x560` minimum | Shell rendered; header, Scope workspace, and Initializing status remained visible; navigation worked; no empty drawer visible; no placeholder panel; no backdrop; resize handle visible; no horizontal overflow; no vertical clipping regression; no Scope controls; no change-plan or Apply UI; no runtime errors. |

### Isolated Open-Drawer Review

- Component harness in `tests/contextDrawerShell.test.tsx` opened the drawer in both `context` and `change-preview` modes.
- Title, supplied content, optional description, optional footer, close button, Escape close, and scroll container were verified.
- Long-content behavior is covered by the independent `.context-drawer-content` scroll container assertion and CSS.
- Wide trailing-panel and narrow overlay behavior are covered through the shell CSS and production responsive smoke regression; no production test trigger or debug query parameter was added.

### Scope Confirmation

- P2-006 was not started and remains `NOT_STARTED`.
- No Scope domain model, Scope scanning, selection synchronization, selected-node state, Motion reads, Motion adapter usage, raw Figma object access, actual change preview, change plan, compatibility preview, Apply, Reset, revalidation, writer dispatch, post-apply verification workflow, Inspector panel, Edit panel, QA panel, Standards panel, Handoff panel, Sequencer property panel, analytics, licensing, persistence, network work, live Figma test, commit, or push was added.
- Navigation remains session-local and independent.
- Lifecycle state remains owned by P2-003.

## P2-006 Through P2-010 Scope Discovery And Filtering

Status: DONE for P2-006, P2-007, P2-008, P2-009, and P2-010.

### Existing Scope Infrastructure Found

- P2-005 left P2-006 as the next `NOT_STARTED` task, with no Scope domain model, scanner, controls, filters, or hierarchy UI present.
- The production shell already had Scope as the initial workspace through `src/ui/workspaces.ts` and `src/ui/App.tsx`.
- The typed UI/plugin message boundary already lived in `src/shared/messages.ts`; Scope scanning extends that bridge instead of creating a second channel.
- Figma access already belonged to the plugin process through `src/plugin/main.ts`; the UI still does not access Figma globals.
- Application lifecycle state remains owned by P2-003 and workspace navigation remains local to the shell.

### Files Added Or Changed

- `src/domain/scope.ts`
- `src/domain/scopeScan.ts`
- `src/domain/scopeFilters.ts`
- `src/plugin/scopeScanner.ts`
- `src/shared/messages.ts`
- `src/plugin/main.ts`
- `src/ui/ScopeWorkspace.tsx`
- `src/ui/App.tsx`
- `src/ui/styles.css`
- `tests/scopeDomain.test.ts`
- `tests/scopeScanner.test.ts`
- `tests/scopeFilters.test.ts`
- `tests/scopeWorkspace.test.tsx`
- `docs/implementation/TASK_LEDGER.md`
- `docs/implementation/DECISIONS.md`
- `docs/implementation/KNOWN_LIMITATIONS.md`

### Scope Model

- `ScopeDefinition` is the canonical shared discriminated union.
- Supported modes are current selection, direct children, all descendants, depth-limited descendants, and manual node-ID membership.
- Scope definitions are serializable, immutable, and contain no Figma objects, node names, layer data, filter fields, ordering fields, React state, or callbacks.
- Depth must be finite, integral, and at least `1`.
- Manual node IDs are opaque strings. Deduplication is deterministic and preserves first occurrence order.
- Runtime parsing returns typed serializable success or validation issue results.
- The default Scope is current selection.

### Scanner Ownership And Semantics

- `src/plugin/scopeScanner.ts` owns Figma document access and returns `ScopeScanResult`.
- The scanner uses async page/node loading hooks where available and `getNodeByIdAsync` for explicit manual IDs.
- Current selection supports multiple selected roots.
- Direct children, all descendants, and depth-limited descendants traverse from selected roots only; there is no implicit full-document scan.
- Manual mode resolves only requested node IDs. Missing IDs produce serializable `missing_node` issues instead of thrown errors.
- Overlapping roots and duplicate descendants are deduped deterministically by traversal order while preserving root membership.
- Scan nodes include ID, parent ID, name, type, depth, child IDs, visible/locked state, child availability/inclusion, root membership, and stable traversal index.
- Scanner results contain no raw Figma objects and do not inspect Motion fields.
- `SCOPE_SCAN_REQUEST` and `SCOPE_SCAN_RESULT` are request-correlated through existing runtime message validation.

### Hierarchy And Modes

- `ScopeWorkspace` replaces the Scope placeholder inside the existing Scope workspace only.
- Loading, empty, error, and hierarchy states are rendered from scanner output.
- Rows expose keyboard focus, expand/collapse, checkboxes, safe node-type icon text, layer name, node type, hidden indicator, locked indicator, hierarchy depth, and local inclusion state.
- Scope state is feature-local and session-only in `ScopeWorkspace`; it is not stored in the application lifecycle machine, workspace navigation state, context drawer, plugin data, local storage, or a singleton.
- Mode controls cover selected object/current selection, direct children, all descendants, depth, and manual node IDs.
- Depth validation is immediate and does not send invalid scans.
- Manual mode accepts explicit opaque node IDs. Checkbox inclusion remains local and reversible.

### Filters And Exclusions

- `src/domain/scopeFilters.ts` defines a typed serializable filter model.
- Supported filters are case-insensitive layer-name search, visible only, unlocked only, node type, exclude hidden layers, exclude locked layers, and manual node-ID exclusions in the pure filter layer.
- Filtering is pure, deterministic, immutable, and does not mutate scan results.
- UI filters apply locally to the latest scan result and do not trigger Figma rescans.
- Clearing filters restores the unfiltered scan presentation.
- Hidden and locked indicators remain visible when rows are not filtered out.
- Animated-only, unanimated-only, Motion-property, Motion-source, Motion compatibility, target ordering, and selection-sync filters were not added.
- Background exclusion is intentionally unsupported because no deterministic repository-approved background definition exists without Motion reads or design heuristics.

### Focused Tests Run

| Command | Result | Notes |
|---|---|---|
| `rtk npm run test -- tests/scopeDomain.test.ts` | PASS | 1 file, 7 tests. All Scope variants, default, depth validation, manual-ID dedupe, runtime parsing, serialization, immutability, invalid shapes. |
| `rtk npm run typecheck` after P2-006 | PASS | App/test and plugin TypeScript configs passed. |
| `rtk npm run test -- tests/scopeScanner.test.ts` | PASS | 1 file, 10 tests. Empty selection, one/multiple roots, direct children, all descendants, depth, overlapping roots, manual IDs, missing IDs, hidden/locked data, deterministic traversal, async loads, no Motion reads, serializable results, message validation. |
| `rtk npm run typecheck` after P2-007 | PASS | App/test and plugin TypeScript configs passed. |
| `rtk npm run test -- tests/scopeWorkspace.test.tsx` after P2-008 | PASS | 1 file, 5 tests. Loading, empty, error, stale response rejection, hierarchy rendering, expansion, checkboxes, keyboard behavior, no Motion badges. |
| `rtk npm run test -- tests/scopeWorkspace.test.tsx` after P2-009 | PASS | 1 file, 7 tests. Adds all five mode controls, depth validation, manual IDs, no target order or selection-sync controls. |
| `rtk npm run test -- tests/scopeFilters.test.ts tests/scopeWorkspace.test.tsx tests/scopeDomain.test.ts tests/scopeScanner.test.ts` | PASS | 4 files, 33 tests. Adds search, visible/unlocked filters, node types, hidden/locked exclusions, combinations, clearing, immutability, deterministic order, local UI filtering, and manual exclusion semantics. |
| `rtk npm run typecheck` after P2-010 | PASS | App/test and plugin TypeScript configs passed. |

### Final Verification

| Command | Result | Notes |
|---|---|---|
| `rtk npm run typecheck` | PASS | App/test and plugin TypeScript configs passed. |
| `rtk npm run lint` | PASS | ESLint passed. |
| `rtk npm run test` | PASS | 35 files, 369 tests. |
| `rtk npm run build` | PASS | Production plugin/UI build passed; `dist/index.html` inlined 1 script and 1 stylesheet. |
| `rtk npm run test:build-artifacts` | PASS | 2 Node build-artifact tests passed. |
| `rtk npm run verify` | PASS | Final canonical verifier passed all 5 stages: typecheck, lint, automated tests, production build, build-artifacts. The verifier's internal test stage also passed 35 files and 369 tests. |
| `rtk npm run test:ui -- tests/ui/smoke.spec.ts` | PASS | 8 Chromium smoke tests passed. |

### Manual Standalone Review

Performed with a temporary standalone server at `http://127.0.0.1:4174/`, then stopped after review. Mock scanner results were injected through the existing typed UI message boundary.

| Viewport | Result |
|---|---|
| `1080x760` default | Header and workspace navigation rendered; Scope loading state visible; empty and error states usable; hierarchy expanded; search and node-type filters usable; hidden/locked indicators visible when rows remained included; no horizontal overflow; no context drawer; resize handle visible; no runtime errors. |
| `820x620` narrow | Header, five tabs, Scope controls, hierarchy, filters, empty/error states, and resize handle remained usable; no horizontal overflow; no context drawer; no runtime errors. |
| `760x560` minimum | Header, five tabs, Scope controls, hierarchy, filters, empty/error states, and resize handle remained usable at the minimum size; no horizontal overflow; no context drawer; no runtime errors. |

Manual review also confirmed no target-ordering, custom-order, selection-sync, node-reveal, animated-only, Motion-source, or compatibility content appeared at the end of the P2-006 through P2-010 batch. P2-011 through P2-016 supersede that boundary.

## P2-011 Through P2-016 Scope Ordering, Sync, Reveal, Progress, States, And Integration

### Status

| Task | Status |
|---|---|
| P2-011 - Implement target ordering modes | DONE |
| P2-012 - Implement custom target order | DONE |
| P2-013 - Implement selection sync and node reveal | DONE |
| P2-014 - Implement scan cancellation and progress | DONE |
| P2-015 - Implement empty/loading/stale/error states | DONE |
| P2-016 - Add Scope UI and integration tests | DONE |
| P3-001 | NOT_STARTED |

### Existing Infrastructure Reused

- Scope remained inside `ScopeWorkspace`; no Scope workflow state moved into application lifecycle, workspace navigation, context drawer, local storage, plugin data, or a singleton.
- The existing typed UI/plugin bridge in `src/shared/messages.ts` was extended for progress, cancellation, selection-change notifications, and reveal request/result messages.
- The plugin process still owns all Figma access through `src/plugin/scopeScanner.ts` and `src/plugin/main.ts`; UI code does not touch `figma`.
- The global header was not extended because the current header API owns product/workspace/lifecycle presentation, not feature-local Scope state. Real sync and rescan controls live in Scope where their behavior exists.

### Implementation

- Target ordering: `src/domain/scopeOrdering.ts` adds layer-panel, reverse, top-to-bottom, bottom-to-top, left-to-right, right-to-left, center-outward, edges-inward, and custom order. Tie-breakers use traversal/layer order, not layer names.
- Scanner geometry: scan nodes now project only x, y, width, height, centerX, and centerY. Missing geometry is safe and deterministic.
- Custom order: session-only node-ID order dedupes IDs, drops removed targets, appends newly discovered targets, survives filtering, and resets to the last automatic order. Move up/down controls provide the accessible equivalent used in this batch.
- Node reveal: `SCOPE_REVEAL_NODE_REQUEST` resolves nodes in the plugin process, safely selects and scrolls them into view, and returns typed selected/missing/unsupported/error results.
- Selection sync: `SCOPE_SELECTION_CHANGED` marks existing results stale when sync is disabled and rescans when enabled. Programmatic reveal suppresses its own selection notification to avoid loops.
- Cancellation and progress: replacement scans cancel prior active scans, explicit cancel messages stop scanner traversal cooperatively, and progress reports visited nodes by request ID. Stale progress/results are ignored.
- Scope states: the workspace uses a feature-local discriminated union for idle, scanning, ready, stale, cancelled, and error states with explicit no-selection, no-eligible-target, stale, retry, cancel, and rescan affordances.

### Focused Evidence

| Layer | Command | Result |
|---|---|---|
| P2-011 ordering and geometry | `rtk npm run test -- tests/scopeOrdering.test.ts tests/scopeScanner.test.ts tests/scopeWorkspace.test.tsx tests/scopeFilters.test.ts tests/scopeDomain.test.ts` | PASS - 5 files, 49 tests. |
| P2-012 custom order | Included in `tests/scopeOrdering.test.ts` and `tests/scopeWorkspace.test.tsx` | PASS - normalization, new/removed target reconciliation, immutability, local UI movement, reset, and no-rescan behavior covered. |
| P2-013 sync and reveal | Included in `tests/scopeScanner.test.ts` and `tests/scopeWorkspace.test.tsx` | PASS - typed messages, reveal request/result, selection sync on/off, stale state, and feedback-loop suppression policy covered. |
| P2-014/P2-015 cancellation, progress, states | Included in `tests/scopeScanner.test.ts` and `tests/scopeWorkspace.test.tsx` | PASS - progress, cooperative cancellation, cancel UI, stale state, retry/rescan, empty/no-selection, and error states covered. |
| P2-016 integrated Scope hardening | `rtk npm run test` | PASS - 36 files, 385 tests. |

### Final Verification

| Command | Result | Notes |
|---|---|---|
| `rtk npm run typecheck` | PASS | App/test and plugin TypeScript configs passed. |
| `rtk npm run lint` | PASS | ESLint passed. |
| `rtk npm run test` | PASS | 36 files, 385 tests. |
| `rtk npm run build` | PASS | Production plugin/UI build passed; `dist/index.html` inlined 1 script and 1 stylesheet. |
| `rtk npm run test:build-artifacts` | PASS | 2 Node build-artifact tests passed. |
| `rtk npm run verify` | PASS | Canonical verifier passed all 5 stages: typecheck, lint, tests, build, build-artifacts. Its internal test stage passed 36 files and 385 tests. |
| `rtk npm run test:ui -- tests/ui/smoke.spec.ts` | PASS | 8 Chromium smoke tests passed. |

### Viewport Results

Playwright smoke covered the standalone UI at the required viewport sizes.

| Viewport | Result |
|---|---|
| `1080x760` | Header, navigation, Scope controls, ordering controls, selection sync, rescan, cancel, resize handle, and shell layout remained usable with no runtime errors. |
| `820x620` | Narrow layout remained usable with no horizontal overflow, visible header/workspace/status content, and usable Scope controls. |
| `760x560` | Minimum layout remained usable with no horizontal overflow, visible navigation, visible header/status content, and usable resize handle. |

### Manual Figma Verification

Manual live Figma verification was not performed in this run. The implemented behavior is covered by the typed plugin boundary, scanner tests, React integration tests, production build checks, and standalone Playwright smoke tests, but no claim is made that a live Figma session was manually exercised for multiple roots, reveal, selection sync, stale behavior, or large-scan cancellation.

### Scope Confirmation

- P2-011 through P2-016 are `DONE`.
- P3-001 remains `NOT_STARTED`.
- No Motion reads or writes were added.
- No Motion adapter use, Motion normalization, or capability classification was added.
- No Inspector, Edit, QA, Standards, Handoff, Sequencer, compatibility preview, change-plan, Apply workflow, analytics, licensing, persistence, backend, or network work was added.
- No staging, commit, push, Git initialization, cleanup, or history rewrite was performed.
