import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { defineCommand } from "citty";
import { consola } from "consola";
import { backendNames, getBackend } from "../backends/index.js";
import { loadConfig } from "../config/loader.js";
import type { BackendName } from "../config/types.js";
import { makeContext } from "../context.js";
import { resolvePlan } from "../graph/resolver.js";
import { latestSuccessful } from "../ledger/ledger.js";
import { applyTarget, resolveTarget } from "../target/target.js";
import { run } from "../util/exec.js";
import { runHooks } from "../util/hooks.js";
import { applyVerbose, verboseArg } from "./shared.js";

export const downCommand = defineCommand({
  meta: {
    name: "down",
    description: "Tear down an environment (optionally its dependencies too).",
  },
  args: {
    environment: {
      type: "positional",
      description: "Environment to tear down.",
      required: true,
    },
    backend: {
      type: "string",
      alias: "b",
      description: `Backend: ${backendNames.join(" | ")}. Defaults to the cached run's backend.`,
    },
    "with-deps": {
      type: "boolean",
      description: "Also tear down dependencies (reverse start order). Off by default.",
    },
    target: { type: "string", description: 'Deployment target (default "local").' },
    "dry-run": {
      type: "boolean",
      description: "Print the teardown commands without running them.",
    },
    ...verboseArg,
    cwd: { type: "string", description: "Directory to resolve the config from." },
  },
  async run({ args }) {
    applyVerbose(args);
    const loaded = await loadConfig(args.cwd);
    const target = args.target ?? process.env.KAUPANG_TARGET ?? "local";
    const rt = resolveTarget(loaded.config, target, loaded.rootDir);
    const cached = latestSuccessful(loaded.cacheDir, args.environment, target);
    const backendName = (args.backend ??
      cached?.backend ??
      rt.backend ??
      loaded.config.defaultBackend ??
      "compose") as BackendName;

    const plan = resolvePlan(args.environment, loaded.environments, backendName);
    const ctx = makeContext(loaded, { targetEnv: rt.env });
    const backend = getBackend(backendName);

    // Default: only the target. With deps: reverse of the start order.
    const targets = args["with-deps"]
      ? [...plan.environments].reverse()
      : plan.environments.filter((e) => e.name === plan.target);

    consola.info(
      `🔥 Striking camp: ${targets.map((e) => e.name).join(", ")} via ${backendName}` +
        (args["dry-run"] ? " (dry-run)" : ""),
    );

    for (const env of targets) {
      const m = backend.materialize(env, ctx);
      consola.start(`🔥 striking ${env.name}`);

      await runHooks(env.hooks?.beforeDown, {
        rootDir: ctx.rootDir,
        dryRun: args["dry-run"],
      });

      // compose down needs the generated file present.
      if (!args["dry-run"]) {
        for (const f of m.files) {
          mkdirSync(dirname(f.path), { recursive: true });
          writeFileSync(f.path, f.content);
        }
      }
      for (const action of m.down) {
        const a = applyTarget(action, rt);
        await run(a.file, a.args, {
          cwd: ctx.rootDir,
          dryRun: args["dry-run"],
          input: a.input,
          env: a.env,
        });
      }

      await runHooks(env.hooks?.afterDown, {
        rootDir: ctx.rootDir,
        dryRun: args["dry-run"],
      });
      consola.success(env.name);
    }
  },
});
