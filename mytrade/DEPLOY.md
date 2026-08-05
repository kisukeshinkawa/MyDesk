# MyTrade デプロイ手順（ターミナルから完結）

Macのターミナルで3つのコマンドを順に実行するだけです。GitHub連携もAWSコンソール操作も不要。

## 0. 準備（初回のみ）

```bash
# AWS CLI が入っているか確認（なければ https://aws.amazon.com/jp/cli/ からインストール）
aws --version

# 認証設定（アクセスキーを入力。リージョンは ap-northeast-1、出力形式は json）
aws configure

# 設定できたか確認（アカウントID 967380192450 が出ればOK）
aws sts get-caller-identity
```

リポジトリをクローンして mytrade へ移動:

```bash
git clone https://github.com/kisukeshinkawa/MyDesk.git
cd MyDesk/mytrade
```

## 1. 分析Lambdaをデプロイ（初回5〜8分／2回目以降は30秒）

```bash
bash deploy/01-deploy-lambda.sh
```

やってくれること: IAMロール作成 → yfinanceレイヤー作成 → Lambda作成/更新 → Function URL発行 → 動作確認のcurl実行。

最後に表示される **Function URL** をコピーしてください（`https://xxxx.lambda-url.ap-northeast-1.on.aws/`）。

## 2. フロントをデプロイ（2〜3分）

```bash
bash deploy/02-deploy-frontend.sh https://xxxx.lambda-url.ap-northeast-1.on.aws/
```

↑ 1で表示されたURLを貼り付けて実行。ビルド時にURLが埋め込まれるので、アプリを開いたらすぐ使えます。

最後に表示される `https://main.xxxxx.amplifyapp.com` がMyTradeのURLです。

## 3. 毎朝の自動レポート＋自動学習を設定（10秒・任意）

```bash
bash deploy/03-setup-schedule.sh
```

毎朝7時（JST）に全銘柄スキャン・アラート生成・予測の答え合わせが自動実行され、月曜は週次学習（因子重み最適化＋教訓更新）まで走ります。

## 更新するとき

コードを直したら、変更した側だけ再実行すればOKです。

```bash
git pull
bash deploy/01-deploy-lambda.sh                      # Lambdaを直した時
bash deploy/02-deploy-frontend.sh <Function URL>     # 画面を直した時
```

## カスタマイズ（環境変数で上書き可）

```bash
REGION=ap-northeast-1 \
FUNC=mytrade-analysis \
APP_NAME=mytrade \
BEDROCK_MODEL=anthropic.claude-3-5-sonnet-20241022-v2:0 \
bash deploy/01-deploy-lambda.sh
```

`BEDROCK_MODEL` をSonnet系にすると、AI判定の質が上がります（コストは上がります）。

## つまずいた時

| 症状 | 対処 |
|---|---|
| `AccessDenied` / `not authorized` | IAMユーザーに Lambda・IAM・S3・Amplify・EventBridge の権限が必要。管理者権限のキーで実行するのが早い |
| レイヤー作成でpipエラー | Mac標準のpython3が古い可能性。`python3 --version` が3.9以上か確認 |
| `curl` の動作確認で `{"error":...}` | Bedrockのモデルアクセスが未有効。AWSコンソール → Bedrock → モデルアクセス で Claude を有効化 |
| AI生成が `Legacy` / `Access denied` | v8で自動復旧します(使えるモデルを自動探索して切替・記憶)。使えるモデルの確認は `{"action":"models"}` |
| curlが `Forbidden` | Function URLの権限不足。スクリプトv2で自動対応済みだが、手動なら `aws lambda add-permission --function-name mytrade-analysis --statement-id PublicInvokeFunction --action lambda:InvokeFunction --principal "*" --region ap-northeast-1` |
| Amplifyデプロイが FAILED | `aws amplify get-job --app-id <ID> --branch-name main --job-id <JOB>` でログ確認 |
| 株価が取得できない | yfinance側の仕様変更。`aws lambda delete-layer-version` でレイヤーを消して 01 を再実行（最新版が入る） |

## 作られるAWSリソース

| リソース | 名前 | 費用の目安 |
|---|---|---|
| Lambda関数 | `mytrade-analysis` | 実行時間課金。個人利用なら月数十円 |
| Lambdaレイヤー | `mytrade-yfinance` | 無料 |
| IAMロール | `mytrade-analysis-role` | 無料 |
| Amplifyアプリ | `mytrade` | 月1GB転送まで実質無料枠 |
| EventBridgeルール | `mytrade-morning` | 無料 |
| S3（既存を利用） | `mydesk-files-dustalk-1777302196` の `stock-cache/`,`stock-learn/` | 数円 |

Bedrock（AI判定）のみ従量課金。Haikuなら1回の分析で0.1円未満です。
