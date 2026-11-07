export interface Limits {
  /** 受け付ける messages の最大件数(超過分は古い方から切り捨て) */
  maxMessages: number;
  /** 1メッセージあたりの最大文字数 */
  maxCharsPerMessage: number;
  /** 切り詰め後の合計最大文字数 */
  maxTotalChars: number;
  /** リクエストボディの最大バイト数 */
  maxBodyBytes: number;
}

export interface Config {
  modelId: string;
  maxOutputTokens: number;
  temperature: number;
  enablePromptCache: boolean;
  mockBedrock: boolean;
  limits: Limits;
}

function int(name: string, fallback: number, env: NodeJS.ProcessEnv): number {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`環境変数 ${name} が不正です: ${raw}`);
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mockBedrock = env.MOCK_BEDROCK === "1";
  const modelId = env.BEDROCK_MODEL_ID ?? "";
  if (!modelId && !mockBedrock) throw new Error("環境変数 BEDROCK_MODEL_ID が未設定です");
  return {
    modelId,
    maxOutputTokens: int("MAX_OUTPUT_TOKENS", 2048, env),
    temperature: Number.parseFloat(env.TEMPERATURE ?? "0.3"),
    enablePromptCache: (env.ENABLE_PROMPT_CACHE ?? "true") === "true",
    mockBedrock,
    limits: {
      maxMessages: int("MAX_MESSAGES", 20, env),
      maxCharsPerMessage: int("MAX_CHARS_PER_MESSAGE", 4000, env),
      maxTotalChars: int("MAX_TOTAL_CHARS", 20000, env),
      maxBodyBytes: int("MAX_BODY_BYTES", 65536, env),
    },
  };
}
