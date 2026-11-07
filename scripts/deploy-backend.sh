#!/usr/bin/env bash
# バックエンドをビルドして Terraform で Lambda を更新する。
set -euo pipefail
cd "$(dirname "$0")/.."
(cd backend && npm ci && npm run typecheck && npm test && npm run build)
cd infra/terraform
terraform init -input=false
terraform apply "$@"
