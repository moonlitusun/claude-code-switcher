import type { ModelEntry } from "../types";

export function detectProviderKind(baseUrl?: string | null): string {
  if (!baseUrl) return "anthropic";
  if (baseUrl.includes("openrouter.ai")) return "openrouter";
  return "custom";
}

export function filterModelsByVendor(models: ModelEntry[], vendor?: string | null): string[] {
  const prefix = vendor ? `${vendor}/` : "";
  return models
    .map((entry) => entry.id)
    .filter((id) => (vendor ? id.startsWith(prefix) : true))
    .sort();
}

export async function fetchOpenRouterModels(): Promise<ModelEntry[]> {
  const response = await fetch("https://openrouter.ai/api/v1/models");

  if (!response.ok) {
    throw new Error(`OpenRouter API returned status ${response.status}`);
  }

  const parsed = (await response.json()) as { data?: ModelEntry[] };
  return parsed.data || [];
}
