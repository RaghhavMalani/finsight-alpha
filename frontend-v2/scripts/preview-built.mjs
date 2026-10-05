// Local production preview for the repository's Nitro Vercel output.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { Readable } from "node:stream";
import app from "../.vercel/output/functions/__server.func/index.mjs";

const root = resolve(".vercel/output/static");
const mime = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".woff": "font/woff",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1:4174");
    const path = resolve(root, "." + decodeURIComponent(url.pathname));
    if (path.startsWith(root + sep) && (await stat(path).catch(() => null))?.isFile()) {
      res.writeHead(200, { "content-type": mime[extname(path)] || "application/octet-stream" });
      res.end(req.method === "HEAD" ? undefined : await readFile(path));
      return;
    }
    const init = { method: req.method, headers: req.headers };
    if (!["GET", "HEAD"].includes(req.method)) {
      init.body = Readable.toWeb(req);
      init.duplex = "half";
    }
    const response = await app.fetch(new Request(url, init));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(res);
    else res.end();
  } catch (error) {
    console.error(error);
    res.writeHead(500);
    res.end("Production preview failed");
  }
}).listen(4174, "127.0.0.1", () => console.log("Production build: http://127.0.0.1:4174"));
