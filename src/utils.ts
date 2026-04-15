import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function getClaudeDir(customDir?: string): string {
  return customDir || path.join(os.homedir(), ".claude");
}

export function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

export function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

export function stableStringify(value: unknown): string {
  function sortDeep(input: unknown): unknown {
    if (Array.isArray(input)) {
      return input.map(sortDeep);
    }

    if (input && typeof input === "object") {
      return Object.keys(input as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = sortDeep((input as Record<string, unknown>)[key]);
          return acc;
        }, {});
    }

    return input;
  }

  return JSON.stringify(sortDeep(value));
}
