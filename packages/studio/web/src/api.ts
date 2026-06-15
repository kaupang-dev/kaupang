import type { CatalogResponse } from "./types";

/** The default catalog source the server was started with (may be empty). */
export async function fetchDefaults(): Promise<{ catalog: string }> {
  const res = await fetch("/api/defaults");
  if (!res.ok) throw new Error(`defaults: ${res.status}`);
  return res.json();
}

/** Resolve a catalog source (file path, http(s) URL, or oci:// ref) into its presets. */
export async function fetchCatalog(source: string): Promise<CatalogResponse> {
  const res = await fetch(`/api/catalog?source=${encodeURIComponent(source)}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `catalog: ${res.status}`);
  }
  return res.json();
}
