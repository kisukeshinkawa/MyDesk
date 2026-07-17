# MyDesk 開発ガイド（Claude Code 引き継ぎ用）

社内営業CRM「MyDesk」。株式会社西原商事ホールディングス／DUSTALK事業部・新川希亮さんが構築・運用。

## 最重要ルール
1. 単一ファイル構成: フロントは dashboard.jsx（React単一ファイル、約34,600行）。分割しない。
2. ビルド識別子: dashboard.jsx 102行目付近の const MYDESK_BUILD = "YYYY-MM-DD-vNNN-説明"; を編集ごとに更新。現在 2026-07-17-v268-snapshot-chunk-throttle。次は v269。
3. 構文チェック必須: 編集後は必ず Babel でパースチェックしてから完了。壊れた状態で渡さない。
4. 巨大ファイルなので慎重に: 一度に大改造せず1機能ずつ。str_replaceは前後の文脈を十分含めてユニークに。
5. デプロイ: git commit → push → AWS Amplify 自動ビルド（3〜5分）→ ⌘+Shift+R。URL: https://main.d13ehj6n3bh94.amplifyapp.com
6. 各タスク完了後、新川さんはテストタスク（確認手順）を期待する。

## インフラ（AWS ap-northeast-1 / アカウント 967380192450・認証ヘッダー x-mydesk-secret: mydesk2026secret）
- フロント: AWS Amplify（GitHub kisukeshinkawa/MyDesk main 連携）
- mydesk-api（Python・RDS PostgreSQL）Function URL(=DB_API_BASE): https://zv3hlppejxw32cjxhn2mnsdgqq0sxeqa.lambda-url.ap-northeast-1.on.aws
- mydesk-fetch-emails（Node・受信＋添付S3保存＋署名付きURL発行）Function URL(=FETCH_EMAILS_URL): https://kh4ppnjygtrezwlbnc6umysci40zflac.lambda-url.ap-northeast-1.on.aws/
  - {action:"attachment-url",s3Key} でGET署名URL / {action:"upload-url",filename,contentType,account} でPUT署名URL
- mydesk-email-ai-analyze（Node・Bedrock Claude Haiku）Function URL(=EMAIL_AI_API_URL): https://5qrykxpolej3ch6ycduq2ypryq0chkih.lambda-url.ap-northeast-1.on.aws/
  - 現行v13。{reanalyzeAll:true,accountEmail,limit:100}で一括再分析（タイムアウト5分必須）。{emailIds:[...],force:true}で個別。
- mydesk-mail-sender（Node20・nodemailer・お名前.com SMTP mail1046.onamae.ne.jp:465）Function URL(=MAIL_SENDER_URL): https://pf4klt3fylg4wowypbbpzqe5ty0buvoe.lambda-url.ap-northeast-1.on.aws/
  - Resendは凍結・廃止済み。nodemailerレイヤー arn:aws:lambda:ap-northeast-1:967380192450:layer:nodemailer:1。実行ロールにAmazonS3ReadOnlyAccess。環境変数SMTP_ACCOUNTS（3人分）。本人名義送信・添付対応。
- mydesk-bizcard-ocr（Bedrock Claude Opus）Function URL: https://2tosyclyqeswer2d7q4p7f4qri0lpfca.lambda-url.ap-northeast-1.on.aws/
- S3 mydesk-files-dustalk-1777302196（ブロックパブリック全ON・署名付きURL方式）。受信添付 email-attachments/{account}/{messageId}/{n}_{filename}、送信添付 outgoing-attachments/{account}/{stamp}_{filename}

## メールアカウント（お名前.com 全員 mail1046.onamae.ne.jp / IMAP993 SMTP465 SSL）
新川 k-shinkawa@beetle-ems.com / 森荘太 s-mori@beetle-ems.com / 今井知美 t-imai@beetle-ems.com

## フロント主要定数
DB_API_BASE, DB_API_SECRET(=mydesk2026secret), FETCH_EMAILS_URL, EMAIL_AI_API_URL, MAIL_SENDER_URL, API_BASE(Vercel), 色オブジェクトC（Tailwind不使用・インラインstyle）

## メール送信経路
返信フォーム→sendEmailNow→MAIL_SENDER_URL(SMTP)。to/cc/bccは{name,email}配列→メール文字列配列に正規化。attachments:[{s3Key,filename}]。新規/AI作成の一部はまだDB_API_BASE/send-email残存。

