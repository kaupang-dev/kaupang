/** The host[:port] portion of an OCI ref (after stripping an optional `oci://`). */
function registryHost(ref: string): string {
  return ref.replace(/^oci:\/\//, "").split("/")[0] ?? "";
}

/** True for localhost / loopback registries, which serve plain HTTP. */
function isLoopback(host: string): boolean {
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
}

/**
 * Extra `oras` flags for talking to a registry. Unlike `docker`, `oras` defaults to
 * HTTPS and does NOT special-case localhost — so a local registry (or an internal
 * airgap registry opted in via `KAUPANG_ORAS_PLAIN_HTTP`) needs `--plain-http`.
 * Public registries (ghcr.io, ACR, …) stay on HTTPS.
 */
export function orasRegistryArgs(ref: string): string[] {
  if (isLoopback(registryHost(ref)) || process.env.KAUPANG_ORAS_PLAIN_HTTP) {
    return ["--plain-http"];
  }
  return [];
}
