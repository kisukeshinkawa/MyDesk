#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# MyTrade: 分析Lambdaをデプロイ(作成 or 更新)
#   使い方:  bash deploy/01-deploy-lambda.sh
#   前提:    aws configure 済み / python3 と zip が使えること
# ─────────────────────────────────────────────────────────────
set -euo pipefail

REGION="${REGION:-ap-northeast-1}"
FUNC="${FUNC:-mytrade-analysis}"
BUCKET="${BUCKET:-mydesk-files-dustalk-1777302196}"   # 既存のMyDesk用S3(キャッシュ/学習データ置き場も兼ねる)
ROLE_NAME="${ROLE_NAME:-mytrade-analysis-role}"
SECRET="${SECRET:-mydesk2026secret}"
BEDROCK_MODEL="${BEDROCK_MODEL:-anthropic.claude-3-haiku-20240307-v1:0}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"

echo "▶ リージョン: $REGION / 関数名: $FUNC"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "▶ AWSアカウント: $ACCOUNT_ID"

# ── 1. 実行ロール(なければ作成) ─────────────────────────────
if ! aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  echo "▶ IAMロールを作成: $ROLE_NAME"
  aws iam create-role --role-name "$ROLE_NAME" \
    --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
    >/dev/null
  aws iam attach-role-policy --role-name "$ROLE_NAME" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name mytrade-s3-bedrock \
    --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[
      {\"Effect\":\"Allow\",\"Action\":[\"s3:GetObject\",\"s3:PutObject\"],\"Resource\":\"arn:aws:s3:::$BUCKET/*\"},
      {\"Effect\":\"Allow\",\"Action\":[\"bedrock:InvokeModel\",\"bedrock:ListFoundationModels\",\"bedrock:ListInferenceProfiles\"],\"Resource\":\"*\"}]}"
  echo "▶ ロール反映待ち(10秒)..."; sleep 10
else
  echo "▶ IAMロールは既存のものを使用: $ROLE_NAME (ポリシーを最新化)"
  aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name mytrade-s3-bedrock \
    --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[
      {\"Effect\":\"Allow\",\"Action\":[\"s3:GetObject\",\"s3:PutObject\"],\"Resource\":\"arn:aws:s3:::$BUCKET/*\"},
      {\"Effect\":\"Allow\",\"Action\":[\"bedrock:InvokeModel\",\"bedrock:ListFoundationModels\",\"bedrock:ListInferenceProfiles\"],\"Resource\":\"*\"}]}"
fi
ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query Role.Arn --output text)

# ── 2. yfinanceレイヤー(初回のみ・約2〜5分) ──────────────────
LAYER_ARN=$(aws lambda list-layer-versions --layer-name mytrade-yfinance --region "$REGION" \
  --query 'LayerVersions[0].LayerVersionArn' --output text 2>/dev/null || echo "None")
if [ "$LAYER_ARN" = "None" ] || [ -z "$LAYER_ARN" ]; then
  echo "▶ yfinanceレイヤーを作成中(数分かかります)..."
  TMP=$(mktemp -d); mkdir -p "$TMP/python"
  python3 -m pip install yfinance -t "$TMP/python" \
    --platform manylinux2014_x86_64 --only-binary=:all: --python-version 3.12 -q
  (cd "$TMP" && zip -qr layer.zip python)
  echo "▶ レイヤーzipをS3経由でアップロード..."
  aws s3 cp "$TMP/layer.zip" "s3://$BUCKET/mytrade-deploy/yfinance-layer.zip" --region "$REGION"
  LAYER_ARN=$(aws lambda publish-layer-version --layer-name mytrade-yfinance \
    --content "S3Bucket=$BUCKET,S3Key=mytrade-deploy/yfinance-layer.zip" \
    --compatible-runtimes python3.12 --region "$REGION" \
    --query LayerVersionArn --output text)
  rm -rf "$TMP"
  echo "▶ レイヤー作成完了: $LAYER_ARN"
else
  echo "▶ 既存レイヤーを使用: $LAYER_ARN"
fi

# ── 3. 関数コードをzip ───────────────────────────────────────
TMPZ=$(mktemp -d)
cp "$HERE/lambda/lambda_function.py" "$TMPZ/"
(cd "$TMPZ" && zip -q function.zip lambda_function.py)

ENVVARS="Variables={MYDESK_SECRET=$SECRET,S3_BUCKET=$BUCKET,BEDROCK_MODEL_ID=$BEDROCK_MODEL,BEDROCK_REGION=$REGION}"

if aws lambda get-function --function-name "$FUNC" --region "$REGION" >/dev/null 2>&1; then
  echo "▶ 既存関数を更新..."
  aws lambda update-function-code --function-name "$FUNC" \
    --zip-file "fileb://$TMPZ/function.zip" --region "$REGION" >/dev/null
  aws lambda wait function-updated --function-name "$FUNC" --region "$REGION"
  aws lambda update-function-configuration --function-name "$FUNC" \
    --timeout 900 --memory-size 2048 --layers "$LAYER_ARN" \
    --environment "$ENVVARS" --region "$REGION" >/dev/null
else
  echo "▶ 関数を新規作成..."
  aws lambda create-function --function-name "$FUNC" \
    --runtime python3.12 --handler lambda_function.lambda_handler \
    --role "$ROLE_ARN" --zip-file "fileb://$TMPZ/function.zip" \
    --timeout 900 --memory-size 2048 --layers "$LAYER_ARN" \
    --environment "$ENVVARS" --region "$REGION" >/dev/null
fi
aws lambda wait function-updated --function-name "$FUNC" --region "$REGION"
rm -rf "$TMPZ"

# ── 4. Function URL(なければ作成) ───────────────────────────
if ! aws lambda get-function-url-config --function-name "$FUNC" --region "$REGION" >/dev/null 2>&1; then
  echo "▶ Function URLを作成..."
  aws lambda create-function-url-config --function-name "$FUNC" \
    --auth-type NONE --region "$REGION" >/dev/null
fi
# 公開URLからの呼び出しには InvokeFunctionUrl と InvokeFunction の両方が必要
# (片方だけだとURL経由が Forbidden になる。既存のmydesk-apiも両方持っている)
aws lambda add-permission --function-name "$FUNC" --statement-id FunctionURLAllowPublicAccess \
  --action lambda:InvokeFunctionUrl --principal '*' --function-url-auth-type NONE \
  --region "$REGION" >/dev/null 2>&1 || echo "  (InvokeFunctionUrl権限は設定済み)"
aws lambda add-permission --function-name "$FUNC" --statement-id PublicInvokeFunction \
  --action lambda:InvokeFunction --principal '*' \
  --region "$REGION" >/dev/null 2>&1 || echo "  (InvokeFunction権限は設定済み)"
echo "▶ 権限の反映待ち(10秒)..."; sleep 10
URL=$(aws lambda get-function-url-config --function-name "$FUNC" --region "$REGION" --query FunctionUrl --output text)

echo ""
echo "════════════════════════════════════════════════"
echo "✅ Lambdaデプロイ完了"
echo "   Function URL: $URL"
echo "════════════════════════════════════════════════"
echo ""
echo "▶ 動作確認(地合い取得):"
curl -s -X POST "$URL" -H "content-type: application/json" \
  -H "x-mydesk-secret: $SECRET" -d '{"action":"market"}' | head -c 400
echo ""
echo ""
echo "次: このURLを使ってフロントをデプロイ"
echo "  bash deploy/02-deploy-frontend.sh $URL"
