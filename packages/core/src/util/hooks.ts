import { resolve } from "node:path";
import type { HookCommand } from "../config/types.js";
import { defaultExecutor, type Executor } from "../util/exec.js";

/** Run a list of hook commands sequentially, relative to rootDir. */
export async function runHooks(
  commands: HookCommand[] | undefined,
  opts: { rootDir: string; dryRun?: boolean; executor?: Executor },
): Promise<void> {
  const executor = opts.executor ?? defaultExecutor;
  for (const cmd of commands ?? []) {
    const norm = typeof cmd === "string" ? { run: cmd } : cmd;
    await executor.runShell(norm.run, {
      cwd: norm.cwd ? resolve(opts.rootDir, norm.cwd) : opts.rootDir,
      env: norm.env,
      dryRun: opts.dryRun,
    });
  }
}
