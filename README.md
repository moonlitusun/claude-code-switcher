# cc-switcher

`cc-switcher` is a Node.js CLI for managing Claude Code provider profiles and default models.

It keeps the profile-based workflow that tools like `claude-code-switch` made convenient, and adds model discovery plus model switching for OpenRouter-backed profiles.

## Why

Claude Code gives you a model picker inside a session, but many provider setups still live in `~/.claude/settings.json` and `~/.claude/settings.<profile>.json`.

This tool is for people who want to:

- switch Claude Code provider profiles quickly
- see which models are available for a provider-backed profile
- update the default model for a profile without editing JSON by hand

## Features

- list Claude profiles from `~/.claude`
- show the active profile, model, and base URL
- switch profiles by updating `~/.claude/settings.json`
- interactively pick a profile and model
- filter interactive model selection by vendor
- list OpenRouter models, optionally filtered by vendor
- support JSON output for script-friendly queries
- update the default model fields for a profile and the active settings
- create new profiles without hand-editing JSON
- delete saved profiles
- edit saved profiles without opening JSON

## Install

### Local development

```bash
npm install
npm link
```

After linking, the CLI is available as:

```bash
cc-switcher
// Or
ccs
```

## Usage

### List saved profiles

```bash
ccs profiles
ccs profiles --json
```

### Show the active profile

```bash
ccs current
ccs current --json
```

### Switch profile

```bash
ccs switch openrouter
ccs switch local-gateway
ccs switch openrouter --json
```

### Interactively pick a profile and model

```bash
ccs pick
```

For OpenRouter-backed profiles, `pick` switches the profile first and then lets you choose a model from the OpenRouter catalog.
The picker uses a real terminal selection UI instead of raw numeric input.
If you do not pass `--vendor`, the CLI first asks you to choose a vendor and then shows the matching models.

To narrow the model list during interactive selection:

```bash
ccs pick --vendor anthropic
ccs pick --vendor openai
```

### List models for the active profile

```bash
ccs models
ccs models --json
```

### List models for a specific profile and vendor

```bash
ccs models openrouter anthropic
ccs models openrouter openai
ccs models openrouter anthropic --json
```

### Update the active profile model

```bash
ccs use anthropic/claude-sonnet-4.6
ccs use anthropic/claude-sonnet-4.6 --json
```

### Update a specific profile model

```bash
ccs use openai/gpt-5-codex --profile openrouter
```

### Create a profile from flags

```bash
ccs create openrouter \
  --base-url https://openrouter.ai/api \
  --api-key-env OPENROUTER_API_KEY \
  --model anthropic/claude-sonnet-4.6 \
  --json
```

### Create a profile interactively

```bash
ccs create openrouter
```

If you omit flags, the CLI prompts for the missing values.

### Edit a saved profile

```bash
ccs edit openrouter --model openai/gpt-5-codex
ccs edit openrouter --model openai/gpt-5-codex --json
```

You can also run `ccs edit openrouter` with no flags and answer prompts for the current base URL, API key env var, and default model.

### Delete a saved profile

```bash
ccs delete openrouter
ccs delete openrouter --json
```

For safety, the CLI refuses to delete the currently active profile.

## How it works

Profiles are discovered from:

- `~/.claude/settings.<name>.json`

The active Claude Code config is:

- `~/.claude/settings.json`

When you run `ccs switch <profile>`, the tool merges the selected profile into `settings.json` while preserving unrelated user settings such as enabled plugins.

When you run `ccs use <model>`, the tool updates:

- `model`
- `env.ANTHROPIC_MODEL`
- `env.ANTHROPIC_DEFAULT_OPUS_MODEL`
- `env.ANTHROPIC_DEFAULT_SONNET_MODEL`
- `env.ANTHROPIC_DEFAULT_HAIKU_MODEL`
- `env.ANTHROPIC_SMALL_FAST_MODEL`

If the target profile is active, `settings.json` is updated too.

## Provider support

### OpenRouter

`cc-switcher` currently supports model discovery for OpenRouter-backed profiles by calling:

- `https://openrouter.ai/api/v1/models`

Profiles are treated as OpenRouter profiles when `ANTHROPIC_BASE_URL` contains `openrouter.ai`.

### Other providers

Other profiles can still be switched and updated manually with `ccs use <model>`, but remote model discovery is not implemented yet.

## Respectful attribution

This project was inspired by [foreveryh/claude-code-switch](https://github.com/foreveryh/claude-code-switch), which showed a clean, profile-oriented workflow for Claude Code switching.

`cc-switcher` does not copy that project’s shell implementation. Instead, it reimplements the idea as a Node.js CLI and extends it with model discovery and model switching, especially for OpenRouter-backed setups.

If you primarily want a lightweight shell-based switcher, you should also take a look at the original project.

## Development

Run tests:

```bash
npm test
```

Show CLI help:

```bash
node bin/cc-switcher.js --help
```

The help output includes examples and notes for the most common profile and model workflows.

## JSON output

These commands support `--json`:

- `ccs profiles --json`
- `ccs current --json`
- `ccs models [profile] [vendor] --json`
- `ccs switch <profile> --json`
- `ccs use <model> [--profile <name>] --json`
- `ccs create <profile> --json`
- `ccs edit <profile> --json`
- `ccs delete <profile> --json`

This makes it easier to script around the CLI from shell pipelines or automation.

## Roadmap

- add provider adapters for more hosted backends
- improve interactive prompts and multi-step flows
- add json output to mutation commands where useful
