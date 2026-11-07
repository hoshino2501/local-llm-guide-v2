#!/usr/bin/env bash
# web/ を S3 に同期し、CloudFront のキャッシュを無効化する。
set -euo pipefail
cd "$(dirname "$0")/.."
TF="terraform -chdir=infra/terraform output -raw"
BUCKET=$($TF web_bucket)
DIST_ID=$($TF cloudfront_distribution_id)

# HTML は常に再検証、その他は短めのキャッシュ(更新は invalidation で即時反映)
aws s3 sync web/ "s3://$BUCKET/" --delete --exclude "*.html" \
  --cache-control "public, max-age=300"
aws s3 sync web/ "s3://$BUCKET/" --exclude "*" --include "*.html" \
  --cache-control "no-cache"
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*" >/dev/null
echo "deployed: $($TF site_url)"
