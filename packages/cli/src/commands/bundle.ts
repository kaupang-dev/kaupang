import { basename, join, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { defineCommand } from "citty";
import { consola } from "consola";
import { getBackend } from "@kaupang/core/internal";
import { loadConfig } from "@kaupang/core/internal";
import type { BackendName, EnvironmentPlan, ServiceDefinition } from "@kaupang/core/internal";
import { makeContext } from "@kaupang/core/internal";
import { resolveMultiPlan } from "@kaupang/core/internal";
import { resolveEnvironmentImages, type ResolvedImage } from "@kaupang/core/internal";
import { applyPins, resolveSolution } from "@kaupang/core/internal";
import {
  pushBundle,
  rewriteActionPath,
  writeBundle,
  type BundleEnvironment,
  type BundleManifest,
} from "@kaupang/core/internal";
import { resolveTarget } from "@kaupang/core/internal";
import { stackName } from "@kaupang/core/internal";
import { mergeEnv } from "@kaupang/core/internal";
import { hasBinary, run } from "@kaupang/core/internal";

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
    const saveRefs = new Set<string>();

    // --with-images packs the images for an airgapped target. That only works if docker
    // is here to `docker save` them; if it isn't, fall back to a build-on-target bundle.
    const withImages = Boolean(args["with-images"]) && (await hasBinary("docker"));
    if (args["with-images"] && !withImages) {
      consola.warn("docker not found — bundling without images (the target must build/pull).");
    }

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

      // Airgap bundle: deploy from the saved images instead of rebuilding on the target,
      // so record every image to save and drop the build contexts from the artifact.
      let artifactEnv = deployEnv;
      if (withImages) {
        for (const svc of Object.values(deployEnv.services)) {
          if (svc.image) saveRefs.add(svc.image);
        }
        artifactEnv = stripBuild(deployEnv);
      }

      const m = backend.materialize(artifactEnv, ctx);
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

    if (withImages) {
      mkdirSync(join(outDir, "images"), { recursive: true });
      for (const ref of saveRefs) {
        const tar = join("images", `${ref.replace(/[^a-zA-Z0-9]+/g, "_")}.tar`);
        consola.start(`📦 stowing image ${ref}`);
        try {
          await run("docker", ["save", "-o", join(outDir, tar), ref], { cwd: loaded.rootDir });
        } catch {
          throw new Error(
            `Could not "docker save ${ref}" — the image isn't present locally. Build or pull it ` +
              `first (e.g. \`kaupang build <env>\`), then re-run bundle.`,
          );
        }
        tars.push(tar);
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

/** Drop build contexts so an airgapped target deploys from the loaded image, not a rebuild. */
function stripBuild(env: EnvironmentPlan): EnvironmentPlan {
  const services: Record<string, ServiceDefinition> = {};
  for (const [key, def] of Object.entries(env.services)) {
    const copy = { ...def };
    delete copy.build;
    services[key] = copy;
  }
  return { ...env, services };
}
