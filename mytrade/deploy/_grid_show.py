#!/usr/bin/env python3
"""条件比較(optimize)の結果を読みやすく表示する。deploy/grid.sh から呼ばれる。"""
import json
import sys
from datetime import datetime, timezone

try:
    with open(sys.argv[1], encoding="utf-8") as f:
        d = json.load(f)
except Exception:
    d = {}

if not d.get("combos"):
    print("まだ結果がありません。")
    print("  ・開始していないなら   : bash deploy/grid.sh run")
    print("  ・開始済みなら20分待って: bash deploy/grid.sh")
    raise SystemExit

try:
    t = datetime.fromisoformat(d["updatedAt"].replace("Z", "+00:00"))
    age = (datetime.now(timezone.utc) - t).total_seconds() / 60
    print("この結果は {} に出たものです({})".format(
        t.astimezone().strftime("%m/%d %H:%M"),
        "{:.0f}分前".format(age) if age < 60 else "{:.1f}時間前".format(age / 60)))
    if age > 30:
        print("  ※ 開始したばかりなら、これは前回の結果です。20分ほど待ってください")
except Exception:
    print("この結果の生成日時が不明です(古い形式)")

p = d.get("period", {})
print("検証期間 {}年 / {}銘柄".format(p.get("years"), p.get("tickers")))
if d.get("combosTried") and d.get("combosTotal") and d["combosTried"] < d["combosTotal"]:
    print("  ※ 時間内に試せたのは{}/{}条件でした".format(d["combosTried"], d["combosTotal"]))
print()

pos = d.get("byPositions") or []
if pos:
    print("■ 何銘柄に分散するのが良いか（同じ条件の平均）")
    print()
    print("{:>8}{:>10}{:>12}{:>10}{:>12}".format("同時保有", "平均年利", "平均最大下落", "平均効率", "最高年利"))
    print("-" * 54)
    best = max(pos, key=lambda x: x["avgCalmar"])
    for r in pos:
        mark = "  ← 効率が最良" if r is best else ""
        print("{:>7}銘柄{:>9.2f}%{:>11.1f}%{:>10.3f}{:>11.2f}%{}".format(
            r["maxPositions"], r["avgCagr"], r["avgDd"], r["avgCalmar"], r["bestCagr"], mark))
    print()
    print("効率 = 年利 ÷ 最大下落。分散を増やすほど下落は浅くなるのが普通ですが、")
    print("増やしすぎると1銘柄あたりの金額が小さくなり、リターンも伸びなくなります。")
    print()

print("■ 効率が高い条件 上位8件")
print()
print("{:>6}{:>6}{:>8}{:>7}{:>10}{:>10}{:>8}{:>8}  手法".format(
    "買い", "利確", "同時保有", "リスク", "年利", "最大下落", "勝率", "効率"))
print("-" * 92)
for r in (d.get("combos") or [])[:8]:
    print("{:>5}点{:>5.0f}倍{:>7}銘柄{:>6.0f}%{:>9.2f}%{:>9.1f}%{:>7.1f}%{:>8.2f}  {}".format(
        r["entryScore"], r["rr"], r["maxPositions"], r["riskPct"],
        r["cagrPct"], r["maxDrawdownPct"], r["winRate"], r["calmar"], r.get("method", "標準")))
print()

pr = d.get("presets") or {}
NAMES = [("safe", "🛡️ 安定型"), ("balanced", "⚖️ バランス型"),
         ("aggressive", "🔥 積極型"), ("max", "💀 最大リターン型")]
if any(pr.get(k) for k, _ in NAMES):
    print("■ 運用タイプ別のおすすめ")
    print()
    for k, label in NAMES:
        r = pr.get(k)
        if not r:
            continue
        print("{:<16} 年利{:>+7.2f}% / 最大下落{:>6.1f}% / 勝率{:>5.1f}% / 最大{}連敗".format(
            label, r["cagrPct"], r["maxDrawdownPct"], r["winRate"], r.get("maxLossStreak", "?")))
        print("{:<16}   買い{}点 / 利確{:.0f}倍 / {}銘柄 / リスク{:.0f}% / {}".format(
            "", r["entryScore"], r["rr"], r["maxPositions"], r["riskPct"], r.get("method", "標準")))
    print()
    print("採用するには「💴デモ売買」タブの運用タイプから選んでください。")
    print("(コマンドなら: bash deploy/mode.sh safe|balanced|aggressive|max)")
