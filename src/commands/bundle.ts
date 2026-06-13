import { basename, join, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { defineCommand } from "citty";
import { consola } from "consola";
import { getBackend } from "../backends/index.js";
import { loadConfig } from "../config/loader.js";
import type { BackendName } from "../config/types.js";
import { makeContext } from "../context.js";
import { resolveMultiPlan } from "../graph/resolver.js";
import { resolveEnvironmentImages, type ResolvedImage } from "../image/resolve.js";
import { applyPins, resolveSolution } from "../solution/solution.js";
import {
  pushBundle,
  rewriteActionPath,
  writeBundle,
  type BundleEnvironment,
  type BundleManifest,
} from "../solution/bundle.js";
import { resolveTarget } from "../target/target.js";
import { stackName } from "../util/names.js";
import { mergeEnv } from "../util/env.js";
import { hasBinary, run } from "../util/exec.js";

export const bundleCommand = defineCommand({
  meta: {
    name: "bundle",
    description: "Materialize a solution into a portable, pinned bundle.",
  },
  args: {
    solution: { type: "positional", description: "Solution name.", required: true },
    target: { type: "string", description: 'Target the bundle is built for (default "local").' },
    output: { type: "string", alias: "o", description: "Output directory for the bundle." },
    "with-images": {
      type: "boolean",
      description: "docker save each pinned image into the bundle (for airgapped transfer).",
    },
    push: {
      type: "string",
      description: "Also push the bundle to an OCI registry, e.g. oci://acmeregistry.azurecr.io/bundles/x:1.",
    },
    resolve: {
      type: "boolean",
      default: true,
      description: "Resolve images to digests (--no-resolve to keep tags as-is).",
    },
    cwd: { type: "string", description: "Directory to resolve the config from." },
  },
  async run({ args }) {
    const loaded = await loadConfig(args.cwd);
    const sol = await resolveSolution(loaded.config, loaded.catalog, args.solution);
    const targetName = args.target ?? sol.target ?? "local";
    const rt = resolveTarget(loaded.config, targetName, loaded.rootDir);
    const backendName = (rt.backend ?? loaded.config.defaultBackend ?? "compose") as BackendName;

    const plan = resolveMultiPlan(sol.environments, sol.name, loaded.environments, backendName);
    applyPins(plan, sol.pins);

    const ctx = makeContext(loaded, { targetEnv: mergeEnv(rt.env, sol.env) });
    const backend = getBackend(backendName);

    const outDir = resolve(loaded.rootDir, args.output ?? `${sol.name}-bundle`);
    const tars: string[] = [];
    const environments: BundleEnvironment[] = [];

    consola.info(
      `📦 Packing cargo "${sol.name}"${sol.version ? `@${sol.version}` : ""} for ${targetName} (${backendName})`,
    );

    for (const env of plan.environments) {
      let deployEnv = env;
      let images: ResolvedImage[] = [];
      if (args.resolve) {
        const r = await resolveEnvironmentImages(env);
        deployEnv = r.env;
        images = r.images;
      }
      const m = backend.materialize(deployEnv, ctx);
      const file = m.files[0]!; // every backend emits one artifact per environment
      const relPath = join("artifacts", stackName(loaded.project, env.name), basename(file.path));

      environments.push({
        name: env.name,
        backend: backendName,
        images,
        artifact: { relPath, content: file.content },
        up: m.up.map((a) => rewriteActionPath(a, file.path, relPath)),
        down: m.down.map((a) => rewriteActionPath(a, file.path, relPath)),
      });
    }

    if (args["with-images"]) {
      if (!(await hasBinary("docker"))) {
        consola.warn("docker not found — skipping image export (bundle has no tars).");
      } else {
        mkdirSync(join(outDir, "images"), { recursive: true });
        const unique = [...new Set(environments.flatMap((e) => e.images.map((i) => i.pinned)))];
        for (const ref of unique) {
          const tar = join("images", `${ref.replace(/[^a-zA-Z0-9]+/g, "_")}.tar`);
          consola.start(`📦 stowing image ${ref}`);
          await run("docker", ["save", "-o", join(outDir, tar), ref], { cwd: loaded.rootDir });
          tars.push(tar);
        }
      }
    }

    const manifest: BundleManifest = {
      kaupang: "0.1.0",
      solution: sol.name,
      version: sol.version,
      target: targetName,
      project: loaded.project,
      createdAt: new Date().toISOString(),
      images: { included: tars.length > 0, tars },
      environments,
    };

    writeBundle(outDir, manifest);
    consola.success(
      `📦 Cargo packed at ${outDir} (${environments.length} environment(s)` +
        `${manifest.images.included ? `, ${tars.length} image tar(s)` : ", no images"}).`,
    );

    if (args.push) {
      consola.start(`⛵ ferrying cargo → ${args.push}`);
      await pushBundle(outDir, args.push);
      consola.success(`cargo delivered to ${args.push}`);
    }
  },
});
