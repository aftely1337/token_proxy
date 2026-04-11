# Codex Upstream-Owned Routing Design

## Goal

Make Codex account selection an upstream concern instead of an account-list concern so users can express routing like:

- `codex-free (99)`
- `channel-1 (50)`
- `channel-2 (49)`
- `codex-plus (0)`

and get the exact runtime order:

`codex-free -> channel-1 -> channel-2 -> codex-plus`

while preserving the existing cooldown-based cost-saving behavior where later requests return to the free Codex account after its cooldown expires.

## Problem

Today the proxy uses two different priority systems:

1. **Provider/upstream priority** decides which provider family is tried first.
2. **Codex account priority** decides which Codex account is tried inside an unbound Codex upstream.

That layered model has two user-visible problems:

- It cannot express `free -> external channel -> plus` in a single instance because provider selection happens before Codex account selection.
- Codex account priority lives on the account page, so routing behavior is split between the account UI and the upstream UI.

The current model also contains an important behavior that must not be lost:

- When the highest-priority Codex account gets a retryable failure such as `429`, it is cooled down temporarily.
- The next request can use another route.
- Later requests go back to the higher-priority free account automatically after cooldown expires.

This behavior reduces paid-token usage and is a required compatibility constraint for the redesign.

## Scope

This redesign applies to:

- Codex account-backed upstreams
- `/v1/responses` routing
- The upstream editor and account UI needed to support that routing

Out of scope for the first pass:

- Reworking Kiro account routing
- Reworking every non-responses path
- Removing database priority columns in the first migration

## Design Summary

### 1. Upstreams own Codex routing order

Each `provider=codex` upstream will explicitly bind to one Codex account via `codex_account_id`.

Routing order will come from **upstream priority only**, not from Codex account priority.

Example:

- `codex-free`, `codex_account_id=free.json`, `priority=99`
- `channel-1`, `provider=openai-response`, `priority=50`
- `channel-2`, `provider=openai-response`, `priority=49`
- `codex-plus`, `codex_account_id=plus.json`, `priority=0`

The proxy must try those entries in exactly that order for `/v1/responses`.

### 2. Codex account priority stops driving routing

The Codex account list will still show account metadata, but its `priority` field will no longer control request routing.

In the first pass:

- the backend storage field may remain for compatibility,
- the Codex account UI will stop exposing routing priority as an editable control,
- the effective routing source of truth becomes upstream priority.

### 3. Pinned Codex upstreams must respect cooldown

Today pinned `codex_account_id` upstreams bypass the account ordering logic. That would break the current low-usage behavior if left unchanged.

The redesign must therefore add cooldown awareness to pinned Codex upstreams:

- if the bound Codex account is cooling down, skip that upstream for the current request,
- continue to the next upstream by priority,
- on the next request, re-check the same highest-priority upstream first.

This preserves:

- `free failed -> temporary fallback`
- `later request -> return to free first`

without sticky failover to a paid account.

### 4. Legacy config remains readable, but edited Codex upstreams become explicit

Existing configs that contain Codex upstreams without `codex_account_id` should continue to load so users are not broken on startup.

However, once a Codex upstream is edited or newly created through the new UI flow, it must save with an explicit `codex_account_id`.

The new UI should treat “Codex upstream without selected account” as invalid when saving.

## Architecture

### Backend routing model

`/v1/responses` should stop treating Codex as a two-level decision of:

1. choose provider `codex`,
2. then choose a Codex account inside it.

Instead, responses routing should operate on an ordered set of **concrete upstream attempts**:

- each concrete upstream already knows its provider,
- each Codex upstream knows its bound account id,
- ordering is global by upstream priority,
- equal-priority ties keep config insertion order.

This allows Codex and non-Codex upstreams to interleave naturally.

### Backend account resolution

For Codex:

- if `codex_account_id` is present:
  - resolve only that account,
  - but skip the upstream if that account is cooling down,
  - still apply cooldown updates after retryable failures.
- if `codex_account_id` is absent in legacy config:
  - keep the old automatic selection path as a read-compatibility fallback.

### Frontend config model

The upstream form must preserve and round-trip `codex_account_id` instead of stripping it.

When `providers=["codex"]`, the upstream dialog must expose a Codex account selector populated from the account list.

The existing auto-generated default Codex upstream behavior should be removed for Codex, because account existence should no longer imply routing behavior.

## Detailed Changes

### Config and form layer

- Preserve `codex_account_id` in `toForm(...)`.
- Preserve `codex_account_id` in `toPayload(...)`.
- Add a Codex account selector to the upstream editor dialog.
- Validate that enabled Codex upstreams have a selected account id.
- Stop auto-creating synthetic `codex-default` upstreams from account presence.
- Keep Kiro behavior unchanged in this pass unless a touched helper must branch by provider.

### Proxy routing layer

- Introduce a responses-routing path that iterates concrete upstreams in global priority order instead of provider-first order.
- Keep current behavior for untouched routes.
- Ensure retry/failover moves to the next concrete upstream entry rather than collapsing back into provider-first selection.

### Codex cooldown behavior

- Reuse the existing cooldown state in `account_selector`.
- Before sending a pinned Codex upstream attempt, check whether its bound account is cooling down.
- If cooling, treat that upstream as temporarily unavailable and continue to the next upstream.
- When a pinned Codex attempt returns a retryable failure, mark that same account as cooling just like the auto-selected path does today.

### Accounts UI

- Remove the Codex priority editor from the account details dialog.
- Leave proxy URL and quota management intact.
- The account list may still display the stored priority value for now if removing it everywhere is too invasive, but it must no longer be the control surface for routing.

## Testing

Add or update tests to cover:

1. `responses` tries Codex-free before lower-priority external channels.
2. If Codex-free is cooling or gets `429`, routing continues to channel-1, then channel-2, then Codex-plus.
3. A later request returns to Codex-free after cooldown expiry.
4. Pinned Codex upstreams log the selected account id correctly.
5. Legacy Codex upstreams without `codex_account_id` still load and can still use the old automatic account selection path until resaved.
6. The UI form round-trips `codex_account_id` instead of dropping it.
7. Saving an enabled Codex upstream without an account id fails validation.
8. Codex account priority edits are no longer offered in the accounts UI.

## Migration and Compatibility

No database migration is required in the first pass.

Compatibility strategy:

- stored Codex account priority values may remain in SQLite,
- old configs can still load,
- newly edited Codex upstreams become explicit and upstream-driven.

This keeps the rollout small while moving all practical Codex routing control to upstream configuration.

## Risks

### Risk: accidental sticky fallback to paid routes

Mitigation:

- always restart each new request from the highest-priority upstream,
- use cooldown only as a temporary skip,
- do not remember the previously successful fallback route as the next default.

### Risk: mixing new routing with untouched provider-first code

Mitigation:

- confine the first pass to `/v1/responses`,
- keep the old routing path for routes not explicitly migrated,
- add regression tests around current responses fallback behavior.

### Risk: UI silently strips account binding again

Mitigation:

- add form serialization tests,
- add component tests for the Codex account selector and validation path.

## Recommendation

Implement the redesign in one focused pass on the current feature branch:

1. preserve and expose `codex_account_id` in the config UI,
2. make `/v1/responses` route by concrete upstream priority,
3. add cooldown-aware handling for pinned Codex accounts,
4. remove Codex routing priority editing from the accounts UI,
5. verify the free-first, temporary-fallback, return-to-free behavior with regression tests.
