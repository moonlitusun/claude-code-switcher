export interface Settings {
  apiKeyHelper?: string;
  env?: Record<string, string>;
  enabledPlugins?: Record<string, boolean>;
  model?: string;
  [key: string]: unknown;
}

export interface ProfileOptions {
  profile: string;
  baseUrl?: string | null;
  apiKeyEnv?: string | null;
  apiKeyHelper?: string | null;
  model?: string | null;
  disableNonessentialTraffic?: boolean;
}

export interface Logger {
  log(message: string): void;
  error(message: string): void;
}

export interface ModelEntry {
  id: string;
}
