#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# MyTrade: 連動性(相関)を売買に使うと成績が上がるかを検証・確認する
#   bash deploy/corr.sh          結果を見る(まだなら状況を表示)
#   bash deploy/corr.sh run      検証を開始(10〜15分・裏で走る)
#   bash deploy/corr.sh apply    効いた設定を自動売買に反映
# ─────────────────────────────────────────────────────────────
set -euo pipefail

REGION="${REGION:-ap-northeast-1}"
FUNC="${FUNC:-mytrade-analysis}"
SECRET="${SECRET:-mydesk2026secret}"
HERE="$(cd "$(dirname "$0")" && pwd)"
CMD="${1:-show}"

URL=$(aws lambda get-function-url-config --function-name "$FUNC" \
  --region "$REGION" --query FunctionUrl --output text)

# --max-time を必ず付ける(応答待ちで固まらないように)
call() {
  curl -s -X POST "$URL" -H "content-type: application/json" \
    -H "x-mydesk-secret: $SECRET" --max-time 120 -d "$1"
}

if [ "$CMD" = "run" ]; then
  aws lambda invoke --function-name "$FUNC" --region "$REGION" \
    --invocation-type Event --cli-binary-format raw-in-base64-out \
    --payload '{"job":"corr"}' /dev/null >/dev/null
  echo "▶ 検証を開始しました(10〜15分)。終わったら: bash deploy/corr.sh"
  exit 0
fi

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
call '{"action":"corr-latest"}' > "$TMP"

if [ "$CMD" = "apply" ]; then
  CFG=$(python3 "$HERE/_corr_show.py" "$TMP" apply)
  case "$CFG" in
    NOTREADY) echo "✗ まだ検証結果がありません。先に: bash deploy/corr.sh run"; exit 1 ;;
    NOGAIN)   echo "▶ どの仕組みも基準を上回りませんでした。"
              echo "  効かないものを入れると成績が落ちるので、設定は変更しません。"; exit 0 ;;
  esac
  echo "▶ 効いた設定を反映します: $CFG"
  call "{\"action\":\"autotrade-config\",\"config\":$CFG}" >/dev/null
  echo "✅ 反映しました。次の自動売買(毎時05分)から適用されます"
  exit 0
fi

python3 "$HERE/_corr_show.py" "$TMP"
