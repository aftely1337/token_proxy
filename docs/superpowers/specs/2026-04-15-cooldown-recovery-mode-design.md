# Cooldown Recovery Mode Design

## Goal
Add a configurable retryable-failure cooldown mode so users can choose between the current time-window cooldown behavior and a new mode that clears cooldowns from earlier failed upstreams once a later upstream succeeds in the same request. Keep the existing cooldown duration configurable in the UI.

## User-facing behavior
- Keep `retryable_failure_cooldown_secs` as a user-editable integer field with default `15`.
- Add a new global setting `retryable_failure_cooldown_mode` with two values:
  - `time_window`: current behavior. A failed upstream/account stays excluded until its cooldown expires.
  - `clear_on_later_success`: if request routing falls through to later candidates and one later candidate succeeds, clear the cooldowns that were created earlier in that same request so the next request starts from the top again.
- The new mode applies to generic upstream ordering, not just free/plus examples.

## Runtime semantics
- Cooldown marking logic stays unchanged for retryable failures (`401/403/408/429/5xx` and network retryable failures).
- In `time_window`, the current behavior remains unchanged.
- In `clear_on_later_success`, the dispatcher tracks which upstream selector keys and account IDs were newly cooled during the current request attempt chain.
- If a later candidate succeeds in the same dispatch flow, clear those tracked cooldowns before returning success.
- This applies both to same-provider upstream cooldowns and account-backed cooldowns.
- If the request never finds a successful later candidate, cooldowns remain in place.

## Configuration model
- Rust config adds a `RetryableFailureCooldownMode` enum with serde snake_case values.
- `ProxyConfigFile` stores both `retryable_failure_cooldown_secs` and `retryable_failure_cooldown_mode`.
- `ProxyConfig` stores resolved runtime mode plus duration.
- Frontend config types/forms mirror the new enum.

## UI placement
- Add the new mode selector in the Core settings card next to the existing retryable failure cooldown settings.
- Keep the cooldown seconds input editable regardless of mode because it still matters for `time_window`, and also remains the fallback duration when no later success happens in `clear_on_later_success`.

## Testing
- Rust tests should verify:
  - default mode stays `time_window`
  - same-provider upstream cooldown remains in `time_window`
  - same-provider upstream cooldown is cleared after later success in `clear_on_later_success`
  - pinned/account cooldown is cleared after later success in `clear_on_later_success`
- Frontend tests should verify:
  - form round-trip for the new mode
  - validation still allows custom cooldown seconds values
  - core card renders and updates the new selector
