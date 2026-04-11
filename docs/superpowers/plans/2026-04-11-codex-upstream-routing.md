# Codex Upstream-Owned Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Codex routing control from account priority to upstream priority so `/v1/responses` can honor explicit upstream order like `free -> channel1 -> channel2 -> plus` while preserving cooldown-driven return-to-free behavior.

**Architecture:** Keep the existing config and provider systems, but make Codex upstreams explicitly bind a `codex_account_id`, preserve that binding through the frontend form, and special-case `/v1/responses` routing so it iterates concrete upstreams in global priority order instead of provider-first order. Reuse the existing cooldown state in `account_selector` so pinned Codex upstreams are skipped only temporarily, not permanently.

**Tech Stack:** Rust (`token_proxy_core`, Axum, Tokio), TypeScript/React, Tauri, Vitest, Cargo tests.

---

## File structure and responsibilities

- Modify: `D:\master\gpt-zcj\_external\token_proxy\src\features\config\types.ts` — add account-binding fields to `UpstreamForm`.
- Modify: `D:\master\gpt-zcj\_external\token_proxy\src\features\config\form.ts` — preserve `codex_account_id`/`kiro_account_id`, validate enabled Codex upstreams, and stop auto-injecting `codex-default`.
- Modify: `D:\master\gpt-zcj\_external\token_proxy\src\features\config\cards\upstreams\editor-dialog-form.tsx` — render account selectors for account-backed upstreams.
- Modify: `D:\master\gpt-zcj\_external\token_proxy\src\features\config\cards\upstreams\editor-dialog.tsx`, `D:\master\gpt-zcj\_external\token_proxy\src\features\config\cards\upstreams-card.tsx`, `D:\master\gpt-zcj\_external\token_proxy\src\features\config\AppView.tsx`, `D:\master\gpt-zcj\_external\token_proxy\src\features\config\ConfigScreen.tsx` — thread account state into the upstream editor.
- Modify: `D:\master\gpt-zcj\_external\token_proxy\crates\token_proxy_core\src\proxy\upstream.rs` — skip pinned Codex accounts during cooldown and allow forwarding a selected upstream subset.
- Modify: `D:\master\gpt-zcj\_external\token_proxy\crates\token_proxy_core\src\proxy\server.rs` — build a concrete `/v1/responses` upstream chain ordered by priority.
- Modify: `D:\master\gpt-zcj\_external\token_proxy\src\features\providers\providers-accounts-table.tsx` and `D:\master\gpt-zcj\_external\token_proxy\src\features\providers\ProvidersPanel.tsx` — remove Codex priority editing from the UI path.
- Test: `D:\master\gpt-zcj\_external\token_proxy\src\features\config\form.test.ts`, `D:\master\gpt-zcj\_external\token_proxy\src\features\config\cards\upstreams\editor-dialog-form.test.tsx`, `D:\master\gpt-zcj\_external\token_proxy\src\features\providers\ProvidersPanel.test.tsx`, `D:\master\gpt-zcj\_external\token_proxy\crates\token_proxy_core\src\proxy\server.test.rs`.

### Task 1: Preserve account bindings in the config form

**Files:**
- Modify: `D:\master\gpt-zcj\_external\token_proxy\src\features\config\types.ts`
- Modify: `D:\master\gpt-zcj\_external\token_proxy\src\features\config\form.ts`
- Test: `D:\master\gpt-zcj\_external\token_proxy\src\features\config\form.test.ts`

- [ ] **Step 1: Write the failing form tests**

