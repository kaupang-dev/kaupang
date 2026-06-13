import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { defineCommand } from "citty";
import { consola } from "consola";
import { backendNames, getBackend } from "../backends/index.js";
import { loadConfig } from "../config/loader.js";
import type { BackendName } from "../config/types.js";
import { makeContext } from "../context.js";
import { resolvePlan } from "../graph/resolver.js";
import { run } from "../util/exec.js";
import { applyVerbose, verboseArg } from "./shared.js";

export const buildCommand = defineCommand({
  meta: {
    name: "build",
    description: "Build images for services that declare a build context.",
  },
  args: {
    environment: {
      type: "positional",
      description: "Environment whose services to build.",
      required: true,
    },
    backend: { type: "string", alias: "b", description: backendNames.join(" | ") },
    push: { type: "boolean", description: "Push built images to the registry after building." },
    "dry-run": { type: "boolean", description: "Print build commands without running them." },
    ...verboseArg,
    cwd: { type: "string", description: "Directory to resolve the config from." },
  },
  async run({ args }) {
    applyVerbose(args);
    const loaded = await loadConfig(args.cwd);
    const backendName = (args.backend ??
      loaded.config.defaultBackend ??
      "compose") as BackendName;

    if (backendName === "kubernetes") {
      consola.warn(
        "The kubernetes backend does not build images — build + push with your CI, then deploy by image.",
      );
      return;
    }

    const plan = resolvePlan(args.environment, loaded.environments, backendName);
    const ctx = makeContext(loaded);
    const backend = getBackend(backendName);

    // Only the target environment is built (not its dependencies).
    const env = plan.environments.find((e) => e.name === plan.target)!;
    const hasBuild = Object.values(env.services).some((s) => s.build);
    if (!hasBuild) {
      consola.info(`No services in "${env.name}" declare a build context — nothing to build.`);
      return;
    }

    const m = backend.materialize(env, ctx);
    if (!args["dry-run"]) {
      for (const f of m.files) {
        mkdirSync(dirname(f.path), { recursive: true });
        writeFileSync(f.path, f.content);
      }
    }
    consola.start(`⚒️  forging ${env.name}`);
    for (const action of m.build) {
      await run(action.file, action.args, { cwd: ctx.rootDir, dryRun: args["dry-run"] });
    }

    if (args.push) {
      const pushActions = m.push ?? [];
      if (pushActions.length === 0) {
        consola.warn(`The ${backendName} backend can't push — build + push with your CI instead.`);
      } else {
        consola.start(`⛵ shipping ${env.name}`);
        for (const action of pushActions) {
          await run(action.file, action.args, { cwd: ctx.rootDir, dryRun: args["dry-run"] });
        }
      }
    }
    consola.success(`⚒️  Forged "${env.name}"${args.push ? " and shipped" : ""}.`);
  },
});
