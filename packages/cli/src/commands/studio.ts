import { defineCommand } from "citty";
import { consola } from "consola";

export const studioCommand = defineCommand({
  meta: {
    name: "studio",
    description:
      "Launch the kaupang studio web UI — browse a catalog, assemble environments + a solution, and export a config.",
  },
  args: {
    port: { type: "string", description: "Port to listen on (default 8080)." },
    catalog: {
      type: "string",
      description: "Catalog source to preload: a file path, http(s) URL, or oci://ref.",
    },
    "no-open": { type: "boolean", description: "Don't open a browser automatically." },
    cwd: { type: "string", description: "Directory to resolve `file` catalog sources from." },
  },
  async run({ args }) {
    // Loaded lazily so it doesn't weigh down `up`/`down`/etc.
    const { startStudio } = await import("@kaupang/studio");
    const { url } = await startStudio({
      port: args.port ? Number(args.port) : undefined,
      catalog: args.catalog,
      rootDir: args.cwd,
      open: !args["no-open"],
    });
    consola.success(`⚓ kaupang studio → ${url}   (Ctrl-C to stop)`);
    // Keep the process alive while the server is listening.
    await new Promise<never>(() => {});
  },
});
