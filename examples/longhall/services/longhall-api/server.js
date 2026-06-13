// A tiny, dependency-free Node service for the kaupang "longhall" example.
// One image, three roles — selected by the first CLI arg (see package.json):
//   server  (herald)    — HTTP API with a /health endpoint
//   migrate (runecarver)— one-shot "migration" that prints and exits 0
//   worker  (huscarl)   — a long-running background loop
const http = require("node:http");

const mode = process.argv[2] || process.env.LONGHALL_MODE || "server";
const log = (msg) => console.log(`[longhall:${mode}] ${msg}`);

if (mode === "migrate") {
  // A real app would run schema migrations here; we just prove the env is wired.
  log(`carving runes into ${process.env.DATABASE_URL || "(no DATABASE_URL set)"}`);
  log("the saga schema is ready ✅");
  process.exit(0);
}

if (mode === "worker") {
  log(`huscarl awake — cache at ${process.env.REDIS_URL || "(no REDIS_URL set)"}`);
  setInterval(() => log("tending the hall…"), 5000);
} else {
  const port = Number(process.env.PORT || 3000);
  const realm = process.env.REALM || "midgard";
  http
    .createServer((req, res) => {
      if (req.url === "/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "ok", realm }));
        return;
      }
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end(`⚔️  longhall herald — realm ${realm}, public ${process.env.PUBLIC_URL || "(unset)"}\n`);
    })
    .listen(port, () => log(`herald listening on :${port} (realm ${realm})`));
}