```ts
it("preserves codex and kiro account bindings when loading and saving config", () => {
  const form = toForm({
    host: "127.0.0.1",
    port: 9208,
    local_api_key: null,
    app_proxy_url: null,
    upstreams: [
      {
        id: "codex-free",
        providers: ["codex"],
        base_url: "",
        api_keys: undefined,
        proxy_url: null,
        codex_account_id: "codex-free.json",
        priority: 99,
        enabled: true,
        model_mappings: {},
      },
    ],
    tray_token_rate: { enabled: true, format: "split" },
    upstream_strategy: { order: "fill_first", dispatch: { type: "serial" } },
  });

  expect(form.upstreams[0]?.codexAccountId).toBe("codex-free.json");

  const payload = toPayload(form);
  expect(payload.upstreams[0]?.codex_account_id).toBe("codex-free.json");
});

it("requires an account id for enabled codex upstreams", () => {
  const upstream = createEmptyUpstream();
  upstream.id = "codex-free";
  upstream.providers = ["codex"];
  upstream.enabled = true;
  upstream.codexAccountId = "";

  const result = validate({
    ...EMPTY_FORM,
    upstreams: [upstream],
  });

  expect(result).toEqual({
    valid: false,
    message: m.error_upstream_codex_account_required({ id: "codex-free" }),
  });
});

it("does not auto-create codex-default when codex accounts exist", () => {
  const upstreams = syncAccountBackedUpstreams([], {
    hasKiroAccount: false,
    hasCodexAccount: true,
  });

  expect(upstreams).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/features/config/form.test.ts`
Expected: FAIL because `UpstreamForm` does not expose `codexAccountId`, `toPayload()` clears `codex_account_id`, and `syncAccountBackedUpstreams()` still creates `codex-default`.

- [ ] **Step 3: Write minimal implementation**

```ts
// D:\master\gpt-zcj\_external\token_proxy\src\features\config\types.ts
export type UpstreamForm = {
  id: string;
  providers: string[];
  baseUrl: string;
  apiKeys: string;
  filterPromptCacheRetention: boolean;
  filterSafetyIdentifier: boolean;
  useChatCompletionsForResponses: boolean;
  rewriteDeveloperRoleToSystem: boolean;
  kiroAccountId: string;
  codexAccountId: string;
  preferredEndpoint: "" | KiroPreferredEndpoint;
  proxyUrl: string;
  priority: string;
  enabled: boolean;
  modelMappings: ModelMappingForm[];
  convertFromMap: Record<string, InboundApiFormat[]>;
  overrides: { header: HeaderOverrideForm[] };
};

// D:\master\gpt-zcj\_external\token_proxy\src\features\config\form.ts
export function createEmptyUpstream(): UpstreamForm {
  return {
    id: "",
    providers: ["openai"],
    baseUrl: "",
    apiKeys: "",
    filterPromptCacheRetention: false,
    filterSafetyIdentifier: false,
    useChatCompletionsForResponses: false,
    rewriteDeveloperRoleToSystem: false,
    kiroAccountId: "",
    codexAccountId: "",
    preferredEndpoint: "",
    proxyUrl: "",
    priority: "",
    enabled: false,
    modelMappings: [],
    convertFromMap: {},
    overrides: { header: [] },
  };
}

// inside toForm(...)
kiroAccountId: upstream.kiro_account_id ?? "",
codexAccountId: upstream.codex_account_id ?? "",

// inside toPayload(...)
kiro_account_id: upstream.kiroAccountId.trim() ? upstream.kiroAccountId.trim() : null,
codex_account_id: upstream.codexAccountId.trim() ? upstream.codexAccountId.trim() : null,

// inside validate(...)
if (isSingleProvider(upstream, "codex") && !upstream.codexAccountId.trim()) {
  return {
    valid: false,
    message: m.error_upstream_codex_account_required({ id }),
  };
}

// D:\master\gpt-zcj\_external\token_proxy\messages\en.json
"error_upstream_codex_account_required": "Upstream {id} requires a Codex account.",

// D:\master\gpt-zcj\_external\token_proxy\messages\zh.json
"error_upstream_codex_account_required": "?? {id} ?????? Codex ???",

// after editing locale files
pnpm run i18n:compile

// inside syncAccountBackedUpstreams(...)
if (isSingleProvider(upstream, "codex")) {
  return true;
}
...
if (accountState.hasCodexAccount && !next.some((upstream) => isSingleProvider(upstream, "codex"))) {
  return next;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/features/config/form.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add src/features/config/types.ts src/features/config/form.ts src/features/config/form.test.ts
git commit -m "feat: preserve codex upstream account bindings"
```

