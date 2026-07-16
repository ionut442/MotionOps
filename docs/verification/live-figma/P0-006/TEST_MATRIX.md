# P0-006 Test Matrix

Accepted run: `p006-mrin2zvh-ac0f05`

Manifest: `test-results/p006-mrin2zvh-ac0f05.manifest.json`

| Case | Scene | Diagnostic target | Commands | Expected evidence | Result | Evidence file |
|---|---|---|---|---|---|---|
| R01 | Empty selection | `EMPTY` | `GET_ENVIRONMENT`, `READ_CURRENT_SELECTION`, `READ_MOTION_DATA` | Empty target handled safely; no selected-node Motion claim. | DONE: 0 requested, 0 resolved, 0 read | `test-results/R01-empty-selection-*.json` |
| R02 | Ordinary node without Motion | `EXPLICIT_NODE_IDS` | `READ_CURRENT_SELECTION`, `READ_MOTION_DATA`, `READ_MANUAL_TRACKS`, `READ_ANIMATION_STYLES`, `READ_DERIVED_ANIMATIONS`, `READ_TIMELINES` | Empty manual/style/derived data, timeline present. | DONE: 1 requested, 1 resolved, 1 read | `test-results/R02-no-motion-*.json` |
| R03 | Manual opacity animation | `EXPLICIT_NODE_IDS` | All Motion read commands | Manual opacity track, derived animation, timeline. | DONE: 1 requested, 1 resolved, 1 read | `test-results/R03-generated-opacity-*.json` |
| R04 | Manual multi-property animation | `EXPLICIT_NODE_IDS` | All Motion read commands | Translation Y, rotation, scale X tracks; derived animations; timeline. | DONE: 1 requested, 1 resolved, 1 read | `test-results/R04-multi-property-*.json` |
| R05 | Native animation style | `EXPLICIT_NODE_IDS` | `READ_ANIMATION_STYLES`, `READ_DERIVED_ANIMATIONS`, `READ_MOTION_DATA`, `READ_TIMELINES` | Animation style instance, derived animations, timeline; manual tracks empty. | DONE: 1 requested, 1 resolved, 1 read | `test-results/R05-native-style-*.json` |
| R06 | Mixed source node | `EXPLICIT_NODE_IDS` | All Motion read commands | Native style plus manual translation X; derived animations; timeline. | DONE: 1 requested, 1 resolved, 1 read | `test-results/R06-mixed-style-manual-*.json` |
| R07 | Parent and children | `EXPLICIT_NODE_IDS` | Explicit reads for parent-only, child-only, and parent+child target IDs | Node-local parent and child reads plus explicit two-node read; no canvas multi-selection claim. | DONE: variants read 1, 1, and 2 targets | `test-results/R07-*.json` |
| R08 | Auto-layout children | `EXPLICIT_NODE_IDS` | All Motion read commands | Parent empty for Motion tracks; children expose opacity and translation Y tracks; timelines present. | DONE: variants read 1, 3, 1, 1, and 1 targets | `test-results/R08-*.json` |
| R09 | Timeline-duration evidence | `EXPLICIT_NODE_IDS` | `READ_TIMELINES`, `READ_MOTION_DATA`, `READ_MANUAL_TRACKS` | Timeline record plus manual opacity track. | DONE: 1 requested, 1 resolved, 1 read | `test-results/R09-extended-timeline-*.json` |
| R10 | Mixed multiple nodes | `EXPLICIT_NODE_IDS` | All Motion read commands | Manual, style, and no-Motion nodes read in order with per-node empty/populated fields. | DONE: 3 requested, 3 resolved, 3 read | `test-results/R10-mixed-selection-*.json` |

P0-006 is complete for read verification. Write behavior remains out of scope for this matrix.
