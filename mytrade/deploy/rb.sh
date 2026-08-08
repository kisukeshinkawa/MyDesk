#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# MyTrade: 月次リバランス方式が指数に勝てるかを検証する
#   bash deploy/rb.sh       結果を見る
#   bash deploy/rb.sh run   検証を開始(20分ほど・裏で走る)
# ─────────────────────────────────────────────────────────────
set -euo pipefail

REGION="${REGION:-ap-northeast-1}"
FUNC="${FUNC:-mytrade-analysis}"
SECRET="${SECRET:-mydesk2026secret}"
HERE="$(cd "$(dirname "$0")" && pwd)"
CMD="${1:-show}"

URL=$(aws lambda get-function-url-config --function-name "$FUNC" \
  --region "$REGION" --query FunctionUrl --output text)

if [ "$CMD" = "run" ]; then
  aws lambda invoke --function-name "$FUNC" --region "$REGION" \
    --invocation-type Event --cli-binary-format raw-in-base64-out \
    --payload '{"job":"rebalance"}' /dev/null >/dev/null
  echo "▶ 月次リバランス方式の検証を開始しました(20分ほど)。"
  echo "  終わったら: bash deploy/rb.sh"
  exit 0
fi

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
# --max-time を必ず付ける(応答待ちで固まらないように)
curl -s -X POST "$URL" -H "content-type: application/json" \
  -H "x-mydesk-secret: $SECRET" --max-time 120 \
  -d '{"action":"rebalance-latest"}' > "$TMP"

python3 "$HERE/_rb_show.py" "$TMP"
