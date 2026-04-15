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
  "  ccs switch openrouter",
  "  ccs models openrouter anthropic",
  "  ccs pick --vendor anthropic",
  "  ccs use openai/gpt-5-codex --profile openrouter",
  "  ccs create openrouter --base-url https://openrouter.ai/api --api-key-env OPENROUTER_API_KEY",
  "  ccs edit openrouter --model anthropic/claude-sonnet-4.6",
  "",
  "Notes:",
  "  OpenRouter model discovery works when ANTHROPIC_BASE_URL contains openrouter.ai.",
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
    .action(() => {
      const profiles = listProfiles(claudeDir);
      const active = detectActiveProfile(claudeDir);

      if (!profiles.length) {
        logger.log("No Claude profiles found.");
        return;
      }

      profiles.forEach((name) => {
        logger.log((name === active ? "* " : "  ") + name);
      });
    });

  program
    .command("current")
    .description("Show the current Claude profile and model")
    .action(() => {
      const active = detectActiveProfile(claudeDir) || "unknown";
      const settings = readCurrentSettings(claudeDir);

      if (!settings) {
        logger.error("No active Claude settings found.");
        process.exitCode = 1;
        return;
      }

      logger.log("Active profile: " + active);
      logger.log("Model: " + (settings.model || settings.env && settings.env.ANTHROPIC_MODEL || "(unset)"));
      logger.log("Base URL: " + (settings.env && settings.env.ANTHROPIC_BASE_URL || "(native)"));
    });

  program
    .command("switch <profile>")
    .description("Switch to a saved Claude profile")
    .action((profile) => {
      switchProfile(profile, claudeDir);
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
      const chosenModel = await select(
        "Choose a model",
        filterModelsByVendor(models, command.vendor)
      );

      updateProfileModel(chosenProfile, chosenModel, claudeDir);
      logger.log(pc.green("Updated " + chosenProfile + " model to " + chosenModel));
    });

  program
    .command("models [profile] [vendor]")
    .description("List models for a provider-backed profile")
    .action(async (profile, vendor) => {
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
      filterModelsByVendor(models, vendor).forEach((id) => logger.log(id));
    });

  program
    .command("use <model>")
    .description("Set the default model for a profile")
    .option("-p, --profile <profile>", "Profile name to update")
    .action((model, command) => {
      const profile = command.profile || detectActiveProfile(claudeDir);

      if (!profile) {
        logger.error("No active profile found. Use --profile to target one.");
        process.exitCode = 1;
        return;
      }

      updateProfileModel(profile, model, claudeDir);
      logger.log(pc.green("Updated " + profile + " model to " + model));
    });

  program
    .command("create <profile>")
    .description("Create a Claude profile")
    .option("--base-url <url>", "Provider base URL")
    .option("--api-key-env <name>", "Environment variable that stores the API key")
    .option("--api-key-helper <command>", "Explicit apiKeyHelper command")
    .option("--model <model>", "Default model to save")
    .action(async (profile, command) => {
      const baseUrl =
        command.baseUrl || (await ask("Base URL", "https://openrouter.ai/api"));
      const apiKeyEnv =
        command.apiKeyEnv || (!command.apiKeyHelper ? await ask("API key env var", "OPENROUTER_API_KEY") : null);
      const model = command.model || (await ask("Default model", "anthropic/claude-sonnet-4.6"));

      createProfile(
        {
          profile,
          baseUrl,
          apiKeyEnv,
          apiKeyHelper: command.apiKeyHelper,
          model,
        },
        claudeDir
      );
      logger.log(pc.green("Created profile: " + profile));
    });

  program
    .command("edit <profile>")
    .description("Edit a Claude profile")
    .option("--base-url <url>", "Provider base URL")
    .option("--api-key-env <name>", "Environment variable that stores the API key")
    .option("--api-key-helper <command>", "Explicit apiKeyHelper command")
    .option("--model <model>", "Default model to save")
    .action(async (profile, command) => {
      const current = readProfile(profile, claudeDir);

      if (!current) {
        logger.error("Profile not found: " + profile);
        process.exitCode = 1;
        return;
      }

      const baseUrl =
        command.baseUrl || (await ask("Base URL", current.env && current.env.ANTHROPIC_BASE_URL));
      const model =
        command.model || (await ask("Default model", current.model || current.env && current.env.ANTHROPIC_MODEL));
      const apiKeyEnv =
        command.apiKeyEnv ||
        (!command.apiKeyHelper ? await ask("API key env var", inferApiKeyEnv(current.apiKeyHelper)) : null);

      editProfile(
        profile,
        {
          baseUrl,
          apiKeyEnv,
          apiKeyHelper: command.apiKeyHelper,
          model,
        },
        claudeDir
      );
      logger.log(pc.green("Updated profile: " + profile));
    });

  program
    .command("delete <profile>")
    .description("Delete a Claude profile")
    .action((profile) => {
      deleteProfile(profile, claudeDir);
      logger.log(pc.green("Deleted profile: " + profile));
    });

  return program;
}

function readProfileLikeSettings(profile, claudeDir) {
  return profile ? readProfile(profile, claudeDir) : readCurrentSettings(claudeDir);
}

function promptInput(message, defaultValue) {
  const readline = require("readline");
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const suffix = defaultValue ? " [" + defaultValue + "]" : "";
    rl.question(message + suffix + ": ", (answer) => {
      rl.close();
      resolve(answer || defaultValue);
    });
  });
}

async function selectFromList(message, choices) {
  const answer = await promptInput(
    message + "\n" + choices.map((choice, index) => index + 1 + ". " + choice).join("\n"),
    "1"
  );
  const numeric = Number(answer);
  if (!Number.isNaN(numeric) && numeric >= 1 && numeric <= choices.length) {
    return choices[numeric - 1];
  }
  if (choices.indexOf(answer) >= 0) {
    return answer;
  }
  throw new Error("Invalid selection: " + answer);
}

function inferApiKeyEnv(apiKeyHelper) {
  if (!apiKeyHelper) {
    return "OPENROUTER_API_KEY";
  }

  const match = apiKeyHelper.match(/\$([A-Z0-9_]+)/);
  return match ? match[1] : "OPENROUTER_API_KEY";
}

module.exports = {
  createProgram,
};
