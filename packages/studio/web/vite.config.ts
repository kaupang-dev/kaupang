import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Builds the studio SPA into a single, self-contained index.html (CSS + JS inlined, no
// CDN — airgap-safe). The package's tsup build then embeds that file as a string (see
// ../src/ui.ts). In dev, `npm run dev` proxies /api to a running `kaupang studio`.
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
  },
  server: {
    proxy: { "/api": "http://127.0.0.1:8080" },
  },
});
