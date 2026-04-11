import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UpstreamEditorFields } from "@/features/config/cards/upstreams/editor-dialog-form";
import { createEmptyUpstream } from "@/features/config/form";
import { m } from "@/paraglide/messages.js";

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>(
    "@tanstack/react-router"
  );
  return {
    ...actual,
    Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
  };
});

afterEach(() => {
  cleanup();
});

describe("upstreams/editor-dialog-form", () => {
  it("renders kiro account selector when provider is kiro", () => {
    const draft = createEmptyUpstream();
    draft.id = "kiro-default";
    draft.providers = ["kiro"];
    draft.kiroAccountId = "kiro-primary.json";

    render(
      <UpstreamEditorFields
        draft={draft}
        providerOptions={["kiro"]}
        appProxyUrl=""
        showApiKeys={false}
        codexAccounts={[]}
        codexAccountsLoading={false}
        codexAccountsError=""
        onRefreshCodexAccounts={vi.fn()}
        kiroAccounts={[
          {
            account_id: "kiro-primary.json",
            provider: "aws",
            auth_method: "aws",
            email: "kiro@example.com",
            expires_at: null,
            status: "active",
            priority: 0,
          },
        ]}
        kiroAccountsLoading={false}
        kiroAccountsError=""
        onRefreshKiroAccounts={vi.fn()}
        onToggleApiKeys={vi.fn()}
        onChangeDraft={vi.fn()}
      />
    );

    expect(screen.getByText(m.field_kiro_account())).toBeInTheDocument();
    expect(screen.queryByLabelText(m.field_base_url())).not.toBeInTheDocument();
    expect(screen.queryByLabelText(m.field_proxy_url())).not.toBeInTheDocument();
    expect(screen.getByLabelText(m.field_id())).toBeDisabled();
    expect(screen.getByRole("button", { name: /kiro/i })).toBeDisabled();
  });

  it("renders codex account selector when provider is codex", () => {
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
            expires_at: null,
            status: "active",
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
    expect(screen.queryByLabelText(m.field_base_url())).not.toBeInTheDocument();
    expect(screen.queryByLabelText(m.field_proxy_url())).not.toBeInTheDocument();
    expect(screen.getByLabelText(m.field_id())).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /codex/i })).not.toBeDisabled();
  });
});
