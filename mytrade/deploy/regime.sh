#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# MyTrade: 地合いフィルターを差し替えて指数に勝てるかを検証する
#   bash deploy/regime.sh        結果を見る
#   bash deploy/regime.sh run    検証を開始(20分ほど・裏で走る)
#   bash deploy/regime.sh apply  全期間で指数を上回った判定だけを実運用に入れる
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
    --payload '{"job":"regime"}' /dev/null >/dev/null
  echo "▶ 地合いフィルターの検証を開始しました(20分ほど)。"
  echo "  終わったら: bash deploy/regime.sh"
  exit 0
fi

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
# --max-time を必ず付ける(応答待ちで固まらないように)
curl -s -X POST "$URL" -H "content-type: application/json" \
  -H "x-mydesk-secret: $SECRET" --max-time 120 \
  -d '{"action":"regime-latest"}' > "$TMP"

if [ "$CMD" = "apply" ]; then
  MODE=$(python3 -c '
import json,sys
d=json.load(open(sys.argv[1]))
b=d.get("best")
print(b["mode"] if b else "NONE")' "$TMP")
  if [ "$MODE" = "NONE" ]; then
    echo "▶ 全期間で指数を上回った地合い判定はありませんでした。設定は変更しません。"
    exit 0
  fi
  curl -s -X POST "$URL" -H "content-type: application/json" \
    -H "x-mydesk-secret: $SECRET" --max-time 60 \
    -d "{\"action\":\"autotrade-config\",\"config\":{\"regime\":\"$MODE\"}}" >/dev/null
  echo "✅ 地合い判定を $MODE にしました"
  exit 0
fi

python3 "$HERE/_regime_show.py" "$TMP"
