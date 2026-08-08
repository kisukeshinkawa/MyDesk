#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# MyTrade: 設定を決めた期間の「外」でも通用するかを検証する
#   bash deploy/wf.sh       結果を見る
#   bash deploy/wf.sh run       検証を開始(20分ほど・裏で走る)
#   bash deploy/wf.sh run off   地合いフィルター無しで検証
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
  # 地合い判定を指定できる(既定は現行の ma200)。off で地合いフィルター無し
  RG="${2:-ma200}"
  aws lambda invoke --function-name "$FUNC" --region "$REGION" \
    --invocation-type Event --cli-binary-format raw-in-base64-out \
    --payload "{\"job\":\"walkforward\",\"regime\":\"$RG\"}" /dev/null >/dev/null
  echo "▶ ウォークフォワード検証を開始しました(地合い判定=$RG・20分ほど)。"
  echo "  終わったら: bash deploy/wf.sh"
  exit 0
fi

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
# --max-time を必ず付ける(応答待ちで固まらないように)
curl -s -X POST "$URL" -H "content-type: application/json" \
  -H "x-mydesk-secret: $SECRET" --max-time 120 \
  -d '{"action":"walkforward-latest"}' > "$TMP"

python3 "$HERE/_wf_show.py" "$TMP"
