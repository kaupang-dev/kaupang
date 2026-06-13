import { defineConfig } from "@kaupang/core";

// Reusable service presets resolved from a catalog. Here the catalog is a local
// JSON file; it could equally be an HTTP endpoint, a live service, or an OCI artifact.
export default defineConfig({
  environments: "./environments",
  project: "catalog-demo",
  catalog: {
    sources: [{ type: "file", path: "./catalog.json" }],
  },
});
