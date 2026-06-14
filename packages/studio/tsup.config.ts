import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts", // exports startStudio() — used by the CLI
    serve: "src/serve.ts", // standalone entry (Docker / `kaupang-studio` bin)
  },
  format: ["esm"],
  target: "node18",
  dts: { entry: { index: "src/index.ts" } },
  clean: true,
  shims: true,
  external: ["@kaupang/core", "@kaupang/core/internal"],
  // Inline the single-page UI as a string so it ships inside the bundle.
  loader: { ".html": "text" },
});
