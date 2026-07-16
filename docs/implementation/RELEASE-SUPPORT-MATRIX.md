# Release Support Matrix

Date: 2026-07-14

Status: draft for release candidate. Final support claims are blocked by live Figma desktop/browser verification.

## Product Areas

| Area | Release-candidate status | Evidence boundary |
| --- | --- | --- |
| Scope | Supported with warning | Automated tests and earlier retained evidence; final live campaign still blocked. |
| Inspect | Supported with warning | Automated normalized-data tests; P3-012 live UI verification remains blocked. |
| Edit Timing/Easing | Supported with warning | Automated writer/planner tests; P4-019 live Edit/Undo verification remains blocked. |
| Copy/Paste Motion | Supported with warning | Automated compatibility/planner tests; P5-019 live paste verification remains blocked. |
| Sequencer | Supported with warning | Automated draft/planner/UI tests; P6-024 live verification remains blocked. |
| Stagger | Supported with warning | Automated schedule/planner/UI tests; P7-015 live verification remains blocked. |
| Standards and QA | Supported with warning | Automated storage/domain/UI tests; P8-022 live storage/safe-fix verification remains blocked. |
| Handoff exports | Supported with warning | Automated report/export tests; no backend, upload, or implementation-code generation. |
| Help and limitations | Supported | Static offline content and UI tests. |
| Analytics | Disabled | No-op typed boundary only; no collection or network behavior. |
| Licensing/feature access | Future-ready only | Local pure abstraction; no billing/account/license checks. |
| Figma Desktop environment | Unknown | P10-010 live campaign blocked. |
| Figma browser environment | Unknown | P10-010 live campaign blocked. |

## Capability Areas

| Capability | Release-candidate status | Notes |
| --- | --- | --- |
| Manual opacity timing/easing | Supported with warning | Automated and retained evidence support guarded manual writes; final native Undo matrix remains blocked. |
| Manual translation, rotation, scale timing/easing | Supported with warning | Planned through the same guarded manual-track path; live representative matrix remains blocked. |
| Timeline duration writes | Supported with warning | Retained P0-009 evidence exists; native Undo grouping remains blocked. |
| Width, height, corner radius, stroke weight, path trim | Read-only / unsupported for release claims | No new live evidence promotes geometry or path writes. |
| Native style instances | Read-only for mutation; visible in Inspect/Handoff | Direct style timing/easing mutation remains unsafe or unverified. |
| Paint/effect Motion data | Read-only / limitation | Visible where normalized, not promoted to write support. |
| Component-property value writes | Limited supported-with-warning for accepted CP09 BOOLEAN path only | Broader component-property kinds remain unsupported/read-only. |
| Components, component sets, instances, nested instances | Conservative / warning | Do not promote write support beyond accepted retained evidence. |
| Unknown beta fields | Conservative | Unknown data serializes and surfaces warning/not-evaluated states; it does not create write support. |
| Native Undo after every write workflow | Unknown | P10-008 blocked. |
| Large dynamic-page files | Unknown | P10-009 blocked. |

## Finalization Rule

Do not mark this matrix final and do not update `docs/implementation/API_CAPABILITY_MATRIX.md` until accepted live evidence exists for the relevant rows.
