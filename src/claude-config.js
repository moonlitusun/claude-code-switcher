const fs = require("fs");
const path = require("path");

const { MODEL_ENV_KEYS, PROVIDER_ENV_KEYS } = require("./constants");
const { getClaudeDir, readJson, writeJson, stableStringify } = require("./utils");

function getSettingsPath(claudeDir) {
  return path.join(getClaudeDir(claudeDir), "settings.json");
}

function getProfilePath(name, claudeDir) {
  return path.join(getClaudeDir(claudeDir), "settings." + name + ".json");
}

function listProfiles(claudeDir) {
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

function detectActiveProfile(claudeDir) {
  const profiles = listProfiles(claudeDir);
  const settingsPath = getSettingsPath(claudeDir);

  if (!fs.existsSync(settingsPath)) {
    return null;
  }

  const active = readJson(settingsPath);
  const activeBaseUrl = active.env && active.env.ANTHROPIC_BASE_URL;
  const normalized = stableStringify(active);

  for (const name of profiles) {
    const profile = readJson(getProfilePath(name, claudeDir));
    const baseUrl = profile.env && profile.env.ANTHROPIC_BASE_URL;

    if (activeBaseUrl === baseUrl || (!activeBaseUrl && !baseUrl)) {
      return name;
    }
  }

  for (const name of profiles) {
    const profile = readJson(getProfilePath(name, claudeDir));
    if (stableStringify(profile) === normalized) {
      return name;
    }
  }

  return null;
}

function switchProfile(name, claudeDir) {
  const target = readJson(getProfilePath(name, claudeDir));
  const settingsPath = getSettingsPath(claudeDir);
  const current = fs.existsSync(settingsPath) ? readJson(settingsPath) : {};
  const mergedEnv = Object.assign({}, current.env || {}, target.env || {});

  for (const key of PROVIDER_ENV_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(target.env || {}, key)) {
      delete mergedEnv[key];
    }
  }

  const next = Object.assign({}, current, target, {
    env: mergedEnv,
    enabledPlugins: Object.assign({}, current.enabledPlugins || {}, target.enabledPlugins || {}),
  });

  if (!target.apiKeyHelper) {
    delete next.apiKeyHelper;
  }

  if (!target.model) {
    delete next.model;
  }

  writeJson(settingsPath, next);
  return next;
}

function updateProfileModel(name, model, claudeDir) {
  const profilePath = getProfilePath(name, claudeDir);
  const profile = readJson(profilePath);
  const nextProfile = applyModel(profile, model);

  writeJson(profilePath, nextProfile);

  if (detectActiveProfile(claudeDir) === name) {
    const settingsPath = getSettingsPath(claudeDir);
    const active = readJson(settingsPath);
    writeJson(settingsPath, applyModel(active, model));
  }

  return nextProfile;
}

function applyModel(settings, model) {
  const next = Object.assign({}, settings, {
    env: Object.assign({}, settings.env || {}),
    model,
  });

  for (const key of MODEL_ENV_KEYS) {
    next.env[key] = model;
  }

  return next;
}

function readCurrentSettings(claudeDir) {
  const settingsPath = getSettingsPath(claudeDir);
  if (!fs.existsSync(settingsPath)) {
    return null;
  }
  return readJson(settingsPath);
}

function readProfile(name, claudeDir) {
  const profilePath = getProfilePath(name, claudeDir);
  if (!fs.existsSync(profilePath)) {
    return null;
  }
  return readJson(profilePath);
}

function createProfile(options, claudeDir) {
  const profileName = options.profile;
  const model = options.model;
  let next = {
    env: {
      ANTHROPIC_BASE_URL: options.baseUrl,
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:
        options.disableNonessentialTraffic === false ? "0" : "1",
    },
    model,
  };

  if (options.apiKeyHelper) {
    next.apiKeyHelper = options.apiKeyHelper;
  } else if (options.apiKeyEnv) {
    next.apiKeyHelper =
      "zsh -lc 'printf %s \"$" + options.apiKeyEnv + "\"'";
  }

  if (model) {
    next = applyModel(next, model);
  }

  writeJson(getProfilePath(profileName, claudeDir), next);
  return next;
}

module.exports = {
  getSettingsPath,
  getProfilePath,
  listProfiles,
  detectActiveProfile,
  switchProfile,
  updateProfileModel,
  readCurrentSettings,
  readProfile,
  createProfile,
};
