import fs from "node:fs";
import path from "node:path";

import { MODEL_ENV_KEYS, PROVIDER_ENV_KEYS } from "./constants";
import type { ProfileOptions, Settings } from "./types";
import { getClaudeDir, readJson, stableStringify, writeJson } from "./utils";

export function getSettingsPath(claudeDir?: string): string {
  return path.join(getClaudeDir(claudeDir), "settings.json");
}

export function getProfilePath(name: string, claudeDir?: string): string {
  return path.join(getClaudeDir(claudeDir), `settings.${name}.json`);
}

export function listProfiles(claudeDir?: string): string[] {
  const dir = getClaudeDir(claudeDir);

  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir)
    .filter((file) => /^settings\.[^.].+\.json$/.test(file) && file !== "settings.json")
    .map((file) => file.replace(/^settings\./, "").replace(/\.json$/, ""))
    .sort();
}

export function detectActiveProfile(claudeDir?: string): string | null {
  const profiles = listProfiles(claudeDir);
  const settingsPath = getSettingsPath(claudeDir);

  if (!fs.existsSync(settingsPath)) {
    return null;
  }

  const active = readJson<Settings>(settingsPath);
  const activeBaseUrl = active.env?.ANTHROPIC_BASE_URL;
  const normalized = stableStringify(active);

  for (const name of profiles) {
    const profile = readJson<Settings>(getProfilePath(name, claudeDir));
    const baseUrl = profile.env?.ANTHROPIC_BASE_URL;

    if (activeBaseUrl === baseUrl || (!activeBaseUrl && !baseUrl)) {
      return name;
    }
  }

  for (const name of profiles) {
    const profile = readJson<Settings>(getProfilePath(name, claudeDir));
    if (stableStringify(profile) === normalized) {
      return name;
    }
  }

  return null;
}

export function switchProfile(name: string, claudeDir?: string): Settings {
  const target = readJson<Settings>(getProfilePath(name, claudeDir));
  const settingsPath = getSettingsPath(claudeDir);
  const current = fs.existsSync(settingsPath) ? readJson<Settings>(settingsPath) : {};
  const mergedEnv: Record<string, string> = {
    ...(current.env || {}),
    ...(target.env || {}),
  };

  for (const key of PROVIDER_ENV_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(target.env || {}, key)) {
      delete mergedEnv[key];
    }
  }

  const next: Settings = {
    ...current,
    ...target,
    env: mergedEnv,
    enabledPlugins: {
      ...(current.enabledPlugins || {}),
      ...(target.enabledPlugins || {}),
    },
  };

  if (!target.apiKeyHelper) {
    delete next.apiKeyHelper;
  }

  if (!target.model) {
    delete next.model;
  }

  writeJson(settingsPath, next);
  return next;
}

export function updateProfileModel(name: string, model: string, claudeDir?: string): Settings {
  const profilePath = getProfilePath(name, claudeDir);
  const profile = readJson<Settings>(profilePath);
  const nextProfile = applyModel(profile, model);

  writeJson(profilePath, nextProfile);

  if (detectActiveProfile(claudeDir) === name) {
    const settingsPath = getSettingsPath(claudeDir);
    const active = readJson<Settings>(settingsPath);
    writeJson(settingsPath, applyModel(active, model));
  }

  return nextProfile;
}

export function readCurrentSettings(claudeDir?: string): Settings | null {
  const settingsPath = getSettingsPath(claudeDir);
  if (!fs.existsSync(settingsPath)) {
    return null;
  }
  return readJson<Settings>(settingsPath);
}

export function readProfile(name: string, claudeDir?: string): Settings | null {
  const profilePath = getProfilePath(name, claudeDir);
  if (!fs.existsSync(profilePath)) {
    return null;
  }
  return readJson<Settings>(profilePath);
}

export function createProfile(options: ProfileOptions, claudeDir?: string): Settings {
  const next = buildProfileSettings({}, options);
  writeJson(getProfilePath(options.profile, claudeDir), next);
  return next;
}

export function deleteProfile(name: string, claudeDir?: string): void {
  const profilePath = getProfilePath(name, claudeDir);
  if (!fs.existsSync(profilePath)) {
    throw new Error(`Profile not found: ${name}`);
  }

  if (detectActiveProfile(claudeDir) === name) {
    throw new Error(`Cannot delete the active profile: ${name}`);
  }

  fs.unlinkSync(profilePath);
}

export function editProfile(name: string, updates: Omit<ProfileOptions, "profile">, claudeDir?: string): Settings {
  const profilePath = getProfilePath(name, claudeDir);
  if (!fs.existsSync(profilePath)) {
    throw new Error(`Profile not found: ${name}`);
  }

  const current = readJson<Settings>(profilePath);
  const next = buildProfileSettings(current, updates);
  writeJson(profilePath, next);

  if (detectActiveProfile(claudeDir) === name) {
    switchProfile(name, claudeDir);
  }

  return next;
}

function applyModel(settings: Settings, model: string): Settings {
  const next: Settings = {
    ...settings,
    env: {
      ...(settings.env || {}),
    },
    model,
  };

  for (const key of MODEL_ENV_KEYS) {
    next.env![key] = model;
  }

  return next;
}

function buildProfileSettings(base: Settings, options: Partial<ProfileOptions>): Settings {
  let next: Settings = {
    ...base,
    env: {
      ...(base.env || {}),
    },
  };

  if (options.baseUrl) {
    next.env!.ANTHROPIC_BASE_URL = options.baseUrl;
  }

  if (options.disableNonessentialTraffic !== undefined) {
    next.env!.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC =
      options.disableNonessentialTraffic === false ? "0" : "1";
  } else if (!next.env!.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC) {
    next.env!.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1";
  }

  if (options.apiKeyHelper) {
    next.apiKeyHelper = options.apiKeyHelper;
  } else if (options.apiKeyEnv) {
    next.apiKeyHelper = defaultApiKeyHelper(options.apiKeyEnv);
  }

  if (options.model) {
    next = applyModel(next, options.model);
  } else if (!next.model && base.model) {
    next.model = base.model;
  }

  return next;
}

export function defaultApiKeyHelper(apiKeyEnv: string): string {
  return `node -e "process.stdout.write(process.env.${apiKeyEnv} || '')"`;
}
