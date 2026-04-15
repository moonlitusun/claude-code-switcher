const { Command } = require("commander");
const pc = require("picocolors");

const {
  listProfiles,
  detectActiveProfile,
  switchProfile,
  updateProfileModel,
  readCurrentSettings,
  readProfile,
  createProfile,
  deleteProfile,
  editProfile,
} = require("./claude-config");
const { detectProviderKind, filterModelsByVendor, fetchOpenRouterModels } = require("./providers/openrouter");

const HELP_EPILOG = [
  "",
  "Examples:",
  "  ccs profiles",
  "  ccs profiles --json",
  "  ccs current --json",
  "  ccs switch openrouter",
  "  ccs switch openrouter --json",
  "  ccs models openrouter anthropic",
  "  ccs models openrouter anthropic --json",
  "  ccs pick",
  "  ccs pick --vendor anthropic",
  "  ccs use openai/gpt-5-codex --profile openrouter",
  "  ccs use openai/gpt-5-codex --profile openrouter --json",
  "  ccs create openrouter --base-url https://openrouter.ai/api --api-key-env OPENROUTER_API_KEY",
  "  ccs create openrouter --base-url https://openrouter.ai/api --api-key-env OPENROUTER_API_KEY --json",
  "  ccs edit openrouter --model anthropic/claude-sonnet-4.6",
  "  ccs edit openrouter --model anthropic/claude-sonnet-4.6 --json",
  "  ccs delete openrouter --json",
  "",
  "Notes:",
  "  OpenRouter model discovery works when ANTHROPIC_BASE_URL contains openrouter.ai.",
  "  In interactive pick mode, if --vendor is omitted, you will choose a vendor first.",
  "  Other profiles can still be switched and edited, but model discovery is not implemented yet.",
].join("\n");

