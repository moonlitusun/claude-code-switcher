import { Command } from "commander";
import { search as inquirerSearch, select as inquirerSelect } from "@inquirer/prompts";
import readline from "node:readline";
import pc from "picocolors";

import {
  createProfile,
  deleteProfile,
  detectActiveProfile,
  editProfile,
  listProfiles,
  renameProfile,
  readCurrentSettings,
  readProfile,
  switchProfile,
  updateProfileModel,
} from "./claude-config";
import { createSearchSource, isPromptCancelledError } from "./prompt-helpers";
import { detectProviderKind, fetchOpenRouterModels, filterModelsByVendor } from "./providers/openrouter";
import type { Logger, ModelEntry, Settings } from "./types";

type AskFn = (message: string, defaultValue?: string | null) => Promise<string | null>;
type SelectFn = (message: string, choices: string[]) => Promise<string | null>;
type SearchFn = (message: string, choices: string[]) => Promise<string | null>;

interface ProgramOptions {
  claudeDir?: string;
  logger?: Logger;
  fetchModels?: () => Promise<ModelEntry[]>;
  search?: SearchFn;
  ask?: AskFn;
}

interface PromptCapabilities {
  term?: string | null;
  stdinTTY?: boolean;
  stdoutTTY?: boolean;
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
  "  ccs create openrouter --base-url https://openrouter.ai/api --api-key sk-or-v1-your-key",
  "  ccs create openrouter --base-url https://openrouter.ai/api --api-key sk-or-v1-your-key --json",
  "  ccs edit openrouter --model anthropic/claude-sonnet-4.6",
  "  ccs edit openrouter --model anthropic/claude-sonnet-4.6 --json",
  "  ccs rename openrouter openrouter-v2",
  "  ccs delete openrouter --json",
  "",
  "Notes:",
  "  OpenRouter model discovery works when ANTHROPIC_BASE_URL contains openrouter.ai.",
  "  In interactive pick mode, --vendor narrows the model search results.",
  "  Other profiles can still be switched and edited, but model discovery is not implemented yet.",
].join("\n");

