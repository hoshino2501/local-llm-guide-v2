// ローカル開発サーバー: web/ を配信し、/api/chat を Lambda と同じ処理に接続する。
//   npm run dev:mock  … Bedrock に接続せずモック応答(AWS 認証不要)
//   npm run dev       … 実際の Bedrock に接続(AWS 認証情報と BEDROCK_MODEL_ID が必要)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chat } from "../src/chat";
import { loadConfig } from "../src/config";
import { formatSse } from "../src/sse";

const root = new URL("..", import.meta.url).pathname;
process.env.CONTENT_DIR ??= root;
const webRoot = join(root, "..", "web");
const config = loadConfig();
const port = Number(process.env.PORT ?? 8787);

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  if (url.pathname === "/api/chat") {
    if (req.method !== "POST") {
      res.writeHead(405).end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ code: "invalid_json" }));
      return;
    }
    const abort = new AbortController();
    res.on("close", () => abort.abort());
    res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store" });
    for await (const ev of chat(config, body, abort.signal)) res.write(formatSse(ev));
    res.end();
    return;
  }

  let path = normalize(url.pathname).replace(/^(\.\.[/\\])+/, "");
  if (path.endsWith("/")) path += "index.html";
  try {
    const data = await readFile(join(webRoot, path));
    res.writeHead(200, { "Content-Type": types[extname(path)] ?? "application/octet-stream" }).end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not Found");
  }
}).listen(port, () => {
  console.log(`dev server: http://localhost:${port}/  (mock=${config.mockBedrock})`);
});
