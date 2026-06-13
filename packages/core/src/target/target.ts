import { resolve } from "node:path";
import type { BackendAction } from "../backends/types.js";
import type { BackendName, KaupangConfig, EnvMap, PullPolicy } from "../config/types.js";

/** Everything deploying to a target implies: defaults, env overrides, and execution context. */
export interface TargetRuntime {
  name: string;
  backend?: BackendName;
  pull?: PullPolicy;
  /** Target env overrides (merged over globalEnv + env, under service env). */
  env: EnvMap;
  /** Prepended to `docker …` invocations (e.g. ["--context", "prod"]). */
  dockerContextArgs: string[];
  /** Prepended to `kubectl …` invocations. */
  kubectlContextArgs: string[];
  /** Extra env injected into spawned processes (DOCKER_HOST / KUBECONFIG). */
  processEnv: Record<string, string>;
}

function emptyRuntime(name: string): TargetRuntime {
  return {
    name,
    env: {},
    dockerContextArgs: [],
    kubectlContextArgs: [],
    processEnv: {},
  };
}

export function resolveTarget(
  config: KaupangConfig,
  name: string,
  rootDir: string,
): TargetRuntime {
  const cfg = config.targets?.[name];
  if (!cfg) {
    // "local" is always valid even without explicit config.
    if (name === "local") return emptyRuntime("local");
    const available = Object.keys(config.targets ?? {}).sort().join(", ") || "(none)";
    throw new Error(`Unknown target "${name}". Configured targets: ${available}.`);
  }

  const processEnv: Record<string, string> = {};
  if (cfg.dockerHost) processEnv.DOCKER_HOST = cfg.dockerHost;
  if (cfg.kubeconfig) processEnv.KUBECONFIG = resolve(rootDir, cfg.kubeconfig);

  return {
    name,
    backend: cfg.backend,
    pull: cfg.pull,
    env: cfg.env ?? {},
    dockerContextArgs: cfg.dockerContext ? ["--context", cfg.dockerContext] : [],
    kubectlContextArgs: cfg.kubeContext ? ["--context", cfg.kubeContext] : [],
    processEnv,
  };
}

export interface AppliedAction {
  file: string;
  args: string[];
  input?: string;
  env?: Record<string, string>;
}

/** Apply a target's context flags + process env to a backend action. */
export function applyTarget(
  action: BackendAction,
  rt: TargetRuntime,
): AppliedAction {
  let args = action.args;
  if (action.file === "docker" && rt.dockerContextArgs.length) {
    args = [...rt.dockerContextArgs, ...args];
  } else if (action.file === "kubectl" && rt.kubectlContextArgs.length) {
    args = [...rt.kubectlContextArgs, ...args];
  }
  return {
    file: action.file,
    args,
    input: action.input,
    env: Object.keys(rt.processEnv).length ? rt.processEnv : undefined,
  };
}
