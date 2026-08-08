#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# MyTrade: 条件の一括比較(optimize)を実行・確認する
#   bash deploy/grid.sh        結果を見る(まだなら状況を表示)
#   bash deploy/grid.sh run    比較を開始(20分ほど・裏で走る)
#   bash deploy/grid.sh best         まぐれを除いた「実運用向けの設定」を選ぶ
#   bash deploy/grid.sh apply-best   その設定を自動売買に入れる(次点は apply-best 1)
#   bash deploy/grid.sh dd-limit -45 耐えられる最大下落を決める(自動追従の歯止め)
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

if [ "$CMD" = "apply-best" ]; then
  IDX="${2:-0}"; DD="${3:--40}"
  curl -s -X POST "$URL" -H "content-type: application/json" \
    -H "x-mydesk-secret: $SECRET" --max-time 120 \
    -d "{\"action\":\"apply-recommended\",\"index\":$IDX,\"maxDrawdown\":$DD}" \
    | python3 -c '
import json,sys
d=json.load(sys.stdin)
if d.get("error"): print("✗ "+str(d["error"])); raise SystemExit(1)
c=d["config"]
print("✅ 設定しました")
print()
print("  買い%s点以上 / 利確%s倍 / %s銘柄まで / 1回のリスク%s%%"
      % (c.get("entryScore"), c.get("rr"), c.get("maxPositions"), c.get("riskPct")))
print()
print("  " + d.get("note",""))
print()
print("次の自動売買(毎時05分)から適用されます。")
'
  exit 0
fi

if [ "$CMD" = "dd-limit" ]; then
  V="${2:-}"
  if [ -z "$V" ]; then echo "使い方: bash deploy/grid.sh dd-limit -45"; exit 1; fi
  curl -s -X POST "$URL" -H "content-type: application/json" \
    -H "x-mydesk-secret: $SECRET" --max-time 60 \
    -d "{\"action\":\"autotrade-config\",\"config\":{\"ddLimit\":$V}}" >/dev/null
  echo "✅ 耐えられる最大下落を ${V}% に設定しました"
  echo "  自動追従がこれより深い設定を選ぶことはなくなります"
  exit 0
fi

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
# --max-time を必ず付ける(応答待ちで固まらないように)
curl -s -X POST "$URL" -H "content-type: application/json" \
  -H "x-mydesk-secret: $SECRET" --max-time 120 \
  -d '{"action":"optimize-latest"}' > "$TMP"

python3 "$HERE/_grid_show.py" "$TMP"
