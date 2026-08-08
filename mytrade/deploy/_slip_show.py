#!/usr/bin/env python3
"""約定のズレ(スリッページ)の検証結果を表示する。deploy/slip.sh から呼ばれる。"""
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
    print("  ・開始していないなら   : bash deploy/slip.sh run")
    print("  ・開始済みなら20分待って: bash deploy/slip.sh")
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
print("{}銘柄 / 地合い判定: {}".format(d.get("tickers"), d.get("regime")))
print()
print("■ 約定のズレをいくら見込むと、指数への優位が消えるか")
print()
print("  手数料0.1%とは別に、買いは高く・売りは安く約定します。")
print("  各期間ごとに、それ以前だけを見て設定を選び直しています(期間外で測定)。")
print()
print("{:<16}{:>10}{:>11}{:>9}{:>11}{:>10}   指数超え".format(
    "見込むズレ", "年利", "最大下落", "効率", "指数の年利", "差"))
print("-" * 78)
for r in d["rows"]:
    mark = "◎" if r["edge"] > 0 else "×"
    print("{:<16}{:>9.2f}%{:>10.1f}%{:>9.3f}{:>10.2f}%{:>+9.2f} {}  年利{}/{} 効率{}/{}".format(
        r["label"], r["avgCagr"], r["avgDd"], r["avgCalmar"],
        r["avgBenchCagr"], r["edge"], mark,
        r["beatCagr"], r["of"], r["beatCalmar"], r["of"]))
print()
print("差 = このシステムの年利 − 同じ期間の指数の年利。プラスなら売買する価値がある")
print()

be = d.get("breakeven")
if be:
    print("優位が残る上限: {} （そのとき年利{:+.2f}% / 指数比{:+.2f}ポイント / 平均{}回売買）".format(
        be["label"], be["avgCagr"], be["edge"], be["avgTrades"]))
    print()
print("【結論】" + d.get("verdict", ""))
print()
print("目安: 大型株なら片道0.05%前後、中小型や板の薄い銘柄では0.20%を超えることもあります。")
print("     成行で発注するほど、また売買が多いほど、ズレは効いてきます。")
