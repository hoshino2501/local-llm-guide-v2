import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { GuideId } from "./guides";

/** プロンプトとナレッジの置き場所。Lambda では dist/ 直下に同梱される。 */
function contentRoot(): string {
  return process.env.CONTENT_DIR ?? process.env.LAMBDA_TASK_ROOT ?? process.cwd();
}

function readMarkdownDir(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
    .sort()
    .map((f) => `<document name="${f}">\n${readFileSync(join(dir, f), "utf-8").trim()}\n</document>`);
}

const cache = new Map<GuideId, string>();

/**
 * ガイドごとのシステムプロンプトを組み立てる。
 *   prompts/<guide>.md  + knowledge/common/*.md + knowledge/<guide>/*.md
 * コールドスタート後はメモリにキャッシュする。
 */
export function buildSystemPrompt(guide: GuideId, root = contentRoot()): string {
  const cached = cache.get(guide);
  if (cached && root === contentRoot()) return cached;

  const promptFile = join(root, "prompts", `${guide}.md`);
  if (!existsSync(promptFile)) throw new Error(`プロンプトが見つかりません: ${promptFile}`);

  const docs = [
    ...readMarkdownDir(join(root, "knowledge", "common")),
    ...readMarkdownDir(join(root, "knowledge", guide)),
  ];
  const base = readFileSync(promptFile, "utf-8").trim();
  const prompt = docs.length
    ? `${base}\n\n# 参考ナレッジ\n以下は回答の根拠として使える資料です。資料に無いことは断定せず、その旨を伝えてください。\n\n<knowledge>\n${docs.join("\n\n")}\n</knowledge>`
    : base;

  if (root === contentRoot()) cache.set(guide, prompt);
  return prompt;
}
