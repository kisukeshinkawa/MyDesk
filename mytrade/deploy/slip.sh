#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# MyTrade: 約定のズレをいくら見込むと指数への優位が消えるかを測る
#   bash deploy/slip.sh       結果を見る
#   bash deploy/slip.sh run   検証を開始(20分ほど・裏で走る)
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
  RG="${2:-off}"
  aws lambda invoke --function-name "$FUNC" --region "$REGION" \
    --invocation-type Event --cli-binary-format raw-in-base64-out \
    --payload "{\"job\":\"slippage\",\"regime\":\"${RG}\"}" /dev/null >/dev/null
  echo "▶ 約定コストの検証を開始しました(地合い判定=${RG}・20分ほど)。"
  echo "  終わったら: bash deploy/slip.sh"
  exit 0
fi

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
# --max-time を必ず付ける(応答待ちで固まらないように)
curl -s -X POST "$URL" -H "content-type: application/json" \
  -H "x-mydesk-secret: $SECRET" --max-time 120 \
  -d '{"action":"slippage-latest"}' > "$TMP"

python3 "$HERE/_slip_show.py" "$TMP"
