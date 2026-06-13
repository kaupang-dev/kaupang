import { execa } from "execa";
import { consola } from "consola";
import type { ServiceDefinition } from "../config/types.js";
import type { EnvironmentPlan } from "../graph/resolver.js";

/** A resolved image: what was authored vs. the immutable digest we deploy. */
export interface ResolvedImage {
  service: string;
  /** The reference as authored, e.g. "ghcr.io/acme/shop-api:latest". */
  ref: string;
  /** The resolved digest, e.g. "sha256:abc…". */
  digest: string;
  /** The digest-pinned reference we actually deploy, e.g. "ghcr.io/acme/shop-api@sha256:abc…". */
  pinned: string;
  /** True when the authored ref can point somewhere new on a later deploy. */
  floating: boolean;
}

/** Tags that obviously move. Used only to label a deployment as floating. */
const FLOATING_TAGS = new Set([
  "latest",
  "edge",
  "stable",
  "main",
  "master",
  "dev",
  "nightly",
]);

export function isPinned(ref: string): boolean {
  return ref.includes("@sha256:");
}

/** Strip any tag and digest, leaving the bare repository reference. */
function repository(ref: string): string {
  const base = ref.includes("@") ? ref.slice(0, ref.indexOf("@")) : ref;
  const slash = base.lastIndexOf("/");
  const colon = base.lastIndexOf(":");
  return colon > slash ? base.slice(0, colon) : base;
}

function tagOf(ref: string): string | undefined {
  const base = ref.includes("@") ? ref.slice(0, ref.indexOf("@")) : ref;
  const slash = base.lastIndexOf("/");
  const colon = base.lastIndexOf(":");
  return colon > slash ? base.slice(colon + 1) : undefined;
}

/**
 * Resolve an image reference to a content digest by querying the registry.
 * Uses `docker buildx imagetools inspect`, which returns the index/manifest
 * digest (correct for multi-arch images). Already-pinned refs short-circuit.
 */
export async function resolveDigest(ref: string): Promise<string> {
  if (isPinned(ref)) return ref.slice(ref.indexOf("@") + 1);
  try {
    const { stdout } = await execa("docker", [
      "buildx",
      "imagetools",
      "inspect",
      ref,
      "--format",
      "{{.Manifest.Digest}}",
    ]);
    const digest = stdout.trim();
    if (digest.startsWith("sha256:")) return digest;
    throw new Error(`unexpected output "${digest}"`);
  } catch (err) {
    throw new Error(
      `Could not resolve a digest for "${ref}". Ensure the image is pushed and you are ` +
        `authenticated, or pass --no-resolve to deploy the reference as-is. ` +
        `(${(err as Error).message})`,
    );
  }
}

export interface ResolveResult {
  /** A copy of the plan with each service image rewritten to its pinned digest. */
  env: EnvironmentPlan;
  images: ResolvedImage[];
}

/**
 * Resolve every registry-backed image in an environment to a pinned digest.
 * Services with a local `build` context (and imageless services) are skipped —
 * their images may not exist in any registry.
 */
export async function resolveEnvironmentImages(
  env: EnvironmentPlan,
): Promise<ResolveResult> {
  const services: Record<string, ServiceDefinition> = {};
  const images: ResolvedImage[] = [];

  for (const [key, def] of Object.entries(env.services)) {
    if (def.build || !def.image) {
      services[key] = def;
      continue;
    }
    const ref = def.image;
    const digest = await resolveDigest(ref);
    const pinned = `${repository(ref)}@${digest}`;
    const tag = tagOf(ref);
    const floating = !isPinned(ref) && (tag === undefined || FLOATING_TAGS.has(tag));

    images.push({ service: key, ref, digest, pinned, floating });
    services[key] = { ...def, image: pinned };
    consola.log(
      `  ${ref} → ${digest.slice(0, 19)}…${floating ? "  (floating)" : ""}`,
    );
  }

  return { env: { ...env, services }, images };
}
