import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts", // public authoring API (@kaupang/core)
    internal: "src/internal.ts", // engine surface for @kaupang/cli (@kaupang/core/internal)
  },
  format: ["esm"],
  target: "node18",
  dts: true,
  clean: true,
  // Keep the user-installed jiti/execa/etc. external so they resolve at runtime.
  shims: true,
});
