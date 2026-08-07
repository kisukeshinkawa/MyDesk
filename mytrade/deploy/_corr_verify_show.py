#!/usr/bin/env python3
"""集中回避などが「たまたま効いただけ」でないかの確認結果を表示する。
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
    if not d.get("summary"):
        print("NOTREADY")
    elif not d.get("recommended"):
        print("NOGAIN")
    else:
        c = d["recommended"]["config"]
        print(json.dumps({"maxSameDriver": c.get("max_same_driver", 0),
                          "driverTrend": bool(c.get("driver_trend")),
                          "betaSize": bool(c.get("beta_size"))}))
    raise SystemExit

if not d.get("summary"):
    print("まだ結果がありません。")
    print("  ・確認を開始していないなら : bash deploy/corr.sh verify")
    print("  ・開始済みなら15〜25分待って: bash deploy/corr.sh verified")
    raise SystemExit

try:
    t = datetime.fromisoformat(d["updatedAt"].replace("Z", "+00:00"))
    age = (datetime.now(timezone.utc) - t).total_seconds() / 60
    when = t.astimezone().strftime("%m/%d %H:%M")
    print("この結果は {} に出たものです({})".format(
        when, "{:.0f}分前".format(age) if age < 60 else "{:.1f}時間前".format(age / 60)))
    if age > 30:
        print("  ※ 確認を開始したばかりなら、これは前回の結果です。15〜25分待ってください")
except Exception:
    print("この結果の生成日時が不明です")
print()

p = d.get("period", {})
print("検証期間 {}年 / {}銘柄 (ユニバース全体 {}銘柄)".format(
    p.get("years"), d.get("tickers"), d.get("universe")))
if d.get("requested") and d.get("tickers", 0) < d["requested"]:
    print("  ※ 時間内に処理できたのは{}銘柄でした(要求{}銘柄)".format(d["tickers"], d["requested"]))
print()
print("■ 性格の違う設定それぞれで、仕組みを足すとどうなったか")
print()

for row in d.get("bases", []):
    print("【{}】基準: 年利{:+.2f}% / 最大下落{:.1f}% / 効率{:.2f}".format(
        row["base"], row["baseCagr"], row["baseDd"], row["baseCalmar"]))
    for m in row.get("mechs", []):
        print("   {} {:<22} 年利{:>+7.2f}% ({:>+5.2f})  下落{:>6.1f}% ({:>+5.1f})  効率{:>5.2f} ({:>+6.3f})".format(
            "○" if m["win"] else "×", m["name"], m["cagrPct"], m["cagrDiff"],
            m["maxDrawdownPct"], m["ddDiff"], m["calmar"], m["calmarDiff"]))
    print()

print("■ まとめ: どの仕組みが「設定を変えても効く」か")
print()
print("{:<24}{:>10}{:>14}{:>14}   判定".format("仕組み", "効いた数", "平均の年利差", "平均の効率差"))
print("-" * 82)
for s in d["summary"]:
    print("{:<24}{:>8}/{:<3}{:>13.2f}{:>14.3f}   {}".format(
        s["name"], s["wins"], s["of"], s["avgCagrDiff"], s["avgCalmarDiff"], s["verdict"]))
print()
print("効率 = 年利 ÷ 最大下落。○ = その設定で効率が改善した")
print("すべての設定で効いたものだけを「本物」とみなします。")
print("1つの設定でだけ効いたものは、偶然その設定に噛み合っただけの可能性が高いためです。")
print()
print("【結論】" + d.get("verdict", ""))
if d.get("recommended"):
    print()
    print("この設定を自動売買に反映するには: bash deploy/corr.sh apply-verified")
else:
    print()
    print("採用できるものがありません。すでに設定を入れている場合は戻すことを検討してください:")
    print("  bash deploy/corr.sh reset")
