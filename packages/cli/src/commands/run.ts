import { defineCommand } from "citty";
import { loadConfig } from "@kaupang/core/internal";
import { runPipeline } from "@kaupang/core/internal";
import { applyVerbose, verboseArg } from "./shared.js";

export const runCommand = defineCommand({
  meta: {
    name: "run",
    description: "Run a named pipeline (ordered run / up / down / build / wait steps).",
  },
  args: {
    pipeline: { type: "positional", description: "Pipeline name.", required: true },
    target: { type: "string", description: 'Default target for up/down/build steps (default "local").' },
    "dry-run": { type: "boolean", description: "Print the step graph without running anything." },
    ...verboseArg,
    cwd: { type: "string", description: "Directory to resolve the config from." },
  },
  async run({ args }) {
    applyVerbose(args);
    const loaded = await loadConfig(args.cwd);
    await runPipeline(loaded, args.pipeline, {
      target: args.target,
      dryRun: Boolean(args["dry-run"]),
    });
  },
});
