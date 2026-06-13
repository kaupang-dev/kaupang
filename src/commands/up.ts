import { join, resolve as resolvePath } from "node:path";
import { defineCommand } from "citty";
import { consola } from "consola";
import { backendNames } from "../backends/index.js";
import { loadConfig, type LoadedConfig } from "../config/loader.js";
import type { BackendName, PullPolicy } from "../config/types.js";
import { makeContext } from "../context.js";
import { resolveMultiPlan, resolvePlan, type DeploymentPlan } from "../graph/resolver.js";
import { appendDeployment, newDeploymentId } from "../ledger/ledger.js";
import { renderPlan } from "../render/plan.js";
import { deployPlan } from "../run/deploy.js";
import { applyPins, resolveSolution } from "../solution/solution.js";
import { isOciRef, pullBundle, readBundle } from "../solution/bundle.js";
import { applyTarget, resolveTarget, type TargetRuntime } from "../target/target.js";
import { mergeEnv } from "../util/env.js";
import { run } from "../util/exec.js";
import { applyVerbose, verboseArg } from "./shared.js";

const PULL_POLICIES: PullPolicy[] = ["always", "missing", "never"];

export const upCommand = defineCommand({
  meta: {
    name: "up",
    description: "Deploy an environment, a solution, or a pre-built bundle to a target.",
  },
  args: {
    environment: { type: "positional", description: "Environment to bring up.", required: false },
    solution: { type: "string", description: "Deploy a solution (composed environments) instead." },
    bundle: { type: "string", description: "Deploy a pre-built bundle directory (offline)." },
    target: { type: "string", description: 'Deployment target (default "local").' },
    backend: { type: "string", alias: "b", description: `Backend: ${backendNames.join(" | ")}.` },
    pull: { type: "string", description: `Force pull policy: ${PULL_POLICIES.join(" | ")}.` },
    resolve: {
      type: "boolean",
      default: true,
      description: "Resolve image references to digests (pass --no-resolve to skip).",
    },
    "dry-run": { type: "boolean", description: "Print the plan and commands without running anything." },
    output: { type: "string", description: 'Output format: "text" (default) or "json".' },
    ...verboseArg,
    cwd: { type: "string", description: "Directory to resolve the config from." },
  },
  async run({ args }) {
    applyVerbose(args);
    const json = parseOutput(args.output);
    // In JSON mode, keep stdout clean — route all progress chatter away.
    if (json) consola.level = -999;
    const loaded = await loadConfig(args.cwd);

    // Mode 3: deploy a pre-built bundle (offline / airgap).
    if (args.bundle) {
      await deployBundle(loaded, args.bundle, {
        target: args.target,
        dryRun: Boolean(args["dry-run"]),
        json,
      });
      return;
    }

    // Modes 1 & 2: resolve a plan from an environment or a solution.
    const targetName = args.target ?? process.env.KAUPANG_TARGET ?? "local";
    const rt = resolveTarget(loaded.config, targetName, loaded.rootDir);

    let plan: DeploymentPlan;
    let targetEnv = rt.env;

    if (args.solution) {
      const sol = await resolveSolution(loaded.config, loaded.catalog, args.solution);
      const backendName = resolveBackend(args.backend, rt.backend, loaded.config.defaultBackend);
      plan = resolveMultiPlan(sol.environments, sol.name, loaded.environments, backendName);
      applyPins(plan, sol.pins);
      targetEnv = mergeEnv(rt.env, sol.env);
    } else if (args.environment) {
      const backendName = resolveBackend(args.backend, rt.backend, loaded.config.defaultBackend);
      plan = resolvePlan(args.environment, loaded.environments, backendName);
    } else {
      throw new Error("Specify an environment, --solution <name>, or --bundle <dir>.");
    }

    const backendName = plan.backend;
    const pull = resolvePull(args.pull) ?? rt.pull ?? loaded.config.defaultPull;
    const ctx = makeContext(loaded, { pull, targetEnv });

    if (args["dry-run"]) {
      if (json) {
        emitJson({
          dryRun: true,
          project: loaded.project,
          target: targetName,
          backend: backendName,
          willResolve: Boolean(args.resolve),
          environments: plan.environments.map((e) => ({
            name: e.name,
            services: Object.entries(e.services).map(([service, s]) => ({
              service,
              image: s.image ?? null,
            })),
          })),
        });
        return;
      }
      renderPlan(plan, ctx, rt);
      if (args.resolve) {
        consola.info("Images will be resolved to digests at deploy time (--no-resolve to skip).");
      }
      return;
    }

    const records = await deployPlan(loaded, plan, rt, {
      targetName,
      targetEnv,
      pull,
      resolve: Boolean(args.resolve),
    });

    if (json) {
      emitJson({
        project: loaded.project,
        target: targetName,
        backend: backendName,
        deployments: records.map((r) => ({
          environment: r.environment,
          deploymentId: r.id,
          ranAt: r.ranAt,
          images: r.images.map((i) => ({
            service: i.service,
            ref: i.ref,
            digest: i.digest ?? null,
            pinned: i.pinned,
          })),
        })),
      });
      return;
    }
    // The closing summary is printed by deployPlan (renderSummary).
  },
});

