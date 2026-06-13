import { defineConfig } from "tsup";

export default defineConfig({
  entry: { cli: "src/cli.ts" },
  format: ["esm"],
  target: "node18",
  dts: false, // binary package — no library types to ship
  clean: true,
  shims: true,
  // @kaupang/core is a runtime dependency, resolved from node_modules — not bundled.
  external: ["@kaupang/core", "@kaupang/core/internal"],
});
