import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createCatalogResolver, type CatalogSourceConfig } from "@kaupang/core/internal";
import { INDEX_HTML } from "./ui.js";

export interface StudioOptions {
  /** Port to listen on (default 8080). */
  port?: number;
  /** Host to bind (default 127.0.0.1; use 0.0.0.0 in Docker). */
  host?: string;
  /** Default catalog source: a file path, an http(s) URL, or `oci://…`. */
  catalog?: string;
  /** Directory to resolve `file` catalog sources from (default cwd). */
  rootDir?: string;
  /** Open the browser once listening (CLI mode). */
  open?: boolean;
}

/** A catalog source string → a kaupang CatalogSourceConfig. */
function sourceFor(catalog: string): CatalogSourceConfig {
  if (/^https?:\/\//.test(catalog)) return { type: "http", url: catalog };
  if (catalog.startsWith("oci://")) return { type: "oci", ref: catalog.slice("oci://".length) };
  return { type: "file", path: catalog };
}

/** List the catalog's presets (resolved) + solution names. */
async function readCatalog(catalog: string, rootDir: string) {
  const resolver = createCatalogResolver({ sources: [sourceFor(catalog)] }, rootDir);
  const services: Record<string, unknown> = {};
  for (const name of await resolver.list()) services[name] = await resolver.resolve(name);
  const solutions = await resolver.listSolutions().catch(() => []);
  return { services, solutions };
}

/** Start the studio web server. Resolves once it's listening. */
export async function startStudio(opts: StudioOptions = {}): Promise<{ url: string; close: () => void }> {
  const port = opts.port ?? 8080;
  const host = opts.host ?? "127.0.0.1";
  const rootDir = opts.rootDir ?? process.cwd();

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

      if (url.pathname === "/" || url.pathname === "/index.html") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(INDEX_HTML);
        return;
      }

      if (url.pathname === "/api/catalog") {
        const catalog = url.searchParams.get("source") || opts.catalog || "";
        if (!catalog) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "No catalog source. Enter a file path, http(s) URL, or oci://ref." }));
          return;
        }
        const data = await readCatalog(catalog, rootDir);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(data));
        return;
      }

      if (url.pathname === "/api/defaults") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ catalog: opts.catalog ?? "" }));
        return;
      }

      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
    } catch (err) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });

  const url = `http://${host === "0.0.0.0" ? "localhost" : host}:${port}`;
  if (opts.open) openBrowser(url);
  return { url, close: () => server.close() };
}

function openBrowser(url: string): void {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    // best-effort; the URL is printed anyway
  }
}
