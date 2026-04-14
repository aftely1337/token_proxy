# Global Payload Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global payload-rules feature that can default, override, or filter outbound JSON request fields by exact model name across all request types.

**Architecture:** Extend the global config schema with `payload_rules`, keep typed values in config, apply rules to the transformed outbound request body using a dedicated runtime helper keyed by `meta.original_model`, and expose the feature through a new Settings card.

**Tech Stack:** Rust (`token_proxy_core`, Axum, Serde JSON), TypeScript/React, Tauri, Vitest, Cargo tests.

---

## File structure and responsibilities

- Modify: `D:\master\gpt-zcj\_external\token_proxy\src\features\config\types.ts` ！ add frontend payload-rules types.
- Modify: `D:\master\gpt-zcj\_external\token_proxy\src\features\config\form.ts` ！ round-trip and validate payload rules.
- Add: `D:\master\gpt-zcj\_external\token_proxy\src\features\config\cards\payload-rules-card.tsx` ！ global UI card.
- Modify: `D:\master\gpt-zcj\_external\token_proxy\src\features\config\cards\index.ts` and `D:\master\gpt-zcj\_external\token_proxy\src\features\config\AppView.tsx` ！ render the new card in Settings.
- Modify: `D:\master\gpt-zcj\_external\token_proxy\messages\en.json` and `D:\master\gpt-zcj\_external\token_proxy\messages\zh.json` ！ labels and validation messages.
- Add: `D:\master\gpt-zcj\_external\token_proxy\crates\token_proxy_core\src\proxy\payload_rules.rs` ！ rule application helper.
- Modify: `D:\master\gpt-zcj\_external\token_proxy\crates\token_proxy_core\src\proxy\mod.rs` ！ register module.
- Modify: `D:\master\gpt-zcj\_external\token_proxy\crates\token_proxy_core\src\proxy\config\types.rs` and `D:\master\gpt-zcj\_external\token_proxy\crates\token_proxy_core\src\proxy\config\mod.rs` ！ add payload-rules config support.
- Modify: `D:\master\gpt-zcj\_external\token_proxy\crates\token_proxy_core\src\proxy\upstream\request.rs` ！ apply payload rules before provider-specific cleanup.
- Test: `D:\master\gpt-zcj\_external\token_proxy\src\features\config\form.test.ts`, `D:\master\gpt-zcj\_external\token_proxy\src\features\config\cards\payload-rules-card.test.tsx`, `D:\master\gpt-zcj\_external\token_proxy\src\features\config\AppView.test.tsx`, `D:\master\gpt-zcj\_external\token_proxy\crates\token_proxy_core\src\proxy\payload_rules.rs` tests.

## Task 1: Add config schema and frontend form support

- [ ] Add frontend types for payload rules, params, filters, and value types.
- [ ] Add failing Vitest cases for:
  - round-tripping payload rules through `toForm()` and `toPayload()`
  - validating empty model/path/value entries
  - validating number / boolean / json parsing
- [ ] Implement minimal form helpers and validation.
- [ ] Add new message strings and run `pnpm run i18n:compile`.
- [ ] Re-run targeted form tests until green.

## Task 2: Implement backend payload-rules engine with tests first

- [ ] Add failing Rust unit tests covering:
  - exact model match
  - filter/default/override order
  - nested dotted paths
  - JSON typed values
  - non-match no-op
- [ ] Implement a dedicated helper module that mutates `serde_json::Value` safely.
- [ ] Extend Rust config types with `payload_rules`.
- [ ] Thread runtime config through `ProxyConfig`.
- [ ] Apply payload rules in `upstream/request.rs` on the transformed outbound body before provider-specific cleanup.
- [ ] Re-run targeted Cargo tests until green.

## Task 3: Build the global Settings UI card

- [ ] Add a failing component test for rendering and editing the new Payload Rules card.
- [ ] Implement a row-based editor for:
  - default rules
  - override rules
  - filter rules
- [ ] Mount the card inside the Settings section.
- [ ] Add an AppView test to confirm the card appears in Settings.
- [ ] Re-run targeted frontend tests until green.

## Task 4: Verify end-to-end behavior

- [ ] Run targeted frontend verification:
  - `pnpm vitest run src/features/config/form.test.ts src/features/config/cards/payload-rules-card.test.tsx src/features/config/AppView.test.tsx`
- [ ] Run targeted backend verification:
  - `cargo test -p token_proxy_core payload_rules -- --nocapture`
- [ ] Run TypeScript typecheck:
  - `pnpm exec tsc --noEmit`
- [ ] If everything is green, stage and commit the feature branch.