function createProgram(options) {
  const claudeDir = options && options.claudeDir;
  const logger = (options && options.logger) || console;
  const fetchModels = (options && options.fetchModels) || fetchOpenRouterModels;
  const select = (options && options.select) || selectFromList;
  const ask = (options && options.ask) || promptInput;
  const program = new Command();

  program
    .name("cc-switcher")
    .description("Switch Claude Code provider profiles and models")
    .showHelpAfterError("(run with --help for usage examples)");

  const defaultHelpInformation = program.helpInformation.bind(program);
  program.helpInformation = function () {
    return defaultHelpInformation() + "\n" + HELP_EPILOG + "\n";
  };

  program
    .command("profiles")
    .description("List saved Claude profiles")
    .option("--json", "Output profiles as JSON")
    .action((command) => {
      const profiles = listProfiles(claudeDir);
      const active = detectActiveProfile(claudeDir);

      if (!profiles.length) {
        if (command.json) {
          printJson(logger, { active, profiles: [] });
        } else {
          logger.log("No Claude profiles found.");
        }
        return;
      }

      if (command.json) {
        printJson(logger, { active, profiles });
        return;
      }

      profiles.forEach((name) => {
        logger.log((name === active ? "* " : "  ") + name);
      });
    });

  program
    .command("current")
    .description("Show the current Claude profile and model")
    .option("--json", "Output current profile details as JSON")
    .action((command) => {
      const active = detectActiveProfile(claudeDir) || "unknown";
      const settings = readCurrentSettings(claudeDir);

      if (!settings) {
        logger.error("No active Claude settings found.");
        process.exitCode = 1;
        return;
      }

      const payload = {
        activeProfile: active,
        model: settings.model || settings.env && settings.env.ANTHROPIC_MODEL || null,
        baseUrl: settings.env && settings.env.ANTHROPIC_BASE_URL || null,
      };

      if (command.json) {
        printJson(logger, payload);
        return;
      }

      logger.log("Active profile: " + payload.activeProfile);
      logger.log("Model: " + (payload.model || "(unset)"));
      logger.log("Base URL: " + (payload.baseUrl || "(native)"));
    });

  program
    .command("switch <profile>")
    .description("Switch to a saved Claude profile")
    .option("--json", "Output switch result as JSON")
    .action((profile, command) => {
      const next = switchProfile(profile, claudeDir);

      if (command.json) {
        printJson(logger, {
          profile,
          switched: true,
          model: next.model || next.env && next.env.ANTHROPIC_MODEL || null,
          baseUrl: next.env && next.env.ANTHROPIC_BASE_URL || null,
        });
        return;
      }

      logger.log(pc.green("Switched to profile: " + profile));
    });

  program
    .command("pick")
    .description("Interactively choose a profile and model")
    .option("--vendor <vendor>", "Filter models by vendor during selection")
    .action(async (command) => {
      const profiles = listProfiles(claudeDir);

      if (!profiles.length) {
        logger.error("No Claude profiles found.");
        process.exitCode = 1;
        return;
      }

      const chosenProfile = await select("Choose a profile", profiles);
      switchProfile(chosenProfile, claudeDir);
      logger.log(pc.green("Switched to profile: " + chosenProfile));

      const settings = readProfile(chosenProfile, claudeDir);
      const providerKind = detectProviderKind(settings && settings.env && settings.env.ANTHROPIC_BASE_URL);

      if (providerKind !== "openrouter") {
        logger.log("Model discovery is not supported yet for profile: " + chosenProfile);
        return;
      }

      const models = await fetchModels();
      const vendor = command.vendor || (await select("Choose a vendor", listVendors(models)));
      const chosenModel = await select(
        "Choose a model",
        filterModelsByVendor(models, vendor)
      );

      updateProfileModel(chosenProfile, chosenModel, claudeDir);
      logger.log(pc.green("Updated " + chosenProfile + " model to " + chosenModel));
    });

  program
    .command("models [profile] [vendor]")
    .description("List models for a provider-backed profile")
    .option("--json", "Output model results as JSON")
    .action(async (profile, vendor, command) => {
      const profileName = profile || detectActiveProfile(claudeDir);
      const settings = readProfileLikeSettings(profileName, claudeDir);

      if (!settings) {
        logger.error("Profile not found: " + profileName);
        process.exitCode = 1;
        return;
      }

      const providerKind = detectProviderKind(settings.env && settings.env.ANTHROPIC_BASE_URL);

      if (providerKind !== "openrouter") {
        logger.error("Model discovery is not supported yet for profile: " + profileName);
        process.exitCode = 1;
        return;
      }

      const models = await fetchModels();
      const filtered = filterModelsByVendor(models, vendor);

      if (command.json) {
        printJson(logger, {
          profile: profileName,
          vendor: vendor || null,
          models: filtered,
        });
        return;
      }

      filtered.forEach((id) => logger.log(id));
    });

  program
    .command("use <model>")
    .description("Set the default model for a profile")
    .option("-p, --profile <profile>", "Profile name to update")
    .option("--json", "Output update result as JSON")
    .action((model, command) => {
      const profile = command.profile || detectActiveProfile(claudeDir);

      if (!profile) {
        logger.error("No active profile found. Use --profile to target one.");
        process.exitCode = 1;
        return;
      }

      updateProfileModel(profile, model, claudeDir);

      if (command.json) {
        printJson(logger, {
          profile,
          updated: true,
          model,
        });
        return;
      }

      logger.log(pc.green("Updated " + profile + " model to " + model));
    });

  program
    .command("create <profile>")
    .description("Create a Claude profile")
    .option("--base-url <url>", "Provider base URL")
    .option("--api-key-env <name>", "Environment variable that stores the API key")
    .option("--api-key-helper <command>", "Explicit apiKeyHelper command")
    .option("--model <model>", "Default model to save")
    .option("--json", "Output creation result as JSON")
    .action(async (profile, command) => {
      const baseUrl =
        command.baseUrl || (await ask("Base URL", "https://openrouter.ai/api"));
      const apiKeyEnv =
        command.apiKeyEnv || (!command.apiKeyHelper ? await ask("API key env var", "OPENROUTER_API_KEY") : null);
      const model = command.model || (await ask("Default model", "anthropic/claude-sonnet-4.6"));

      const created = createProfile(
        {
          profile,
          baseUrl,
          apiKeyEnv,
          apiKeyHelper: command.apiKeyHelper,
          model,
        },
        claudeDir
      );

      if (command.json) {
        printJson(logger, {
          profile,
          created: true,
          model: created.model || null,
          baseUrl: created.env && created.env.ANTHROPIC_BASE_URL || null,
        });
        return;
      }

      logger.log(pc.green("Created profile: " + profile));
    });

  program
    .command("edit <profile>")
    .description("Edit a Claude profile")
    .option("--base-url <url>", "Provider base URL")
    .option("--api-key-env <name>", "Environment variable that stores the API key")
    .option("--api-key-helper <command>", "Explicit apiKeyHelper command")
    .option("--model <model>", "Default model to save")
    .option("--json", "Output edit result as JSON")
    .action(async (profile, command) => {
      const current = readProfile(profile, claudeDir);

      if (!current) {
        logger.error("Profile not found: " + profile);
        process.exitCode = 1;
        return;
      }

      const interactive =
        !command.baseUrl &&
        !command.apiKeyEnv &&
        !command.apiKeyHelper &&
        !command.model;

      const baseUrl =
        command.baseUrl ||
        (interactive ? await ask("Base URL", current.env && current.env.ANTHROPIC_BASE_URL) : current.env && current.env.ANTHROPIC_BASE_URL);
      const model =
        command.model ||
        (interactive ? await ask("Default model", current.model || current.env && current.env.ANTHROPIC_MODEL) : current.model || current.env && current.env.ANTHROPIC_MODEL);
      const apiKeyEnv =
        command.apiKeyEnv ||
        (!command.apiKeyHelper
          ? interactive
            ? await ask("API key env var", inferApiKeyEnv(current.apiKeyHelper))
            : inferApiKeyEnv(current.apiKeyHelper)
          : null);

      const updated = editProfile(
        profile,
        {
          baseUrl,
          apiKeyEnv,
          apiKeyHelper: command.apiKeyHelper,
          model,
        },
        claudeDir
      );

      if (command.json) {
        printJson(logger, {
          profile,
          updated: true,
          model: updated.model || null,
          baseUrl: updated.env && updated.env.ANTHROPIC_BASE_URL || null,
        });
        return;
      }

      logger.log(pc.green("Updated profile: " + profile));
    });

  program
    .command("delete <profile>")
    .description("Delete a Claude profile")
    .option("--json", "Output delete result as JSON")
    .action((profile, command) => {
      deleteProfile(profile, claudeDir);

      if (command.json) {
        printJson(logger, {
          profile,
          deleted: true,
        });
        return;
      }

      logger.log(pc.green("Deleted profile: " + profile));
    });

  return program;
}

function readProfileLikeSettings(profile, claudeDir) {
  return profile ? readProfile(profile, claudeDir) : readCurrentSettings(claudeDir);
}

function promptInput(message, defaultValue) {
  const { Input } = require("enquirer");
  const prompt = new Input({
    message,
    initial: defaultValue,
  });

  return prompt.run().then((value) => value || defaultValue);
}

async function selectFromList(message, choices) {
  const { Select } = require("enquirer");
  const prompt = new Select({
    message,
    choices,
  });

  return prompt.run();
}

function inferApiKeyEnv(apiKeyHelper) {
  if (!apiKeyHelper) {
    return "OPENROUTER_API_KEY";
  }

  const match = apiKeyHelper.match(/\$([A-Z0-9_]+)/);
  return match ? match[1] : "OPENROUTER_API_KEY";
}

function printJson(logger, payload) {
  logger.log(JSON.stringify(payload, null, 2));
}

function listVendors(models) {
  return Array.from(
    new Set(
      models
        .map((entry) => String(entry.id || "").split("/")[0])
        .filter(Boolean)
    )
  ).sort();
}

module.exports = {
  createProgram,
};
