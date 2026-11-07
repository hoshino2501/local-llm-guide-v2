import { streamBedrock } from "./bedrock";
import type { Config } from "./config";
import { buildSystemPrompt } from "./prompts";
import type { SseEvent } from "./sse";
import { ValidationError, validateChatRequest } from "./validate";

/**
 * チャット1回分の処理。検証済みリクエストから SSE イベント列を生成する。
 * Lambda ハンドラとローカル開発サーバーの両方から使う(AWS 依存は bedrock.ts のみ)。
 * 質問・回答の本文はログに出さない。メタデータのみ記録する。
 */
export async function* chat(
  config: Config,
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<SseEvent> {
  const started = Date.now();
  let guide = "unknown";
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let status = "ok";
  try {
    const req = validateChatRequest(body, config.limits);
    guide = req.guide;
    const system = buildSystemPrompt(req.guide);
    for await (const chunk of streamBedrock(config, system, req.messages, signal)) {
      if (chunk.type === "delta") yield { type: "delta", text: chunk.text };
      else {
        inputTokens = chunk.inputTokens;
        outputTokens = chunk.outputTokens;
      }
    }
    yield { type: "done", usage: { inputTokens, outputTokens } };
  } catch (err) {
    if (err instanceof ValidationError) {
      status = err.code;
      yield { type: "error", code: err.code, message: err.message };
    } else {
      status = "internal_error";
      console.error(JSON.stringify({ level: "error", name: (err as Error).name, message: (err as Error).message }));
      yield {
        type: "error",
        code: "internal_error",
        message: "回答の生成中にエラーが発生しました。しばらくしてからもう一度お試しください。",
      };
    }
  } finally {
    console.log(
      JSON.stringify({
        level: "info",
        event: "chat",
        guide,
        status,
        inputTokens,
        outputTokens,
        latencyMs: Date.now() - started,
      }),
    );
  }
}
