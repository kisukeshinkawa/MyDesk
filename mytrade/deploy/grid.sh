#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# MyTrade: 条件の一括比較(optimize)を実行・確認する
#   bash deploy/grid.sh        結果を見る(まだなら状況を表示)
#   bash deploy/grid.sh run    比較を開始(20分ほど・裏で走る)
#   bash deploy/grid.sh best   まぐれを除いた「実運用向けの設定」を選ぶ
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
    --payload '{"job":"optimize"}' /dev/null >/dev/null
  echo "▶ 条件の比較を開始しました(20分ほど)。終わったら: bash deploy/grid.sh"
  exit 0
fi

if [ "$CMD" = "best" ]; then
  # 年利1位は「たまたま当たった条件」の可能性が高い。
  # 周辺の条件(1項目だけ違う設定)も同水準かどうかで安定性を見る
  DD="${2:--40}"
  curl -s -X POST "$URL" -H "content-type: application/json" \
    -H "x-mydesk-secret: $SECRET" --max-time 120 \
    -d "{\"action\":\"recommend\",\"maxDrawdown\":$DD,\"allowLeverage\":false}" \
    | python3 "$HERE/_best_show.py"
  exit 0
fi

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
# --max-time を必ず付ける(応答待ちで固まらないように)
curl -s -X POST "$URL" -H "content-type: application/json" \
  -H "x-mydesk-secret: $SECRET" --max-time 120 \
  -d '{"action":"optimize-latest"}' > "$TMP"

python3 "$HERE/_grid_show.py" "$TMP"