function parseOutput(value: string | undefined): boolean {
  if (value === undefined || value === "text") return false;
  if (value === "json") return true;
  throw new Error(`Unknown --output "${value}" (use "text" or "json").`);
}

function emitJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/** Deploy a pre-built bundle: load images (if present), replay pinned artifacts. */
async function deployBundle(
  loaded: LoadedConfig,
  bundleArg: string,
  opts: { target?: string; dryRun: boolean; json?: boolean },
): Promise<void> {
  let dir: string;
  if (isOciRef(bundleArg)) {
    consola.start(`⛵ ferrying cargo ← ${bundleArg}`);
    dir = await pullBundle(bundleArg, join(loaded.cacheDir, "pulled"));
    consola.success(`cargo ashore at ${dir}`);
  } else {
    dir = resolvePath(loaded.rootDir, bundleArg);
  }
  const manifest = readBundle(dir);
  const targetName = opts.target ?? manifest.target ?? "local";
  const rt: TargetRuntime = resolveTarget(loaded.config, targetName, loaded.rootDir);

  consola.info(
    `📦 Unpacking cargo "${manifest.solution}"${manifest.version ? `@${manifest.version}` : ""} ` +
      `→ ${targetName} (${manifest.environments.map((e) => e.name).join(" → ")})`,
  );

  if (manifest.images.included && manifest.images.tars.length) {
    for (const tar of manifest.images.tars) {
      await run("docker", ["load", "-i", join(dir, tar)], { cwd: dir, dryRun: opts.dryRun });
    }
  }

  const deployed: Array<{ environment: string; deploymentId: string; ranAt: string; images: typeof manifest.environments[number]["images"] }> = [];
  for (const env of manifest.environments) {
    consola.start(`🪓 raising ${env.name}`);
    const absArtifact = join(dir, env.artifact.relPath);
    for (const action of env.up) {
      // Rewrite the bundle-relative artifact path back to an absolute path.
      const abs = { ...action, args: action.args.map((x) => (x === env.artifact.relPath ? absArtifact : x)) };
      const a = applyTarget(abs, rt);
      await run(a.file, a.args, { cwd: dir, dryRun: opts.dryRun, input: a.input, env: a.env });
    }
    if (!opts.dryRun) {
      const id = newDeploymentId();
      const ranAt = new Date().toISOString();
      appendDeployment(loaded.cacheDir, {
        id,
        environment: env.name,
        target: targetName,
        backend: env.backend,
        project: manifest.project,
        ranAt,
        status: "succeeded",
        images: env.images,
        files: [{ path: absArtifact, content: env.artifact.content }],
        up: env.up,
        down: env.down,
      });
      deployed.push({ environment: env.name, deploymentId: id, ranAt, images: env.images });
    }
    consola.success(env.name);
  }

  if (opts.json) {
    emitJson({
      project: manifest.project,
      solution: manifest.solution,
      version: manifest.version ?? null,
      target: targetName,
      bundle: dir,
      deployments: deployed.map((d) => ({
        environment: d.environment,
        deploymentId: d.deploymentId,
        ranAt: d.ranAt,
        images: d.images.map((i) => ({
          service: i.service,
          ref: i.ref,
          digest: i.digest ?? null,
          pinned: i.pinned,
        })),
      })),
    });
    return;
  }

  consola.success(`🛖 Cargo "${manifest.solution}" landed on ${targetName}.`);
}

function resolveBackend(
  flag: string | undefined,
  fromTarget: BackendName | undefined,
  fallback: BackendName | undefined,
): BackendName {
  const name = (flag ?? fromTarget ?? fallback ?? "compose") as BackendName;
  if (!backendNames.includes(name)) {
    throw new Error(`Unknown backend "${name}". Use one of: ${backendNames.join(", ")}.`);
  }
  return name;
}

function resolvePull(flag: string | undefined): PullPolicy | undefined {
  if (!flag) return undefined;
  if (!PULL_POLICIES.includes(flag as PullPolicy)) {
    throw new Error(`Unknown pull policy "${flag}". Use one of: ${PULL_POLICIES.join(", ")}.`);
  }
  return flag as PullPolicy;
}
