import { chmodSync, rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: ["./bin/cc-switcher.ts"],
  outdir: "./dist/bin",
  target: "node",
  format: "esm",
});

if (!result.success) {
  for (const failure of result.logs) {
    console.error(failure);
  }
  process.exit(1);
}

const outputPath = "./dist/bin/cc-switcher.js";

if (process.platform !== "win32") {
  chmodSync(outputPath, 0o755);
}
