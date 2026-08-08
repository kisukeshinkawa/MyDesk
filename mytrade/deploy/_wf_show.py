#!/usr/bin/env python3
"""ウォークフォワード検証の結果を表示する。deploy/wf.sh から呼ばれる。"""
import json
import sys
from datetime import datetime, timezone

try:
    with open(sys.argv[1], encoding="utf-8") as f:
        d = json.load(f)
except Exception:
    d = {}

if not d.get("folds"):
    print("まだ結果がありません。")
    print("  ・開始していないなら   : bash deploy/wf.sh run")
    print("  ・開始済みなら20分待って: bash deploy/wf.sh")
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
    pass
地合={"ma200":"指数が200日線の上のときだけ買う(現行)","recovery":"回復も拾う",
      "ma50":"50日線の上","off":"地合いフィルター無し"}
print("検証銘柄 {} / 地合い判定: {}".format(
    d.get("tickers"), 地合.get(d.get("regime","ma200"), d.get("regime","ma200"))))
print()
print("■ 設定を決めた期間の「外」で、同じ成績が出るか")
print()
print("  やり方: 前半のデータだけを見て設定を決め、一度も見ていない後半で走らせる。")
print("         過去を全部見てから選んだ条件が良く見えるのは当たり前なので、それを排除する。")
print()

for f in d["folds"]:
    c = f["config"]
    print("【第{}区間】".format(f["fold"]))
    print("  決めた期間 : {} 〜 {}  ({}日・{}条件から選定)".format(
        f["trainFrom"], f["trainTo"], f["trainDays"], f["triedCombos"]))
    print("  選ばれた設定: 買い{}点 / 利確{:.0f}倍 / {}銘柄 / リスク{:.0f}%{}{}".format(
        c["entry_score"], c["rr"], c["max_pos"], c["risk_pct"],
        " / 分割利確" if c.get("partial") else "",
        " / 長期保有" if c.get("hold_mode") == "trend" else ""))
    i, o = f["inSample"], f["outSample"]
    print("    決めた期間の成績 : 年利{:>+7.2f}% / 最大下落{:>6.1f}% / 勝率{:>5.1f}% / 効率{:>6.3f}".format(
        i["cagrPct"], i["maxDrawdownPct"], i["winRate"], i["calmar"]))
    print("  試した期間 : {} 〜 {}  ({}日)".format(f["testFrom"], f["testTo"], f["testDays"]))
    mark = "○" if o["cagrPct"] > 0 else "×"
    print("  {} 未知の期間の成績 : 年利{:>+7.2f}% / 最大下落{:>6.1f}% / 勝率{:>5.1f}% / 効率{:>6.3f}".format(
        mark, o["cagrPct"], o["maxDrawdownPct"], o["winRate"], o["calmar"]))
    print("    → 選定時との差 年利{:+.2f}ポイント / 効率{:+.3f}".format(f["cagrDrop"], f["calmarDrop"]))
    b = (f.get("benchmark") or {}).get("mix")
    if b:
        wc = "○" if o["cagrPct"] > b["cagrPct"] else "×"
        we = "○" if o["calmar"] > b["calmar"] else "×"
        print("    同じ期間の指数     : 年利{:>+7.2f}% / 最大下落{:>6.1f}% / 効率{:>6.3f}".format(
            b["cagrPct"], b["maxDrawdownPct"], b["calmar"]))
        print("    → 指数に対して 年利{} / 効率{}".format(wc, we))
    print()

print("■ まとめ")
print()
print("  設定を決めた期間の平均年利 : {:+.2f}%".format(d["avgInSampleCagr"]))
keep_txt = "（選定時の{}%を維持）".format(d["keepPct"]) if d["avgOutSampleCagr"] > 0 else "（利益が消えた）"
print("  未知の期間の平均年利       : {:+.2f}%   {}".format(d["avgOutSampleCagr"], keep_txt))
print("  未知の期間の平均最大下落   : {:.1f}%".format(d["avgOutSampleDd"]))
print("  利益が出た区間             : {}/{}".format(d["positiveFolds"], d["totalFolds"]))
if d.get("avgBenchCagr") is not None:
    print()
    print("  同じ期間の指数の平均年利   : {:+.2f}%".format(d["avgBenchCagr"]))
    print("  同じ期間の指数の平均下落   : {:.1f}%".format(d["avgBenchDd"]))
    eff_s = d["avgOutSampleCagr"] / abs(d["avgOutSampleDd"]) if d["avgOutSampleDd"] else 0
    eff_b = d["avgBenchCagr"] / abs(d["avgBenchDd"]) if d["avgBenchDd"] else 0
    print()
    print("  {:<22}{:>10}{:>12}{:>10}".format("", "年利", "最大下落", "効率"))
    print("  " + "-" * 52)
    print("  {:<22}{:>9.2f}%{:>11.1f}%{:>10.3f}".format(
        "MyTrade(期間外)", d["avgOutSampleCagr"], d["avgOutSampleDd"], eff_s))
    print("  {:<22}{:>9.2f}%{:>11.1f}%{:>10.3f}".format(
        "指数(同じ期間)", d["avgBenchCagr"], d["avgBenchDd"], eff_b))
    print()
    print("  指数に勝った区間: 年利で{}/{} / 効率で{}/{}".format(
        d.get("beatBenchCagr", 0), d["totalFolds"],
        d.get("beatBenchEfficiency", 0), d["totalFolds"]))
print()
print("【結論】" + d.get("verdict", ""))
print()
print("維持率100%に近いほど本物です。50%を切るなら、過去に合わせ込んだだけの数字です。")
