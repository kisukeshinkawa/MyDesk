#!/usr/bin/env python3
"""地合いフィルターの検証結果を表示する。deploy/regime.sh から呼ばれる。"""
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
    print("  ・開始していないなら   : bash deploy/regime.sh run")
    print("  ・開始済みなら20分待って: bash deploy/regime.sh")
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
print("{}銘柄 / 代表的な{}設定の平均".format(d.get("tickers"), d.get("configs")))
print()
print("■ 仮説: 「指数が200日線の上だけ買う」ルールがV字回復の初動を逃している")
print()
print("  他の条件は一切変えず、地合いの判定だけを差し替えて比べます。")
print()

for r in d["rows"]:
    tag = " ← 現行" if r["mode"] == "ma200" else ""
    print("【{}】{}".format(r["label"], tag))
    for w in r["windows"]:
        m1 = "○" if w["beatCagr"] else "×"
        m2 = "○" if w["beatCalmar"] else "×"
        bc = w.get("benchCagr")
        bench = "指数{:+7.2f}%/{:>6.1f}%".format(bc, w["benchDd"]) if bc is not None else "指数—"
        print("  {} 〜 {}  年利{:>+7.2f}% / 下落{:>6.1f}% / 売買{:>4}回   {}   年利{} 効率{}".format(
            w["from"], w["to"], w["cagrPct"], w["maxDrawdownPct"], w["trades"], bench, m1, m2))
    print("  平均: 年利{:+.2f}% / 下落{:.1f}% / 効率{:.3f}   指数超え: 年利{}/{} 効率{}/{}".format(
        r["avgCagr"], r["avgDd"], r["avgCalmar"],
        r["beatCagr"], r["of"], r["beatCalmar"], r["of"]))
    print()

cur, best = d.get("current"), d.get("best")
if cur and best and best["mode"] != cur["mode"]:
    print("■ 現行との差")
    print("  年利  {:+.2f}% → {:+.2f}%  ({:+.2f}ポイント)".format(
        cur["avgCagr"], best["avgCagr"], best["avgCagr"] - cur["avgCagr"]))
    print("  下落  {:.1f}% → {:.1f}%".format(cur["avgDd"], best["avgDd"]))
    print("  売買  {}回 → {}回".format(cur["avgTrades"], best["avgTrades"]))
    print()

print("【結論】" + d.get("verdict", ""))
if best:
    print()
    print("この地合い判定を実運用に入れるには: bash deploy/regime.sh apply")
else:
    print()
    print("採用できるものはありません。設定は変更しないでください。")
