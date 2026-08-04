#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# MyTrade: 毎朝7時(JST)の自動レポート+自動学習をEventBridgeで設定
#   使い方:  bash deploy/03-setup-schedule.sh
# ─────────────────────────────────────────────────────────────
set -euo pipefail
REGION="${REGION:-ap-northeast-1}"
FUNC="${FUNC:-mytrade-analysis}"
RULE="${RULE:-mytrade-morning}"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
FUNC_ARN="arn:aws:lambda:$REGION:$ACCOUNT_ID:function:$FUNC"

echo "▶ ルールを作成/更新: $RULE (毎日 UTC22:00 = JST朝7:00)"
aws events put-rule --name "$RULE" --schedule-expression "cron(0 22 * * ? *)" \
  --description "MyTrade 朝レポート+週次自動学習" --region "$REGION" >/dev/null

aws lambda add-permission --function-name "$FUNC" --statement-id "${RULE}-invoke" \
  --action lambda:InvokeFunction --principal events.amazonaws.com \
  --source-arn "arn:aws:events:$REGION:$ACCOUNT_ID:rule/$RULE" \
  --region "$REGION" >/dev/null 2>&1 || echo "  (権限は設定済み)"

aws events put-targets --rule "$RULE" --region "$REGION" \
  --targets "Id=1,Arn=$FUNC_ARN" >/dev/null

echo "✅ 設定完了: 毎朝7時(JST)に全銘柄スキャン+答え合わせ、月曜は週次学習も自動実行"
echo "   停止する場合: aws events disable-rule --name $RULE --region $REGION"