### Task 2: Surface account selectors in the upstream editor

**Files:**
- Modify: `D:\master\gpt-zcj\_external\token_proxy\src\features\config\cards\upstreams\editor-dialog-form.tsx`
- Modify: `D:\master\gpt-zcj\_external\token_proxy\src\features\config\cards\upstreams\editor-dialog.tsx`
- Modify: `D:\master\gpt-zcj\_external\token_proxy\src\features\config\cards\upstreams-card.tsx`
- Modify: `D:\master\gpt-zcj\_external\token_proxy\src\features\config\AppView.tsx`
- Modify: `D:\master\gpt-zcj\_external\token_proxy\src\features\config\ConfigScreen.tsx`
- Test: `D:\master\gpt-zcj\_external\token_proxy\src\features\config\cards\upstreams\editor-dialog-form.test.tsx`

- [ ] **Step 1: Write the failing editor test**

```tsx
it("renders codex account selector", () => {
  const draft = createEmptyUpstream();
  draft.id = "codex-free";
  draft.providers = ["codex"];
  draft.codexAccountId = "codex-free.json";

  render(
    <UpstreamEditorFields
      draft={draft}
      providerOptions={["codex"]}
      appProxyUrl=""
      showApiKeys={false}
      codexAccounts={[
        {
          account_id: "codex-free.json",
          email: "free@example.com",
          status: "active",
          expires_at: null,
          auto_refresh_enabled: false,
          proxy_url: null,
          priority: 0,
        },
      ]}
      codexAccountsLoading={false}
      codexAccountsError=""
      onRefreshCodexAccounts={vi.fn()}
      kiroAccounts={[]}
      kiroAccountsLoading={false}
      kiroAccountsError=""
      onRefreshKiroAccounts={vi.fn()}
      onToggleApiKeys={vi.fn()}
      onChangeDraft={vi.fn()}
    />
  );

  expect(screen.getByText(m.field_codex_account())).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/features/config/cards/upstreams/editor-dialog-form.test.tsx`
Expected: FAIL because `UpstreamEditorFields` does not accept account props and never renders `CodexAccountSelect`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// D:\master\gpt-zcj\_external\token_proxy\src\features\config\cards\upstreams\editor-dialog-form.tsx
import { CodexAccountSelect } from "@/features/config/cards/upstreams/codex-account-select";
import { KiroAccountSelect } from "@/features/config/cards/upstreams/kiro-account-select";

export type UpstreamEditorFieldsProps = {
  draft: UpstreamForm;
  providerOptions: readonly string[];
  appProxyUrl: string;
  showApiKeys: boolean;
  codexAccounts: CodexAccountSummary[];
  codexAccountsLoading: boolean;
  codexAccountsError: string;
  onRefreshCodexAccounts: () => void;
  kiroAccounts: KiroAccountSummary[];
  kiroAccountsLoading: boolean;
  kiroAccountsError: string;
  onRefreshKiroAccounts: () => void;
  onToggleApiKeys: () => void;
  onChangeDraft: (patch: Partial<UpstreamForm>) => void;
};

{isKiro ? (
  <KiroAccountSelect
    accountId={draft.kiroAccountId}
    accounts={kiroAccounts}
    loading={kiroAccountsLoading}
    error={kiroAccountsError}
    onRefresh={onRefreshKiroAccounts}
    onSelect={(accountId) => onChangeDraft({ kiroAccountId: accountId })}
  />
) : null}

{isCodex ? (
  <CodexAccountSelect
    accountId={draft.codexAccountId}
    accounts={codexAccounts}
    loading={codexAccountsLoading}
    error={codexAccountsError}
    onRefresh={onRefreshCodexAccounts}
    onSelect={(accountId) => onChangeDraft({ codexAccountId: accountId })}
  />
) : null}
```

```tsx
// D:\master\gpt-zcj\_external\token_proxy\src\features\config\AppView.tsx
<UpstreamsCard
  ...
  kiroAccounts={props.kiroAccounts}
  kiroAccountsLoading={props.kiroAccountsLoading}
  kiroAccountsError={props.kiroAccountsError}
  onRefreshKiroAccounts={props.onRefreshKiroAccounts}
  codexAccounts={props.codexAccounts}
  codexAccountsLoading={props.codexAccountsLoading}
  codexAccountsError={props.codexAccountsError}
  onRefreshCodexAccounts={props.onRefreshCodexAccounts}
