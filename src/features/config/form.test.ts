import { describe, expect, it } from "vitest";

import {
  EMPTY_FORM,
  createEmptyUpstream,
  createPayloadFilterRule,
  createPayloadParam,
  createPayloadValueRule,
  extractConfigExtras,
  mergeConfigExtras,
  syncAccountBackedUpstreams,
  toForm,
  toPayload,
  validate,
} from "@/features/config/form";
import { m } from "@/paraglide/messages.js";

describe("config/form", () => {
  it("validates required host", () => {
    expect(validate({ ...EMPTY_FORM, host: "   " }).valid).toBe(false);
  });

  it("validates port range", () => {
    expect(validate({ ...EMPTY_FORM, port: "70000" }).valid).toBe(false);
    expect(validate({ ...EMPTY_FORM, port: "0" }).valid).toBe(false);
    expect(validate({ ...EMPTY_FORM, port: "9208" }).valid).toBe(true);
  });

  it("validates retryable failure cooldown as non-negative integer", () => {
    expect(validate({ ...EMPTY_FORM, retryableFailureCooldownSecs: "-1" }).valid).toBe(false);
    expect(validate({ ...EMPTY_FORM, retryableFailureCooldownSecs: "" }).valid).toBe(false);
    expect(validate({ ...EMPTY_FORM, retryableFailureCooldownSecs: "0" }).valid).toBe(true);
    expect(validate({ ...EMPTY_FORM, retryableFailureCooldownSecs: "15" }).valid).toBe(true);
  });

  it("validates upstream no data timeout as integer >= 3", () => {
    expect(validate({ ...EMPTY_FORM, upstreamNoDataTimeoutSecs: "-1" }).valid).toBe(false);
    expect(validate({ ...EMPTY_FORM, upstreamNoDataTimeoutSecs: "" }).valid).toBe(false);
    expect(validate({ ...EMPTY_FORM, upstreamNoDataTimeoutSecs: "0" }).valid).toBe(false);
    expect(validate({ ...EMPTY_FORM, upstreamNoDataTimeoutSecs: "2" }).valid).toBe(false);
    expect(validate({ ...EMPTY_FORM, upstreamNoDataTimeoutSecs: "3" }).valid).toBe(true);
    expect(validate({ ...EMPTY_FORM, upstreamNoDataTimeoutSecs: "120" }).valid).toBe(true);
  });

  it("requires upstream id for enabled upstreams", () => {
    const upstream = createEmptyUpstream();
    const result = validate({ ...EMPTY_FORM, upstreams: [upstream] });

    expect(result.valid).toBe(false);
    expect(result.message).not.toBe("");
  });

  it("rejects unsupported provider in enabled upstreams", () => {
    const upstream = createEmptyUpstream();
    upstream.id = "legacy-1";
    upstream.enabled = true;
    upstream.providers = ["legacy-provider"];

    const result = validate({ ...EMPTY_FORM, upstreams: [upstream] });

    expect(result.valid).toBe(false);
  });

  it("allows enabled kiro upstreams without binding account ids", () => {
    const kiroUpstream = createEmptyUpstream();
    kiroUpstream.id = "kiro-1";
    kiroUpstream.enabled = true;
    kiroUpstream.providers = ["kiro"];

    expect(validate({ ...EMPTY_FORM, upstreams: [kiroUpstream] }).valid).toBe(true);
  });

  it("requires an account id for enabled codex upstreams", () => {
    const codexUpstream = createEmptyUpstream();
    codexUpstream.id = "codex-1";
    codexUpstream.enabled = true;
    codexUpstream.providers = ["codex"];
    codexUpstream.codexAccountId = "";

    expect(validate({ ...EMPTY_FORM, upstreams: [codexUpstream] })).toEqual({
      valid: false,
      message: m.error_upstream_codex_account_required({ id: "codex-1" }),
    });
  });

  it("treats disabled upstream as draft (still requires id)", () => {
    const upstream = createEmptyUpstream();
    upstream.id = "u1";
    upstream.enabled = false;
    upstream.providers = [];
    upstream.baseUrl = "";

    expect(validate({ ...EMPTY_FORM, upstreams: [upstream] }).valid).toBe(true);
  });

  it("creates new upstream as disabled draft", () => {
    const upstream = createEmptyUpstream();
    upstream.id = "openai-1";

    expect(upstream.enabled).toBe(false);
    expect(validate({ ...EMPTY_FORM, upstreams: [upstream] }).valid).toBe(true);
  });

  it("extracts and merges unknown config keys as extras", () => {
    const payload = toPayload(EMPTY_FORM);
    const configWithExtras = { ...payload, foo: 1, bar: { nested: true } };

    const extras = extractConfigExtras(configWithExtras);
    expect(extras).toEqual({ foo: 1, bar: { nested: true } });

    const merged = mergeConfigExtras(payload, extras);
    expect(merged).toMatchObject({
      foo: 1,
      bar: { nested: true },
      host: payload.host,
      port: payload.port,
    });
  });

  it("normalizes payload (trim + de-dup providers + sanitize convert_from_map)", () => {
    const upstream = createEmptyUpstream();
    upstream.id = "  upstream-1 ";
    upstream.providers = [" openai ", "openai", "", " openai-response "];
    upstream.baseUrl = " https://example.com ";
    upstream.apiKeys = "   ";
    upstream.convertFromMap = {
      openai: ["openai_chat"],
      unknown: ["gemini"],
    };

    const payload = toPayload({
      ...EMPTY_FORM,
      host: " 127.0.0.1 ",
      localApiKey: " ",
      modelListPrefix: true,
      upstreams: [upstream],
    });

    expect(payload.host).toBe("127.0.0.1");
    expect(payload.local_api_key).toBeNull();
    expect(payload.model_list_prefix).toBe(true);
    expect(payload.retryable_failure_cooldown_secs).toBe(15);
    expect(payload.upstream_no_data_timeout_secs).toBe(120);
    expect(payload.upstreams[0]?.id).toBe("upstream-1");
    expect(payload.upstreams[0]?.providers).toEqual(["openai", "openai-response"]);
    expect(payload.upstreams[0]?.base_url).toBe("https://example.com");
    expect(payload.upstreams[0]?.api_keys).toBeUndefined();
    // openai_chat 对 openai 是 native 格式，应被清理；unknown provider 也应被丢弃。
    expect(payload.upstreams[0]?.convert_from_map).toBeUndefined();
  });

  it("serializes multiple upstream api keys", () => {
    const upstream = createEmptyUpstream();
    upstream.id = "multi-key";
    upstream.apiKeys = " key-a, key-b, key-a ";

    const payload = toPayload({
      ...EMPTY_FORM,
      upstreams: [upstream],
    });

    expect(payload.upstreams[0]?.api_keys).toEqual(["key-a", "key-b"]);
  });

  it("serializes retryable failure cooldown seconds", () => {
    const payload = toPayload({
      ...EMPTY_FORM,
      retryableFailureCooldownSecs: "30",
    });

    expect(payload.retryable_failure_cooldown_secs).toBe(30);
  });

  it("serializes retryable failure cooldown mode", () => {
    const payload = toPayload({
      ...EMPTY_FORM,
      retryableFailureCooldownMode: "clear_on_later_success",
    });

    expect(payload.retryable_failure_cooldown_mode).toBe("clear_on_later_success");
  });

  it("defaults upstream no data timeout seconds to 120 when config omits it", () => {
    expect(EMPTY_FORM.upstreamNoDataTimeoutSecs).toBe("120");

    const form = toForm({
      host: "127.0.0.1",
      port: 9208,
      local_api_key: null,
      app_proxy_url: null,
      upstreams: [
        {
          id: "multi-key",
          providers: ["openai"],
          base_url: "https://example.com",
          api_keys: ["key-a", "key-b"],
          proxy_url: null,
          priority: null,
          enabled: true,
          model_mappings: {},
        },
      ],
      tray_token_rate: {
        enabled: true,
        format: "split",
      },
      upstream_strategy: {
        order: "fill_first",
        dispatch: {
          type: "serial",
        },
      },
    });

    expect(form.upstreamNoDataTimeoutSecs).toBe("120");
    expect(form.retryableFailureCooldownMode).toBe("time_window");
    expect(form.modelListPrefix).toBe(false);
    expect(form.upstreams[0]?.apiKeys).toBe("key-a, key-b");
    expect(form.upstreamStrategy).toEqual({
      order: "fill_first",
      dispatchType: "serial",
      hedgeDelayMs: "2000",
      maxParallel: "2",
    });
  });

  it("preserves kiro and codex account bindings when loading and saving config", () => {
    const form = toForm({
      host: "127.0.0.1",
      port: 9208,
      local_api_key: null,
      app_proxy_url: null,
      upstreams: [
        {
          id: "kiro-default",
          providers: ["kiro"],
          base_url: "",
          api_keys: undefined,
          proxy_url: null,
          kiro_account_id: "kiro-primary.json",
          priority: 10,
          enabled: true,
          model_mappings: {},
        },
        {
          id: "codex-default",
          providers: ["codex"],
          base_url: "",
          api_keys: undefined,
          proxy_url: null,
          codex_account_id: "codex-primary.json",
          priority: 20,
          enabled: true,
          model_mappings: {},
        },
      ],
      tray_token_rate: {
        enabled: true,
        format: "split",
      },
      upstream_strategy: {
        order: "fill_first",
        dispatch: {
          type: "serial",
        },
      },
    });

    expect(form.upstreams[0]?.providers).toEqual(["kiro"]);
    expect(form.upstreams[1]?.providers).toEqual(["codex"]);
    expect(form.upstreams[0]?.kiroAccountId).toBe("kiro-primary.json");
    expect(form.upstreams[1]?.codexAccountId).toBe("codex-primary.json");

    const payload = toPayload(form);

    expect(payload.upstreams[0]?.kiro_account_id).toBe("kiro-primary.json");
    expect(payload.upstreams[1]?.codex_account_id).toBe("codex-primary.json");
  });

  it("loads retryable failure cooldown mode from config", () => {
    const form = toForm({
      host: "127.0.0.1",
      port: 9208,
      local_api_key: null,
      app_proxy_url: null,
      retryable_failure_cooldown_mode: "clear_on_later_success",
      upstreams: [],
      tray_token_rate: {
        enabled: true,
        format: "split",
      },
      upstream_strategy: {
        order: "fill_first",
        dispatch: {
          type: "serial",
        },
      },
    });

    expect(form.retryableFailureCooldownMode).toBe("clear_on_later_success");
  });

  it("round-trips payload rules through form serialization", () => {
    const form = toForm({
      host: "127.0.0.1",
      port: 9208,
      local_api_key: null,
      app_proxy_url: null,
      payload_rules: {
        default: [
          {
            models: ["gpt-5.4"],
            params: [
              {
                path: "instructions",
                value_type: "string",
                value: "You are an IT software development expert",
              },
            ],
          },
        ],
        override: [
          {
            models: ["gpt-5.4"],
            params: [
              {
                path: "service_tier",
                value_type: "string",
                value: "priority",
              },
            ],
          },
        ],
        filter: [
          {
            models: ["gpt-5.4"],
            paths: ["reasoning.summary"],
          },
        ],
      },
      upstreams: [],
      tray_token_rate: {
        enabled: true,
        format: "split",
      },
      upstream_strategy: {
        order: "fill_first",
        dispatch: {
          type: "serial",
        },
      },
    });

    expect(form.payloadRules.defaultRules[0]?.models).toEqual(["gpt-5.4"]);
    expect(form.payloadRules.overrideRules[0]?.params[0]?.value).toBe("priority");
    expect(form.payloadRules.filterRules[0]?.paths).toEqual(["reasoning.summary"]);

    const payload = toPayload(form);
    expect(payload.payload_rules).toEqual({
      default: [
        {
          models: ["gpt-5.4"],
          params: [
            {
              path: "instructions",
              value_type: "string",
              value: "You are an IT software development expert",
            },
          ],
        },
      ],
      override: [
        {
          models: ["gpt-5.4"],
          params: [
            {
              path: "service_tier",
              value_type: "string",
              value: "priority",
            },
          ],
        },
      ],
      filter: [
        {
          models: ["gpt-5.4"],
          paths: ["reasoning.summary"],
        },
      ],
    });
  });

  it("serializes typed payload rule values", () => {
    const defaultRule = createPayloadValueRule();
    defaultRule.models = ["gpt-5.4"];
    defaultRule.params = [
      createPayloadParam("metadata", "json", "{\"source\":\"token_proxy\"}"),
      createPayloadParam("temperature", "number", "0.2"),
      createPayloadParam("stream", "boolean", "true"),
    ];

    const payload = toPayload({
      ...EMPTY_FORM,
      payloadRules: {
        defaultRules: [defaultRule],
        overrideRules: [],
        filterRules: [],
      },
    });

    expect(payload.payload_rules).toEqual({
      default: [
        {
          models: ["gpt-5.4"],
          params: [
            {
              path: "metadata",
              value_type: "json",
              value: { source: "token_proxy" },
            },
            {
              path: "temperature",
              value_type: "number",
              value: 0.2,
            },
            {
              path: "stream",
              value_type: "boolean",
              value: true,
            },
          ],
        },
      ],
      override: [],
      filter: [],
    });
  });

  it("validates payload rules for exact model, path, and typed values", () => {
    const defaultRule = createPayloadValueRule();
    defaultRule.models = [""];
    defaultRule.params = [createPayloadParam("instructions", "string", "hello")];

    expect(
      validate({
        ...EMPTY_FORM,
        payloadRules: {
          defaultRules: [defaultRule],
          overrideRules: [],
          filterRules: [],
        },
      })
    ).toEqual({
      valid: false,
      message: m.error_payload_rule_model_required({ kind: "default", row: "1" }),
    });

    defaultRule.models = ["gpt-5.4"];
    defaultRule.params = [createPayloadParam("tools[0]", "string", "hello")];
    expect(
      validate({
        ...EMPTY_FORM,
        payloadRules: {
          defaultRules: [defaultRule],
          overrideRules: [],
          filterRules: [],
        },
      })
    ).toEqual({
      valid: false,
      message: m.error_payload_rule_path_invalid({ kind: "default", row: "1.1" }),
    });

    defaultRule.params = [createPayloadParam("temperature", "number", "abc")];
    expect(
      validate({
        ...EMPTY_FORM,
        payloadRules: {
          defaultRules: [defaultRule],
          overrideRules: [],
          filterRules: [],
        },
      })
    ).toEqual({
      valid: false,
      message: m.error_payload_rule_value_invalid({ kind: "default", row: "1.1" }),
    });

    const filterRule = createPayloadFilterRule();
    filterRule.models = ["gpt-5.4"];
    filterRule.paths = ["reasoning.summary"];
    expect(
      validate({
        ...EMPTY_FORM,
        payloadRules: {
          defaultRules: [],
          overrideRules: [],
          filterRules: [filterRule],
        },
      }).valid
    ).toBe(true);
  });

  it("drops upstream base_url and proxy_url for kiro and codex providers", () => {
    const kiroUpstream = createEmptyUpstream();
    kiroUpstream.id = "kiro-default";
    kiroUpstream.providers = ["kiro"];
    kiroUpstream.baseUrl = "https://should-not-survive.example.com";
    kiroUpstream.proxyUrl = "http://127.0.0.1:7890";

    const codexUpstream = createEmptyUpstream();
    codexUpstream.id = "codex-default";
    codexUpstream.providers = ["codex"];
    codexUpstream.baseUrl = "https://also-should-not-survive.example.com";
    codexUpstream.proxyUrl = "socks5://127.0.0.1:1080";

    const payload = toPayload({
      ...EMPTY_FORM,
      upstreams: [kiroUpstream, codexUpstream],
    });

    expect(payload.upstreams[0]?.base_url).toBe("");
    expect(payload.upstreams[0]?.proxy_url).toBeNull();
    expect(payload.upstreams[1]?.base_url).toBe("");
    expect(payload.upstreams[1]?.proxy_url).toBeNull();
  });

  it("auto-generates only kiro upstreams when accounts exist", () => {
    const upstreams = syncAccountBackedUpstreams([], {
      hasKiroAccount: true,
      hasCodexAccount: true,
    });

    expect(upstreams.map((item) => item.id)).toEqual(["kiro-default"]);
    expect(upstreams.map((item) => item.providers)).toEqual([["kiro"]]);
    expect(upstreams.every((item) => item.enabled)).toBe(true);
  });

  it("removes kiro upstreams but preserves explicit codex upstreams when accounts disappear", () => {
    const regular = createEmptyUpstream();
    regular.id = "openai-main";
    regular.providers = ["openai"];

    const kiro = createEmptyUpstream();
    kiro.id = "kiro-default";
    kiro.providers = ["kiro"];

    const codex = createEmptyUpstream();
    codex.id = "codex-free";
    codex.providers = ["codex"];
    codex.codexAccountId = "codex-free.json";
    codex.enabled = true;

    const upstreams = syncAccountBackedUpstreams([regular, kiro, codex], {
      hasKiroAccount: false,
      hasCodexAccount: false,
    });

    expect(upstreams).toEqual([regular, codex]);
  });

  it("serializes upstream no data timeout seconds", () => {
    const payload = toPayload({
      ...EMPTY_FORM,
      upstreamNoDataTimeoutSecs: "45",
    });

    expect(payload.upstream_no_data_timeout_secs).toBe(45);
  });

  it("serializes structured upstream strategy", () => {
    const payload = toPayload({
      ...EMPTY_FORM,
      upstreamStrategy: {
        order: "round_robin",
        dispatchType: "hedged",
        hedgeDelayMs: "1500",
        maxParallel: "3",
      },
    });

    expect(payload.upstream_strategy).toEqual({
      order: "round_robin",
      dispatch: {
        type: "hedged",
        delay_ms: 1500,
        max_parallel: 3,
      },
    });
  });

  it("validates hedged delay as positive integer", () => {
    expect(
      validate({
        ...EMPTY_FORM,
        upstreamStrategy: {
          ...EMPTY_FORM.upstreamStrategy,
          dispatchType: "hedged",
          hedgeDelayMs: "0",
        },
      }).valid
    ).toBe(false);

    expect(
      validate({
        ...EMPTY_FORM,
        upstreamStrategy: {
          ...EMPTY_FORM.upstreamStrategy,
          dispatchType: "hedged",
          hedgeDelayMs: "1",
        },
      }).valid
    ).toBe(true);
  });

  it("validates race and hedged max parallel as integer >= 2", () => {
    expect(
      validate({
        ...EMPTY_FORM,
        upstreamStrategy: {
          ...EMPTY_FORM.upstreamStrategy,
          dispatchType: "hedged",
          maxParallel: "1",
        },
      }).valid
    ).toBe(false);

    expect(
      validate({
        ...EMPTY_FORM,
        upstreamStrategy: {
          ...EMPTY_FORM.upstreamStrategy,
          dispatchType: "race",
          maxParallel: "1",
        },
      }).valid
    ).toBe(false);

    expect(
      validate({
        ...EMPTY_FORM,
        upstreamStrategy: {
          ...EMPTY_FORM.upstreamStrategy,
          dispatchType: "race",
          maxParallel: "2",
        },
      }).valid
    ).toBe(true);
  });
  it("serializes openai compatibility upstream flags", () => {
    const upstream = createEmptyUpstream();
    upstream.id = "glm-coding-plan";
    upstream.providers = ["openai-response"];
    upstream.baseUrl = "https://open.bigmodel.cn/api/coding/paas/v4";
    upstream.enabled = true;
    upstream.useChatCompletionsForResponses = true;
    upstream.rewriteDeveloperRoleToSystem = true;

    const payload = toPayload({
      ...EMPTY_FORM,
      upstreams: [upstream],
    });

    expect(payload.upstreams[0]?.use_chat_completions_for_responses).toBe(true);
    expect(payload.upstreams[0]?.rewrite_developer_role_to_system).toBe(true);
  });
});
