import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    cli: "src/cli.ts",
    index: "src/index.ts",
  },
  format: ["esm"],
  target: "node18",
  dts: true,
  clean: true,
  // Keeps the user-installed jiti/execa external so they resolve at runtime.
  shims: true,
});
