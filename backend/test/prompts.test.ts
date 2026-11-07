import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GUIDE_IDS } from "../src/guides";
import { buildSystemPrompt } from "../src/prompts";

const realRoot = new URL("..", import.meta.url).pathname;

describe("buildSystemPrompt", () => {
  it("5つのガイドすべてのプロンプトが存在する", () => {
    for (const id of GUIDE_IDS) {
      expect(buildSystemPrompt(id, realRoot).length).toBeGreaterThan(100);
    }
  });

  it("共通・ガイド別ナレッジを連結し、_ で始まるファイルは無視する", () => {
    const root = mkdtempSync(join(tmpdir(), "prompts-"));
    mkdirSync(join(root, "prompts"));
    mkdirSync(join(root, "knowledge/common"), { recursive: true });
    mkdirSync(join(root, "knowledge/know"));
    writeFileSync(join(root, "prompts/know.md"), "BASE");
    writeFileSync(join(root, "knowledge/common/a.md"), "COMMON");
    writeFileSync(join(root, "knowledge/know/b.md"), "SPECIFIC");
    writeFileSync(join(root, "knowledge/know/_draft.md"), "DRAFT");
    const p = buildSystemPrompt("know", root);
    expect(p).toContain("BASE");
    expect(p).toContain("COMMON");
    expect(p).toContain("SPECIFIC");
    expect(p).not.toContain("DRAFT");
  });
});
