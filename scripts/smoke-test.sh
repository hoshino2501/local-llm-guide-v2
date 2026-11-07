#!/usr/bin/env bash
# 公開後の疎通確認。使い方: scripts/smoke-test.sh [https://example.cloudfront.net]
set -euo pipefail
cd "$(dirname "$0")/.."
URL="${1:-$(terraform -chdir=infra/terraform output -raw site_url)}"
fail=0
check() { if [ "$2" = "$3" ]; then echo "OK   $1"; else echo "FAIL $1 (expected $3, got $2)"; fail=1; fi; }

check "LP"                 "$(curl -s -o /dev/null -w '%{http_code}' "$URL/")" 200
check "chat page"          "$(curl -s -o /dev/null -w '%{http_code}' "$URL/chat/?guide=know")" 200
check "no-slash redirect"  "$(curl -s -o /dev/null -w '%{http_code}' "$URL/chat")" 301

BODY='{"guide":"know","messages":[{"role":"user","content":"Ollamaとは何ですか?一文で。"}]}'
SHA=$(printf '%s' "$BODY" | shasum -a 256 | cut -d' ' -f1)
OUT=$(curl -sN -X POST "$URL/api/chat" -H 'content-type: application/json' -H "x-amz-content-sha256: $SHA" -d "$BODY")
echo "$OUT" | grep -q '"type":"done"' && echo "OK   chat stream" || { echo "FAIL chat stream: $OUT"; fail=1; }

BAD=$(curl -sN -X POST "$URL/api/chat" -H 'content-type: application/json' \
  -H "x-amz-content-sha256: $(printf '%s' '{"guide":"x","messages":[]}' | shasum -a 256 | cut -d' ' -f1)" -d '{"guide":"x","messages":[]}')
echo "$BAD" | grep -q 'invalid_guide' && echo "OK   invalid guide rejected" || { echo "FAIL invalid guide: $BAD"; fail=1; }
exit $fail
