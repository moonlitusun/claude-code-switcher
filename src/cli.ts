import { Command } from "commander";
import enquirer from "enquirer";
import pc from "picocolors";

import {
  createProfile,
  deleteProfile,
  detectActiveProfile,
  editProfile,
  listProfiles,
  readCurrentSettings,
  readProfile,
  switchProfile,
  updateProfileModel,
} from "./claude-config";
import { detectProviderKind, fetchOpenRouterModels, filterModelsByVendor } from "./providers/openrouter";
import type { Logger, ModelEntry, Settings } from "./types";

type AskFn = (message: string, defaultValue?: string | null) => Promise<string | null>;
type SelectFn = (message: string, choices: string[]) => Promise<string>;

interface ProgramOptions {
  claudeDir?: string;
  logger?: Logger;
  fetchModels?: () => Promise<ModelEntry[]>;
  select?: SelectFn;
  ask?: AskFn;
}

const HELP_EPILOG = [
  "",
  "Examples:",
  "  ccs profiles",
  "  ccs profiles --json",
  "  ccs current --json",
  "  ccs switch",
  "  ccs switch openrouter",
  "  ccs switch openrouter --json",
  "  ccs models openrouter anthropic",
  "  ccs models openrouter anthropic --json",
  "  ccs pick",
  "  ccs pick --vendor anthropic",
  "  ccs use",
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

export function createProgram(options: ProgramOptions = {}): Command {
  const claudeDir = options.claudeDir;
  const logger = options.logger || console;
  const fetchModels = options.fetchModels || fetchOpenRouterModels;
  const select = options.select || selectFromList;
  const ask = options.ask || promptInput;
  const program = new Command();

  program
    .name("cc-switcher")
    .description("Switch Claude Code provider profiles and models")
    .showHelpAfterError("(run with --help for usage examples)");

  const defaultHelpInformation = program.helpInformation.bind(program);
  program.helpInformation = function helpInformation(): string {
    return `${defaultHelpInformation()}\n${HELP_EPILOG}\n`;
  };

  program
    .command("profiles")
    .description("List saved Claude profiles")
    .option("--json", "Output profiles as JSON")
    .action(function (this: Command) {
      const opts = this.opts<{ json?: boolean }>();
      const profiles = listProfiles(claudeDir);
      const active = detectActiveProfile(claudeDir);

      if (!profiles.length) {
        if (opts.json) {
          printJson(logger, { active, profiles: [] });
        } else {
          logger.log("No Claude profiles found.");
        }
        return;
      }

      if (opts.json) {
        printJson(logger, { active, profiles });
        return;
      }

      profiles.forEach((name) => {
        logger.log(`${name === active ? "* " : "  "}${name}`);
      });
    });

  program
    .command("current")
    .description("Show the current Claude profile and model")
    .option("--json", "Output current profile details as JSON")
    .action(function (this: Command) {
      const opts = this.opts<{ json?: boolean }>();
      const active = detectActiveProfile(claudeDir) || "unknown";
      const settings = readCurrentSettings(claudeDir);

      if (!settings) {
        logger.error("No active Claude settings found.");
        process.exitCode = 1;
        return;
      }

      const payload = currentPayload(active, settings);

      if (opts.json) {
        printJson(logger, payload);
        return;
      }

      logger.log(`Active profile: ${payload.activeProfile}`);
      logger.log(`Model: ${payload.model || "(unset)"}`);
      logger.log(`Base URL: ${payload.baseUrl || "(native)"}`);
    });

  program
    .command("switch [profile]")
    .description("Switch to a saved Claude profile")
    .option("--json", "Output switch result as JSON")
    .action(async function (this: Command, profile?: string) {
      const opts = this.opts<{ json?: boolean }>();
      const targetProfile = profile || (await chooseProfile(select, claudeDir));

      if (!targetProfile) {
        logger.error("No Claude profiles found.");
        process.exitCode = 1;
        return;
      }

      const next = switchProfile(targetProfile, claudeDir);

      if (opts.json) {
        printJson(logger, {
          profile: targetProfile,
          switched: true,
          model: readModel(next),
          baseUrl: next.env?.ANTHROPIC_BASE_URL || null,
        });
        return;
      }

      logger.log(pc.green(`Switched to profile: ${targetProfile}`));
    });

  program
    .command("pick")
    .description("Interactively choose a profile and model")
    .option("--vendor <vendor>", "Filter models by vendor during selection")
    .action(async function (this: Command) {
      const opts = this.opts<{ vendor?: string }>();
      const profiles = listProfiles(claudeDir);

      if (!profiles.length) {
        logger.error("No Claude profiles found.");
        process.exitCode = 1;
        return;
      }

      const chosenProfile = await select("Choose a profile", profiles);
      switchProfile(chosenProfile, claudeDir);
      logger.log(pc.green(`Switched to profile: ${chosenProfile}`));

      const settings = readProfile(chosenProfile, claudeDir);
      const providerKind = detectProviderKind(settings?.env?.ANTHROPIC_BASE_URL);

      if (providerKind !== "openrouter") {
        logger.log(`Model discovery is not supported yet for profile: ${chosenProfile}`);
        return;
      }

      const models = await fetchModels();
      const vendor = opts.vendor || (await select("Choose a vendor", listVendors(models)));
      const chosenModel = await select("Choose a model", filterModelsByVendor(models, vendor));

      updateProfileModel(chosenProfile, chosenModel, claudeDir);
      logger.log(pc.green(`Updated ${chosenProfile} model to ${chosenModel}`));
    });

  program
    .command("models [profile] [vendor]")
    .description("List models for a provider-backed profile")
    .option("--json", "Output model results as JSON")
    .action(async function (this: Command, profile?: string, vendor?: string) {
      const opts = this.opts<{ json?: boolean }>();
      const profileName = profile || detectActiveProfile(claudeDir);
      const settings = readProfileLikeSettings(profileName, claudeDir);

      if (!settings || !profileName) {
        logger.error(`Profile not found: ${profileName}`);
        process.exitCode = 1;
        return;
      }

      const providerKind = detectProviderKind(settings.env?.ANTHROPIC_BASE_URL);

      if (providerKind !== "openrouter") {
        logger.error(`Model discovery is not supported yet for profile: ${profileName}`);
        process.exitCode = 1;
        return;
      }

      const models = await fetchModels();
      const filtered = filterModelsByVendor(models, vendor);

      if (opts.json) {
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
    .command("use [model]")
    .description("Set the default model for a profile")
    .option("-p, --profile <profile>", "Profile name to update")
    .option("--json", "Output update result as JSON")
    .action(async function (this: Command, model?: string) {
      const opts = this.opts<{ profile?: string; json?: boolean }>();
      const profile = opts.profile || detectActiveProfile(claudeDir);

      if (!profile) {
        logger.error("No active profile found. Use --profile to target one.");
        process.exitCode = 1;
        return;
      }

      const nextModel = model || (await chooseModelForProfile(profile, claudeDir, fetchModels, select, logger));

      if (!nextModel) {
        process.exitCode = 1;
        return;
      }

      updateProfileModel(profile, nextModel, claudeDir);

      if (opts.json) {
        printJson(logger, {
          profile,
          updated: true,
          model: nextModel,
        });
        return;
      }

      logger.log(pc.green(`Updated ${profile} model to ${nextModel}`));
    });

  program
    .command("create <profile>")
    .description("Create a Claude profile")
    .option("--base-url <url>", "Provider base URL")
    .option("--api-key-env <name>", "Environment variable that stores the API key")
    .option("--api-key-helper <command>", "Explicit apiKeyHelper command")
    .option("--model <model>", "Default model to save")
    .option("--json", "Output creation result as JSON")
    .action(async function (this: Command, profile: string) {
      const opts = this.opts<{
        baseUrl?: string;
        apiKeyEnv?: string;
        apiKeyHelper?: string;
        model?: string;
        json?: boolean;
      }>();
      const baseUrl = opts.baseUrl || (await ask("Base URL", "https://openrouter.ai/api"));
      const apiKeyEnv = opts.apiKeyEnv || (!opts.apiKeyHelper ? await ask("API key env var", "OPENROUTER_API_KEY") : null);
      const model = opts.model || (await ask("Default model", "anthropic/claude-sonnet-4.6"));

      const created = createProfile(
        {
          profile,
          baseUrl,
          apiKeyEnv,
          apiKeyHelper: opts.apiKeyHelper,
          model,
        },
        claudeDir
      );

      if (opts.json) {
        printJson(logger, {
          profile,
          created: true,
          model: created.model || null,
          baseUrl: created.env?.ANTHROPIC_BASE_URL || null,
        });
        return;
      }

      logger.log(pc.green(`Created profile: ${profile}`));
    });

  program
    .command("edit <profile>")
    .description("Edit a Claude profile")
    .option("--base-url <url>", "Provider base URL")
    .option("--api-key-env <name>", "Environment variable that stores the API key")
    .option("--api-key-helper <command>", "Explicit apiKeyHelper command")
    .option("--model <model>", "Default model to save")
    .option("--json", "Output edit result as JSON")
    .action(async function (this: Command, profile: string) {
      const opts = this.opts<{
        baseUrl?: string;
        apiKeyEnv?: string;
        apiKeyHelper?: string;
        model?: string;
        json?: boolean;
      }>();
      const current = readProfile(profile, claudeDir);

      if (!current) {
        logger.error(`Profile not found: ${profile}`);
        process.exitCode = 1;
        return;
      }

      const interactive = !opts.baseUrl && !opts.apiKeyEnv && !opts.apiKeyHelper && !opts.model;
      const baseUrl =
        opts.baseUrl ||
        (interactive ? await ask("Base URL", current.env?.ANTHROPIC_BASE_URL || null) : current.env?.ANTHROPIC_BASE_URL || null);
      const model =
        opts.model ||
        (interactive ? await ask("Default model", readModel(current)) : readModel(current));
      const apiKeyEnv =
        opts.apiKeyEnv ||
        (!opts.apiKeyHelper
          ? interactive
            ? await ask("API key env var", inferApiKeyEnv(current.apiKeyHelper))
            : inferApiKeyEnv(current.apiKeyHelper)
          : null);

      const updated = editProfile(
        profile,
        {
          baseUrl,
          apiKeyEnv,
          apiKeyHelper: opts.apiKeyHelper,
          model,
        },
        claudeDir
      );

      if (opts.json) {
        printJson(logger, {
          profile,
          updated: true,
          model: updated.model || null,
          baseUrl: updated.env?.ANTHROPIC_BASE_URL || null,
        });
        return;
      }

      logger.log(pc.green(`Updated profile: ${profile}`));
    });

  program
    .command("delete <profile>")
    .description("Delete a Claude profile")
    .option("--json", "Output delete result as JSON")
    .action(function (this: Command, profile: string) {
      const opts = this.opts<{ json?: boolean }>();
      deleteProfile(profile, claudeDir);

      if (opts.json) {
        printJson(logger, {
          profile,
          deleted: true,
        });
        return;
      }

      logger.log(pc.green(`Deleted profile: ${profile}`));
    });

  return program;
}

function readProfileLikeSettings(profile: string | null, claudeDir?: string): Settings | null {
  return profile ? readProfile(profile, claudeDir) : readCurrentSettings(claudeDir);
}

async function promptInput(message: string, defaultValue?: string | null): Promise<string | null> {
  const { Input } = enquirer as unknown as {
    Input: new (options: { message: string; initial?: string }) => { run(): Promise<string> };
  };
  const prompt = new Input({
    message,
    initial: defaultValue || undefined,
  });

  const value = (await prompt.run()) as string;
  return value || defaultValue || null;
}

async function selectFromList(message: string, choices: string[]): Promise<string> {
  const { AutoComplete } = enquirer as unknown as {
    AutoComplete: new (options: { message: string; choices: string[] }) => { run(): Promise<string> };
  };
  const prompt = new AutoComplete({
    message,
    choices,
  });

  return (await prompt.run()) as string;
}

function inferApiKeyEnv(apiKeyHelper?: string): string {
  if (!apiKeyHelper) {
    return "OPENROUTER_API_KEY";
  }

  const match = apiKeyHelper.match(/\$([A-Z0-9_]+)/);
  return match ? match[1] : "OPENROUTER_API_KEY";
}

function printJson(logger: Logger, payload: unknown): void {
  logger.log(JSON.stringify(payload, null, 2));
}

async function chooseProfile(select: SelectFn, claudeDir?: string): Promise<string | null> {
  const profiles = listProfiles(claudeDir);
  if (!profiles.length) {
    return null;
  }

  return select("Choose a profile", profiles);
}

function listVendors(models: ModelEntry[]): string[] {
  return Array.from(
    new Set(
      models
        .map((entry) => String(entry.id || "").split("/")[0])
        .filter(Boolean)
    )
  ).sort();
}

function readModel(settings: Settings): string | null {
  return settings.model || settings.env?.ANTHROPIC_MODEL || null;
}

async function chooseModelForProfile(
  profile: string,
  claudeDir: string | undefined,
  fetchModels: () => Promise<ModelEntry[]>,
  select: SelectFn,
  logger: Logger
): Promise<string | null> {
  const settings = readProfile(profile, claudeDir);
  const providerKind = detectProviderKind(settings?.env?.ANTHROPIC_BASE_URL);

  if (providerKind !== "openrouter") {
    logger.error(`Interactive model selection is not supported yet for profile: ${profile}`);
    return null;
  }

  const models = await fetchModels();
  const vendor = await select("Choose a vendor", listVendors(models));
  return select("Choose a model", filterModelsByVendor(models, vendor));
}

function currentPayload(activeProfile: string, settings: Settings): { activeProfile: string; model: string | null; baseUrl: string | null } {
  return {
    activeProfile,
    model: readModel(settings),
    baseUrl: settings.env?.ANTHROPIC_BASE_URL || null,
  };
}
