#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# MyTrade: 全自動運用のスケジュール設定(EventBridge)
#   ① 毎朝 7:00 JST  朝レポート(全銘柄スキャン+予測の答え合わせ)
#   ② 毎朝 7:30 JST  自動学習(因子重み再学習+教訓更新)
#   ③ 毎朝 7:45 JST  全銘柄ランキングを事前計算(おすすめタブ用)
#   ④ 毎朝 7:50 JST  プロトレーダー視点(相場観+狙い目)を生成
#   ⑤ 毎月1日 8:00   長期ウォークフォワード再検証(25年・重み自動反映)
#   使い方: bash deploy/03-setup-schedule.sh
# ─────────────────────────────────────────────────────────────
set -euo pipefail
REGION="${REGION:-ap-northeast-1}"
FUNC="${FUNC:-mytrade-analysis}"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
FUNC_ARN="arn:aws:lambda:$REGION:$ACCOUNT_ID:function:$FUNC"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

setup_rule () {
  local RULE="$1" CRON="$2" DESC="$3" INPUT="$4"
  echo "▶ $RULE ($DESC)"
  aws events put-rule --name "$RULE" --schedule-expression "$CRON" \
    --description "$DESC" --region "$REGION" >/dev/null
  aws lambda add-permission --function-name "$FUNC" --statement-id "${RULE}-invoke" \
    --action lambda:InvokeFunction --principal events.amazonaws.com \
    --source-arn "arn:aws:events:$REGION:$ACCOUNT_ID:rule/$RULE" \
    --region "$REGION" >/dev/null 2>&1 || true
  if [ -n "$INPUT" ]; then
    printf '[{"Id":"1","Arn":"%s","Input":%s}]' "$FUNC_ARN" "$(printf '%s' "$INPUT" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')" > "$TMP/t.json"
  else
    printf '[{"Id":"1","Arn":"%s"}]' "$FUNC_ARN" > "$TMP/t.json"
  fi
  aws events put-targets --rule "$RULE" --region "$REGION" --targets "file://$TMP/t.json" >/dev/null
}

setup_rule "mytrade-morning"  "cron(0 22 * * ? *)"  "MyTrade 朝レポート(スキャン+答え合わせ)" ""
setup_rule "mytrade-learn"    "cron(30 22 * * ? *)" "MyTrade 毎日の自動学習(重み+教訓)" '{"job":"learn"}'
setup_rule "mytrade-ranking"  "cron(45 22 * * ? *)" "MyTrade 全銘柄ランキングの事前計算" '{"job":"ranking"}'
setup_rule "mytrade-brief"    "cron(50 22 * * ? *)" "MyTrade プロトレーダー視点の日次生成" '{"job":"brief"}'
setup_rule "mytrade-auto"     "cron(0 23 * * ? *)"  "MyTrade AI自動デモ売買" '{"job":"autotrade"}'
setup_rule "mytrade-backtest" "cron(0 23 1 * ? *)"  "MyTrade 月次の長期再検証(25年WF)" '{"job":"backtest","years":25}'

echo ""
echo "════════════════════════════════════════════════"
echo "✅ 全自動運用の設定完了"
echo "   07:00 JST 毎日  朝レポート(スキャン+答え合わせ)"
echo "   07:30 JST 毎日  自動学習(過去10年+実績で因子重みと教訓を更新)"
echo "   07:45 JST 毎日  全銘柄ランキング事前計算(約400銘柄)"
echo "   07:50 JST 毎日  プロトレーダー視点を生成(ホームに常時表示)"
echo "   08:00 JST 毎日  AI自動デモ売買(有効化した場合のみ)"
echo "   08:00 JST 毎月1日 長期再検証(25年ウォークフォワード)"
echo "════════════════════════════════════════════════"
echo ""
echo "▶ 今すぐ学習を1回テスト実行(2〜3分)..."
aws lambda invoke --function-name "$FUNC" --region "$REGION" \
  --cli-binary-format raw-in-base64-out --payload '{"job":"learn"}' \
  "$TMP/out.json" >/dev/null
python3 -c "
import json,sys
d=json.load(open('$TMP/out.json'))
b=json.loads(d.get('body','{}')) if isinstance(d.get('body'),str) else d
if d.get('statusCode')==200:
    print('✅ 学習成功:', b.get('backtestSamples',0), 'サンプル / 重み', b.get('factor_weights'))
    print('   教訓:', len(b.get('lessons') or []), '件')
else:
    print('⚠️ 学習でエラー:', b)
"
echo ""
echo "停止したい時: aws events disable-rule --name mytrade-learn --region $REGION"
