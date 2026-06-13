const http = require("node:http");

const port = Number(process.env.PORT || 3000);
http
  .createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("built by kaupang — hello from a local Dockerfile\n");
  })
  .listen(port, () => console.log(`listening on :${port}`));
