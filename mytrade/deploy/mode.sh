#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# MyTrade: AI自動売買の運用タイプを切り替える
#   使い方:  bash deploy/mode.sh aggressive
#            bash deploy/mode.sh              (今の設定を表示するだけ)
#   タイプ:  safe(安定) / balanced(バランス) / aggressive(積極) / max(最大攻撃)
# ─────────────────────────────────────────────────────────────
set -euo pipefail

REGION="${REGION:-ap-northeast-1}"
FUNC="${FUNC:-mytrade-analysis}"
SECRET="${SECRET:-mydesk2026secret}"
MODE="${1:-}"

URL=$(aws lambda get-function-url-config --function-name "$FUNC" \
  --region "$REGION" --query FunctionUrl --output text)

# --max-time を必ず付ける(応答待ちで固まらないように)
call() {
  curl -s -X POST "$URL" -H "content-type: application/json" \
    -H "x-mydesk-secret: $SECRET" --max-time 90 -d "$1"
}

show() {
  python3 -c '
import json,sys
c=(json.load(sys.stdin).get("config") or {})
名={"safe":"安定型","balanced":"バランス型","aggressive":"積極型","max":"最大攻撃型",
    "custom":"個別設定(まぐれを除いて選定)"}
print("  運用タイプ : %s" % 名.get(c.get("tradeMode"),c.get("tradeMode")))
print("  稼働状態   : %s" % ("ON(自動売買中)" if c.get("enabled") else "OFF(停止中)"))
print("  自動追従   : %s" % ("ON(毎月かってに最適化)" if c.get("autoTune") else "OFF(手動で決めた設定を維持)"))
print("  下落の上限 : %s%% (自動追従がこれより深い設定を選ばない歯止め)" % c.get("ddLimit", -45))
地合={"ma200":"指数が200日線の上のときだけ買う(標準)","recovery":"200日線の上か、急落後の回復も拾う",
      "ma50":"指数が50日線の上","off":"地合いを見ない"}
print("  地合い判定 : %s" % 地合.get(c.get("regime","ma200"), c.get("regime")))
print("  買いの基準 : %s点以上 / 確信度%s以上" % (c.get("entryScore"), c.get("minConviction")))
print("  利確目標   : 損切り幅の%s倍" % c.get("rr"))
print("  同時保有   : %s銘柄まで / 1回のリスク %s%%" % (c.get("maxPositions"), c.get("riskPct")))
保有={"trade":"短期(利確目標で降りる)","trend":"長期(200日線を割るまで持つ)"}
print("  保有方針   : %s" % 保有.get(c.get("holdMode"),c.get("holdMode")))
a=c.get("appliedFrom") or {}
if a: print("  検証実績   : 年利%s%% / 最大下落%s%% / 勝率%s%%"
            % (a.get("cagrPct"), a.get("maxDrawdownPct"), a.get("winRate")))
# 売買が無い日はログが増えないので、動いているかは実行時刻で見る
import datetime as _dt
lr=c.get("lastRunAt")
if lr:
    try:
        t=_dt.datetime.fromisoformat(lr.replace("Z","+00:00"))
        m=(_dt.datetime.now(_dt.timezone.utc)-t).total_seconds()/60
        mark="⚠️ 2時間以上止まっています" if m>150 else "正常(毎時05分に自動チェック)"
        when = t.astimezone().strftime("%m/%d %H:%M")
        ago = ("%.0f分前" % m) if m < 60 else ("%.1f時間前" % (m / 60))
        print("  最終チェック : " + when + " (" + ago + ") " + mark)
    except Exception: print("  最終チェック : %s" % lr)
else:
    print("  最終チェック : まだ一度も実行されていません")
'
}

if [ -z "$MODE" ]; then
  echo "▶ 現在のAI自動売買の設定"
  call '{"action":"autotrade"}' | show
  echo ""
  echo "変えるには: bash deploy/mode.sh aggressive"
  echo "  safe=安定 / balanced=バランス / aggressive=積極 / max=最大攻撃"
  exit 0
fi

case "$MODE" in
  safe|balanced|aggressive|max) ;;
  *) echo "✗ タイプは safe / balanced / aggressive / max のどれかです"; exit 1 ;;
esac

echo "▶ 運用タイプを $MODE に切り替えます..."
RES=$(call "{\"action\":\"trade-mode\",\"mode\":\"$MODE\",\"enable\":true}")

if echo "$RES" | grep -q '"error"'; then
  echo "$RES" | python3 -c 'import json,sys; print("✗ " + json.load(sys.stdin).get("error",""))'
  echo ""
  echo "「先に条件の比較」と出た場合は、720通りの検証をまず回してください(15分ほど):"
  echo "  aws lambda invoke --function-name $FUNC --region $REGION \\"
  echo "    --invocation-type Event --cli-binary-format raw-in-base64-out \\"
  echo "    --payload '{\"job\":\"optimize\"}' /dev/null"
  exit 1
fi

echo "$RES" | python3 -c 'import json,sys; print("\n" + json.load(sys.stdin).get("note","") + "\n")'
echo "▶ 適用後の設定"
echo "$RES" | show
echo ""
echo "✅ 完了。以降は毎時05分に、この設定でAIが自動で売買します。"
