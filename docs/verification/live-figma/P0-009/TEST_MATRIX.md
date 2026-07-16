# P0-009 Test Matrix

Status: DONE by conclusive live run `p009-mrivc1j7-56e68c`.

| Case | Purpose | Planned operation | Result | Conclusion |
|---|---|---|---|---|
| T01 | No-op duration write | Write current duration `2s` | `2s -> 2s` | Supported. Semantic equality and restoration passed. |
| T02 | Extend duration | Increase to `2.25s` | `2s -> 2.25s` | Supported. Timeline identity/count, tracks, keyframes, and styles stable. |
| T03 | Shorten safely | Reduce to `1.8s`, above max keyframe `0.75s` | `2s -> 1.8s` | Supported. Isolation and restoration passed. |
| T04 | Shorten below final keyframe | Attempt `0.55s`, below max keyframe `0.75s` | `2s -> 0.55s` | Supported-with-warning. Figma accepted the shorter duration; keyframes/tracks unchanged; derived animation duration mirrored `0.55s`. |
| T05 | Repeated writes | Apply `2.1s`, `2.2s`, `2.3s` | Final `2.3s` | Supported. No timeline duplication or accumulating side effect. |
| T06 | Restore original duration | Mutate then restore `2s` | Final `2s` | Supported. Restored semantic state passed. |

Every case must terminate as `PASS`, `PARTIAL`, `UNSUPPORTED`, `BLOCKED_PRECONDITION`, `FAIL`, or `ERROR`.
