import type { BackendName, EnvMap, PullPolicy } from "../config/types.js";
import type { EnvironmentPlan } from "../graph/resolver.js";

export interface BackendContext {
  /** Directory containing kaupang.config.ts (also the cwd for spawned commands). */
  rootDir: string;
  /** Absolute path to the .kaupang cache directory. */
  cacheDir: string;
  /** Project namespace. */
  project: string;
  /** globalEnv merged with per-environment env (service env still wins on top). */
  baseEnv: EnvMap;
  /** Per-target env overrides (above environment env, below service env). */
  targetEnv: EnvMap;
  /** When set, force this pull behavior for the whole run (from --pull). */
  pull?: PullPolicy;
}

export interface BackendAction {
  /** Human-readable description shown in dry-run. */
  description: string;
  file: string;
  args: string[];
  /** Optional stdin payload. */
  input?: string;
}

export interface MaterializedEnvironment {
  /** Files to write before running actions (compose files, manifests, ...). */
  files: { path: string; content: string }[];
  /** Commands to bring the environment up. */
  up: BackendAction[];
  /** Commands to tear the environment down. */
  down: BackendAction[];
  /** Commands to build images for services that declare a build context. */
  build: BackendAction[];
  /** Commands to push built images to the registry (compose backend). */
  push?: BackendAction[];
}

/**
 * A backend is a pure translator: given a resolved environment it produces the
 * files + commands needed. It performs no side effects — the command layer
 * decides whether to write/execute (real run) or just print them (dry-run).
 */
export interface Backend {
  readonly name: BackendName;
  materialize(
    env: EnvironmentPlan,
    ctx: BackendContext,
  ): MaterializedEnvironment;
}
