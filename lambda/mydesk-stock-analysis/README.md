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
# 10年ウォークフォワード検証（2〜4分。apply:trueで検証済み重みを本番に反映）
curl -s -X POST $URL -H "content-type: application/json" -H "x-mydesk-secret: mydesk2026secret" \
  -d '{"action":"backtest","years":10,"apply":true}'
```

## 10年バックテスト（v335）

- `backtest_universe`: ベクトル化した指標計算（rolling/ewmは当日以前のデータのみ参照＝先読みバイアスなし。従来のスライス方式とスコア完全一致を合成データで検証済み）で、10年×20銘柄を週次サンプリング（約2〜4分で完走）
- **ウォークフォワード検証**: 期間の前70%で因子重みを学習→後30%の未知データで精度測定。表示される勝率は「学習に使っていない期間」の成績なので過学習の水増しがない
- **地合いフィルタ**: 指数（日経平均/S&P500）が200日線割れの局面では買いシグナルを「保留」に自動格下げ（バックテストで有無の成績比較を表示）
- 重みICは対指数**超過リターン**で計算（地合いに依存しない銘柄選択力を学習）
- 銘柄未指定時は日米主力20銘柄（DEFAULT_UNIVERSE）で検証
- `apply:true` で検証済み重みが `stock-learn/config.json` に保存され、以後の本番スコアに自動適用

## 学習の仕組み（v334）

1. **予測の自動記録**: analyze/brainのたびに「日付・価格・スコア・判定」をS3(`stock-learn/predictions.json`)へ記録（銘柄×日×種別で1回）
2. **答え合わせ**: 5営業日後・20営業日後の実リターンを自動で書き込み（performance/learn実行時）
3. **因子重み最適化**: 過去2年の週次バックテスト＋実運用実績から、各テクニカル因子と将来リターンの相関(IC)を計算→重み0.5〜1.5倍を`stock-learn/config.json`に保存→以後の短期スコアに自動適用
4. **教訓抽出**: 答え合わせ済みのAI判定をBedrockに渡し「どんな判定が外れやすいか」を教訓化→以後のbrain判定プロンプトに自動注入
5. **自己参照**: brainは判定時に「自分の過去判定の勝率」「その銘柄への過去判定と結果」を見て確信度を調整

定期学習の推奨: EventBridgeで週1回 `{action:"learn"}` を叩くルールを作ると放置で精度が上がっていく（Phase4）。

## v336追加機能

| action | 内容 |
|---|---|
| `watchlist-get` / `watchlist-set` | ウォッチリストのサーバー保存(3人共有・保有情報`holding:{price,qty}`含む) |
| `screen` | 日米主力65銘柄を短期スコアで一括採点し上位15を返す(`exclude`で登録済み除外、`market`でJP/US絞り込み) |
| `daily-report` / `report-latest` | 朝レポート生成/取得。シグナル変化・保有損益±(利確+20%/損切り-8%)・決算接近を自動アラート |
| `brain`に`holding` | 保有中と伝えると継続/利確/損切りの判断(`position_advice`)を返す |

### 毎朝の自動レポート設定（EventBridge）

1. EventBridgeコンソール → ルール作成 → 名前 `mydesk-stock-morning`
2. スケジュール: cron式 `0 22 * * ? *`（UTC 22:00 = **JST朝7:00**。市場が開く前）
3. ターゲット: Lambda関数 `mydesk-stock-analysis`（入力は既定のままでOK。EventBridge経由の起動を自動判別して朝レポートを実行）
4. メールでも受け取る場合はLambda環境変数を追加:
   - `MAIL_SENDER_URL` = mydesk-mail-senderのFunction URL
   - `REPORT_EMAIL_TO` = k-shinkawa@beetle-ems.com
   - `REPORT_EMAIL_ACCOUNT` = k-shinkawa@beetle-ems.com
   ※送信payloadは`{account,to,subject,body}`で組んである。mail-sender側の実フィールド名と違う場合は`run_daily_report`末尾を合わせて修正
5. 週1回の自動学習も推奨: 同様にルール `mydesk-stock-weekly-learn`（`0 21 ? * SUN *`）→ ただしEventBridge起動は朝レポート固定のため、学習はLambdaテスト実行 or フロントのボタンで実施（自動化したい場合はイベント入力`{"source":"aws.events","learn":true}`の分岐を追加）

## 注意

- yfinanceは非公式API。Yahoo側変更で壊れたら `pip install -U yfinance` でレイヤー再作成が第一手。
- Yahooの日本株株価は20分遅延。デイトレではなくスイング〜長期判断用。
- 本機能は投資助言ではない（フロントに免責表示あり）。
