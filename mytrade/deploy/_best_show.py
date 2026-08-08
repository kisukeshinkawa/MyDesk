#!/usr/bin/env python3
"""まぐれを除いた実運用向けの設定を表示する。deploy/grid.sh best から呼ばれる。"""
import json
import sys

d = json.load(sys.stdin)
if d.get("error"):
    print("✗ " + str(d["error"]))
    print("  条件が厳しすぎる場合は許容する下落を広げてください:")
    print("    bash deploy/grid.sh best -50")
    raise SystemExit

b, p = d["recommended"], d.get("peakCagr") or {}
c = d.get("criteria", {})
print("■ 実運用に向いた設定（まぐれを除いて選定）")
print()
print("  買い{}点以上 / 利確{:.0f}倍 / {}銘柄まで / 1回のリスク{:.0f}% / {}".format(
    b["entryScore"], b["rr"], b["maxPositions"], b["riskPct"], b.get("method", "標準")))
print()
print("  年利     {:+.2f}%   （周辺の似た条件の平均 {:+.2f}%）".format(
    b["cagrPct"], b["neighborCagr"]))
print("  最大下落 {:.1f}%".format(b["maxDrawdownPct"]))
print("  勝率     {:.1f}% / 損益比 {} / 売買{}回 / 最大{}連敗".format(
    b["winRate"], b["profitFactor"], b["trades"], b.get("maxLossStreak", "?")))
print("  安定度   {}  （1.0に近いほど、周辺の条件でも同じ成績が出ている）".format(b["stability"]))
print()
print("【なぜこれか】")
print("  " + d.get("reason", ""))
print()
if p:
    print("【年利1位をあえて選んでいません】")
    print("  1位は年利{:+.2f}%（最大下落{:.1f}%）ですが、".format(p["cagrPct"], p["maxDrawdownPct"]))
    print("  周辺の条件が同水準でない＝たまたま当たっただけの可能性が高い設定です。")
    print()
for i, r in enumerate(d.get("runnerUps") or []):
    if i == 0:
        print("【次点】")
    print("  買い{}点/利確{:.0f}倍/{}銘柄/リスク{:.0f}% → 年利{:+.2f}% 下落{:.1f}% (周辺平均{:+.2f}%)".format(
        r["entryScore"], r["rr"], r["maxPositions"], r["riskPct"],
        r["cagrPct"], r["maxDrawdownPct"], r["neighborCagr"]))
print()
print("条件: 下落{}%まで許容 / 信用取引なし / 売買{}回以上 (候補{}件から選定)".format(
    c.get("maxDrawdown"), c.get("minTrades"), c.get("candidates")))
