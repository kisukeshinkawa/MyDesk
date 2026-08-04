# mydesk-stock-analysis デプロイ手順

国内株・米国株のプロトレーダー分析Lambda。フロントの「📈 株式」タブから呼び出す。

## 1. Lambda作成（AWSコンソール / ap-northeast-1）

- 関数名: `mydesk-stock-analysis`
- ランタイム: **Python 3.12** / アーキテクチャ: x86_64
- メモリ: **1024MB** / タイムアウト: **5分**（brain・batch用）
- コード: この `lambda_function.py` を貼り付けて Deploy

## 2. yfinanceレイヤー（pandas同梱・必須）

CloudShell等で作成:

```bash
mkdir -p python
pip install yfinance -t python/ --platform manylinux2014_x86_64 --only-binary=:all: --python-version 3.12
zip -r yfinance-layer.zip python
aws lambda publish-layer-version --layer-name yfinance \
  --zip-file fileb://yfinance-layer.zip --compatible-runtimes python3.12 \
  --region ap-northeast-1
```

→ 出力されたレイヤーARNを関数に追加。
（zipが50MB超の場合はS3経由: `aws s3 cp` してから `--content s3://...`）

## 3. 環境変数

| キー | 値 | 備考 |
|---|---|---|
| `MYDESK_SECRET` | `mydesk2026secret` | 既存と同じ |
| `S3_BUCKET` | `mydesk-files-dustalk-1777302196` | キャッシュ保存先（stock-cache/配下） |
| `BEDROCK_MODEL_ID` | `anthropic.claude-3-haiku-20240307-v1:0` | 精度を上げるならSonnet系に変更 |
| `BEDROCK_REGION` | `ap-northeast-1` | |

## 4. 実行ロール権限

- `AmazonS3FullAccess`相当（最低限 `mydesk-files-dustalk-1777302196/stock-cache/*` のGet/Put）
- `bedrock:InvokeModel`（email-ai-analyzeと同じポリシーでOK）

## 5. Function URL

- 認証タイプ: NONE（アプリ側で x-mydesk-secret 検証）
- CORS: 有効化不要（コード内でヘッダー返却）
- 発行されたURLをMyDeskの「📈 株式」タブ初回画面に貼り付けて保存（localStorageに保存される。恒久化するなら dashboard.jsx の `STOCK_API_URL` に直書き）

## 6. 動作確認

```bash
URL=https://xxxx.lambda-url.ap-northeast-1.on.aws/
# 地合い
curl -s -X POST $URL -H "content-type: application/json" -H "x-mydesk-secret: mydesk2026secret" \
  -d '{"action":"market"}' | head -c 500
# トヨタ分析
curl -s -X POST $URL -H "content-type: application/json" -H "x-mydesk-secret: mydesk2026secret" \
  -d '{"action":"analyze","ticker":"7203.T"}' | head -c 800
# プロトレーダー脳（Bedrock使用・30秒前後）
curl -s -X POST $URL -H "content-type: application/json" -H "x-mydesk-secret: mydesk2026secret" \
  -d '{"action":"brain","ticker":"7203.T"}'
# 学習（バックテスト＋答え合わせ＋因子重み最適化＋教訓抽出・1〜2分）
curl -s -X POST $URL -H "content-type: application/json" -H "x-mydesk-secret: mydesk2026secret" \
  -d '{"action":"learn","tickers":["7203.T","AAPL"]}'
# 成績確認
curl -s -X POST $URL -H "content-type: application/json" -H "x-mydesk-secret: mydesk2026secret" \
  -d '{"action":"performance"}'
```

## 学習の仕組み（v334）

1. **予測の自動記録**: analyze/brainのたびに「日付・価格・スコア・判定」をS3(`stock-learn/predictions.json`)へ記録（銘柄×日×種別で1回）
2. **答え合わせ**: 5営業日後・20営業日後の実リターンを自動で書き込み（performance/learn実行時）
3. **因子重み最適化**: 過去2年の週次バックテスト＋実運用実績から、各テクニカル因子と将来リターンの相関(IC)を計算→重み0.5〜1.5倍を`stock-learn/config.json`に保存→以後の短期スコアに自動適用
4. **教訓抽出**: 答え合わせ済みのAI判定をBedrockに渡し「どんな判定が外れやすいか」を教訓化→以後のbrain判定プロンプトに自動注入
5. **自己参照**: brainは判定時に「自分の過去判定の勝率」「その銘柄への過去判定と結果」を見て確信度を調整

定期学習の推奨: EventBridgeで週1回 `{action:"learn"}` を叩くルールを作ると放置で精度が上がっていく（Phase4）。

## 注意

- yfinanceは非公式API。Yahoo側変更で壊れたら `pip install -U yfinance` でレイヤー再作成が第一手。
- Yahooの日本株株価は20分遅延。デイトレではなくスイング〜長期判断用。
- 本機能は投資助言ではない（フロントに免責表示あり）。
