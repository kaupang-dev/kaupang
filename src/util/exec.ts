import { execa } from "execa";
import { consola } from "consola";

export interface RunOptions {
  cwd: string;
  /** When true, print the command but do not execute it. */
  dryRun?: boolean;
  /** Extra environment for the spawned process. */
  env?: Record<string, string>;
  /** Optional string piped to the process stdin (used for `kubectl apply -f -`). */
  input?: string;
}

// Whether to echo each command before running it. Off by default (the deploy UI
// shows progress); the CLI flips it on with --verbose. Dry-run always echoes,
// since printing the commands is the whole point of a dry run.
let verbose = false;

/** Toggle command echoing (set from the CLI's --verbose flag). */
export function setVerbose(value: boolean): void {
  verbose = value;
}

function echo(command: string, dryRun?: boolean): void {
  if (verbose || dryRun) consola.log(`  ${dim("$")} ${command}`);
}

/** Run a command with execa, echoing it first (verbose / dry-run). Honors dry-run. */
export async function run(
  file: string,
  args: string[],
  opts: RunOptions,
): Promise<void> {
  echo(`${file} ${args.join(" ")}`, opts.dryRun);
  if (opts.dryRun) return;

  await execa(file, args, {
    cwd: opts.cwd,
    stdio: opts.input ? ["pipe", "inherit", "inherit"] : "inherit",
    input: opts.input,
    env: opts.env ? { ...process.env, ...opts.env } : process.env,
  });
}

/** True if a binary is resolvable on PATH. */
export async function hasBinary(file: string): Promise<boolean> {
  try {
    await execa(file, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Run a shell command (used for lifecycle hooks). Honors dry-run. */
export async function runShell(
  command: string,
  opts: RunOptions,
): Promise<void> {
  echo(command, opts.dryRun);
  if (opts.dryRun) return;
  await execa(command, {
    shell: true,
    cwd: opts.cwd,
    stdio: "inherit",
    env: opts.env ? { ...process.env, ...opts.env } : process.env,
  });
}

function dim(s: string): string {
  return `\x1b[2m${s}\x1b[0m`;
}

/**
 * The command-execution boundary. The real implementation shells out via execa;
 * tests inject a fake that records calls, so the deploy/pipeline layers can be
 * exercised — asserting which commands run, in what order, with which context —
 * without a Docker daemon. Keep this surface tiny: it is the only seam between
 * kaupang's pure logic and the outside world's side effects.
 */
export interface Executor {
  run(file: string, args: string[], opts: RunOptions): Promise<void>;
  runShell(command: string, opts: RunOptions): Promise<void>;
  hasBinary(file: string): Promise<boolean>;
}

/** The real executor: execa-backed `run` / `runShell` / `hasBinary`. */
export const defaultExecutor: Executor = { run, runShell, hasBinary };

/** Parse "500ms" / "2s" / "5m" / "1h" into milliseconds. Bare numbers are seconds. */
export function parseDuration(value: string | number): number {
  if (typeof value === "number") return value * 1000;
  const m = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h)?$/.exec(value.trim());
  if (!m) throw new Error(`Invalid duration "${value}" (use e.g. "2s", "500ms", "5m").`);
  const n = Number(m[1]);
  switch (m[2]) {
    case "ms":
      return n;
    case "m":
      return n * 60_000;
    case "h":
      return n * 3_600_000;
    default:
      return n * 1000; // "s" or unitless
  }
}
