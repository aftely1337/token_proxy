# Cooldown Recovery Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a configurable retryable-failure cooldown mode that can either honor the full cooldown window or clear cooldowns from earlier failed upstreams after a later upstream succeeds.

**Architecture:** Extend the global proxy config with a cooldown-mode enum, thread that mode into runtime dispatch, track which cooldowns were created during a request, and clear them on later success when the new mode is selected. Expose the mode in the Core settings card next to the existing cooldown seconds field.

**Tech Stack:** Rust (`token_proxy_core`), React/TypeScript config UI, Paraglide i18n, Vitest, cargo test.

---

### Task 1: Add config model support
- Modify `D:\master\gpt-zcj\_external\token_proxy\.worktrees\cooldown-recovery-mode\crates\token_proxy_core\src\proxy\config\types.rs`
- Modify `D:\master\gpt-zcj\_external\token_proxy\.worktrees\cooldown-recovery-mode\crates\token_proxy_core\src\proxy\config\mod.rs`
- Modify `D:\master\gpt-zcj\_external\token_proxy\.worktrees\cooldown-recovery-mode\crates\token_proxy_core\src\proxy\config\types.test.rs`
- Modify `D:\master\gpt-zcj\_external\token_proxy\.worktrees\cooldown-recovery-mode\crates\token_proxy_core\src\proxy\config\mod.test.rs`
- [ ] Add `RetryableFailureCooldownMode` enum with `time_window` default and `clear_on_later_success` variant.
- [ ] Store the new field in `ProxyConfigFile` and `ProxyConfig`.
- [ ] Add defaults/serde handling/tests for the new field.

### Task 2: Implement runtime cooldown-clearing behavior
- Modify `D:\master\gpt-zcj\_external\token_proxy\.worktrees\cooldown-recovery-mode\crates\token_proxy_core\src\proxy\upstream.rs`
- Modify `D:\master\gpt-zcj\_external\token_proxy\.worktrees\cooldown-recovery-mode\crates\token_proxy_core\src\proxy\upstream\result.rs`
- Modify `D:\master\gpt-zcj\_external\token_proxy\.worktrees\cooldown-recovery-mode\crates\token_proxy_core\src\proxy\server.test.rs`
- [ ] Track newly cooled upstream selector keys and account IDs during a request attempt chain.
- [ ] When a later candidate succeeds and mode is `clear_on_later_success`, clear tracked cooldowns before returning success.
- [ ] Add regression tests for same-provider upstreams and pinned/account-backed upstreams.

### Task 3: Add frontend config support
- Modify `D:\master\gpt-zcj\_external\token_proxy\.worktrees\cooldown-recovery-mode\src\features\config\types.ts`
- Modify `D:\master\gpt-zcj\_external\token_proxy\.worktrees\cooldown-recovery-mode\src\features\config\form.ts`
- Modify `D:\master\gpt-zcj\_external\token_proxy\.worktrees\cooldown-recovery-mode\src\features\config\form.test.ts`
- [ ] Add the cooldown mode type and wire it through `EMPTY_FORM`, `toForm`, `toPayload`, and validation.
- [ ] Add form tests for round-trip/default behavior.

### Task 4: Add Core card UI and copy
- Modify `D:\master\gpt-zcj\_external\token_proxy\.worktrees\cooldown-recovery-mode\src\features\config\cards\proxy-core-card.tsx`
- Modify `D:\master\gpt-zcj\_external\token_proxy\.worktrees\cooldown-recovery-mode\src\features\config\AppView.test.tsx`
- Modify `D:\master\gpt-zcj\_external\token_proxy\.worktrees\cooldown-recovery-mode\messages\en.json`
- Modify `D:\master\gpt-zcj\_external\token_proxy\.worktrees\cooldown-recovery-mode\messages\zh.json`
- [ ] Add a selector for cooldown mode beside the existing cooldown seconds field.
- [ ] Add English/Chinese copy for labels, descriptions, and options.
- [ ] Recompile Paraglide and verify related frontend tests.

### Task 5: Verification and commit
- [ ] Run `cargo test -p token_proxy_core` and note the known pre-existing baseline failure if it is still the only failing test.
- [ ] Run `pnpm vitest run src/features/config/form.test.ts src/features/config/AppView.test.tsx src/features/config/ConfigScreen.test.tsx`.
- [ ] Run `pnpm exec tsc --noEmit`.
- [ ] Commit with a focused message for the cooldown-mode feature.
