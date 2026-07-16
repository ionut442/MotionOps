# Release Package

Date: 2026-07-14

Status: release-candidate, not final.

## Location

- Package directory: `dist/release-candidate/motionops-plugin`
- Inventory: `dist/release-candidate/inventory.json`
- Checksums: `dist/release-candidate/SHA256SUMS.txt`

Temporary live-verification package:

- Package directory: `dist/live-verification/motionops-plugin`
- Import manifest: `dist/live-verification/motionops-plugin/manifest.json`
- Inventory: `dist/live-verification/inventory.json`
- Checksums: `dist/live-verification/SHA256SUMS.txt`

## Contents

| File | Bytes | SHA256 |
| --- | ---: | --- |
| `motionops-plugin/dist/index.html` | 371,338 | `698961935511bc5eb2087a71fb873fe2e1352634ba224fdeffde84c817867c31` |
| `motionops-plugin/dist/plugin.js` | 117,550 | `22000453264c6e47c5d1e9c2cd8f01ab452cc3e052d7ead9a0269e80c7f1897e` |
| `motionops-plugin/manifest.json` | 296 | `aa463a59711d8ae6aca51f784b9896e92e1a59f2931de2b92d49f9672f5722ff` |

## Live-Verification Contents

| File | Bytes | SHA256 |
| --- | ---: | --- |
| `motionops-plugin/dist/index.html` | 374,969 | `19628cd01459e970fdfb6e038e83a2906fda6cdb587c11ad52aff5ddd30838fe` |
| `motionops-plugin/dist/plugin.js` | 142,782 | `3efb5552e226fdc3a6e8b4ffbf289eaec4e1589f98c82947006040da2480e502` |
| `motionops-plugin/manifest.json` | 296 | `aa463a59711d8ae6aca51f784b9896e92e1a59f2931de2b92d49f9672f5722ff` |

## Inclusion Rules

The release-candidate package includes only the production manifest, production plugin bundle, and inlined production UI HTML.

It intentionally excludes:

- Source TypeScript and tests.
- Docs and verification evidence.
- Source maps.
- `node_modules`.
- `.env` files or local secrets.
- Lab collector scripts and retained live evidence.
- P0 API-lab handlers and collector markers in the production bundle.
- Live-test runner UI and markers, including `Run all tests`, `LIVE_TEST_RUNNER_START`, and `__MOTIONOPS_LIVE_TEST_SANDBOX__`.

## Verification

`rtk npm run test:release-package` passed with 2 tests after a production build. The package inventory and SHA256 sums describe all included files.

`rtk npm run build:live-verification` produces the separate importable package for the final live campaign and must not be used as the normal release-candidate package.

Final release remains blocked by the live Figma gates in `docs/verification/live-figma/FINAL-LIVE-CAMPAIGN/README.md`.
