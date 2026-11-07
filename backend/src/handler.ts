import { chat } from "./chat";
import { loadConfig } from "./config";
import { formatSse } from "./sse";

// Lambda ランタイムが提供するレスポンスストリーミング用グローバル
declare const awslambda: {
  streamifyResponse(
    fn: (event: FunctionUrlEvent, stream: NodeJS.WritableStream, ctx: unknown) => Promise<void>,
  ): unknown;
  HttpResponseStream: {
    from(
      stream: NodeJS.WritableStream,
      meta: { statusCode: number; headers: Record<string, string> },
    ): NodeJS.WritableStream;
  };
};

interface FunctionUrlEvent {
  requestContext: { http: { method: string } };
  headers?: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
}

const config = loadConfig();

function json(stream: NodeJS.WritableStream, statusCode: number, payload: unknown, extra: Record<string, string> = {}) {
  const out = awslambda.HttpResponseStream.from(stream, {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra },
  });
  out.write(JSON.stringify(payload));
  out.end();
}

export const handler = awslambda.streamifyResponse(async (event, stream) => {
  if (event.requestContext.http.method !== "POST") {
    return json(stream, 405, { code: "method_not_allowed", message: "POST のみ対応しています" }, { Allow: "POST" });
  }

  const raw = event.body ?? "";
  const text = event.isBase64Encoded ? Buffer.from(raw, "base64").toString("utf-8") : raw;
  if (Buffer.byteLength(text) > config.limits.maxBodyBytes) {
    return json(stream, 413, { code: "body_too_large", message: "リクエストが大きすぎます" });
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json(stream, 400, { code: "invalid_json", message: "JSON として解釈できません" });
  }

  const abort = new AbortController();
  const out = awslambda.HttpResponseStream.from(stream, {
    statusCode: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
  stream.on("close", () => abort.abort());
  try {
    for await (const ev of chat(config, body, abort.signal)) out.write(formatSse(ev));
  } finally {
    out.end();
  }
});
