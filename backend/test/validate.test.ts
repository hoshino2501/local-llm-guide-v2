import { describe, expect, it } from "vitest";
import type { Limits } from "../src/config";
import { ValidationError, validateChatRequest } from "../src/validate";

const limits: Limits = { maxMessages: 4, maxCharsPerMessage: 50, maxTotalChars: 120, maxBodyBytes: 65536 };
const u = (content: string) => ({ role: "user", content });
const a = (content: string) => ({ role: "assistant", content });

describe("validateChatRequest", () => {
  it("正常なリクエストを受け付ける", () => {
    const r = validateChatRequest({ guide: "know", messages: [u("Ollamaとは?")] }, limits);
    expect(r.guide).toBe("know");
    expect(r.messages).toHaveLength(1);
  });

  it("許可リスト外の guide を拒否する", () => {
    expect(() => validateChatRequest({ guide: "admin", messages: [u("x")] }, limits)).toThrow(ValidationError);
    expect(() => validateChatRequest({ messages: [u("x")] }, limits)).toThrow(ValidationError);
  });

  it("不正な role / 型 / 空文字を拒否する", () => {
    expect(() => validateChatRequest({ guide: "know", messages: [{ role: "system", content: "x" }] }, limits)).toThrow();
    expect(() => validateChatRequest({ guide: "know", messages: [{ role: "user", content: 1 }] }, limits)).toThrow();
    expect(() => validateChatRequest({ guide: "know", messages: [u("  ")] }, limits)).toThrow();
    expect(() => validateChatRequest({ guide: "know", messages: [] }, limits)).toThrow();
    expect(() => validateChatRequest(null, limits)).toThrow();
  });

  it("末尾が user でないものを拒否する", () => {
    expect(() => validateChatRequest({ guide: "know", messages: [u("a"), a("b")] }, limits)).toThrow();
  });

  it("1メッセージの文字数上限を超えると拒否する", () => {
    expect(() => validateChatRequest({ guide: "know", messages: [u("あ".repeat(51))] }, limits)).toThrow(/50文字/);
  });

  it("件数上限を超えた古いメッセージを切り捨て、先頭を user にする", () => {
    const msgs = [u("1"), a("2"), u("3"), a("4"), u("5")];
    const r = validateChatRequest({ guide: "run", messages: msgs }, limits);
    expect(r.messages[0]?.role).toBe("user");
    expect(r.messages.at(-1)?.content).toBe("5");
    expect(r.messages.length).toBeLessThanOrEqual(4);
  });

  it("合計文字数上限で古い方から切り捨てる", () => {
    const long = "x".repeat(50);
    const r = validateChatRequest({ guide: "run", messages: [u(long), a(long), u(long), a(long), u("最後")] }, limits);
    const total = r.messages.reduce((s, m) => s + m.content.length, 0);
    expect(total).toBeLessThanOrEqual(120);
    expect(r.messages.at(-1)?.content).toBe("最後");
  });
});
