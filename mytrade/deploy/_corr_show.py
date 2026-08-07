#!/usr/bin/env python3
"""連動性(相関)の検証結果を読みやすく表示する。deploy/corr.sh から呼ばれる。
   引数: 結果JSONのファイルパス / モード(show|apply)"""
import json
import sys
from datetime import datetime, timezone

path = sys.argv[1]
mode = sys.argv[2] if len(sys.argv) > 2 else "show"

try:
    with open(path, encoding="utf-8") as f:
        d = json.load(f)
except Exception:
    d = {}

if mode == "apply":
    if not d.get("rows"):
        print("NOTREADY")
    elif not d.get("improved"):
        print("NOGAIN")
    else:
        w = d.get("winner") or {}
        print(json.dumps({"maxSameDriver": w.get("max_same_driver", 0),
                          "driverTrend": bool(w.get("driver_trend")),
                          "betaSize": bool(w.get("beta_size"))}))
    raise SystemExit

if not d.get("rows"):
    print("まだ結果がありません。")
    print("  ・検証を開始していないなら : bash deploy/corr.sh run")
    print("  ・開始済みなら10〜15分待って: bash deploy/corr.sh")
    raise SystemExit

# いつの結果かを必ず出す。検証を始めた直後に叩くと前回の結果を読んでしまい、
# 変わっていないのか終わっていないのかが区別できないため
age_min = None
try:
    t = datetime.fromisoformat(d["updatedAt"].replace("Z", "+00:00"))
    age_min = (datetime.now(timezone.utc) - t).total_seconds() / 60
    when = t.astimezone().strftime("%m/%d %H:%M")
    if age_min < 60:
        print("この結果は {} に出たものです({:.0f}分前)".format(when, age_min))
    else:
        print("この結果は {} に出たものです({:.1f}時間前)".format(when, age_min / 60))
except Exception:
    print("この結果の生成日時が不明です(古い形式)")
if age_min is not None and age_min > 25:
    print("  ※ 検証を開始したばかりなら、これは前回の結果です。"
          "10〜20分待ってもう一度 bash deploy/corr.sh を実行してください")
print()

p, b = d.get("period", {}), d.get("baseSettings", {})
print("検証期間 {}年 / {}銘柄で検証 (連動先が判明 {}銘柄 / ユニバース全体 {}銘柄)".format(
    p.get("years"), d.get("tickers"), d.get("linkedTickers"), d.get("universe", "?")))
if d.get("requested") and d.get("tickers", 0) < d["requested"]:
    print("  ※ 時間内に処理できたのは{}銘柄でした(要求{}銘柄)".format(d["tickers"], d["requested"]))
print("基準の設定: 買い{}点 / 利確{}倍 / {}銘柄 / リスク{}%".format(
    b.get("entry_score"), b.get("rr"), b.get("max_pos"), b.get("risk_pct")))
print()
print("{:<28}{:>9}{:>11}{:>8}{:>8}   判定".format("条件", "年利", "最大下落", "勝率", "効率"))
print("-" * 78)

rows = d["rows"]
for i, r in enumerate(rows):
    mark = "(基準)" if i == 0 else r.get("grade", "★効いた" if r.get("helped") else "効果なし")
    print("{:<28}{:>+8.2f}%{:>10.1f}%{:>7.1f}%{:>8.2f}   {}".format(
        r["label"], r["cagrPct"], r["maxDrawdownPct"], r["winRate"], r["calmar"], mark))
    if i:
        print("{:<28}{:>+8.2f} {:>+10.1f} {:>8}{:>+8.2f}   ← 基準との差".format(
            "", r["cagrDiff"], r["ddDiff"], "", r["calmarDiff"]))
        keep = r.get("tradeKeepPct")
        if keep is not None and keep < 70:
            print("{:<28}取引が基準の{}%まで減少 ← 入れ替えではなく見送りが増えている".format("", keep))
print()
print("効率 = 年利 ÷ 最大下落。同じリターンなら下落が小さいほど良い設定です")
print("取引回数が大きく減っている条件は、代わりに買う銘柄が無くて見送っただけの可能性があります")
print()
print("【結論】" + d.get("verdict", ""))
if d.get("improved"):
    print()
    print("この設定を自動売買に反映するには: bash deploy/corr.sh apply")