/>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/features/config/form.test.ts src/features/config/cards/upstreams/editor-dialog-form.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add src/features/config/ConfigScreen.tsx src/features/config/AppView.tsx src/features/config/cards/upstreams-card.tsx src/features/config/cards/upstreams/editor-dialog.tsx src/features/config/cards/upstreams/editor-dialog-form.tsx src/features/config/cards/upstreams/editor-dialog-form.test.tsx
git commit -m "feat: add account selectors to account-backed upstreams"
```

### Task 3: Make pinned Codex upstreams cooldown-aware

**Files:**
- Modify: `D:\master\gpt-zcj\_external\token_proxy\crates\token_proxy_core\src\proxy\upstream.rs`
- Test: `D:\master\gpt-zcj\_external\token_proxy\crates\token_proxy_core\src\proxy\server.test.rs`

- [ ] **Step 1: Write the failing pinned-account cooldown test**

```rust
async fn spawn_mock_responses_text(text: &str) -> MockUpstream {
    spawn_mock_upstream(
        StatusCode::OK,
        json!({
            "id": "resp_ok",
            "output": [{
                "type": "message",
                "role": "assistant",
                "content": [{ "type": "output_text", "text": text }]
            }],
            "usage": { "input_tokens": 1, "output_tokens": 1, "total_tokens": 2 }
        }),
    )
    .await
}

fn future_expiry() -> String {
    (OffsetDateTime::now_utc() + TimeDuration::days(1))
        .format(&time::format_description::well_known::Rfc3339)
        .expect("format expires_at")
}

