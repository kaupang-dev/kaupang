import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Live/IO-bound paths are exercised by the integration job, not unit tests.
      exclude: ["src/cli.ts", "src/commands/**", "src/**/*.d.ts"],
    },
  },
});
