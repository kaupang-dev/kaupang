const http = require("node:http");

const port = Number(process.env.PORT || 3000);
http
  .createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("kaupang integration test app\n");
  })
  .listen(port, () => console.log(`itest app listening on :${port}`));
