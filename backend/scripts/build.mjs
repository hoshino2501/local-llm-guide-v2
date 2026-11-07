// Lambda 用ビルド: src/handler.ts を単一ファイルにバンドルし、prompts/ と knowledge/ を dist/ に同梱する。
import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const dist = join(root, "dist");
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

await build({
  entryPoints: [join(root, "src/handler.ts")],
  outfile: join(dist, "index.mjs"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  minify: false,
  sourcemap: false,
  // ESM バンドル内で CommonJS 依存が require を使えるようにする
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
});

for (const dir of ["prompts", "knowledge"]) {
  if (existsSync(join(root, dir))) cpSync(join(root, dir), join(dist, dir), { recursive: true });
}
writeFileSync(join(dist, "package.json"), JSON.stringify({ type: "module" }));

// ナレッジ量の目安チェック(第1段階=プロンプト同梱は数十万トークン以内が目安)
function totalChars(dir) {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).reduce((sum, f) => {
    const p = join(dir, f);
    return sum + (statSync(p).isDirectory() ? totalChars(p) : readFileSync(p, "utf-8").length);
  }, 0);
}
const chars = totalChars(join(dist, "knowledge")) + totalChars(join(dist, "prompts"));
console.log(`built dist/ (prompts+knowledge: ${chars.toLocaleString()} chars)`);
const LIMIT = 400_000;
if (chars > LIMIT) {
  console.warn(`警告: ナレッジが ${LIMIT.toLocaleString()} 文字を超えました。Knowledge Bases(第2段階)への移行を検討してください。`);
}
