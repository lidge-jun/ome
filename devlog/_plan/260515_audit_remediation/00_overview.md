# Audit Remediation — Overview

**Date**: 2026-05-15
**Source**: ChatGPT Pro production-readiness audit (devlog/context/260515_gpt_pro_audit_report.md)
**Overall audit score**: 5.0/10 (not-ready)
**Goal**: Address all non-security findings to reach ship-ready (7+/10)

## Scope

Security hardening is explicitly excluded per user decision. Focus is on correctness, packaging, reliability, and DX.

## Phases

| # | Phase | Impact | Effort |
|---|-------|--------|--------|
| 01 | Source/Docs/Tests consistency | HIGH — tests currently fail | 30 min |
| 02 | Package hygiene | HIGH — npm publish broken | 15 min |
| 03 | Dispatch resume bugfix | HIGH — wrong jobId returned | 15 min |
| 04 | Queue cleanup | MEDIUM — misleading feature | 20 min |
| 05 | Async log I/O | MEDIUM — event loop blocking | 45 min |
| 06 | State coherence | MEDIUM — cross-process mismatch | 30 min |
| 07 | Data integrity | LOW — orphan records, partial overwrites | 20 min |

## Acceptance criteria

- `npm test` passes (currently expected to fail on seed count)
- `npm run typecheck` passes
- `npm pack --dry-run` includes LICENSE, excludes irrelevant devlog artifacts
- `ome/web` import resolves
- dispatch retry returns correct jobId
- Queue commands clearly marked experimental or properly consumed
