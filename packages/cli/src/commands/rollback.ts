import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { defineCommand } from "citty";
import { consola } from "consola";
import { loadConfig } from "@kaupang/core/internal";
import {
  appendDeployment,
  history,
  newDeploymentId,
  rollbackTarget,
  type DeploymentRecord,
} from "@kaupang/core/internal";
import { applyTarget, resolveTarget } from "@kaupang/core/internal";
import { run } from "@kaupang/core/internal";
import { applyVerbose, verboseArg } from "./shared.js";

export const rollbackCommand = defineCommand({
  meta: {
    name: "rollback",
    description: "Re-apply a previously recorded deployment of an environment.",
  },
  args: {
    environment: {
      type: "positional",
      description: "Environment to roll back.",
      required: true,
    },
    to: {
      type: "string",
      description: "Deployment id to roll back to (see --list). Defaults to the previous one.",
    },
    target: { type: "string", description: 'Deployment target (default "local").' },
    list: { type: "boolean", description: "Show deployment history and exit." },
    "dry-run": {
      type: "boolean",
      description: "Print the commands that would replay, without running them.",
    },
    ...verboseArg,
    cwd: { type: "string", description: "Directory to resolve the config from." },
  },
  async run({ args }) {
    applyVerbose(args);
    const loaded = await loadConfig(args.cwd);
    const target = args.target ?? process.env.KAUPANG_TARGET ?? "local";
    const rt = resolveTarget(loaded.config, target, loaded.rootDir);
    const records = history(loaded.cacheDir, args.environment, target);

    if (records.length === 0) {
      consola.warn(`No deployment history for "${args.environment}@${target}".`);
      return;
    }

    if (args.list) {
      consola.log(`\nDeployments for ${args.environment}@${target} (newest first):\n`);
      for (const d of [...records].reverse()) {
        const imgs = d.images
          .map((i) => `${i.service}=${i.digest.slice(0, 19)}…`)
          .join("  ");
        const tag = d.rollbackOf ? ` (rollback of ${d.rollbackOf})` : "";
        consola.log(
          `  ${d.id}  ${pad(d.status, 9)} ${d.backend}  ${d.ranAt}${tag}\n` +
            (imgs ? `    ${imgs}\n` : ""),
        );
      }
      return;
    }

    const restore = rollbackTarget(loaded.cacheDir, args.environment, target, args.to);
    if (!restore) {
      consola.error(
        args.to
          ? `No successful deployment with id "${args.to}".`
          : "No previous successful deployment to roll back to (need at least two).",
      );
      return;
    }

    consola.info(
      `↩️  Sailing back "${args.environment}@${target}" to ${restore.id} (${restore.ranAt})`,
    );
    for (const i of restore.images) {
      consola.log(`  ${i.service} ← ${i.digest.slice(0, 19)}…`);
    }

    if (!args["dry-run"]) {
      for (const f of restore.files) {
        mkdirSync(dirname(f.path), { recursive: true });
        writeFileSync(f.path, f.content);
      }
    }
    for (const action of restore.up) {
      const a = applyTarget(action, rt);
      await run(a.file, a.args, {
        cwd: loaded.rootDir,
        dryRun: args["dry-run"],
        input: a.input,
        env: a.env,
      });
    }

    if (!args["dry-run"]) {
      const record: DeploymentRecord = {
        ...restore,
        id: newDeploymentId(),
        ranAt: new Date().toISOString(),
        status: "succeeded",
        rollbackOf: restore.id,
      };
      appendDeployment(loaded.cacheDir, record);
    }

    consola.success(`↩️  Sailed back "${args.environment}" to ${restore.id}.`);
  },
});

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}
