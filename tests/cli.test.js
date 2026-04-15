const fs = require("fs");
const os = require("os");
const path = require("path");

const { createProgram } = require("../src/cli");

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

describe("cli", () => {
  let tmpHome;
  let claudeDir;
  let logs;
  let errors;
  let logger;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "cc-switcher-cli-"));
    claudeDir = path.join(tmpHome, ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });
    logs = [];
    errors = [];
    logger = {
      log: (message) => logs.push(message),
      error: (message) => errors.push(message),
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

    await program.parseAsync(["node", "cc-switcher", "models", "openrouter", "anthropic"], {
      from: "node",
    });

    expect(logs).toEqual(["anthropic/claude-sonnet-4.6"]);
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

    const answers = ["openrouter", "anthropic/claude-sonnet-4.6"];
    const program = createProgram({
      claudeDir,
      logger,
      fetchModels: async () => [
        { id: "anthropic/claude-sonnet-4.6" },
        { id: "openai/gpt-5-codex" },
      ],
      select: async () => answers.shift(),
    });

    await program.parseAsync(["node", "cc-switcher", "pick"], { from: "node" });

    const active = JSON.parse(fs.readFileSync(path.join(claudeDir, "settings.json"), "utf8"));
    expect(active.env.ANTHROPIC_BASE_URL).toBe("https://openrouter.ai/api");
    expect(active.model).toBe("anthropic/claude-sonnet-4.6");
    expect(logs.join("\n")).toContain("Switched to profile: openrouter");
    expect(logs.join("\n")).toContain("Updated openrouter model to anthropic/claude-sonnet-4.6");
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

    const profile = JSON.parse(
      fs.readFileSync(path.join(claudeDir, "settings.openrouter.json"), "utf8")
    );
    expect(profile.apiKeyHelper).toBe("zsh -lc 'printf %s \"$OPENROUTER_API_KEY\"'");
    expect(profile.model).toBe("anthropic/claude-sonnet-4.6");
    expect(logs.join("\n")).toContain("Created profile: openrouter");
  });
});
