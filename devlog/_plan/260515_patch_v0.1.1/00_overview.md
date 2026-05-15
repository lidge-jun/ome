# OME v0.1.1 Patch — GPT Thinking Review Fixes

- date: 2026-05-15
- status: planned
- origin: ChatGPT thinking model code review (NEEDS_FIX verdict)
- conversation: https://chatgpt.com/c/6a06933e-b024-83a3-942a-352b4c5150fb

## Summary

3 priority patches addressing the 2 FAIL + 5 WARN areas found in review.

| Patch | Area | Rating → Target |
|-------|------|-----------------|
| 01 | Process supervision | FAIL → PASS |
| 02 | Web API auth + error sanitization | FAIL → PASS |
| 03 | Output/log bounding + stderr exposure | WARN → PASS |

## File Map

```
devlog/_plan/260515_patch_v0.1.1/
├── 00_overview.md              ← this file
├── 01_process_supervision.md   ← detached spawn, group kill, cancelling state
├── 02_web_auth.md              ← auth token, loopback guard, error sanitize
└── 03_output_bounding.md       ← byte offset logs, memory cap, stderr in SpawnResult
```

## Scope Notes

- These patches are **targeted fixes** — no new features, no refactors beyond what's needed.
- Tests are added inline per patch, not in a separate phase.
- Each patch can be committed independently.
