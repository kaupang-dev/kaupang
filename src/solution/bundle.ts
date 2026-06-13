import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execa } from "execa";
import { create as tarCreate, extract as tarExtract } from "tar";
import type { BackendAction } from "../backends/types.js";
import type { BackendName } from "../config/types.js";
import type { ResolvedImage } from "../image/resolve.js";
import { orasRegistryArgs } from "../util/registry.js";

export const BUNDLE_MANIFEST = "manifest.json";
const BUNDLE_BLOB = "bundle.tar.gz";
const BUNDLE_ARTIFACT_TYPE = "application/vnd.kaupang.bundle.v1";
/** A bundle reference is `oci://<registry>/<repo>:<tag>`. */
const OCI_PREFIX = "oci://";

export function isOciRef(ref: string): boolean {
  return ref.startsWith(OCI_PREFIX);
}

export interface BundleEnvironment {
  name: string;
  backend: BackendName;
  images: ResolvedImage[];
  /** Generated artifact, stored inside the bundle (path is bundle-relative). */
  artifact: { relPath: string; content: string };
  /** Commands whose file argument references `artifact.relPath` (bundle-relative). */
  up: BackendAction[];
  down: BackendAction[];
}

export interface BundleManifest {
  kaupang: string;
  solution: string;
  version?: string;
  target: string;
  project: string;
  createdAt: string;
  /** Whether image tarballs are included (airgap export). */
  images: { included: boolean; tars: string[] };
  environments: BundleEnvironment[];
}

/**
 * Rewrite a backend action's file argument from an absolute path to a
 * bundle-relative one (used at bundle time), or back (at deploy time).
 */
export function rewriteActionPath(
  action: BackendAction,
  from: string,
  to: string,
): BackendAction {
  return { ...action, args: action.args.map((a) => (a === from ? to : a)) };
}

export function writeBundle(dir: string, manifest: BundleManifest): void {
  mkdirSync(dir, { recursive: true });
  for (const env of manifest.environments) {
    const abs = join(dir, env.artifact.relPath);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, env.artifact.content);
  }
  writeFileSync(
    join(dir, BUNDLE_MANIFEST),
    JSON.stringify(manifest, null, 2) + "\n",
  );
}

export function readBundle(dir: string): BundleManifest {
  const path = join(dir, BUNDLE_MANIFEST);
  if (!existsSync(path)) {
    throw new Error(`Not a kaupang bundle (no ${BUNDLE_MANIFEST}): ${dir}`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as BundleManifest;
}

/** Package a bundle directory and push it as a single OCI artifact via oras. */
export async function pushBundle(dir: string, ociRef: string): Promise<void> {
  const ref = ociRef.replace(OCI_PREFIX, "");
  const tmp = mkdtempSync(join(tmpdir(), "kaupang-push-"));
  try {
    await tarCreate({ file: join(tmp, BUNDLE_BLOB), cwd: dir, gzip: true }, ["."]);
    await oras(
      ["push", ...orasRegistryArgs(ref), ref, "--artifact-type", BUNDLE_ARTIFACT_TYPE, BUNDLE_BLOB],
      tmp,
      `push ${ref}`,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** Pull an OCI bundle artifact and extract it; returns the local bundle dir. */
export async function pullBundle(ociRef: string, intoParent: string): Promise<string> {
  const ref = ociRef.replace(OCI_PREFIX, "");
  const tmp = mkdtempSync(join(tmpdir(), "kaupang-pull-"));
  try {
    await oras(["pull", ...orasRegistryArgs(ref), ref, "-o", tmp], process.cwd(), `pull ${ref}`);
    const blob = join(tmp, BUNDLE_BLOB);
    if (!existsSync(blob)) {
      throw new Error(`OCI artifact ${ref} is not a kaupang bundle (no ${BUNDLE_BLOB}).`);
    }
    mkdirSync(intoParent, { recursive: true });
    const dest = mkdtempSync(join(intoParent, "bundle-"));
    await tarExtract({ file: blob, cwd: dest });
    return dest;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function oras(args: string[], cwd: string, what: string): Promise<void> {
  try {
    await execa("oras", args, { cwd, stdio: "inherit" });
  } catch (err) {
    const e = err as { code?: string; message?: string };
    if (e.code === "ENOENT") {
      throw new Error(
        `Pushing/pulling OCI bundles needs the \`oras\` CLI on PATH (https://oras.land).`,
      );
    }
    throw new Error(`oras ${what} failed: ${e.message ?? String(err)}`);
  }
}
