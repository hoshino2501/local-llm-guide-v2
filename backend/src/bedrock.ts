import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
  type ContentBlock,
  type SystemContentBlock,
} from "@aws-sdk/client-bedrock-runtime";
import type { Config } from "./config";
import type { ChatMessage } from "./validate";

export type BedrockChunk =
  | { type: "delta"; text: string }
  | { type: "usage"; inputTokens?: number; outputTokens?: number };

let client: BedrockRuntimeClient | undefined;

/** Bedrock ConverseStream を呼び、テキスト差分とトークン使用量を順次返す。 */
export async function* streamBedrock(
  config: Config,
  system: string,
  messages: ChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<BedrockChunk> {
  if (config.mockBedrock) {
    yield* mockStream(messages);
    return;
  }
  client ??= new BedrockRuntimeClient({});

  const systemBlocks: SystemContentBlock[] = [{ text: system }];
  if (config.enablePromptCache) systemBlocks.push({ cachePoint: { type: "default" } });

  const res = await client.send(
    new ConverseStreamCommand({
      modelId: config.modelId,
      system: systemBlocks,
      messages: messages.map((m) => ({
        role: m.role,
        content: [{ text: m.content }] satisfies ContentBlock[],
      })),
      inferenceConfig: { maxTokens: config.maxOutputTokens, temperature: config.temperature },
    }),
    { abortSignal: signal },
  );

  for await (const ev of res.stream ?? []) {
    const text = ev.contentBlockDelta?.delta?.text;
    if (text) yield { type: "delta", text };
    if (ev.metadata?.usage) {
      yield {
        type: "usage",
        inputTokens: ev.metadata.usage.inputTokens,
        outputTokens: ev.metadata.usage.outputTokens,
      };
    }
  }
}

/** UI 確認用。AWS に接続せず固定文を少しずつ返す。 */
async function* mockStream(messages: ChatMessage[]): AsyncGenerator<BedrockChunk> {
  const last = messages[messages.length - 1]?.content ?? "";
  const text = `(モック応答) 「${last.slice(0, 40)}」についてのご質問ですね。\n\n- これは **開発用のダミー応答** です\n- \`MOCK_BEDROCK=1\` を外すと Bedrock に接続します\n\n\`\`\`bash\nollama run llama3.2\n\`\`\``;
  for (const ch of text.match(/[\s\S]{1,6}/g) ?? []) {
    await new Promise((r) => setTimeout(r, 25));
    yield { type: "delta", text: ch };
  }
  yield { type: "usage", inputTokens: 0, outputTokens: 0 };
}
