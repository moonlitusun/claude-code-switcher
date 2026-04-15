type SearchChoice = {
  name: string;
  value: string;
};

export function createSearchSource(choices: string[]) {
  return async (term: string | undefined, _options: { signal: AbortSignal }): Promise<SearchChoice[]> => {
    const query = term?.trim().toLowerCase();
    const filtered = query ? choices.filter((choice) => choice.toLowerCase().includes(query)) : choices;

    return filtered.map((choice) => ({
      name: choice,
      value: choice,
    }));
  };
}

export function isPromptCancelledError(error: unknown): boolean {
  return error instanceof Error && (error.name === "ExitPromptError" || error.name === "AbortPromptError");
}
