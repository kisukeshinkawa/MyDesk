#!/usr/bin/env python3
"""月次リバランス方式の検証結果を表示する。deploy/rb.sh から呼ばれる。"""
import json
import sys
from datetime import datetime, timezone

try:
    with open(sys.argv[1], encoding="utf-8") as f:
        d = json.load(f)
except Exception:
    d = {}

if not d.get("rows"):
    print("まだ結果がありません。")
    print("  ・開始していないなら   : bash deploy/rb.sh run")
    print("  ・開始済みなら20分待って: bash deploy/rb.sh")
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
print("{}銘柄".format(d.get("tickers")))
print()
print("■ 月次リバランス方式（損切りも利確もせず、順位で入れ替えるだけ）")
print()
print("  今の方式は6年で600回売買してコストに負けました。")
print("  こちらは決めるのが「何本持つか」「何日ごとか」の2つだけです。")
print()

for slip in sorted({r["slip"] for r in d["rows"]}):
    rows = [r for r in d["rows"] if r["slip"] == slip]
    if not rows:
        continue
    print("【{}】".format(rows[0]["slipLabel"]))
    print("  {:<22}{:>9}{:>11}{:>9}{:>11}{:>9}   指数超え".format(
        "条件", "年利", "最大下落", "効率", "指数の年利", "売買/年"))
    print("  " + "-" * 80)
    for r in sorted(rows, key=lambda x: -x["avgCalmar"]):
        mark = "◎" if r["edge"] > 0 else "×"
        print("  {:<22}{:>8.2f}%{:>10.1f}%{:>9.3f}{:>10.2f}%{:>8.1f}回 {} 年利{}/{} 効率{}/{}".format(
            r["label"], r["avgCagr"], r["avgDd"], r["avgCalmar"],
            r["avgBench"], r["tradesPerYear"], mark,
            r["beatCagr"], r["of"], r["beatCalmar"], r["of"]))
    print()

print("【結論】" + d.get("verdict", ""))
if d.get("best"):
    b = d["best"]
    print()
    print("  採用候補: {} / {}".format(b["label"], b["slipLabel"]))
    print("  年利{:.2f}% / 最大下落{:.1f}% / 年間{}回の売買".format(
        b["avgCagr"], b["avgDd"], b["tradesPerYear"]))
    print()
    print("  ※ ただしこれは検証結果です。実運用に入れる前に、")
    print("     生存バイアス(倒産企業を含まない)ぶんの下振れを見込んでください。")