#[test]
fn responses_request_skips_pinned_codex_upstream_while_account_is_cooling() {
    run_async(async {
        let codex = spawn_mock_responses_text("from free").await;
        let channel = spawn_mock_responses_text("from channel").await;

        let mut config = config_with_runtime_upstreams(&[
            (PROVIDER_CODEX, 99, "codex-free", codex.base_url.as_str(), FORMATS_RESPONSES),
            (PROVIDER_RESPONSES, 50, "channel-1", channel.base_url.as_str(), FORMATS_RESPONSES),
        ]);
        config.upstreams.get_mut(PROVIDER_CODEX).unwrap().groups[0].items[0].codex_account_id =
            Some("codex-free.json".to_string());

        let data_dir = next_test_data_dir("responses_skip_cooling_pinned_codex");
        let state = build_test_state_handle(config, data_dir.clone()).await;
        let expires_at = future_expiry();
        seed_codex_account(&state, "codex-free.json", "codex-token-free", "chatgpt-free", &expires_at).await;
        state.account_selector.mark_retryable_failure("codex", "codex-free.json");

        let (status, json) = send_responses_request(state).await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(json["output"][0]["content"][0]["text"].as_str(), Some("from channel"));
        assert_eq!(codex.requests().len(), 0);
        assert_eq!(channel.requests().len(), 1);
    });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p token_proxy_core responses_request_skips_pinned_codex_upstream_while_account_is_cooling -- --nocapture`
Expected: FAIL because pinned `codex_account_id` upstreams are still attempted during cooldown.

- [ ] **Step 3: Write minimal implementation**

```rust
// D:\master\gpt-zcj\_external\token_proxy\crates\token_proxy_core\src\proxy\upstream.rs
async fn resolve_codex_upstream(
    state: &ProxyState,
    upstream: &UpstreamRuntime,
    upstream_url: &str,
) -> Result<ResolvedUpstreamAuth, AttemptOutcome> {
    if let Some(account_id) = upstream
        .codex_account_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        if state.account_selector.is_cooling_down("codex", account_id) {
            return Err(AttemptOutcome::Retryable(http::error_response(
                StatusCode::TOO_MANY_REQUESTS,
                "Pinned Codex account is cooling down.",
            )));
        }
    }

    let has_pinned_account = upstream
        .codex_account_id
        .as_deref()
        .map(str::trim)
        .is_some_and(|value| !value.is_empty());
    let ordered_account_ids = if has_pinned_account {
        None
    } else {
        Some(ordered_runtime_account_ids(state, "codex").await)
    };
    ...
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p token_proxy_core responses_request_skips_pinned_codex_upstream_while_account_is_cooling -- --nocapture`
Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add crates/token_proxy_core/src/proxy/upstream.rs crates/token_proxy_core/src/proxy/server.test.rs
git commit -m "fix: skip pinned codex upstreams during cooldown"
```

### Task 4: Route `/v1/responses` by concrete upstream priority

**Files:**
- Modify: `D:\master\gpt-zcj\_external\token_proxy\crates\token_proxy_core\src\proxy\server.rs`
- Modify: `D:\master\gpt-zcj\_external\token_proxy\crates\token_proxy_core\src\proxy\upstream.rs`
- Test: `D:\master\gpt-zcj\_external\token_proxy\crates\token_proxy_core\src\proxy\server.test.rs`

- [ ] **Step 1: Write the failing routing-order tests**

```rust
async fn spawn_mock_responses_text(text: &str) -> MockUpstream {
    spawn_mock_upstream(
        StatusCode::OK,
        json!({
            "id": "resp_ok",
            "output": [{
                "type": "message",
                "role": "assistant",
                "content": [{ "type": "output_text", "text": text }]
            }],
            "usage": { "input_tokens": 1, "output_tokens": 1, "total_tokens": 2 }
        }),
    )
    .await
}

async fn spawn_mock_rate_limited_upstream() -> MockUpstream {
    spawn_mock_upstream(
        StatusCode::TOO_MANY_REQUESTS,
        json!({ "error": { "message": "rate limited" } }),
    )
    .await
}

fn future_expiry() -> String {
    (OffsetDateTime::now_utc() + TimeDuration::days(1))
        .format(&time::format_description::well_known::Rfc3339)
        .expect("format expires_at")
}

#[test]
fn responses_request_uses_global_upstream_priority_across_codex_and_channels() {
    run_async(async {
        let codex_free = spawn_mock_rate_limited_upstream().await;
        let channel_1 = spawn_mock_responses_text("from channel 1").await;
        let channel_2 = spawn_mock_responses_text("from channel 2").await;
        let codex_plus = spawn_mock_responses_text("from plus").await;

        let mut config = config_with_runtime_upstreams(&[
            (PROVIDER_CODEX, 99, "codex-free", codex_free.base_url.as_str(), FORMATS_RESPONSES),
            (PROVIDER_RESPONSES, 50, "channel-1", channel_1.base_url.as_str(), FORMATS_RESPONSES),
            (PROVIDER_RESPONSES, 49, "channel-2", channel_2.base_url.as_str(), FORMATS_RESPONSES),
            (PROVIDER_CODEX, 0, "codex-plus", codex_plus.base_url.as_str(), FORMATS_RESPONSES),
        ]);
        config.upstreams.get_mut(PROVIDER_CODEX).unwrap().groups[0].items[0].codex_account_id = Some("codex-free.json".to_string());
        config.upstreams.get_mut(PROVIDER_CODEX).unwrap().groups[1].items[0].codex_account_id = Some("codex-plus.json".to_string());

        let data_dir = next_test_data_dir("responses_global_upstream_priority");
        let state = build_test_state_handle(config, data_dir.clone()).await;
        let expires_at = future_expiry();
        seed_codex_account(&state, "codex-free.json", "codex-token-free", "chatgpt-free", &expires_at).await;
        seed_codex_account(&state, "codex-plus.json", "codex-token-plus", "chatgpt-plus", &expires_at).await;

        let (status, json) = send_responses_request(state).await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(json["output"][0]["content"][0]["text"].as_str(), Some("from channel 1"));
        assert_eq!(channel_1.requests().len(), 1);
        assert_eq!(channel_2.requests().len(), 0);
        assert_eq!(codex_plus.requests().len(), 0);
    });
}

#[test]
fn responses_request_returns_to_free_after_pinned_codex_cooldown_expires() {
    run_async(async {
        let codex_free = spawn_mock_responses_text("from free").await;
        let channel_1 = spawn_mock_responses_text("from channel 1").await;

        let mut config = config_with_runtime_upstreams(&[
            (PROVIDER_CODEX, 99, "codex-free", codex_free.base_url.as_str(), FORMATS_RESPONSES),
            (PROVIDER_RESPONSES, 50, "channel-1", channel_1.base_url.as_str(), FORMATS_RESPONSES),
        ]);
        config.upstreams.get_mut(PROVIDER_CODEX).unwrap().groups[0].items[0].codex_account_id = Some("codex-free.json".to_string());

        let data_dir = next_test_data_dir("responses_return_to_free_after_cooldown");
        let state = build_test_state_handle(config, data_dir.clone()).await;
        let expires_at = future_expiry();
        seed_codex_account(&state, "codex-free.json", "codex-token-free", "chatgpt-free", &expires_at).await;
        state.account_selector.mark_retryable_failure("codex", "codex-free.json");

        let (first_status, first_json) = send_responses_request(state.clone()).await;
        assert_eq!(first_status, StatusCode::OK);
        assert_eq!(first_json["output"][0]["content"][0]["text"].as_str(), Some("from channel 1"));

        state.account_selector.clear_cooldown("codex", "codex-free.json");

        let (second_status, second_json) = send_responses_request(state).await;
        assert_eq!(second_status, StatusCode::OK);
        assert_eq!(second_json["output"][0]["content"][0]["text"].as_str(), Some("from free"));
    });
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
- `cargo test -p token_proxy_core responses_request_uses_global_upstream_priority_across_codex_and_channels -- --nocapture`
- `cargo test -p token_proxy_core responses_request_returns_to_free_after_pinned_codex_cooldown_expires -- --nocapture`

Expected: FAIL because `server.rs` still chooses a primary provider first and never interleaves Codex and `openai-response` upstreams by global priority.

- [ ] **Step 3: Write minimal implementation**

```rust
// D:\master\gpt-zcj\_external\token_proxy\crates\token_proxy_core\src\proxy\server.rs
#[derive(Clone)]
struct ConcreteResponsesPlan {
    provider: &'static str,
    upstream_id: String,
    outbound_path: &'static str,
    request_transform: FormatTransform,
    response_transform: FormatTransform,
}

fn resolve_concrete_responses_plans(config: &ProxyConfig, compact: bool) -> Vec<ConcreteResponsesPlan> {
    let mut items = Vec::new();

    if let Some(upstreams) = config.provider_upstreams(PROVIDER_CODEX) {
        for group in &upstreams.groups {
            for upstream in &group.items {
                if upstream.supports_inbound(InboundApiFormat::OpenaiResponses) {
                    items.push((group.priority, ConcreteResponsesPlan {
                        provider: PROVIDER_CODEX,
                        upstream_id: upstream.id.clone(),
                        outbound_path: CODEX_RESPONSES_PATH,
                        request_transform: if compact {
                            FormatTransform::ResponsesCompactToCodex
                        } else {
                            FormatTransform::ResponsesToCodex
                        },
                        response_transform: FormatTransform::CodexToResponses,
                    }));
                }
            }
        }
    }

    if let Some(upstreams) = config.provider_upstreams(PROVIDER_RESPONSES) {
        for group in &upstreams.groups {
            for upstream in &group.items {
                if upstream.supports_inbound(InboundApiFormat::OpenaiResponses) {
                    items.push((group.priority, ConcreteResponsesPlan {
                        provider: PROVIDER_RESPONSES,
                        upstream_id: upstream.id.clone(),
                        outbound_path: RESPONSES_PATH,
                        request_transform: FormatTransform::None,
                        response_transform: FormatTransform::None,
                    }));
                }
            }
        }
    }

    items.sort_by(|left, right| right.0.cmp(&left.0));
    items.into_iter().map(|(_, plan)| plan).collect()
}
```

```rust
// D:\master\gpt-zcj\_external\token_proxy\crates\token_proxy_core\src\proxy\upstream.rs
pub(super) async fn forward_upstream_request(
    state: Arc<ProxyState>,
    method: Method,
    provider: &str,
    inbound_path: &str,
    upstream_path_with_query: &str,
    headers: &HeaderMap,
    body: &ReplayableBody,
    meta: &RequestMeta,
    request_auth: &RequestAuth,
    client_gemini_api_key: Option<String>,
    response_transform: FormatTransform,
    request_detail: Option<RequestDetailSnapshot>,
    target_upstream_ids: Option<&[String]>,
) -> ForwardUpstreamResult {
    let upstreams = match resolve_provider_upstreams(&state, provider, inbound_path, meta, request_detail.as_ref()) {
        Ok(upstreams) => upstreams,
        Err(response) => {
            return ForwardUpstreamResult { response, should_fallback: true };
        }
    };
    let scoped = filter_provider_upstreams(upstreams, target_upstream_ids);
    let summary = run_upstream_groups(
        &state,
        method,
        provider,
        detect_inbound_api_format(inbound_path),
        inbound_path,
        upstream_path_with_query,
        headers,
        body,
        meta,
        request_auth,
        client_gemini_api_key.as_deref(),
        response_transform,
        request_detail.clone(),
        &scoped,
    ).await;
    ...
}

fn filter_provider_upstreams(
    upstreams: &ProviderUpstreams,
    target_upstream_ids: Option<&[String]>,
) -> ProviderUpstreams {
    let Some(targets) = target_upstream_ids else {
        return upstreams.clone();
    };
    let targets = targets.iter().cloned().collect::<std::collections::HashSet<_>>();
    let groups = upstreams
        .groups
        .iter()
        .filter_map(|group| {
            let items = group
                .items
                .iter()
                .filter(|item| targets.contains(&item.id))
                .cloned()
                .collect::<Vec<_>>();
            if items.is_empty() {
                None
            } else {
                Some(UpstreamGroup { priority: group.priority, items })
            }
        })
        .collect::<Vec<_>>();
    ProviderUpstreams { groups }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
- `cargo test -p token_proxy_core responses_request_uses_global_upstream_priority_across_codex_and_channels -- --nocapture`
- `cargo test -p token_proxy_core responses_request_returns_to_free_after_pinned_codex_cooldown_expires -- --nocapture`
- `cargo test -p token_proxy_core responses_request_logs_selected_codex_account_id -- --nocapture`

Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add crates/token_proxy_core/src/proxy/server.rs crates/token_proxy_core/src/proxy/upstream.rs crates/token_proxy_core/src/proxy/server.test.rs
git commit -m "feat: route responses by upstream priority"
```

### Task 5: Remove Codex priority editing from the providers UI

**Files:**
- Modify: `D:\master\gpt-zcj\_external\token_proxy\src\features\providers\providers-accounts-table.tsx`
- Modify: `D:\master\gpt-zcj\_external\token_proxy\src\features\providers\ProvidersPanel.tsx`
- Test: `D:\master\gpt-zcj\_external\token_proxy\src\features\providers\ProvidersPanel.test.tsx`

- [ ] **Step 1: Write the failing UI test**

```tsx
it("does not show codex account priority controls in account dialog", async () => {
  const user = userEvent.setup();
  render(<ProvidersPanel />);

  await user.click(
    within(await findAccountRow("bob@example.com")).getByRole("button", {
      name: m.providers_account_dialog_title(),
    })
  );

  expect(screen.queryByLabelText(m.field_priority())).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: m.providers_save_priority() })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/features/providers/ProvidersPanel.test.tsx`
Expected: FAIL because the Codex account dialog still renders the shared priority editor.

- [ ] **Step 3: Write minimal implementation**

```tsx
// D:\master\gpt-zcj\_external\token_proxy\src\features\providers\providers-accounts-table.tsx
const canEditPriority = row?.provider === "kiro";

{canEditPriority ? (
  <div className="space-y-2 border-t border-border/60 pt-3">
    <Label htmlFor="provider-account-priority" className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
      {m.field_priority()}
    </Label>
    <p className="text-xs text-muted-foreground">{m.account_priority_tip()}</p>
    <div className="flex flex-col gap-2 sm:flex-row">
      <Input
        id="provider-account-priority"
        type="number"
        step="1"
        inputMode="numeric"
        value={priorityValue}
        onChange={(event) => setPriorityDraft(event.target.value)}
        disabled={busy}
        className="sm:max-w-[10rem]"
      />
      <Button type="button" size="sm" onClick={handleSavePriority} disabled={busy}>
        {m.providers_save_priority()}
      </Button>
    </div>
  </div>
) : null}

// D:\master\gpt-zcj\_external\token_proxy\src\features\providers\ProvidersPanel.tsx
const handleSavePriority = useCallback(
  async (row: ProviderAccountTableRow, priority: number) => {
    if (row.provider !== "kiro") {
      return;
    }
    try {
      await kiroAccounts.setPriority(row.accountId, priority);
      await kiroAccounts.refresh();
      await providerAccounts.refresh();
    } catch (error) {
      toast.error(parseError(error));
    }
  },
  [kiroAccounts, providerAccounts]
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/features/providers/ProvidersPanel.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add src/features/providers/providers-accounts-table.tsx src/features/providers/ProvidersPanel.tsx src/features/providers/ProvidersPanel.test.tsx
git commit -m "refactor: remove codex priority editing from providers ui"
```

### Task 6: Final verification

**Files:**
- Verify only; no planned file edits.

- [ ] **Step 1: Run the combined frontend verification**

Run: `pnpm vitest run src/features/config/form.test.ts src/features/config/cards/upstreams/editor-dialog-form.test.tsx src/features/providers/ProvidersPanel.test.tsx`
Expected: PASS

- [ ] **Step 2: Run the combined Rust verification**

Run:
- `cargo test -p token_proxy_core responses_request_skips_pinned_codex_upstream_while_account_is_cooling -- --nocapture`
- `cargo test -p token_proxy_core responses_request_uses_global_upstream_priority_across_codex_and_channels -- --nocapture`
- `cargo test -p token_proxy_core responses_request_returns_to_free_after_pinned_codex_cooldown_expires -- --nocapture`
- `cargo test -p token_proxy_core responses_request_logs_selected_codex_account_id -- --nocapture`

Expected: PASS

- [ ] **Step 3: Smoke-test the desktop app in dev mode**

Run: `pnpm tauri:dev`
Expected: the upstream editor shows a Codex account selector for `provider=codex`, a config with `codex-free(99), channel-1(50), channel-2(49), codex-plus(0)` saves successfully, requests use `free -> channel-1 -> channel-2 -> plus`, and after `free` cooldown expires later requests return to `free` first.

- [ ] **Step 4: Commit the completed feature**

```powershell
git add crates/token_proxy_core/src/proxy/server.rs crates/token_proxy_core/src/proxy/upstream.rs crates/token_proxy_core/src/proxy/server.test.rs src/features/config/types.ts src/features/config/form.ts src/features/config/form.test.ts src/features/config/AppView.tsx src/features/config/ConfigScreen.tsx src/features/config/cards/upstreams-card.tsx src/features/config/cards/upstreams/editor-dialog.tsx src/features/config/cards/upstreams/editor-dialog-form.tsx src/features/config/cards/upstreams/editor-dialog-form.test.tsx src/features/providers/providers-accounts-table.tsx src/features/providers/ProvidersPanel.tsx src/features/providers/ProvidersPanel.test.tsx
git commit -m "feat: move codex routing priority to upstreams"
```
