# cc-switcher

`cc-switcher` is a Bun-first TypeScript CLI for managing Claude Code provider profiles and default models.

It is built for people who keep Claude Code configs in `~/.claude/settings.json` and `~/.claude/settings.<profile>.json`, and want a faster way to:

- switch between saved provider profiles
- see the active profile, model, and base URL
- discover available OpenRouter models
- update a profile's default model without editing JSON by hand

The CLI is available as both `cc-switcher` and `ccs`.

## Quick Start

If you only want the shortest path from install to use, follow this order:

1. Install the CLI
2. Check which profiles exist
3. Inspect the active profile
4. Switch to the profile you want
5. Update or pick a model

### Install

#### From npm

```bash
npm install -g @sunday-sky/cc-switcher
```

#### Local development

Requirements:

- Bun `>= 1.2.16`

```bash
bun install
bun link
```

## First Run

### 1. See your saved profiles

```bash
ccs profiles
ccs profiles --json
```

This lists profiles discovered from `~/.claude/settings.<name>.json`.
The active profile is marked with `*`.

### 2. Check what is active right now

```bash
ccs current
ccs current --json
```

This shows:

- the active profile name
- the current model
- the configured base URL

### 3. Switch to another profile

```bash
ccs switch openrouter
ccs switch local-gateway
ccs switch
```

If you omit the profile, `ccs switch` opens a searchable selector.
In non-standard terminals or wrapped shells, the selector falls back to a simpler prompt to avoid noisy redraw output.

### 4. Update the model for the active profile

```bash
ccs use anthropic/claude-sonnet-4.6
ccs use anthropic/claude-sonnet-4.6 --json
```

If you omit the model, `ccs use` opens an interactive vendor-and-model picker.
It uses a searchable terminal UI when available, and falls back to a simpler prompt in terminals that do not behave well with advanced redraw output.

### 5. Pick a profile and model in one flow

```bash
ccs pick
ccs pick --vendor anthropic
ccs pick --vendor openai
```

`pick` first switches the profile, then updates the model if the selected profile supports model discovery.
For OpenRouter-backed profiles, the CLI can first ask you to choose a vendor and then narrow the model list to that vendor.

## Common Workflows

### Check available OpenRouter models

```bash
ccs models
ccs models --json
```

To inspect a different profile:

```bash
ccs models openrouter
ccs models openrouter anthropic
ccs models openrouter openai
ccs models openrouter anthropic --json
```

Model discovery works when `ANTHROPIC_BASE_URL` contains `openrouter.ai`.

### Create a new profile

```bash
ccs create openrouter \
  --base-url https://openrouter.ai/api \
  --api-key-env OPENROUTER_API_KEY \
  --model anthropic/claude-sonnet-4.6
```

If you skip flags, `create` prompts for the missing values:

```bash
ccs create openrouter
```

### Edit an existing profile

```bash
ccs edit openrouter --model openai/gpt-5-codex
ccs edit openrouter --model openai/gpt-5-codex --json
```

If you run `ccs edit openrouter` without flags, the CLI prompts for the current base URL, API key env var, and default model.

### Delete a profile

```bash
ccs delete openrouter
ccs delete openrouter --json
```

For safety, the CLI refuses to delete the currently active profile.

## Command Reference

### `profiles`

List saved Claude profiles.

```bash
ccs profiles
ccs profiles --json
```

### `current`

Show the active profile, model, and base URL.

```bash
ccs current
ccs current --json
```

### `switch [profile]`

Switch to a saved Claude profile.

```bash
ccs switch
ccs switch openrouter
ccs switch openrouter --json
```

### `pick`

Interactively choose a profile and model.

```bash
ccs pick
ccs pick --vendor anthropic
```

### `models [profile] [vendor]`

List models for a provider-backed profile.

```bash
ccs models
ccs models openrouter
ccs models openrouter anthropic
ccs models openrouter anthropic --json
```

### `use [model]`

Set the default model for the active profile, or for a profile passed with `--profile`.

```bash
ccs use
ccs use anthropic/claude-sonnet-4.6
ccs use openai/gpt-5-codex --profile openrouter
ccs use openai/gpt-5-codex --profile openrouter --json
```

### `create <profile>`

Create a Claude profile.

```bash
ccs create openrouter
ccs create openrouter \
  --base-url https://openrouter.ai/api \
  --api-key-env OPENROUTER_API_KEY \
  --model anthropic/claude-sonnet-4.6 \
  --json
```

### `edit <profile>`

Edit a saved profile.

```bash
ccs edit openrouter
ccs edit openrouter --model anthropic/claude-sonnet-4.6
ccs edit openrouter --model anthropic/claude-sonnet-4.6 --json
```

### `delete <profile>`

Delete a saved profile.

```bash
ccs delete openrouter
ccs delete openrouter --json
```

## How It Works

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

## JSON Output

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

## Provider Support

### OpenRouter

`cc-switcher` currently supports model discovery for OpenRouter-backed profiles by calling:

- `https://openrouter.ai/api/v1/models`

Profiles are treated as OpenRouter profiles when `ANTHROPIC_BASE_URL` contains `openrouter.ai`.

### Other providers

Other profiles can still be switched and updated manually with `ccs use <model>`, but remote model discovery is not implemented yet.

## Respectful Attribution

This project was inspired by [foreveryh/claude-code-switch](https://github.com/foreveryh/claude-code-switch), which showed a clean, profile-oriented workflow for Claude Code switching.

`cc-switcher` does not copy that project’s shell implementation. Instead, it reimplements the idea as a Bun + TypeScript CLI and extends it with model discovery and model switching, especially for OpenRouter-backed setups.

If you primarily want a lightweight shell-based switcher, you should also take a look at the original project.

## Development

Run tests:

```bash
bun test
```

Run type-checking:

```bash
bun run typecheck
```

Build the publishable CLI:

```bash
bun run build
```

The build output is written to:

```bash
dist/bin/cc-switcher.js
```

Show CLI help during development:

```bash
bun run src/cli.ts --help
```

The help output includes examples and notes for the most common profile and model workflows.

## Publishing

Before publishing, the package runs:

```bash
bun run typecheck
bun test
bun run build
```

This happens automatically through `prepublishOnly`, so the published package uses the built file from `dist/`.
