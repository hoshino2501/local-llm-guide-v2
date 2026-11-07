# 04. プロンプト・ナレッジ設計

## 1. ガイドと ID

| ガイド | `guide` | URL | プロンプト |
|---|---|---|---|
| 知る: ローカルLLMガイドさん | `know` | `/chat/?guide=know` | `backend/prompts/know.md` |
| 動かす: ローカルLLMナビゲーター | `run` | `/chat/?guide=run` | `backend/prompts/run.md` |
| 決める: LLM導入判断ナビ | `decide` | `/chat/?guide=decide` | `backend/prompts/decide.md` |
| 通す: ハードウェア選定ナビ | `hardware` | `/chat/?guide=hardware` | `backend/prompts/hardware.md` |
| 守る: セキュリティガイド | `security` | `/chat/?guide=security` | `backend/prompts/security.md` |

ガイド ID は **3 か所**で一致させる: `backend/src/guides.ts`(許可リスト)、`web/assets/guides.js`(表示)、`backend/prompts/<id>.md`。追加・変更手順は [運用 02](../operations/02-runbook.md#ガイドの追加変更)。

## 2. システムプロンプトの組み立て

`backend/src/prompts.ts` が次の順で連結する(コールドスタート時に 1 回だけ。以降メモリ保持)。

```
prompts/<guide>.md
# 参考ナレッジ
<knowledge>
  <document name="a.md"> …  ← knowledge/common/*.md(全ガイド共通、ファイル名昇順)
  <document name="b.md"> …  ← knowledge/<guide>/*.md(ガイド専用)
</knowledge>
```

- 先頭が `_` のファイルは読み込まない(下書き用)。`*.md` 以外は無視。
- Bedrock 呼び出し時、system の末尾に `cachePoint` を付与(`ENABLE_PROMPT_CACHE`)。**プロンプト+ナレッジは会話中不変**にしておくとキャッシュが効く。

## 3. GPTs からの移行手順

1. 各 GPT の「指示」をそのまま `prompts/<id>.md` に貼る(**12/11 前にバックアップ**)。
2. 共通の運用ルール(回答範囲・断り方・非開示・日本語・出典確認の促し)は、現行ダミーの「共通ルール」節を残す。
3. ナレッジファイル(PDF/Word 等)を Markdown に変換し `knowledge/` に配置。表・図は文章化する。
4. `cd backend && npm run build` でサイズを確認(約 40 万文字超で警告)。
5. [品質比較セット](../operations/04-cutover-checklist.md#品質比較の質問セット)で新旧を比較し、差が大きい箇所をプロンプトで調整。

## 4. 第2段階(Knowledge Bases)への移行基準

次のいずれかで検討する。

- ナレッジ合計が約 40 万文字(≒数十万トークン)を超えた
- 更新が頻繁で、デプロイなしに差し替えたい
- 回答の根拠を絞りたい(長い文脈で取りこぼしが出る)

実装方針: Bedrock Knowledge Bases(S3 Vectors または OpenSearch Serverless)を Terraform に追加し、`bedrock.ts` の前段で `Retrieve` した断片を system/user に挿入する。IAM に `bedrock:Retrieve`、運用部品(同期ジョブ)が増える点に注意。
