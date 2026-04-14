import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProxyCoreCard } from "@/features/config/cards/proxy-core-card";
import { EMPTY_FORM } from "@/features/config/form";
import { I18nProvider } from "@/lib/i18n";
import { m } from "@/paraglide/messages.js";

describe("config/cards/ProxyCoreCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders retryable failure cooldown mode control", () => {
    render(
      <I18nProvider>
        <ProxyCoreCard
          form={EMPTY_FORM}
          showLocalKey={false}
          onToggleLocalKey={vi.fn()}
          onChange={vi.fn()}
          proxyService={{
            status: { state: "stopped", addr: null, last_error: null },
            requestState: "idle",
            message: "",
            isDirty: false,
            onStart: vi.fn(),
            onStop: vi.fn(),
            onRestart: vi.fn(),
            onReload: vi.fn(),
            onRefresh: vi.fn(),
          }}
        />
      </I18nProvider>
    );

    expect(
      screen.getByLabelText(m.proxy_core_retryable_failure_cooldown_mode_label())
    ).toBeInTheDocument();
  });
});
