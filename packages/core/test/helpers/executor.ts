import type { CatalogResolver } from "../../src/catalog/source.js";
import type { LoadedConfig, ResolvedEnvironment } from "../../src/config/loader.js";
import type { BackendName, KaupangConfig, ServiceDefinition } from "../../src/config/types.js";
import type { DeploymentPlan, EnvironmentPlan } from "../../src/graph/resolver.js";
import type { Executor, RunOptions } from "../../src/util/exec.js";

/** A single command the executor was asked to run, captured for assertions. */
export interface RecordedCall {
  kind: "run" | "shell";
  /** For "run", the binary; for "shell", the full command string. */
  file: string;
  args: string[];
  cwd: string;
  input?: string;
  env?: Record<string, string>;
  dryRun?: boolean;
}

export interface Recording {
  executor: Executor;
  calls: RecordedCall[];
  /** Only the `run(...)` calls, in order. */
  runs: () => RecordedCall[];
  /** Only the `runShell(...)` calls, in order. */
  shells: () => RecordedCall[];
}

/**
 * A fake {@link Executor} that records every command instead of running it.
 * Lets the deploy/pipeline layers be exercised offline — asserting which
 * commands run, in what order, with which target context — without Docker.
 */
export function recordingExecutor(
  opts: { missingBinaries?: string[]; failOn?: (call: RecordedCall) => boolean } = {},
): Recording {
  const calls: RecordedCall[] = [];
  const record = (call: RecordedCall): void => {
    calls.push(call);
  };

  const executor: Executor = {
    async run(file: string, args: string[], o: RunOptions) {
      const call: RecordedCall = {
        kind: "run",
        file,
        args,
        cwd: o.cwd,
        input: o.input,
        env: o.env,
        dryRun: o.dryRun,
      };
      record(call);
      if (opts.failOn?.(call)) {
        throw new Error(`forced failure: ${file} ${args.join(" ")}`);
      }
    },
    async runShell(command: string, o: RunOptions) {
      record({ kind: "shell", file: command, args: [], cwd: o.cwd, env: o.env, dryRun: o.dryRun });
    },
    async hasBinary(file: string) {
      return !(opts.missingBinaries ?? []).includes(file);
    },
  };

  return {
    executor,
    calls,
    runs: () => calls.filter((c) => c.kind === "run"),
    shells: () => calls.filter((c) => c.kind === "shell"),
  };
}

const throwingCatalog: CatalogResolver = {
  async resolve() {
    throw new Error("catalog not available in this test");
  },
  async list() {
    return [];
  },
  async resolveSolution() {
    throw new Error("catalog not available in this test");
  },
  async listSolutions() {
    return [];
  },
};

/** Build an in-memory {@link LoadedConfig} (no config file on disk needed). */
export function makeLoaded(
  over: { rootDir: string; cacheDir: string } & Partial<LoadedConfig>,
): LoadedConfig {
  const config: KaupangConfig = over.config ?? { environments: "envs" };
  return {
    config,
    configPath: `${over.rootDir}/kaupang.config.ts`,
    rootDir: over.rootDir,
    cacheDir: over.cacheDir,
    project: over.project ?? "longhall",
    catalog: over.catalog ?? throwingCatalog,
    environments: over.environments ?? new Map(),
  };
}

/** A normalized environment (what the loader produces, what the resolver consumes). */
export function normEnv(
  name: string,
  services: Record<string, ServiceDefinition>,
  extra: Partial<ResolvedEnvironment> = {},
): ResolvedEnvironment {
  return { name, file: `${name}.ts`, services, dependsOn: [], env: {}, ...extra };
}

/** An already-resolved environment plan (skips the resolver). */
export function envPlan(
  name: string,
  services: Record<string, ServiceDefinition>,
  extra: Partial<EnvironmentPlan> = {},
): EnvironmentPlan {
  const order = Object.keys(services);
  return {
    name,
    file: `${name}.ts`,
    env: {},
    dependsOn: [],
    order,
    waves: [order],
    services,
    ...extra,
  };
}

/** A deployment plan over the given environment plans (last one is the target). */
export function deploymentPlan(
  environments: EnvironmentPlan[],
  opts: { backend?: BackendName; target?: string } = {},
): DeploymentPlan {
  return {
    target: opts.target ?? environments.at(-1)!.name,
    backend: opts.backend ?? "compose",
    environments,
  };
}
