import { consola } from "consola";

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g;

export function stripAnsi(s: string): string {
  return s.replace(ANSI, "");
}

/**
 * Capture everything written through consola while `fn` runs, with ANSI stripped.
 * Used to assert dry-run rendering (plans, pipeline graphs) without a daemon.
 */
export async function captureConsola(fn: () => void | Promise<void>): Promise<string> {
  const lines: string[] = [];
  const originalReporters = consola.options.reporters;
  // Vitest lowers consola.level to 1 (warn), which would filter out log/info —
  // raise it so the full dry-run rendering reaches our capture reporter.
  const originalLevel = consola.level;
  consola.level = 5;
  consola.setReporters([
    {
      log(logObj) {
        lines.push((logObj.args ?? []).map((a) => String(a)).join(" "));
      },
    },
  ]);
  try {
    await fn();
  } finally {
    consola.setReporters(originalReporters);
    consola.level = originalLevel;
  }
  return stripAnsi(lines.join("\n"));
}
