# MyTrade — 投資専用ダッシュボード

MyDeskから分離した独立アプリ。国内株・米国株のプロトレーダー分析(スコアリング/AI判定/学習/ポートフォリオ管理)。

## 構成

- `app.jsx` — フロント全体(React単一ファイル・MyDesk同様の構成)
- `lambda/` — 分析エンジン(AWS Lambda `mydesk-stock-analysis`・デプロイ手順は lambda/README.md)
- `DESIGN.md` — ロジック設計書(v1〜v8の全履歴)

## デプロイ

**→ ターミナルから3コマンドで完結: [DEPLOY.md](./DEPLOY.md) を参照**

```bash
bash deploy/01-deploy-lambda.sh                    # 分析エンジン
bash deploy/02-deploy-frontend.sh <Function URL>   # 画面
bash deploy/03-setup-schedule.sh                   # 毎朝の自動化(任意)
```

<details><summary>GitHub連携で自動デプロイしたい場合(旧手順)</summary>


### 方法A: 専用リポジトリに分離(推奨・完全独立)

1. GitHubで新リポジトリ作成(例: `kisukeshinkawa/MyTrade`)
2. この `mytrade/` フォルダの中身をリポジトリ直下にコピーしてpush
3. AWS Amplifyで新しいアプリを作成→そのリポジトリを接続(ビルド設定は amplify.yml が自動認識)
4. 発行されたURLを開き、初回画面にLambdaのFunction URLを貼り付け

### 方法B: 同一リポジトリのままAmplifyモノレポ設定

1. Amplifyコンソール→新しいアプリ→ kisukeshinkawa/MyDesk を接続
2. 「モノレポ」を有効にして AppRoot に `mytrade` を指定
3. 以降 `mytrade/` 配下の変更だけでMyTradeが自動デプロイされる(MyDeskのAmplifyとは別アプリ)

## バックエンド

Lambda(`mydesk-stock-analysis`)・S3(`stock-cache/`,`stock-learn/`)は変更不要でそのまま使えます。
認証は既存と同じ `x-mydesk-secret` ヘッダー。

## 開発

```bash
cd mytrade
npm install
npm run dev   # http://localhost:5173
```

編集ごとに app.jsx 冒頭の MYTRADE_BUILD を更新し、Babelパースチェックしてからpushすること(MyDeskと同じ運用)。

</details>
