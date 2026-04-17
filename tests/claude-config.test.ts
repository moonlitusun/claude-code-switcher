import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, test } from "bun:test";

import {
  createProfile,
  deleteProfile,
  detectActiveProfile,
  editProfile,
  literalApiKeyHelper,
  listProfiles,
  renameProfile,
  switchProfile,
  updateProfileModel,
} from "../src/claude-config";

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

describe("claude config", () => {
  let claudeDir: string;

  beforeEach(() => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "cc-switcher-"));
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
        ANTHROPIC_DEFAULT_SONNET_MODEL: "anthropic/claude-sonnet-4.6",
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

    const active = JSON.parse(fs.readFileSync(path.join(claudeDir, "settings.json"), "utf8")) as {
      enabledPlugins: Record<string, boolean>;
      permissions: { mode: string };
      apiKeyHelper: string;
      model: string;
      env: Record<string, string>;
    };

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

    const profileData = JSON.parse(fs.readFileSync(path.join(claudeDir, "settings.openrouter.json"), "utf8")) as {
      model: string;
      env: Record<string, string>;
    };
    const activeData = JSON.parse(fs.readFileSync(path.join(claudeDir, "settings.json"), "utf8")) as {
      model: string;
      env: Record<string, string>;
    };

    for (const data of [profileData, activeData]) {
      expect(data.model).toBe("openai/gpt-5-codex");
      expect(data.env.ANTHROPIC_MODEL).toBe("openai/gpt-5-codex");
      expect(data.env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe("openai/gpt-5-codex");
      expect(data.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe("openai/gpt-5-codex");
      expect(data.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe("openai/gpt-5-codex");
    }
  });

  test("creates a profile with a literal api key helper and model defaults", () => {
    createProfile(
      {
        profile: "openrouter",
        baseUrl: "https://openrouter.ai/api",
        apiKey: "sk-test-create",
        model: "anthropic/claude-sonnet-4.6",
      },
      claudeDir
    );

    const profileData = JSON.parse(fs.readFileSync(path.join(claudeDir, "settings.openrouter.json"), "utf8")) as {
      apiKeyHelper: string;
      model: string;
      env: Record<string, string>;
    };

    expect(profileData.apiKeyHelper).toBe(literalApiKeyHelper("sk-test-create"));
    expect(profileData.model).toBe("anthropic/claude-sonnet-4.6");
    expect(profileData.env.ANTHROPIC_BASE_URL).toBe("https://openrouter.ai/api");
    expect(profileData.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC).toBe("1");
    expect(profileData.env.ANTHROPIC_MODEL).toBe("anthropic/claude-sonnet-4.6");
  });

  test("deletes a non-active profile file", () => {
    writeJson(path.join(claudeDir, "settings.openrouter.json"), {});

    deleteProfile("openrouter", claudeDir);

    expect(fs.existsSync(path.join(claudeDir, "settings.openrouter.json"))).toBe(false);
  });

  test("renames a profile file", () => {
    writeJson(path.join(claudeDir, "settings.openrouter.json"), {
      env: { ANTHROPIC_BASE_URL: "https://openrouter.ai/api" },
    });

    renameProfile("openrouter", "openrouter-v2", claudeDir);

    expect(fs.existsSync(path.join(claudeDir, "settings.openrouter.json"))).toBe(false);
    expect(fs.existsSync(path.join(claudeDir, "settings.openrouter-v2.json"))).toBe(true);
  });

  test("edits an existing profile while preserving unrelated settings", () => {
    writeJson(path.join(claudeDir, "settings.openrouter.json"), {
      enabledPlugins: {
        "provider@claude-provider-plugin": true,
      },
      env: {
        ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
        CUSTOM_FLAG: "keep-me",
      },
      model: "anthropic/claude-sonnet-4.6",
      apiKeyHelper: "zsh -lc 'printf %s \"$OPENROUTER_API_KEY\"'",
    });

    editProfile(
      "openrouter",
      {
        baseUrl: "https://openrouter.ai/api/v2",
        apiKey: "sk-test-edit",
        model: "openai/gpt-5-codex",
      },
      claudeDir
    );

    const profileData = JSON.parse(fs.readFileSync(path.join(claudeDir, "settings.openrouter.json"), "utf8")) as {
      enabledPlugins: Record<string, boolean>;
      env: Record<string, string>;
      model: string;
      apiKeyHelper: string;
    };

    expect(profileData.enabledPlugins).toEqual({
      "provider@claude-provider-plugin": true,
    });
    expect(profileData.env.ANTHROPIC_BASE_URL).toBe("https://openrouter.ai/api/v2");
    expect(profileData.env.CUSTOM_FLAG).toBe("keep-me");
    expect(profileData.model).toBe("openai/gpt-5-codex");
    expect(profileData.apiKeyHelper).toBe(literalApiKeyHelper("sk-test-edit"));
  });

  test("builds a literal api key helper", () => {
    expect(literalApiKeyHelper("sk-test-123")).toBe(
      'node -e "process.stdout.write(\'sk-test-123\')"'
    );
  });
});
