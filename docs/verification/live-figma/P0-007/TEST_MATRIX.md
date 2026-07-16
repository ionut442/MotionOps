# P0-007 Test Matrix

| Case | Purpose | Fixture | Property | Expected Proof |
|---|---|---|---|---|
| W01 | Complete no-op round trip | Two-keyframe manual opacity | `OPACITY` | Track ID, keyframe IDs, values, easing, order, and count survive no-op replacement. PASS in run `p007-mriq1s7l-2b2f3c`. |
| W02 | Timing modification | Three-keyframe translation | `TRANSLATION_X` | DONE with limitation in run `p007-mriq1s7l-2b2f3c`: intended time changed, but keyframe ID `6389:165` regenerated as `6389:256`; production code must re-read and remap. |
| W03 | Value modification | Three-keyframe opacity | `OPACITY` | Only keyframe 2 float value changes; IDs and count survive. PASS in run `p007-mriq1s7l-2b2f3c`. |
| W04 | Easing modification | Three-keyframe opacity with easing | `OPACITY` | DONE with warning in run `p007-mriq1s7l-2b2f3c`: `LINEAR` write accepted, but readback added cubic-bezier data; future checks need semantic easing comparison. |
| W05 | Multi-keyframe preservation | Four-keyframe opacity | `OPACITY` | Intermediate values/easing/order survive except the intended value change. PASS in run `p007-mriq1s7l-2b2f3c`. |
| W06 | Sibling-track isolation | Opacity plus translation on one node | `OPACITY` | Translation sibling fingerprint is unchanged; no duplicate track. PASS in run `p007-mriq1s7l-2b2f3c`. |
| W07 | Repeated replacement | Three-keyframe translation | `TRANSLATION_X` | Two sequential replacements keep one logical track and stable IDs. PASS in run `p007-mriq1s7l-2b2f3c`. |
| W08 | Restore original payload | Three-keyframe opacity | `OPACITY` | Mutation is followed by full original-payload restoration and re-read. PASS in run `p007-mriq1s7l-2b2f3c`. |
