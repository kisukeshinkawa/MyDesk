#!/bin/bash
# phase0_check.sh — Phase 0 現状実測（読み取り専用・EC2の /home/ubuntu/ky_ai で実行）
# 目的: 7/6の引き継ぎ資料の前提が8月現在も生きているかを、本番に一切触れずに確認する。
# 使い方: bash phase0_check.sh  （sudo不要の項目から順に表示。書き込みは一切しない）

KY=/home/ubuntu/ky_ai
LOG=$KY/data/logs/daemon.log
DB=$KY/data/db/kyotei.db

echo "===== Phase 0 現状実測 $(date '+%F %T') ====="

echo; echo "--- [1] daemン状態（実体プロセスで確認・pgrep -f は使わない）---"
systemctl is-active ky-ai-daemon 2>/dev/null
systemctl is-enabled ky-ai-daemon 2>/dev/null
ps -eo pid,lstart,cmd | grep '/daemon.py' | grep -v grep || echo "プロセス実体なし"

echo; echo "--- [2] 蘇生3経路の封鎖状態 ---"
echo "[2a] Restart設定:"; grep -r 'Restart' /etc/systemd/system/ky-ai-daemon.service.d/ 2>/dev/null || echo "override無し(要確認)"
echo "[2b] check_daemon_alive cron(有効行が0であること):"
crontab -l 2>/dev/null | grep -v '^#' | grep -c 'check_daemon_alive'
echo "[2c] cron全体のうちkyotei関連(参考):"
crontab -l 2>/dev/null | grep -i -E 'ky_ai|kyotei|daemon|learn|optimize' | head -20

echo; echo "--- [3] 実投稿の点数（最重要・「絞りN点」の直近実測値）---"
grep '🎯' "$LOG" 2>/dev/null | tail -10 || echo "daemon.logに質判定行なし"
echo "[3b] 直近の投稿ログ(参考):"
grep -E '絞り|本予想' "$LOG" 2>/dev/null | tail -10

echo; echo "--- [4] ベースライン不変の確認（6/28版のままか）---"
echo "[4a] models_v4_test 最新更新:"
ls -lt --time-style=long-iso $KY/data/models_v4_test/ 2>/dev/null | head -5
echo "[4b] 点数json:"
ls -l --time-style=long-iso $KY/data/grade_points*.json 2>/dev/null
echo "[4c] background_learn がコメントアウトのままか(daemon.py 1163行付近):"
sed -n '1158,1168p' $KY/daemon.py 2>/dev/null | grep -n 'background_learn'

echo; echo "--- [5] 本番コードの状態（A2化の現状）---"
echo "[5a] race_predictor.py 軸絞り撤去済みか(172行付近):"
sed -n '128,152p' $KY/predictor/race_predictor.py 2>/dev/null
sed -n '168,184p' $KY/predictor/race_predictor.py 2>/dev/null
echo "[5b] lgbm_predictor.py L層=40か(954/1114行付近):"
sed -n '950,958p' $KY/simulator/lgbm_predictor.py 2>/dev/null
sed -n '1110,1118p' $KY/simulator/lgbm_predictor.py 2>/dev/null
echo "[5c] 質判定層(1120-1170行・未対処のはず):"
sed -n '1120,1170p' $KY/simulator/lgbm_predictor.py 2>/dev/null
echo "[5d] pyc残存状況:"
find $KY -path '*/venv/*' -prune -o -name '__pycache__' -type d -print 2>/dev/null

echo; echo "--- [6] データ基盤の健全性 ---"
SQL="$KY/venv/bin/python3 - <<'EOF'
import sqlite3
db = sqlite3.connect('file:$DB?mode=ro', uri=True)
cur = db.cursor()
def q(label, sql):
    try:
        print(label, cur.execute(sql).fetchall())
    except Exception as e:
        print(label, 'ERROR:', e)
q('[6a] races最新日:', \"select max(date) from races\")
q('[6b] race_entries最新日(5/7以降欠損の疑い):', \"select max(date) from race_entries\")
q('[6c] actual_course充足(全件空のはず):',
  \"select count(*), sum(case when actual_course is not null and actual_course!='' then 1 else 0 end) from race_entries\")
db.close()
EOF"
eval "$SQL" 2>/dev/null || echo "DB確認失敗: テーブル/カラム名を .tables で確認して調整してください"

echo; echo "--- [7] 7/6以降の変更有無（引き継ぎ後に誰かが触っていないか）---"
find $KY -path '*/venv/*' -prune -o -name '*.py' -newermt '2026-07-07' -print 2>/dev/null | head -20

echo; echo "===== 完了。判定の要点 ====="
echo "・[3]の絞りN点が18点なら資料どおり(質判定層支配が継続中)"
echo "・[4]が6/28以外の日付なら凍結が破れている→即報告"
echo "・[6b]が5/7前後で止まっていれば欠損継続→調査Bの評価窓設計に反映"
echo "・[7]に想定外のファイルがあれば内容確認してから作業開始"
