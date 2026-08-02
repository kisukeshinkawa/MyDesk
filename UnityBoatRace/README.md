# BOATRACE REALISM – Unity競艇シミュレーションゲーム

Unity 2022 LTS向けのリアル競艇レースシミュレーション。
**このフォルダ自体がUnityプロジェクトです。開いて▶ Playを押すだけ**で、6艇のフルレース（ピット離れ→待機行動→スタート→3周→ゴール→リプレイ）が自動で始まります（`AutoLaunch.cs` がシーンに `RaceBootstrap` を自動生成）。

## セットアップ手順（ターミナル版・Mac）

```bash
# 1. Unity Hub をインストール (Homebrew)
brew install --cask unity-hub

# 2. コードを取得
git clone -b claude/unity-boatrace-game-r2id9e \
  https://github.com/kisukeshinkawa/MyDesk.git ~/BoatRace

# 3. Unity Hub を開いてエディタをインストール (GUIで2クリック)
#    「インストール」→「エディターをインストール」→ 2022.3 LTS
open -a "Unity Hub"

# 4. プロジェクトを直接起動 (バージョン番号は自分が入れたものに読み替え)
#    初回はインポートに数分かかる。バージョン確認ダイアログが出たら「続行」でOK
/Applications/Unity/Hub/Editor/2022.3.*/Unity.app/Contents/MacOS/Unity \
  -projectPath ~/BoatRace/UnityBoatRace
```

5. Unityが開いたら **▶ Play** → レースが自動進行。終了後 HUD の「▶ リプレイ再生」でリプレイ
6. 設定を変えたい場合のみ: Hierarchyに `Game` オブジェクトを作り `RaceBootstrap` を付ければ Inspector で venueId(1〜24=桐生〜大村)/seed を変更可能

※ GUI派の場合は Unity Hub「プロジェクト」→「追加」→「ディスクから追加」で `~/BoatRace/UnityBoatRace` を選んでもOK。

## 実装済み機能（仕様書の全20章に対応）

| 仕様 | 実装ファイル |
|---|---|
| 24競艇場水面特性 | `Data/CourseDatabase.cs` |
| 選手データ（ST・旋回力・メンタル） | `Player/PlayerStats.cs`, `Data/PlayerDatabase.cs` |
| モーター性能・抽選 | `Data/MotorDatabase.cs` |
| プロペラ調整 | `Setup/PropellerSystem.cs` |
| ピット離れ | `Start/PitExitSystem.cs` |
| 待機行動・進入コース | `Start/WaitingSystem.cs` |
| 展示タイム | `Start/ExhibitionSystem.cs` |
| フライングスタート・ST判定 | `Start/StartSystem.cs`, `AI/StartAI.cs` |
| ボート物理（加速・水抵抗） | `Boat/BoatPhysicsEngine.cs`, `Physics/WaterPhysics.cs` |
| ターン物理（旋回半径・遠心力・外流れ） | `Physics/TurnPhysics.cs` |
| 航跡（引き波の抵抗） | `Physics/WakePhysics.cs` |
| 燃料減衰 | `Physics/FuelSystem.cs` |
| 風・潮流 | `Physics/WindSystem.cs`, `Physics/CurrentSystem.cs` |
| 1M展開AI（逃げ/差し/まくり/まくり差し） | `AI/StrategyAI.cs`, `AI/TurnAI.cs`, `AI/CourseAI.cs` |
| 実況AI＋学習 | `Commentary/CommentarySystem.cs`, `Commentary/CommentaryLearning.cs` |
| リプレイ（10Hz記録・カメラ切替） | `Core/ReplayManager.cs` |
| オンライン同期（20Hz・トランスポート差替式） | `Network/NetworkSync.cs` |
| レース進行統括 | `Core/RaceManager.cs`, `Core/RaceState.cs`, `Core/TrackPath.cs` |
| シーン自動構築・HUD | `Core/RaceBootstrap.cs`, `Core/RaceHUD.cs` |

## アーキテクチャの要点

- **物理はTransform非依存の純C#**（`BoatPhysicsEngine`）。テスト・高速シミュレーション・サーバー実行が可能
- **seed固定で同一レース再現**（デバッグ・検証・オンライン同期の基盤）
- **RaceManagerのC#イベント**に実況・HUD・リプレイが購読者としてぶら下がる疎結合構成
- 引き波（`WakePhysics`）が後続艇に実抵抗を与えるため、「差しは内の引き波を嫌う」「まくりは外を回す」が物理として創発する

## 今後の拡張ロードマップ（推奨順）

1. **見た目**: ボート3Dモデル・水シェーダー（URP + Crest等）・水しぶきVFX
2. **プレイヤー操作**: 1艇を手動操作（`BoatController` にキー入力を渡すだけ）
3. **舟券システム**: 展示タイム・ST・モーター評価からオッズ生成→的中判定
4. **オンライン対戦**: Package Manager から `com.unity.netcode.gameobjects` を追加し、`NetworkSync.ITransport` を実装（コメントに手順記載）
5. **実況の音声化**: 実況テキスト→TTS。学習ログをLLM few-shotに渡して生成品質向上

## 注意

- フライング(F)艇は現状「Fフラグ表示」のみで走行は継続します（実艇の返還・帰郷処理は舟券システムと同時に実装予定）
- 日本地図・実在選手名・実在場のロゴ等は使用していません（選手は架空データ）
