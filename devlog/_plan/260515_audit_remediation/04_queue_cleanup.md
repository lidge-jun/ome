# Phase 04 — Queue Cleanup

## Problem

Queue writes to both SQLite and in-memory, but:
- `listQueue()` reads only in-memory — SQLite data is invisible after restart
- No startup hydration from SQLite
- No consumer/worker processes the queue
- Users see a "queue" feature that does nothing

## Options

**Option A**: Mark experimental — add `[experimental]` to CLI help, warn on use, document limitation
**Option B**: Implement properly — add hydration + consumer + dispatch integration
**Option C**: Remove entirely

## Plan (Option A — minimal, honest)

### MODIFY `src/queue/index.ts`
- Add startup hydration: read `queued_messages` from SQLite into `messageQueue` on first access
- Add `QUEUE_EXPERIMENTAL` warning log on `enqueue()`

### MODIFY `src/cli/index.ts`
- Add `[experimental]` tag to queue subcommand help text

### MODIFY `README.md`
- Add "Experimental" badge next to Queue section
- Document that queue is not auto-consumed; items must be manually dequeued

## Verification
- Restart process → `listQueue()` returns previously enqueued items
- CLI help shows `[experimental]` for queue commands