## 実装履歴（新しい順）
- v268: 自動/手動スナップショットも業者をチャンク分割保存(_saveSnapshotChunked、`{key}_v{i}`)し6MB(413)回避、loadSnapshotで結合。merge-on-saveに2秒スロットル(window.__myDeskLastMergeSaveAt)で連続保存を軽量化。
- v267: 社内グレード(★1〜3、v.grade。3=対応◎/頼れる,2=普通,1=渋い)を業者詳細(タップ設定)と一覧に表示。merge-on-save追加：saveData保存直前に_fetchServerForMerge()でサーバー最新を取得し_mergeServerLogsIntoLocalで追記型配列をunion(記入したメモを絶対に消さない、削除は尊重、スカラーはローカル優先)。
- v266: メモ消失防止。ポーリングのmergeArraysで、同一エンティティは追記型配列(memos/chat/approachLogs/mtgLogs/changeLogs/files/comments=APPEND_ONLY_FIELDS)を必ずunion(_unionById/_mergeEntityPreserveLogs)。スカラーのみ新しい方採用。
- v265: 保存の413(gzip6MB超)をチャンク分割で解消。業者8000件超(VENDOR_CHUNK_SIZE)なら業者を分割し別キー(mainv_N)保存→全成功後にmainを_vchunks付きで更新(sbSetMainChunked)。loadDataは_vchunksあれば結合、旧形式は後方互換。許可エリア(vendorMunis)の重複表示も排除。
- v264: TSR架電結果CSV取込(業者一覧「📞TSR」→importTsrシート)。R列→ステータス変換、備考1/2+架電ユーザーをアプローチ、断り/見送りは最終備考(S)を失注理由に。業者名(normBizName)照合→更新/新規。
- v263: 業者フィルターに「稼働状況(○×)」追加(vendFilterOperating)。選択自治体×許可の範囲で稼働(○)/非稼働(×)を絞り込み。
- v262: スマホの業者検索窓を全幅化(flexWrap/isPC)。許可×エリア稼働状況を許可種別主軸のコンパクト表示に(稼働数カウント+全○/全×一括)。
- v261: 許可×エリアの稼働状況(○×)管理を業者詳細に追加(v.permitOperating["自治体id::許可種別"]、既定○・app_data保存)。リストビューの許可種別を全表示。
- v260: bee-net日本地図を実際の都道府県輪郭(Geolonia パブリックドメイン)に差し替え。地方別に統合し全transformを座標へ焼き込み(JAPAN_MAP_VIEWBOX="0 0 1009 1016"/JAPAN_REGION_PATHS/JAPAN_REGION_LABELS)。都道府県境も表示、合計ボックスは右下の余白へ。微小離島はしきい値で除去。dashboard.jsxはCRLF改行なので編集時に維持すること(全行差分に注意)。
- v259: bee-net分析に地方別拠点数＋日本地図(JapanRegionMap/JAPAN_REGION_PATHS/BEENET_REGIONS)＋横棒グラフ。地図SVGは手描き近似で不正確。→v260で正確化。
- v257: 返信フォーム開いたら自動スクロール(replyFormRef)
- v256: AI返信フォームの指示・添付を折りたたみ(showAdvanced)
- v255: 本文URLをlinkifyToNodesでリンク化
- v254: 名刺OCRに画像選択ボタン(galleryRef)
- v253: 返信添付を件名下・本文上に配置
- v251/252: 送信添付(uploadFileForSend→S3→mail-sender)、両返信フォームに📎
- v249/250: 受信添付の閲覧(S3署名付きURL)、詳細上部に📎リスト
- AI分析Lambda v10〜v13: 本人名義・宛名精度・要返信判定を反復改善

## 進行中／未完タスク
1. 【メール判定・最優先】人間の取引先から私(To)宛は基本すべて要返信にする。現状v13でTSR久原(eiji.kuhara@tsr-net.co.jp)の日次報告や網岡さんの会議依頼が「共有(返信不要)」になる→要返信にしたい。方針(確認済): 人間の実在担当者から私宛は報告・共有・お礼でもshould_reply=true。ただしnoreply系・「返信はできません」明記のシステム通知(ジョブカン/クラウドサイン)はfalse＋作業はタスク化(これは正しく動作中)。→mydesk-email-ai-analyzeのpromptを調整しv14にして3人分reanalyzeAll。
2. ✅完了(v260): bee-net地図を実際の都道府県輪郭に差し替え済み。
3. メールUI: 横並び分割ビュー(幅広時に受信と返信を左右)。送信済みで何を送ったか見やすく。
4. 宛名の細かい精度: 気になるメールを{emailIds:[id],force:true}で再分析しつつprompt微調整。
5. ✅完了(v264): TSR架電結果CSV取込機能。
6. ✅完了(v265-268): 保存413をチャンク分割で解消・メモ消失を二重ガード(v266ポーリング/v267保存時union)・スナップショットもチャンク化。
7. ○×稼働状況のスプレッドシート一括投入(CSV取込機能化)は保留中。
8. 業者の重複(約1278グループ)の統合は未実行。★グレードの絞り込みフィルタは未追加。

## 開発ワークフロー(Claude Code)
ローカルdashboard.jsx直接編集→Babel構文チェック→MYDESK_BUILD更新→git commit&push→Amplify自動ビルド→新川さんが⌘+Shift+R確認→テストタスク提示。
Lambdaコードはローカルに無い(コンソール編集してきた)。Lambda更新はコンソールのDeploy。

## データ保存アーキテクチャ(v265以降・重要)
app_dataは単一ではなく分割保存。id=mainは業者を除いた本体+`_vchunks`(業者チャンク数)。業者は`mainv_0..N`(VENDOR_CHUNK_SIZE=8000件毎)。loadDataが結合。Lambda Function URLの6MBリクエスト上限回避のため。スナップショットも同方式(`{key}_v{i}`)。保存時はsbSetMainChunked。**メモ等の追記型配列(APPEND_ONLY_FIELDS)は消してはいけない**：ポーリング(v266)と保存直前(v267 merge-on-save)の二重でunionする。編集時この不変条件を壊さないこと。

## 既知のハマりどころ
Reactフック規則(IIFE内useStateでerror#310)。自動保存とポーリング競合→保存キュー。Chrome Scroll Anchoring→パスベース保存/復元。sendBeaconはカスタムヘッダー不可→fetch+keepalive。
