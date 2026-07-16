# P0-010 Evidence Inventory

Status: fresh U01-U10 live Figma evidence captured on 2026-07-13 and audited.

Retained terminal files:

| Case | Evidence file | Manifest | Manifest accepted | SHA-256 |
|---|---|---|---:|---|
| U01 | `test-results/p010-mrizu52k-5b81a6-U01-one-manual-write-one-undo.json` | `test-results/p010-mrizu52k-5b81a6.manifest.json` | yes | `0421eea3f02e834db0d2b798fabcff34599f2f5fd514aa83b1310f4cab1924b3` |
| U02 | `test-results/p010-mrizut2e-5abffd-U02-multi-manual-grouping.json` | `test-results/p010-mrizut2e-5abffd.manifest.json` | yes | `b7300336c24232b89d0e1bba7e940ddd0240c8593c826b1dfa0835c4eb356e33` |
| U03 | `test-results/p010-mrizv3pr-231f67-U03-style-remove-reapply-grouping.json` | `test-results/p010-mrizv3pr-231f67.manifest.json` | yes | `d675be67e970166e0a5569e8dae5307fd106bd2ffcef751e32e3aaf458147753` |
| U04 | `test-results/p010-mrizvdlr-354441-U04-timeline-duration-one-undo.json` | `test-results/p010-mrizvdlr-354441.manifest.json` | yes | `f5d40606cf987ea1be0e7c85a733de7d7c3272d3d224a2047f85834ddfa922da` |
| U05 | `test-results/p010-mrizvp6w-422153-U05-mixed-source-grouping.json` | `test-results/p010-mrizvp6w-422153.manifest.json` | yes | `441db5fb2162302bd32283e60cbea13e8ffd9edf0bdc715eaa7599d5e030d855` |
| U06 | `test-results/p010-mrizw2z7-545f3b-U06-separate-apply-actions.json` | `test-results/p010-mrizw2z7-545f3b.manifest.json` | yes | `3ee9c2624f5a7913254754cb849a2974c833df4f07848a287d18c1a025d8aba4` |
| U07 | `test-results/p010-mrizwhqr-1ba384-U07-noop-apply-history.json` | `test-results/p010-mrizwhqr-1ba384.manifest.json` | yes | `4f5806eec1f8e034c2ccd8b4adfa41495c574c7a58c1cc6f687238bff91336f7` |
| U08 | `test-results/p010-mrizx0su-b6764f-U08-partial-failure-rollback.json` | `test-results/p010-mrizx0su-b6764f.manifest.json` | no | `0abcedde62c53a12da8f7dbe98da81d71bac9e6235dadbcd9b47e2ce372ddfeb` |
| U09 | `test-results/p010-mrizxaoz-3ccda8-U09-async-boundary.json` | `test-results/p010-mrizxaoz-3ccda8.manifest.json` | yes | `5fb56d870f53be80af580ed34ec79916e7f18a84c7e28f6c6c7fe425047a221f` |
| U10 | `test-results/p010-mrizxnmu-107e8d-U10-repeated-transaction-stability.json` | `test-results/p010-mrizxnmu-107e8d.manifest.json` | yes | `c66c336fc0cc1b8739dd508e5e359474ac64978250b0242e222ec6549efd8bc6` |

U08 manifest accepted is `no` because that file was emitted before the classifier treated `P010_CONTROLLED_PARTIAL_FAILURE` as an intentional probe error. The retained evidence itself is conclusive: `triggerUndoSafe=true`, `partialWritesRemained=false`, and `redoRestoredApplied=true`.
