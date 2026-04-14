import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PayloadRulesCard } from "@/features/config/cards/payload-rules-card";
import { createPayloadFilterRule, createPayloadValueRule, EMPTY_FORM } from "@/features/config/form";
import { I18nProvider } from "@/lib/i18n";
import { m } from "@/paraglide/messages.js";

describe("config/cards/PayloadRulesCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders payload rules sections and allows adding rules", () => {
    const handleChange = vi.fn();

    render(
      <I18nProvider>
        <PayloadRulesCard value={EMPTY_FORM.payloadRules} onChange={handleChange} />
      </I18nProvider>
    );

    expect(screen.getByText(m.payload_rules_title())).toBeInTheDocument();
    expect(screen.getByTestId("payload-rules-default-section")).toBeInTheDocument();
    expect(screen.getByTestId("payload-rules-override-section")).toBeInTheDocument();
    expect(screen.getByTestId("payload-rules-filter-section")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: m.payload_rules_add_rule() })[0]!);

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultRules: expect.arrayContaining([expect.objectContaining({ models: [""] })]),
      })
    );
  });

  it("updates parameter values and filter paths", () => {
    const valueRule = createPayloadValueRule();
    valueRule.models = ["gpt-5.4"];
    const filterRule = createPayloadFilterRule();
    filterRule.models = ["gpt-5.4"];
    const handleChange = vi.fn();

    render(
      <I18nProvider>
        <PayloadRulesCard
          value={{
            defaultRules: [valueRule],
            overrideRules: [],
            filterRules: [filterRule],
          }}
          onChange={handleChange}
        />
      </I18nProvider>
    );

    const defaultSection = screen.getByTestId("payload-rules-default-section");
    fireEvent.change(within(defaultSection).getByLabelText(`${m.field_path()} 1`), {
      target: { value: "instructions" },
    });

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultRules: expect.arrayContaining([
          expect.objectContaining({
            params: expect.arrayContaining([
              expect.objectContaining({ path: "instructions" }),
            ]),
          }),
        ]),
      })
    );
  });
});
