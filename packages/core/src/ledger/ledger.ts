import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BackendAction } from "../backends/types.js";
import type { BackendName } from "../config/types.js";
import type { ResolvedImage } from "../image/resolve.js";

const LEDGER_VERSION = 1;
const MAX_HISTORY = 25;

export interface DeploymentRecord {
  id: string;
  environment: string;
  /** Where it was deployed (defaults to "local"). Scopes the history. */
  target: string;
  backend: BackendName;
  project: string;
  ranAt: string;
  status: "succeeded" | "failed";
  /** When this deployment was a rollback, the id it restored. */
  rollbackOf?: string;
  /** The digests actually deployed (for display + auditing). */
  images: ResolvedImage[];
  /** Exactly what was applied, so a rollback replays it verbatim. */
  files: { path: string; content: string }[];
  up: BackendAction[];
  down: BackendAction[];
}

export interface Ledger {
  version: number;
  /** Keyed by `${environment}@${target}`. */
  deployments: Record<string, DeploymentRecord[]>;
}

function ledgerPath(cacheDir: string): string {
  return join(cacheDir, "ledger.json");
}

function key(environment: string, target: string): string {
  return `${environment}@${target}`;
}

export function readLedger(cacheDir: string): Ledger {
  const path = ledgerPath(cacheDir);
  if (!existsSync(path)) return { version: LEDGER_VERSION, deployments: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<Ledger>;
    return { version: LEDGER_VERSION, deployments: parsed.deployments ?? {} };
  } catch {
    return { version: LEDGER_VERSION, deployments: {} };
  }
}

function writeLedger(cacheDir: string, ledger: Ledger): void {
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(ledgerPath(cacheDir), JSON.stringify(ledger, null, 2) + "\n");
}

/** Sortable, human-ish id, e.g. "20260612T103045-a1b2". */
export function newDeploymentId(date = new Date()): string {
  const stamp = date.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const rand = Math.random().toString(36).slice(2, 6);
  return `${stamp}-${rand}`;
}

export function appendDeployment(cacheDir: string, record: DeploymentRecord): void {
  const ledger = readLedger(cacheDir);
  const k = key(record.environment, record.target);
  const list = ledger.deployments[k] ?? [];
  list.push(record);
  ledger.deployments[k] = list.slice(-MAX_HISTORY);
  writeLedger(cacheDir, ledger);
}

export function history(
  cacheDir: string,
  environment: string,
  target: string,
): DeploymentRecord[] {
  return readLedger(cacheDir).deployments[key(environment, target)] ?? [];
}

export function latestSuccessful(
  cacheDir: string,
  environment: string,
  target: string,
): DeploymentRecord | undefined {
  const list = history(cacheDir, environment, target);
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i]!.status === "succeeded") return list[i];
  }
  return undefined;
}

/**
 * The deployment to roll back TO. With `toId`, that exact (successful) record;
 * otherwise the second-most-recent successful deployment (i.e. "the previous one").
 */
export function rollbackTarget(
  cacheDir: string,
  environment: string,
  target: string,
  toId?: string,
): DeploymentRecord | undefined {
  const successful = history(cacheDir, environment, target).filter(
    (d) => d.status === "succeeded",
  );
  if (toId) return successful.find((d) => d.id === toId);
  return successful.length >= 2 ? successful[successful.length - 2] : undefined;
}