export function createProgram(options: ProgramOptions = {}): Command {
  const claudeDir = options.claudeDir;
  const logger = options.logger || console;
  const fetchModels = options.fetchModels || fetchOpenRouterModels;
  const search = options.search || searchFromList;
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
    .command("profiles [profile]")
    .description("List saved Claude profiles or show a profile")
    .option("--json", "Output profiles as JSON")
    .action(function (this: Command, profile?: string) {
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
        if (profile) {
          const selected = readProfile(profile, claudeDir);

          if (!selected) {
            logger.error(`Profile not found: ${profile}`);
            process.exitCode = 1;
            return;
          }

          printJson(logger, profilePayload(profile, selected));
          return;
        }

        printJson(logger, { active, profiles });
        return;
      }

      if (!profile) {
        profiles.forEach((name) => {
          logger.log(`${name === active ? "* " : "  "}${name}`);
        });
        return;
      }

      const selected = readProfile(profile, claudeDir);

      if (!selected) {
        logger.error(`Profile not found: ${profile}`);
        process.exitCode = 1;
        return;
      }

      logger.log("");
      logger.log(`Profile: ${profile}`);
      logger.log(`Model: ${readModel(selected) || "(unset)"}`);
      logger.log(`Base URL: ${selected.env?.ANTHROPIC_BASE_URL || "(native)"}`);
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
      const targetProfile = profile || (await chooseProfile(search, claudeDir));

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

      const chosenProfile = await search("Choose a profile", profiles);
      if (!chosenProfile) {
        logger.error("Selection cancelled.");
        process.exitCode = 1;
        return;
      }
      switchProfile(chosenProfile, claudeDir);
      logger.log(pc.green(`Switched to profile: ${chosenProfile}`));

      const settings = readProfile(chosenProfile, claudeDir);
      const providerKind = detectProviderKind(settings?.env?.ANTHROPIC_BASE_URL);

      if (providerKind !== "openrouter") {
        logger.log(`Model discovery is not supported yet for profile: ${chosenProfile}`);
        return;
      }

      const models = await fetchModels();
      const modelIds = filterModelsByVendor(models, opts.vendor);
      const chosenModel = await search("Choose a model", modelIds);

      if (!chosenModel) {
        logger.error("Selection cancelled.");
        process.exitCode = 1;
        return;
      }

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

      const nextModel = model || (await chooseModelForProfile(profile, claudeDir, fetchModels, search, logger));

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
    .option("--api-key <key>", "API key to store directly in the profile helper")
    .option("--model <model>", "Default model to save")
    .option("--json", "Output creation result as JSON")
    .action(async function (this: Command, profile: string) {
      const opts = this.opts<{
        baseUrl?: string;
        apiKey?: string;
        model?: string;
        json?: boolean;
      }>();
      const resolvedProfile = await resolveCreateProfileName(profile, claudeDir, search, ask, logger);

      if (!resolvedProfile) {
        process.exitCode = 1;
        return;
      }

      const baseUrl = opts.baseUrl || (await ask("Base URL", "https://openrouter.ai/api"));
      const apiKey = opts.apiKey !== undefined ? opts.apiKey : await ask("API key", null);
      const model = opts.model || (await ask("Default model", "anthropic/claude-sonnet-4.6"));

      const created = createProfile(
        {
          profile: resolvedProfile,
          baseUrl,
          apiKey,
          model,
        },
        claudeDir
      );

      if (opts.json) {
        printJson(logger, {
          profile: resolvedProfile,
          created: true,
          model: created.model || null,
          baseUrl: created.env?.ANTHROPIC_BASE_URL || null,
        });
        return;
      }

      logger.log(pc.green(`Created profile: ${resolvedProfile}`));
    });

  program
    .command("edit <profile>")
    .description("Edit a Claude profile")
    .option("--base-url <url>", "Provider base URL")
    .option("--api-key <key>", "API key to store directly in the profile helper")
    .option("--model <model>", "Default model to save")
    .option("--json", "Output edit result as JSON")
    .action(async function (this: Command, profile: string) {
      const opts = this.opts<{
        baseUrl?: string;
        apiKey?: string;
        model?: string;
        json?: boolean;
      }>();
      const current = readProfile(profile, claudeDir);

      if (!current) {
        logger.error(`Profile not found: ${profile}`);
        process.exitCode = 1;
        return;
      }

      const interactive = !opts.baseUrl && opts.apiKey === undefined && !opts.model;
      const baseUrl =
        opts.baseUrl ||
        (interactive ? await ask("Base URL", current.env?.ANTHROPIC_BASE_URL || null) : current.env?.ANTHROPIC_BASE_URL || null);
      const model =
        opts.model ||
        (interactive ? await ask("Default model", readModel(current)) : readModel(current));
      const apiKey =
        opts.apiKey !== undefined
          ? opts.apiKey
          : interactive
            ? await ask("API key", inferLiteralApiKey(current.apiKeyHelper))
            : undefined;

      const updated = editProfile(
        profile,
        {
          baseUrl,
          apiKey,
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
    .command("rename <profile> <next-profile>")
    .description("Rename a Claude profile")
    .option("--json", "Output rename result as JSON")
    .action(async function (this: Command, profile: string, nextProfile: string) {
      const opts = this.opts<{ json?: boolean }>();
      const resolvedRename = await resolveRenameProfileName(profile, nextProfile, claudeDir, search, ask, logger);

      if (!resolvedRename) {
        process.exitCode = 1;
        return;
      }

      renameProfile(profile, resolvedRename.nextProfile, claudeDir, {
        overwrite: resolvedRename.overwrite,
      });

      if (opts.json) {
        printJson(logger, {
          profile,
          nextProfile: resolvedRename.nextProfile,
          renamed: true,
        });
        return;
      }

      logger.log(pc.green(`Renamed profile: ${profile} -> ${resolvedRename.nextProfile}`));
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
  return promptInputSimple(message, defaultValue);
}

async function selectFromList(message: string, choices: string[]): Promise<string | null> {
  if (!shouldUseRichPrompts()) {
    return selectFromListSimple(message, choices);
  }

  try {
    const value = await inquirerSelect({
      message,
      choices: choices.map((choice) => ({
        name: choice,
        value: choice,
      })),
    });

    return value || null;
  } catch (error) {
    if (isPromptCancelledError(error)) {
      return null;
    }

    throw error;
  }
}

async function searchFromList(message: string, choices: string[]): Promise<string | null> {
  if (!shouldUseRichPrompts()) {
    return selectFromListSimple(message, choices);
  }

  try {
    const value = await inquirerSearch({
      message,
      source: createSearchSource(choices),
    });

    return value || null;
  } catch (error) {
    if (isPromptCancelledError(error)) {
      return null;
    }

    throw error;
  }
}

async function promptInputSimple(message: string, defaultValue?: string | null): Promise<string | null> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const suffix = defaultValue ? ` [${defaultValue}]` : "";

  const answer = await new Promise<string>((resolve) => {
    rl.question(`${message}${suffix}: `, resolve);
  });

  rl.close();
  return answer || defaultValue || null;
}

async function selectFromListSimple(message: string, choices: string[]): Promise<string> {
  const menu = `${message}\n${choices.map((choice, index) => `${index + 1}. ${choice}`).join("\n")}`;
  const answer = await promptInputSimple(menu, "1");
  const numeric = Number(answer);

  if (!Number.isNaN(numeric) && numeric >= 1 && numeric <= choices.length) {
    return choices[numeric - 1]!;
  }

  const exact = choices.find((choice) => choice === answer);
  if (exact) {
    return exact;
  }

  throw new Error(`Invalid selection: ${answer}`);
}

function printJson(logger: Logger, payload: unknown): void {
  logger.log(JSON.stringify(payload, null, 2));
}

async function chooseProfile(search: SearchFn, claudeDir?: string): Promise<string | null> {
  const profiles = listProfiles(claudeDir);
  if (!profiles.length) {
    return null;
  }

  return search("Choose a profile", profiles);
}

async function resolveCreateProfileName(
  profile: string,
  claudeDir: string | undefined,
  search: SearchFn,
  ask: AskFn,
  logger: Logger
): Promise<string | null> {
  let current = profile;

  while (true) {
    const existing = readProfile(current, claudeDir);
    if (!existing) {
      return current;
    }

    const action = await search(`Profile ${current} already exists. What do you want to do?`, [
      "overwrite",
      "rename",
      "cancel",
    ]);

    if (!action || action === "cancel") {
      logger.error("Selection cancelled.");
      return null;
    }

    if (action === "overwrite") {
      return current;
    }

    const nextName = await ask("New profile name", null);
    if (!nextName) {
      logger.error("Selection cancelled.");
      return null;
    }

    current = nextName.trim();
    if (!current) {
      logger.error("Selection cancelled.");
      return null;
    }
  }
}

async function resolveRenameProfileName(
  profile: string,
  nextProfile: string,
  claudeDir: string | undefined,
  search: SearchFn,
  ask: AskFn,
  logger: Logger
): Promise<{ nextProfile: string; overwrite: boolean } | null> {
  let current = nextProfile.trim();

  if (!current) {
    logger.error("Selection cancelled.");
    return null;
  }

  while (true) {
    if (current === profile) {
      return { nextProfile: current, overwrite: false };
    }

    const existing = readProfile(current, claudeDir);
    if (!existing) {
      return { nextProfile: current, overwrite: false };
    }

    const action = await search(`Profile ${current} already exists. What do you want to do?`, [
      "overwrite",
      "rename",
      "cancel",
    ]);

    if (!action || action === "cancel") {
      logger.error("Selection cancelled.");
      return null;
    }

    if (action === "overwrite") {
      return { nextProfile: current, overwrite: true };
    }

    const nextName = await ask("New profile name", null);
    if (!nextName) {
      logger.error("Selection cancelled.");
      return null;
    }

    current = nextName.trim();
    if (!current) {
      logger.error("Selection cancelled.");
      return null;
    }
  }
}

function readModel(settings: Settings): string | null {
  return settings.model || settings.env?.ANTHROPIC_MODEL || null;
}

function inferLiteralApiKey(apiKeyHelper?: string): string | null {
  if (!apiKeyHelper) {
    return null;
  }

  const match = apiKeyHelper.match(/^node -e "process\.stdout\.write\('((?:\\'|\\\\|\\r|\\n|\\t|[^'])*)'\)"$/);
  if (!match) {
    return null;
  }

  return match[1]
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\")
    .replace(/\\'/g, "'");
}

async function chooseModelForProfile(
  profile: string,
  claudeDir: string | undefined,
  fetchModels: () => Promise<ModelEntry[]>,
  search: SearchFn,
  logger: Logger
): Promise<string | null> {
  const settings = readProfile(profile, claudeDir);
  const providerKind = detectProviderKind(settings?.env?.ANTHROPIC_BASE_URL);

  if (providerKind !== "openrouter") {
    logger.error(`Interactive model selection is not supported yet for profile: ${profile}`);
    return null;
  }

  const models = await fetchModels();
  const modelIds = models.map((entry) => String(entry.id || "")).filter(Boolean);

  if (!modelIds.length) {
    logger.error(`No models found for profile: ${profile}`);
    return null;
  }

  return search("Choose a model", modelIds);
}

function currentPayload(activeProfile: string, settings: Settings): {
  activeProfile: string;
  model: string | null;
  baseUrl: string | null;
} {
  return {
    activeProfile,
    model: readModel(settings),
    baseUrl: settings.env?.ANTHROPIC_BASE_URL || null,
  };
}

function profilePayload(profile: string, settings: Settings): {
  profile: string;
  model: string | null;
  baseUrl: string | null;
} {
  return {
    profile,
    model: readModel(settings),
    baseUrl: settings.env?.ANTHROPIC_BASE_URL || null,
  };
}

export function shouldUseRichPrompts(capabilities: PromptCapabilities = {}): boolean {
  const term = capabilities.term ?? process.env.TERM ?? null;
  const stdinTTY = capabilities.stdinTTY ?? Boolean(process.stdin.isTTY);
  const stdoutTTY = capabilities.stdoutTTY ?? Boolean(process.stdout.isTTY);

  if (!stdinTTY || !stdoutTTY) {
    return false;
  }

  if (!term || term === "dumb") {
    return false;
  }

  return true;
}
