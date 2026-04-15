import { describe, expect, test } from "bun:test";

import { detectProviderKind, filterModelsByVendor } from "../src/providers/openrouter";

describe("openrouter provider helpers", () => {
  test("filters models by vendor prefix", () => {
    const models = [
      { id: "anthropic/claude-sonnet-4.6" },
      { id: "openai/gpt-5-codex" },
      { id: "anthropic/claude-haiku-4.5" },
    ];

    expect(filterModelsByVendor(models, "anthropic")).toEqual([
      "anthropic/claude-haiku-4.5",
      "anthropic/claude-sonnet-4.6",
    ]);
  });

  test("detects openrouter profiles from base url", () => {
    expect(detectProviderKind("https://openrouter.ai/api")).toBe("openrouter");
    expect(detectProviderKind("http://127.0.0.1:8317")).toBe("custom");
  });
});
