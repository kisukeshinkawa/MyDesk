#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# MyTrade: フロントをAmplify Hostingへデプロイ(GitHub連携なしの直接アップロード)
#   使い方:  bash deploy/02-deploy-frontend.sh <LambdaのFunction URL>
#   前提:    aws configure 済み / node,npm が使えること
# ─────────────────────────────────────────────────────────────
set -euo pipefail

REGION="${REGION:-ap-northeast-1}"
APP_NAME="${APP_NAME:-mytrade}"
BRANCH="${BRANCH:-main}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
API_URL="${1:-}"

cd "$HERE"

# ── 1. ビルド(Function URLを埋め込む) ───────────────────────
if [ -n "$API_URL" ]; then
  echo "▶ API URLを埋め込んでビルド: $API_URL"
  export VITE_STOCK_API_URL="$API_URL"
else
  echo "▶ API URL未指定(アプリ初回画面で貼り付ける方式でビルド)"
fi
npm install --silent
npm run build

# ── 2. Amplifyアプリ(なければ作成) ──────────────────────────
APP_ID=$(aws amplify list-apps --region "$REGION" \
  --query "apps[?name=='$APP_NAME'].appId | [0]" --output text 2>/dev/null || echo "None")
if [ "$APP_ID" = "None" ] || [ -z "$APP_ID" ]; then
  echo "▶ Amplifyアプリを作成: $APP_NAME"
  APP_ID=$(aws amplify create-app --name "$APP_NAME" --region "$REGION" \
    --query app.appId --output text)
else
  echo "▶ 既存のAmplifyアプリを使用: $APP_ID"
fi

if ! aws amplify get-branch --app-id "$APP_ID" --branch-name "$BRANCH" --region "$REGION" >/dev/null 2>&1; then
  echo "▶ ブランチを作成: $BRANCH"
  aws amplify create-branch --app-id "$APP_ID" --branch-name "$BRANCH" --region "$REGION" >/dev/null
fi

# ── 3. dist/ をzipしてアップロード ──────────────────────────
echo "▶ dist/ をアップロード中..."
TMP=$(mktemp -d)
(cd dist && zip -qr "$TMP/site.zip" .)
read -r JOB_ID UPLOAD_URL < <(aws amplify create-deployment --app-id "$APP_ID" \
  --branch-name "$BRANCH" --region "$REGION" \
  --query '[jobId,zipUploadUrl]' --output text)
curl -s -H "Content-Type: application/zip" --upload-file "$TMP/site.zip" "$UPLOAD_URL"
aws amplify start-deployment --app-id "$APP_ID" --branch-name "$BRANCH" \
  --job-id "$JOB_ID" --region "$REGION" >/dev/null
rm -rf "$TMP"

echo "▶ デプロイ反映待ち..."
for i in $(seq 1 40); do
  ST=$(aws amplify get-job --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$JOB_ID" \
    --region "$REGION" --query job.summary.status --output text 2>/dev/null || echo PENDING)
  [ "$ST" = "SUCCEED" ] && break
  if [ "$ST" = "FAILED" ]; then echo "❌ デプロイ失敗(Amplifyコンソールでログ確認)"; exit 1; fi
  sleep 5
done

echo ""
echo "════════════════════════════════════════════════"
echo "✅ フロントデプロイ完了"
echo "   URL: https://$BRANCH.$APP_ID.amplifyapp.com"
echo "════════════════════════════════════════════════"
