import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, test } from "bun:test";

import { createProgram } from "../src/cli";

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

describe("cli", () => {
  let claudeDir: string;
  let logs: string[];
  let errors: string[];
  let logger: { log: (message: string) => void; error: (message: string) => void };

  beforeEach(() => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "cc-switcher-cli-"));
    claudeDir = path.join(tmpHome, ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });
    logs = [];
    errors = [];
    logger = {
      log: (message: string) => logs.push(message),
      error: (message: string) => errors.push(message),
    };
  });

  test("current prints active profile and model", async () => {
    writeJson(path.join(claudeDir, "settings.openrouter.json"), {
      env: { ANTHROPIC_BASE_URL: "https://openrouter.ai/api" },
      model: "anthropic/claude-sonnet-4.6",
    });
    writeJson(path.join(claudeDir, "settings.json"), {
      env: { ANTHROPIC_BASE_URL: "https://openrouter.ai/api" },
      model: "anthropic/claude-sonnet-4.6",
    });

    const program = createProgram({ claudeDir, logger });
    await program.parseAsync(["node", "cc-switcher", "current"], { from: "node" });

    expect(logs.join("\n")).toContain("Active profile: openrouter");
    expect(logs.join("\n")).toContain("Model: anthropic/claude-sonnet-4.6");
  });

  test("profiles supports json output", async () => {
    writeJson(path.join(claudeDir, "settings.openrouter.json"), {});
    writeJson(path.join(claudeDir, "settings.local-gateway.json"), {});
    writeJson(path.join(claudeDir, "settings.json"), {});

    const program = createProgram({ claudeDir, logger });
    await program.parseAsync(["node", "cc-switcher", "profiles", "--json"], { from: "node" });

    const payload = JSON.parse(logs[0]) as { active: string; profiles: string[] };
    expect(payload.active).toBe("local-gateway");
    expect(payload.profiles).toEqual(["local-gateway", "openrouter"]);
  });

  test("current supports json output", async () => {
    writeJson(path.join(claudeDir, "settings.openrouter.json"), {
      env: { ANTHROPIC_BASE_URL: "https://openrouter.ai/api" },
      model: "anthropic/claude-sonnet-4.6",
    });
    writeJson(path.join(claudeDir, "settings.json"), {
      env: { ANTHROPIC_BASE_URL: "https://openrouter.ai/api" },
      model: "anthropic/claude-sonnet-4.6",
    });

    const program = createProgram({ claudeDir, logger });
    await program.parseAsync(["node", "cc-switcher", "current", "--json"], { from: "node" });

    const payload = JSON.parse(logs[0]) as { activeProfile: string; model: string; baseUrl: string };
    expect(payload.activeProfile).toBe("openrouter");
    expect(payload.model).toBe("anthropic/claude-sonnet-4.6");
    expect(payload.baseUrl).toBe("https://openrouter.ai/api");
  });

  test("models prints filtered OpenRouter models", async () => {
    writeJson(path.join(claudeDir, "settings.openrouter.json"), {
      env: { ANTHROPIC_BASE_URL: "https://openrouter.ai/api" },
    });
    writeJson(path.join(claudeDir, "settings.json"), {
      env: { ANTHROPIC_BASE_URL: "https://openrouter.ai/api" },
    });

    const program = createProgram({
      claudeDir,
      logger,
      fetchModels: async () => [
        { id: "anthropic/claude-sonnet-4.6" },
        { id: "openai/gpt-5-codex" },
      ],
    });

    await program.parseAsync(["node", "cc-switcher", "models", "openrouter", "anthropic"], { from: "node" });

    expect(logs).toEqual(["anthropic/claude-sonnet-4.6"]);
  });

  test("models supports json output", async () => {
    writeJson(path.join(claudeDir, "settings.openrouter.json"), {
      env: { ANTHROPIC_BASE_URL: "https://openrouter.ai/api" },
    });
    writeJson(path.join(claudeDir, "settings.json"), {
      env: { ANTHROPIC_BASE_URL: "https://openrouter.ai/api" },
    });

    const program = createProgram({
      claudeDir,
      logger,
      fetchModels: async () => [
        { id: "anthropic/claude-sonnet-4.6" },
        { id: "openai/gpt-5-codex" },
      ],
    });

    await program.parseAsync(["node", "cc-switcher", "models", "openrouter", "anthropic", "--json"], { from: "node" });

    const payload = JSON.parse(logs[0]) as { profile: string; vendor: string; models: string[] };
    expect(payload.profile).toBe("openrouter");
    expect(payload.vendor).toBe("anthropic");
    expect(payload.models).toEqual(["anthropic/claude-sonnet-4.6"]);
  });

  test("pick switches profile and updates model from interactive selections", async () => {
    writeJson(path.join(claudeDir, "settings.openrouter.json"), {
      env: {
        ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
        ANTHROPIC_MODEL: "old-model",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "old-model",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "old-model",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "old-model",
      },
      model: "old-model",
    });
    writeJson(path.join(claudeDir, "settings.local-gateway.json"), {
      env: { ANTHROPIC_BASE_URL: "http://127.0.0.1:8317" },
      model: "gateway-model",
    });
    writeJson(path.join(claudeDir, "settings.json"), {
      env: { ANTHROPIC_BASE_URL: "http://127.0.0.1:8317" },
      model: "gateway-model",
    });

    const answers = ["openrouter", "anthropic", "anthropic/claude-sonnet-4.6"];
    const program = createProgram({
      claudeDir,
      logger,
      fetchModels: async () => [
        { id: "anthropic/claude-sonnet-4.6" },
        { id: "openai/gpt-5-codex" },
      ],
      select: async () => answers.shift() || "",
    });

    await program.parseAsync(["node", "cc-switcher", "pick"], { from: "node" });

    const active = JSON.parse(fs.readFileSync(path.join(claudeDir, "settings.json"), "utf8")) as {
      env: Record<string, string>;
      model: string;
    };
    expect(active.env.ANTHROPIC_BASE_URL).toBe("https://openrouter.ai/api");
    expect(active.model).toBe("anthropic/claude-sonnet-4.6");
    expect(logs.join("\n")).toContain("Switched to profile: openrouter");
    expect(logs.join("\n")).toContain("Updated openrouter model to anthropic/claude-sonnet-4.6");
  });

  test("pick respects vendor filtering when selecting models", async () => {
    writeJson(path.join(claudeDir, "settings.openrouter.json"), {
      env: {
        ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
      },
      model: "old-model",
    });
    writeJson(path.join(claudeDir, "settings.json"), {
      env: { ANTHROPIC_BASE_URL: "https://openrouter.ai/api" },
      model: "old-model",
    });

    const capturedChoices: Array<{ message: string; choices: string[] }> = [];
    const answers = ["openrouter", "openai/gpt-5-codex"];
    const program = createProgram({
      claudeDir,
      logger,
      fetchModels: async () => [
        { id: "anthropic/claude-sonnet-4.6" },
        { id: "openai/gpt-5-codex" },
      ],
      select: async (message, choices) => {
        capturedChoices.push({ message, choices });
        return answers.shift() || "";
      },
    });

    await program.parseAsync(["node", "cc-switcher", "pick", "--vendor", "openai"], { from: "node" });

    expect(capturedChoices[1].choices).toEqual(["openai/gpt-5-codex"]);
  });

  test("pick prompts for vendor before model selection", async () => {
    writeJson(path.join(claudeDir, "settings.openrouter.json"), {
      env: {
        ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
      },
      model: "old-model",
    });
    writeJson(path.join(claudeDir, "settings.json"), {
      env: { ANTHROPIC_BASE_URL: "https://openrouter.ai/api" },
      model: "old-model",
    });

    const capturedChoices: Array<{ message: string; choices: string[] }> = [];
    const answers = ["openrouter", "anthropic", "anthropic/claude-sonnet-4.6"];
    const program = createProgram({
      claudeDir,
      logger,
      fetchModels: async () => [
        { id: "anthropic/claude-sonnet-4.6" },
        { id: "openai/gpt-5-codex" },
      ],
      select: async (message, choices) => {
        capturedChoices.push({ message, choices });
        return answers.shift() || "";
      },
    });

    await program.parseAsync(["node", "cc-switcher", "pick"], { from: "node" });

    expect(capturedChoices[1].choices).toEqual(["anthropic", "openai"]);
    expect(capturedChoices[2].choices).toEqual(["anthropic/claude-sonnet-4.6"]);
  });

  test("create writes a new profile from command options", async () => {
    const program = createProgram({
      claudeDir,
      logger,
    });

    await program.parseAsync(
      [
        "node",
        "cc-switcher",
        "create",
        "openrouter",
        "--base-url",
        "https://openrouter.ai/api",
        "--api-key-env",
        "OPENROUTER_API_KEY",
        "--model",
        "anthropic/claude-sonnet-4.6",
      ],
      { from: "node" }
    );

    const profile = JSON.parse(fs.readFileSync(path.join(claudeDir, "settings.openrouter.json"), "utf8")) as {
      apiKeyHelper: string;
      model: string;
    };
    expect(profile.apiKeyHelper).toBe("zsh -lc 'printf %s \"$OPENROUTER_API_KEY\"'");
    expect(profile.model).toBe("anthropic/claude-sonnet-4.6");
    expect(logs.join("\n")).toContain("Created profile: openrouter");
  });

  test("switch supports json output", async () => {
    writeJson(path.join(claudeDir, "settings.openrouter.json"), {
      env: { ANTHROPIC_BASE_URL: "https://openrouter.ai/api" },
      model: "anthropic/claude-sonnet-4.6",
    });
    writeJson(path.join(claudeDir, "settings.json"), {
      env: { ANTHROPIC_BASE_URL: "http://127.0.0.1:8317" },
      model: "gateway-model",
    });

    const program = createProgram({ claudeDir, logger });
    await program.parseAsync(["node", "cc-switcher", "switch", "openrouter", "--json"], { from: "node" });

    const payload = JSON.parse(logs[0]) as { profile: string; model: string };
    expect(payload.profile).toBe("openrouter");
    expect(payload.model).toBe("anthropic/claude-sonnet-4.6");
  });

  test("switch enters interactive selection when profile is omitted", async () => {
    writeJson(path.join(claudeDir, "settings.openrouter.json"), {
      env: { ANTHROPIC_BASE_URL: "https://openrouter.ai/api" },
      model: "anthropic/claude-sonnet-4.6",
    });
    writeJson(path.join(claudeDir, "settings.local-gateway.json"), {
      env: { ANTHROPIC_BASE_URL: "http://127.0.0.1:8317" },
      model: "gateway-model",
    });
    writeJson(path.join(claudeDir, "settings.json"), {
      env: { ANTHROPIC_BASE_URL: "http://127.0.0.1:8317" },
      model: "gateway-model",
    });

    const capturedChoices: Array<{ message: string; choices: string[] }> = [];
    const program = createProgram({
      claudeDir,
      logger,
      select: async (message, choices) => {
        capturedChoices.push({ message, choices });
        return "openrouter";
      },
    });

    await program.parseAsync(["node", "cc-switcher", "switch"], { from: "node" });

    const active = JSON.parse(fs.readFileSync(path.join(claudeDir, "settings.json"), "utf8")) as {
      env: Record<string, string>;
    };
    expect(capturedChoices[0].message).toBe("Choose a profile");
    expect(capturedChoices[0].choices).toEqual(["local-gateway", "openrouter"]);
    expect(active.env.ANTHROPIC_BASE_URL).toBe("https://openrouter.ai/api");
  });

  test("use supports json output", async () => {
    writeJson(path.join(claudeDir, "settings.openrouter.json"), {
      env: {
        ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
        ANTHROPIC_MODEL: "old-model",
      },
      model: "old-model",
    });
    writeJson(path.join(claudeDir, "settings.json"), {
      env: { ANTHROPIC_BASE_URL: "https://openrouter.ai/api" },
      model: "old-model",
    });

    const program = createProgram({ claudeDir, logger });
    await program.parseAsync(
      ["node", "cc-switcher", "use", "openai/gpt-5-codex", "--profile", "openrouter", "--json"],
      { from: "node" }
    );

    const payload = JSON.parse(logs[0]) as { profile: string; model: string };
    expect(payload.profile).toBe("openrouter");
    expect(payload.model).toBe("openai/gpt-5-codex");
  });

  test("use enters interactive selection when model is omitted", async () => {
    writeJson(path.join(claudeDir, "settings.openrouter.json"), {
      env: {
        ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
        ANTHROPIC_MODEL: "old-model",
      },
      model: "old-model",
    });
    writeJson(path.join(claudeDir, "settings.json"), {
      env: { ANTHROPIC_BASE_URL: "https://openrouter.ai/api" },
      model: "old-model",
    });

    const capturedChoices: Array<{ message: string; choices: string[] }> = [];
    const answers = ["anthropic", "anthropic/claude-sonnet-4.6"];
    const program = createProgram({
      claudeDir,
      logger,
      fetchModels: async () => [
        { id: "anthropic/claude-sonnet-4.6" },
        { id: "openai/gpt-5-codex" },
      ],
      select: async (message, choices) => {
        capturedChoices.push({ message, choices });
        return answers.shift() || "";
      },
    });

    await program.parseAsync(["node", "cc-switcher", "use"], { from: "node" });

    const active = JSON.parse(fs.readFileSync(path.join(claudeDir, "settings.json"), "utf8")) as {
      model: string;
    };
    expect(capturedChoices[0].choices).toEqual(["anthropic", "openai"]);
    expect(capturedChoices[1].choices).toEqual(["anthropic/claude-sonnet-4.6"]);
    expect(active.model).toBe("anthropic/claude-sonnet-4.6");
  });

  test("delete removes a profile", async () => {
    writeJson(path.join(claudeDir, "settings.openrouter.json"), {
      env: { ANTHROPIC_BASE_URL: "https://openrouter.ai/api" },
    });

    const program = createProgram({
      claudeDir,
      logger,
    });

    await program.parseAsync(["node", "cc-switcher", "delete", "openrouter"], { from: "node" });

    expect(fs.existsSync(path.join(claudeDir, "settings.openrouter.json"))).toBe(false);
    expect(logs.join("\n")).toContain("Deleted profile: openrouter");
  });

  test("create supports json output", async () => {
    const program = createProgram({
      claudeDir,
      logger,
    });

    await program.parseAsync(
      [
        "node",
        "cc-switcher",
        "create",
        "openrouter",
        "--base-url",
        "https://openrouter.ai/api",
        "--api-key-env",
        "OPENROUTER_API_KEY",
        "--model",
        "anthropic/claude-sonnet-4.6",
        "--json",
      ],
      { from: "node" }
    );

    const payload = JSON.parse(logs[0]) as { profile: string; created: boolean };
    expect(payload.profile).toBe("openrouter");
    expect(payload.created).toBe(true);
  });

  test("edit updates an existing profile from command options", async () => {
    writeJson(path.join(claudeDir, "settings.openrouter.json"), {
      env: {
        ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      },
      model: "anthropic/claude-sonnet-4.6",
      apiKeyHelper: "zsh -lc 'printf %s \"$OPENROUTER_API_KEY\"'",
    });

    const program = createProgram({
      claudeDir,
      logger,
    });

    await program.parseAsync(
      [
        "node",
        "cc-switcher",
        "edit",
        "openrouter",
        "--base-url",
        "https://openrouter.ai/api/v2",
        "--api-key-env",
        "ALT_OPENROUTER_KEY",
        "--model",
        "openai/gpt-5-codex",
      ],
      { from: "node" }
    );

    const profile = JSON.parse(fs.readFileSync(path.join(claudeDir, "settings.openrouter.json"), "utf8")) as {
      env: Record<string, string>;
      model: string;
      apiKeyHelper: string;
    };
    expect(profile.env.ANTHROPIC_BASE_URL).toBe("https://openrouter.ai/api/v2");
    expect(profile.model).toBe("openai/gpt-5-codex");
    expect(profile.apiKeyHelper).toBe("zsh -lc 'printf %s \"$ALT_OPENROUTER_KEY\"'");
    expect(logs.join("\n")).toContain("Updated profile: openrouter");
  });

  test("edit supports json output", async () => {
    writeJson(path.join(claudeDir, "settings.openrouter.json"), {
      env: {
        ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
      },
      model: "anthropic/claude-sonnet-4.6",
      apiKeyHelper: "zsh -lc 'printf %s \"$OPENROUTER_API_KEY\"'",
    });

    const program = createProgram({
      claudeDir,
      logger,
    });

    await program.parseAsync(
      ["node", "cc-switcher", "edit", "openrouter", "--model", "openai/gpt-5-codex", "--json"],
      { from: "node" }
    );

    const payload = JSON.parse(logs[0]) as { profile: string; updated: boolean; model: string };
    expect(payload.profile).toBe("openrouter");
    expect(payload.updated).toBe(true);
    expect(payload.model).toBe("openai/gpt-5-codex");
  });

  test("help includes examples and workflow notes", () => {
    const program = createProgram({ claudeDir, logger });
    const helpText = program.helpInformation();

    expect(helpText).toContain("Examples:");
    expect(helpText).toContain("ccs switch openrouter");
    expect(helpText).toContain("ccs pick --vendor anthropic");
    expect(helpText).toContain("Notes:");
    expect(helpText).toContain("OpenRouter model discovery");
  });

  test("delete supports json output", async () => {
    writeJson(path.join(claudeDir, "settings.openrouter.json"), {
      env: { ANTHROPIC_BASE_URL: "https://openrouter.ai/api" },
    });

    const program = createProgram({
      claudeDir,
      logger,
    });

    await program.parseAsync(["node", "cc-switcher", "delete", "openrouter", "--json"], { from: "node" });

    const payload = JSON.parse(logs[0]) as { profile: string; deleted: boolean };
    expect(payload.profile).toBe("openrouter");
    expect(payload.deleted).toBe(true);
  });
});
