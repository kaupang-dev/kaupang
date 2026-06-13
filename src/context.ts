import type { BackendContext } from "./backends/types.js";
import type { LoadedConfig } from "./config/loader.js";
import type { EnvMap, PullPolicy } from "./config/types.js";

export function makeContext(
  loaded: LoadedConfig,
  opts: { pull?: PullPolicy; targetEnv?: EnvMap } = {},
): BackendContext {
  return {
    rootDir: loaded.rootDir,
    cacheDir: loaded.cacheDir,
    project: loaded.project,
    baseEnv: loaded.config.globalEnv ?? {},
    targetEnv: opts.targetEnv ?? {},
    pull: opts.pull,
  };
}
