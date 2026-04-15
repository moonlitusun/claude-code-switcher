# cc-switcher Design

## Goal

Build a Node.js CLI that manages Claude Code provider profiles stored as `~/.claude/settings.<name>.json`, switches the active profile by updating `~/.claude/settings.json`, lists available models for supported providers, and updates the active/default model for a profile.

## Scope

Version 1 focuses on:

- Listing saved Claude profiles
- Showing the current active profile and model
- Switching between profiles
- Listing models for OpenRouter-backed profiles, optionally filtered by vendor
- Updating the selected model for a profile and the active Claude settings

Version 1 does not attempt to:

- Discover models from arbitrary local gateways
- Manage secrets beyond preserving existing `apiKeyHelper`
- Patch shell startup files

## Architecture

The CLI is organized around three layers:

1. `src/claude-config.js`
   Reads and writes Claude settings files from `~/.claude`, detects profiles, and applies profile/model updates.
2. `src/providers/openrouter.js`
   Fetches the OpenRouter model catalog and filters it by vendor prefix.
3. `src/cli.js`
   Defines user commands and formats output for terminal use.

The `switch` command merges the selected profile into `~/.claude/settings.json`, preserving unrelated user settings while replacing provider/model-specific fields. The `use` command updates a profile’s model fields and also updates the active `settings.json` when that profile is active.

## Commands

- `cc-switcher profiles`
  List saved Claude provider profiles.
- `cc-switcher current`
  Show the active profile, active model, and active base URL.
- `cc-switcher switch <profile>`
  Activate a saved profile.
- `cc-switcher models [profile] [vendor]`
  List models for a supported profile. For OpenRouter profiles, optionally filter by vendor such as `anthropic` or `openai`.
- `cc-switcher use <model> [--profile <name>]`
  Set the model fields for a profile. If the profile is active, update `~/.claude/settings.json` too.

## Data Rules

- Profiles live at `~/.claude/settings.<name>.json`
- Active settings live at `~/.claude/settings.json`
- Model updates should keep these fields in sync when present:
  - `model`
  - `env.ANTHROPIC_MODEL`
  - `env.ANTHROPIC_DEFAULT_OPUS_MODEL`
  - `env.ANTHROPIC_DEFAULT_SONNET_MODEL`
  - `env.ANTHROPIC_DEFAULT_HAIKU_MODEL`

## Error Handling

- Missing Claude config directory returns a helpful setup error.
- Missing profile returns a not-found error with available profile names.
- Unsupported provider for model discovery returns a clear “not yet supported” message.
- OpenRouter network or API failures surface concise error messages and non-zero exit codes.

## Testing

Tests should cover:

- Profile discovery from a temp Claude directory
- Active profile detection
- Switching profiles merges provider-specific fields correctly
- Model updates rewrite the expected model fields
- OpenRouter filtering logic

