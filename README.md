# ローカルLLM構築ガイド 移行後システム

ChatGPT カスタムGPT(2026-12-11 終了予定)の代替として、LP と 5 つのガイドさん(チャット)を
AWS 上の 1 サイトに集約したシステムです。計画資料: 「ローカルLLM構築ガイド 代替サイト構築計画」。

```
Browser ─▶ CloudFront(+WAF) ─┬─ /*      ─▶ S3 (LP・チャット画面)
                              └─ /api/*  ─▶ Lambda Function URL ─▶ Bedrock ConverseStream
```

| ディレクトリ | 内容 |
|---|---|
| [`web/`](web/) | LP とチャット画面(ビルド不要の静的ファイル、依存ライブラリなし) |
| [`backend/`](backend/) | チャット API(Lambda / Node.js 22 / TypeScript)、ガイド別プロンプト・ナレッジ |
| [`infra/terraform/`](infra/terraform/) | AWS 構成一式(S3 / CloudFront / WAF / Lambda / 監視 / Budgets) |
| [`docs/design/`](docs/design/) | 設計ドキュメント |
| [`docs/operations/`](docs/operations/) | 運用ドキュメント(構築・日常運用・障害対応・切替チェックリスト) |
| [`docs/development-notes.md`](docs/development-notes.md) | 開発メモ(経緯・現状・対応が必要な点) |
| [`scripts/`](scripts/) | デプロイ・疎通確認スクリプト |

## クイックスタート(ローカル確認)

```bash
cd backend && npm install
npm run dev:mock        # http://localhost:8787/ (AWS 不要のモック応答)
npm run dev             # 実 Bedrock に接続(AWS 認証情報と BEDROCK_MODEL_ID が必要)
npm test                # 単体テスト
```

## デプロイ

詳細は [docs/operations/01-deployment.md](docs/operations/01-deployment.md)。

```bash
cp infra/terraform/terraform.tfvars.example infra/terraform/terraform.tfvars   # 編集
scripts/deploy-backend.sh      # backend をビルドして terraform apply
scripts/deploy-web.sh          # web/ を S3 へ同期 + CloudFront 無効化
scripts/smoke-test.sh          # 疎通確認
```

## 公開前に必ずやること

1. **プロンプトの差し替え**: `backend/prompts/*.md` は暫定のダミーです。GPTs の「指示」を移植してください。
2. **ナレッジの配置**: GPTs のナレッジファイルを Markdown にして `backend/knowledge/` へ([README](backend/knowledge/README.md))。
3. **Bedrock モデルアクセスの有効化**と `bedrock_model_id` の確定(日本語の技術質問で品質比較)。
4. 通知先メール・月額上限の設定、LP の文言(運営者表記・問い合わせ先)の確認。
5. [切替チェックリスト](docs/operations/04-cutover-checklist.md)の実施。
