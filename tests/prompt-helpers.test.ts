import { describe, expect, test } from "bun:test";

import { createSearchSource, isPromptCancelledError } from "../src/prompt-helpers";

describe("prompt helpers", () => {
  test("createSearchSource returns matching choices for a search term", async () => {
    const source = createSearchSource(["anthropic/claude-sonnet-4.6", "openai/gpt-5-codex"]);

    const choices = await source("openai", { signal: new AbortController().signal });

    expect(choices).toEqual([{ name: "openai/gpt-5-codex", value: "openai/gpt-5-codex" }]);
  });

  test("createSearchSource returns all choices when the search term is empty", async () => {
    const source = createSearchSource(["anthropic/claude-sonnet-4.6", "openai/gpt-5-codex"]);

    const choices = await source(undefined, { signal: new AbortController().signal });

    expect(choices).toEqual([
      { name: "anthropic/claude-sonnet-4.6", value: "anthropic/claude-sonnet-4.6" },
      { name: "openai/gpt-5-codex", value: "openai/gpt-5-codex" },
    ]);
  });

  test("isPromptCancelledError recognizes inquirer cancellation errors", () => {
    expect(isPromptCancelledError(new Error("nope"))).toBe(false);

    const cancelled = new Error("User force closed the prompt with 0 null");
    cancelled.name = "ExitPromptError";

    expect(isPromptCancelledError(cancelled)).toBe(true);
  });
});
