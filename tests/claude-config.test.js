const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  listProfiles,
  detectActiveProfile,
  switchProfile,
  updateProfileModel,
  createProfile,
} = require("../src/claude-config");

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

describe("claude config", () => {
  let tmpHome;
  let claudeDir;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "cc-switcher-"));
    claudeDir = path.join(tmpHome, ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });
  });

  test("lists profiles from settings files", () => {
    writeJson(path.join(claudeDir, "settings.openrouter.json"), {});
    writeJson(path.join(claudeDir, "settings.local-gateway.json"), {});
    writeJson(path.join(claudeDir, "settings.json"), {});

    expect(listProfiles(claudeDir)).toEqual(["local-gateway", "openrouter"]);
  });

  test("detects the active profile by base url", () => {
    writeJson(path.join(claudeDir, "settings.openrouter.json"), {
      env: { ANTHROPIC_BASE_URL: "https://openrouter.ai/api" },
    });
    writeJson(path.join(claudeDir, "settings.json"), {
      env: { ANTHROPIC_BASE_URL: "https://openrouter.ai/api" },
    });

    expect(detectActiveProfile(claudeDir)).toBe("openrouter");
  });

  test("switches profile while preserving unrelated settings", () => {
    writeJson(path.join(claudeDir, "settings.openrouter.json"), {
      apiKeyHelper: "zsh -lc 'echo token'",
      env: {
        ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
        ANTHROPIC_MODEL: "anthropic/claude-sonnet-4.6",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "anthropic/claude-sonnet-4.6"
      },
      model: "anthropic/claude-sonnet-4.6",
    });
    writeJson(path.join(claudeDir, "settings.json"), {
      enabledPlugins: {
        "provider@claude-provider-plugin": true,
      },
      env: {
        ANTHROPIC_BASE_URL: "http://127.0.0.1:8317",
      },
      permissions: {
        mode: "acceptEdits",
      },
    });

    switchProfile("openrouter", claudeDir);

    const active = JSON.parse(
      fs.readFileSync(path.join(claudeDir, "settings.json"), "utf8")
    );

    expect(active.enabledPlugins).toEqual({
      "provider@claude-provider-plugin": true,
    });
    expect(active.permissions).toEqual({ mode: "acceptEdits" });
    expect(active.apiKeyHelper).toBe("zsh -lc 'echo token'");
    expect(active.model).toBe("anthropic/claude-sonnet-4.6");
    expect(active.env.ANTHROPIC_BASE_URL).toBe("https://openrouter.ai/api");
  });

  test("updates model fields for a profile and the active settings when active", () => {
    const profile = {
      env: {
        ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
        ANTHROPIC_MODEL: "old-model",
        ANTHROPIC_DEFAULT_OPUS_MODEL: "old-model",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "old-model",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "old-model",
      },
      model: "old-model",
    };

    writeJson(path.join(claudeDir, "settings.openrouter.json"), profile);
    writeJson(path.join(claudeDir, "settings.json"), profile);

    updateProfileModel("openrouter", "openai/gpt-5-codex", claudeDir);

    const profileData = JSON.parse(
      fs.readFileSync(path.join(claudeDir, "settings.openrouter.json"), "utf8")
    );
    const activeData = JSON.parse(
      fs.readFileSync(path.join(claudeDir, "settings.json"), "utf8")
    );

    for (const data of [profileData, activeData]) {
      expect(data.model).toBe("openai/gpt-5-codex");
      expect(data.env.ANTHROPIC_MODEL).toBe("openai/gpt-5-codex");
      expect(data.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe("openai/gpt-5-codex");
      expect(data.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe("openai/gpt-5-codex");
      expect(data.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe("openai/gpt-5-codex");
    }
  });

  test("creates a profile with env-based api key helper and model defaults", () => {
    createProfile(
      {
        profile: "openrouter",
        baseUrl: "https://openrouter.ai/api",
        apiKeyEnv: "OPENROUTER_API_KEY",
        model: "anthropic/claude-sonnet-4.6",
      },
      claudeDir
    );

    const profileData = JSON.parse(
      fs.readFileSync(path.join(claudeDir, "settings.openrouter.json"), "utf8")
    );

    expect(profileData.apiKeyHelper).toBe(
      "zsh -lc 'printf %s \"$OPENROUTER_API_KEY\"'"
    );
    expect(profileData.model).toBe("anthropic/claude-sonnet-4.6");
    expect(profileData.env.ANTHROPIC_BASE_URL).toBe("https://openrouter.ai/api");
    expect(profileData.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC).toBe("1");
    expect(profileData.env.ANTHROPIC_MODEL).toBe("anthropic/claude-sonnet-4.6");
  });
});
