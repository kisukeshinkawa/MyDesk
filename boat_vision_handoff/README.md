# boat_vision_handoff — BOAT VISION (kyotei_ai) 引き継ぎ先行成果物

MyDesk（CRM）とは無関係の一時置き場。Claude Codeのクラウド環境からEC2に触れないため、
先行作業の成果物をこのブランチ経由で受け渡す。**mainにはマージしないこと**（Amplifyビルド対象外を維持）。

## EC2への持ち込み方
```
cd /home/ubuntu/ky_ai
git clone -b claude/boat-vision-handoff-ksws5p --depth 1 \
    https://github.com/kisukeshinkawa/MyDesk /tmp/bvh && cp -r /tmp/bvh/boat_vision_handoff ./docs_handoff
```
（または各ファイルを個別にコピー）

## 内容

| ファイル | 内容 | 状態 |
|---|---|---|
| instruction_AD_proposal.md | 現状整理と改善提案（指示AD案）。Phase 0〜4のロードマップ | 完成 |
| phase0_check.sh | Phase 0 現状実測スクリプト（読み取り専用・EC2で `bash phase0_check.sh`） | 完成・構文OK。DB部はテーブル名要確認 |
| verify_grade_roi.py | 宿題B: グレード別回収率（クラスタBS2000回・CI・日次分散・AC判定） | 統計コアはテスト済み。データ結線のみEC2で（ファイル冒頭参照） |
| bet_count_policy.py | 改善案2: 点数決定一元化モジュール（A2実装＋セルフチェック＋BUILD識別子） | テスト済みドラフト。雨/風/12R補正の順序は現行コードと要突合 |

## 実行順（EC2で）
1. `bash phase0_check.sh` — 7/6資料の前提が生きているか確認（daemン状態・絞りN点・凍結・データ欠損）
2. 調査B: verify_grade_roi.py を結線 → `--limit 500` 小サンプル → 21時以降フル実行
3. 方針決定後の本番改修時に bet_count_policy.py を適用（不可逆・新川さん確認後）

各スクリプト内の「★ADAPT」印がEC2で確認・調整が必要な箇所。
