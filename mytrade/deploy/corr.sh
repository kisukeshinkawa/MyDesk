#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# MyTrade: 連動性(相関)を売買に使うと成績が上がるかを検証・確認する
#   bash deploy/corr.sh                 結果を見る(まだなら状況を表示)
#   bash deploy/corr.sh run             検証を開始(10〜15分・裏で走る)
#   bash deploy/corr.sh apply           効いた設定を自動売買に反映
#
#   bash deploy/corr.sh verify          「たまたま効いただけ」でないかを確認(15〜25分)
#   bash deploy/corr.sh verified        その結果を見る
#   bash deploy/corr.sh apply-verified  すべての設定で効いたものだけを反映
#   bash deploy/corr.sh reset           相関の設定を全部オフに戻す
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

start_job() {
  aws lambda invoke --function-name "$FUNC" --region "$REGION" \
    --invocation-type Event --cli-binary-format raw-in-base64-out \
    --payload "{\"job\":\"$1\"}" /dev/null >/dev/null
}

if [ "$CMD" = "run" ]; then
  start_job corr
  echo "▶ 検証を開始しました(10〜15分)。終わったら: bash deploy/corr.sh"
  exit 0
fi

if [ "$CMD" = "verify" ]; then
  start_job corr-verify
  echo "▶ 4種類の設定で確認を開始しました(15〜25分)。"
  echo "  終わったら: bash deploy/corr.sh verified"
  exit 0
fi

if [ "$CMD" = "reset" ]; then
  call '{"action":"autotrade-config","config":{"maxSameDriver":0,"driverTrend":false,"betaSize":false}}' >/dev/null
  echo "✅ 相関を使った条件をすべてオフに戻しました"
  exit 0
fi

if [ "$CMD" = "verified" ] || [ "$CMD" = "apply-verified" ]; then
  TMPV=$(mktemp); trap 'rm -f "$TMPV"' EXIT
  call '{"action":"corr-verify-latest"}' > "$TMPV"
  if [ "$CMD" = "verified" ]; then
    python3 "$HERE/_corr_verify_show.py" "$TMPV"
    exit 0
  fi
  CFG=$(python3 "$HERE/_corr_verify_show.py" "$TMPV" apply)
  case "$CFG" in
    NOTREADY) echo "✗ まだ確認結果がありません。先に: bash deploy/corr.sh verify"; exit 1 ;;
    NOGAIN)   echo "▶ すべての設定で効いた仕組みはありませんでした。"
              echo "  1つの設定でだけ効いたものは偶然の可能性が高いので、採用しません。"
              echo "  すでに入れている設定を戻すなら: bash deploy/corr.sh reset"; exit 0 ;;
  esac
  echo "▶ すべての設定で効いた仕組みを反映します: $CFG"
  call "{\"action\":\"autotrade-config\",\"config\":$CFG}" >/dev/null
  echo "✅ 反映しました。次の自動売買(毎時05分)から適用されます"
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
