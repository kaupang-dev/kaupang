import type { EnvMap, EnvValue, SecretRef } from "../config/types.js";

export function isSecret(value: EnvValue): value is SecretRef {
  return typeof value === "object" && value !== null && "$secret" in value;
}

/** Merge env maps left → right (later wins). Secret references are preserved. */
export function mergeEnv(...maps: (EnvMap | undefined)[]): EnvMap {
  const out: EnvMap = {};
  for (const m of maps) if (m) Object.assign(out, m);
  return out;
}

/**
 * Render for Docker Compose / Swarm: literals pass through, secrets become
 * `${SOURCE}` interpolation references that Docker resolves at runtime from the
 * process environment. The secret value is never written into the file.
 */
export function renderComposeEnv(env: EnvMap): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    out[key] = isSecret(value) ? `\${${value.$secret}}` : value;
  }
  return out;
}

/** Distinct host env var names referenced by secrets across the given maps. */
export function requiredSecretVars(...maps: (EnvMap | undefined)[]): string[] {
  const set = new Set<string>();
  for (const m of maps) {
    if (!m) continue;
    for (const value of Object.values(m)) {
      if (isSecret(value)) set.add(value.$secret);
    }
  }
  return [...set];
}
