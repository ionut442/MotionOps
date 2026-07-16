# P0-012 Test Matrix

| Case | Focus | Expected terminal behavior |
|---|---|---|
| CP01 | Discover source component and component-set definitions | PASS, PARTIAL, READ_ONLY, or UNSUPPORTED |
| CP02 | Read target and sibling instance state | PASS, PARTIAL, READ_ONLY, or UNSUPPORTED |
| CP03 | Boolean property Motion discovery | PASS, PARTIAL, READ_ONLY, UNSUPPORTED, or BLOCKED_PRECONDITION |
| CP04 | Text property Motion discovery | PASS, PARTIAL, READ_ONLY, UNSUPPORTED, or BLOCKED_PRECONDITION |
| CP05 | Instance-swap property Motion discovery | PASS, PARTIAL, READ_ONLY, UNSUPPORTED, or BLOCKED_PRECONDITION |
| CP06 | Variant-property Motion discovery | PASS, PARTIAL, READ_ONLY, UNSUPPORTED, or BLOCKED_PRECONDITION |
| CP07 | Small writable property probe where available | PASS, PARTIAL, READ_ONLY, UNSUPPORTED, or BLOCKED_PRECONDITION |
| CP08 | Unsupported/read-only classification | READ_ONLY or UNSUPPORTED |
| CP09 | `commitUndo() -> write` undo behavior | PASS, PARTIAL, READ_ONLY, UNSUPPORTED, or BLOCKED_PRECONDITION |
| CP10 | Source, sibling, nested, and unrelated Motion isolation | PASS, PARTIAL, READ_ONLY, UNSUPPORTED, or BLOCKED_PRECONDITION |

Every case must terminate and write one evidence record. A mixed manifest is acceptable when all records are conclusive and no case is stuck running.
