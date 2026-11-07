import type { Limits } from "./config";
import { type GuideId, isGuideId } from "./guides";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  guide: GuideId;
  messages: ChatMessage[];
}

export class ValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * リクエストボディ(パース済み JSON)を検証し、上限内に切り詰めた ChatRequest を返す。
 * - guide は許可リストのみ
 * - 古いメッセージから切り捨て、先頭は必ず user、末尾も必ず user
 */
export function validateChatRequest(body: unknown, limits: Limits): ChatRequest {
  if (typeof body !== "object" || body === null) {
    throw new ValidationError("invalid_body", "リクエストボディが不正です");
  }
  const { guide, messages } = body as { guide?: unknown; messages?: unknown };

  if (!isGuideId(guide)) throw new ValidationError("invalid_guide", "guide が不正です");
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new ValidationError("invalid_messages", "messages は1件以上の配列で指定してください");
  }

  const parsed: ChatMessage[] = messages.map((m) => {
    if (typeof m !== "object" || m === null) {
      throw new ValidationError("invalid_messages", "messages の要素が不正です");
    }
    const { role, content } = m as { role?: unknown; content?: unknown };
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
      throw new ValidationError("invalid_messages", "role または content が不正です");
    }
    if (content.trim().length === 0) {
      throw new ValidationError("empty_message", "空のメッセージは送れません");
    }
    if ([...content].length > limits.maxCharsPerMessage) {
      throw new ValidationError(
        "message_too_long",
        `1メッセージは${limits.maxCharsPerMessage}文字以内にしてください`,
      );
    }
    return { role, content };
  });

  if (parsed[parsed.length - 1]?.role !== "user") {
    throw new ValidationError("invalid_messages", "最後のメッセージは user にしてください");
  }

  // 件数・合計文字数で古い方から切り捨てる
  let trimmed = parsed.slice(-limits.maxMessages);
  let total = trimmed.reduce((sum, m) => sum + [...m.content].length, 0);
  while (trimmed.length > 1 && total > limits.maxTotalChars) {
    total -= [...(trimmed[0] as ChatMessage).content].length;
    trimmed = trimmed.slice(1);
  }
  // 先頭は user から始める
  while (trimmed.length > 1 && trimmed[0]?.role !== "user") trimmed = trimmed.slice(1);

  // 連続する同一ロールは Bedrock が拒否するため結合する
  const merged: ChatMessage[] = [];
  for (const m of trimmed) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.content += `\n\n${m.content}`;
    else merged.push({ ...m });
  }

  if (merged.length === 1 && [...(merged[0] as ChatMessage).content].length > limits.maxTotalChars) {
    throw new ValidationError("message_too_long", "メッセージが長すぎます");
  }

  return { guide, messages: merged };
}
