# 艇道 TEIDO — テストアプリ化ガイド

Unityメニューに「**艇道ビルド**」が追加されています(git更新後にUnityへ戻ると自動でコンパイルされます)。
出力は `UnityBoatRace/Builds/` に入ります(gitには含まれません)。

## ① Mac版アプリ(最速・5分・費用ゼロ)

1. Unityメニュー → **艇道ビルド → ① Mac版アプリを書き出し**
2. 完成すると Finder で `Builds/Mac/TEIDO.app` が開く
3. ダブルクリックで起動。AirDropで他のMacに渡してもOK
   (初回起動で警告が出たら 右クリック → 開く)

まずこれで「アプリとして動く」ことを確認するのがおすすめ。

## ② WebGL版(URLで配る・社内テストに最適)

1. Unityメニュー → **艇道ビルド → ② WebGL版を書き出し**(初回はWebGLモジュールの
   インストールをUnity Hubから求められる場合あり。ビルドは10〜20分かかります)
2. できあがった `Builds/WebGL/` フォルダの中身を S3 か Amplify に置くだけ
   - 手早いのはS3: mydesk-files-dustalk バケットとは別に公開用バケットを作るか、
     Amplifyで新しいアプリ(手動デプロイ)を作って `Builds/WebGL` をZipでドラッグ&ドロップ
3. 発行されたURLをLINEやメールで共有 → PCブラウザでそのまま遊べる
   (スマホブラウザでも動くが、メモリの都合で動作は端末次第)

## ③ iPhone実機テスト(TestFlight・本命だが準備が必要)

必要なもの:
- **Apple Developer Program**(年間 ¥12,980)への登録 — https://developer.apple.com/jp/programs/
- Xcode(Mac App Storeから無料)

手順:
1. Unity Hub → Installs → 6000.3.11f1 の歯車 → Add modules → **iOS Build Support** を追加
2. Unityメニュー → **艇道ビルド → ③ iOS用Xcodeプロジェクトを書き出し**
3. `Builds/iOS/Unity-iPhone.xcodeproj` をXcodeで開く
4. Signing & Capabilities で自分のTeamを選択(Bundle ID: `com.dustalk.teido`)
5. まずは実機テスト: iPhoneをUSB接続 → 上部のデバイス選択でiPhoneを選び ▶ 実行
   (これだけならDeveloper Program未登録の無料Apple IDでも7日間有効で動く)
6. 配布する場合: Product → Archive → **Distribute App → TestFlight & App Store**
   → App Store Connect にアップロード → TestFlightで社内テスター(メール招待)に配布

## おすすめの進め方

1. **今日**: ①Mac版で動作確認(コスト0・5分)
2. **今週**: ②WebGLをAmplifyに置いて森さん・今井さんに触ってもらう
3. **本格テスト**: Apple Developer登録 → ③TestFlightでiPhone配布

## アプリ化前に決めること(RELEASE_CHECKLIST.mdも参照)

- アプリアイコン(1024×1024 PNG があれば設定します — 作って渡してください)
- 実在選手名のデフォルト(現在ON。外部配布ならパロディ名デフォルト推奨)
- 「BOATRACE」「戸田」等の実名表記の扱い(社内テストなら問題になりにくいが、
  App Store公開時は権利面の確認推奨)
