#!/usr/bin/env python3
"""連動性(相関)の検証結果を読みやすく表示する。deploy/corr.sh から呼ばれる。
   引数: 結果JSONのファイルパス / モード(show|apply)"""
import json
import sys

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

p, b = d.get("period", {}), d.get("baseSettings", {})
print("検証期間 {}年 / {}銘柄 (うち連動先が判明 {}銘柄)".format(
    p.get("years"), d.get("tickers"), d.get("linkedTickers")))
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
