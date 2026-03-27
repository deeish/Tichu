# Round-End Preview Plan

## Decision

Use **server-supported transient state** (previous Option B).

This is the strongest long-term approach because it is deterministic, synchronized for all players, and safest for future UX additions.

## Goal

Show a short, non-interactive preview of the final hand/trick moment before the normal round-end view, without allowing extra gameplay actions.

## Final Approach

Two-phase round ending:

1. **Logical round end** (authoritative): rules resolve immediately.
2. **Preview phase** (`round-ending-preview`): clients render final snapshot briefly.
3. **Final phase** (`round-ended`): current end-of-round UI and scoring presentation.

## Server Contract

- New state: `round-ending-preview`.
- Server emits preview snapshot immediately after logical round end.
- Server blocks all play/pass actions while in preview.
- After `previewMs`, server transitions to `round-ended` and broadcasts again.
- Suggested config:
  - `ROUND_END_PREVIEW_MS=1200` (default)

## Client Behavior

- Treat `round-ending-preview` as read-only:
  - disable all action buttons,
  - show "Round ending..." indicator,
  - keep final trick/hand context visible.
- On `round-ended`, show existing round-end UI flow.

## Guardrails

- Do not alter tailender/trick correctness rules.
- Do not permit any extra turn during preview.
- Keep `stateVersion` behavior unchanged so stale suppression remains reliable.

## Test Plan

- Tailender: third-out ends logically, preview shows, no extra actions possible.
- Dragon end cases: recipient/scoring remains correct through preview transition.
- Reconnect during preview: client lands in correct preview or final state.
- Auto-pass and other toggles remain visually consistent after transition.
- Bots/integration tests can bypass timing with `ROUND_END_PREVIEW_MS=0`.

## Open Values To Confirm

- Final `previewMs` value (recommend 1200ms).
- Whether preview should allow manual skip (default recommendation: no skip initially).

