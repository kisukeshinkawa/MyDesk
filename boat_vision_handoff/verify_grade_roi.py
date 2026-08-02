# -*- coding: utf-8 -*-
"""
verify_grade_roi.py — グレード別回収率調査（宿題B / 指示AC実測検証）ドラフト

HANDOFF §4-1 の設計に基づく。統計コア（集計・レース単位クラスタブートストラップ・
日次分散）は完成済みで --selftest で検証可能。データ読み込み部のみEC2で結線する。

■ EC2での結線方法（2通り・どちらか）
  A) scripts/verify_4m.py のレースループをコピーし collect_recs() に移植。
     recsタプルに grade（verify_4m 61行付近 sim.get('grade','C')）を追加するだけ。
  B) verify_4m.py 側に「recを1行JSONで吐く」数行を足し、本スクリプトに
     --input recs.jsonl で渡す（verify_4mの検証済みロジックをそのまま使えるので推奨）。

■ rec の形式（1レース=1件）
  {"race_id": str,        # レース一意ID（クラスタ単位）
   "date": "YYYY-MM-DD",  # 日次分散の集計用
   "grade": "SS|S|A|B|C",
   "n_bets": int,          # A2買い目の点数
   "hit": 0|1,             # 三連単的中
   "payout": int}          # 的中時 payout3t（racesテーブル・100円あたり払戻円）、外れ0

■ 実行の規律（HANDOFF §4厳守）
  - 21時以降・読み取り専用・本番非干渉:
      setsid nice -19 venv/bin/python3 -u verify_grade_roi.py --input recs.jsonl \
          > /tmp/verify_grade_roi.log 2>&1 &
  - まず --limit 500 の小サンプルで「grade別に分かれ回収率が妥当か」を確認してからフル実行。
  - 判定は点推定でなくCI: SS級のCI上限 < 全体回収率 かつ C級が高ければ指示ACを支持。
  - N≥200未満のグレードは判定保留として表示。
"""
import argparse
import json
import random
import sys
from collections import defaultdict

N_BOOT = 2000          # レース単位クラスタブートストラップ回数（規律で固定）
SEED = 20260802        # 再現性のため固定
MIN_N = 200            # これ未満のセルは判定保留
GRADES = ['SS', 'S', 'A', 'B', 'C']


# ------------------------------------------------------------------ 統計コア
def roi_of(recs):
    """回収率 = Σpayout / (Σ点数×100)。掛け金は1点100円想定。"""
    stake = sum(r['n_bets'] for r in recs) * 100
    if stake == 0:
        return 0.0
    return 100.0 * sum(r['payout'] for r in recs) / stake


def cluster_bootstrap_ci(recs, n_boot=N_BOOT, seed=SEED, alpha=0.05):
    """レース単位クラスタブートストラップの95%CI [lo, hi]（回収率%）。"""
    if not recs:
        return (0.0, 0.0)
    rng = random.Random(seed)
    n = len(recs)
    rois = []
    for _ in range(n_boot):
        sample = [recs[rng.randrange(n)] for _ in range(n)]
        rois.append(roi_of(sample))
    rois.sort()
    lo = rois[int((alpha / 2) * n_boot)]
    hi = rois[min(n_boot - 1, int((1 - alpha / 2) * n_boot))]
    return (lo, hi)


def daily_variance(recs):
    """日次回収率のブレ（規律: 分散併記）。日数・平均・標準偏差・最小/最大を返す。"""
    by_day = defaultdict(list)
    for r in recs:
        by_day[r['date']].append(r)
    daily = sorted((d, roi_of(rs)) for d, rs in by_day.items())
    vals = [v for _, v in daily]
    if not vals:
        return {'days': 0, 'mean': 0, 'std': 0, 'min': 0, 'max': 0, 'top_share': 0}
    mean = sum(vals) / len(vals)
    var = sum((v - mean) ** 2 for v in vals) / len(vals)
    # 寄与の偏り: 最大寄与日のレース数シェア（特定日偏重の検出）
    day_n = sorted(((d, len(rs)) for d, rs in by_day.items()),
                   key=lambda x: -x[1])
    top_share = 100.0 * day_n[0][1] / len(recs)
    return {'days': len(vals), 'mean': mean, 'std': var ** 0.5,
            'min': min(vals), 'max': max(vals), 'top_share': top_share}


def summarize(recs, label):
    n = len(recs)
    hits = sum(r['hit'] for r in recs)
    avg_bets = sum(r['n_bets'] for r in recs) / n if n else 0
    roi = roi_of(recs)
    ci_lo, ci_hi = cluster_bootstrap_ci(recs)
    dv = daily_variance(recs)
    return {'label': label, 'N': n, 'hit_rate': 100.0 * hits / n if n else 0,
            'avg_bets': avg_bets, 'roi': roi, 'ci_lo': ci_lo, 'ci_hi': ci_hi,
            'daily': dv, 'judge_ok': n >= MIN_N}


def report(all_recs):
    total = summarize(all_recs, '全体')
    rows = [total]
    for g in GRADES:
        sub = [r for r in all_recs if r.get('grade') == g]
        if sub:
            rows.append(summarize(sub, g))

    print(f"\n{'区分':<4} {'N':>6} {'的中率':>7} {'平均点':>6} {'回収率':>7} "
          f"{'95%CI':>16} {'日数':>4} {'日次σ':>6} {'最大日ｼｪｱ':>8}")
    for s in rows:
        hold = '' if s['judge_ok'] else ' ※N<200判定保留'
        print(f"{s['label']:<4} {s['N']:>6} {s['hit_rate']:>6.1f}% "
              f"{s['avg_bets']:>5.1f}点 {s['roi']:>6.1f}% "
              f"[{s['ci_lo']:>6.1f},{s['ci_hi']:>6.1f}] "
              f"{s['daily']['days']:>4} {s['daily']['std']:>5.1f}% "
              f"{s['daily']['top_share']:>7.1f}%{hold}")

    # 指示ACの判定（事前登録: SS低・C高の主張を支持するか）
    print("\n--- 指示AC判定（事前登録基準）---")
    ss = next((s for s in rows if s['label'] == 'SS'), None)
    c = next((s for s in rows if s['label'] == 'C'), None)
    if ss and ss['judge_ok']:
        verdict = "支持" if ss['ci_hi'] < total['roi'] else "支持せず"
        print(f"SS級CI上限({ss['ci_hi']:.1f}%) < 全体回収率({total['roi']:.1f}%) → {verdict}")
    else:
        print("SS級: N不足または不存在 → 判定保留")
    if c and c['judge_ok']:
        verdict = "支持" if c['ci_lo'] > total['roi'] else "点推定のみ（CI重複）"
        print(f"C級CI下限({c['ci_lo']:.1f}%) > 全体回収率({total['roi']:.1f}%) → {verdict}")
    print("絶対判定: 回収率CI下限>100%のグレード:",
          [s['label'] for s in rows[1:] if s['judge_ok'] and s['ci_lo'] > 100] or "なし")
    return rows


# ------------------------------------------------------------ データ読み込み
def collect_recs():
    """★ADAPT(方法A): verify_4m.py のレースループをここに移植する。

    verify_4m.py の各レース処理で以下を組み立てて recs.append する:
        rec = {'race_id': race_id, 'date': date_str,
               'grade': sim.get('grade', 'C'),      # 61行付近で取得済み
               'n_bets': len(a2_bets), 'hit': hit,   # A2買い目と的中判定
               'payout': payout3t if hit else 0}     # racesテーブル
    """
    raise NotImplementedError(
        "EC2で verify_4m.py のループを移植するか、--input recs.jsonl を使ってください")


def load_jsonl(path, limit=None):
    recs = []
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            recs.append(json.loads(line))
            if limit and len(recs) >= limit:
                break
    return recs


# ------------------------------------------------------------------ selftest
def _selftest():
    """既知の回収率を持つ合成データで、集計とCIの正しさを検証する。"""
    rng = random.Random(1)
    recs = []
    # グレードごとに真の的中率/払戻を設計（真の回収率 = hit_p * payout / (bets*100)）
    design = {  # grade: (n, n_bets, hit_p, payout) → 真の回収率
        'SS': (400, 4, 0.55, 550),   # 0.55*550/400 = 75.6%
        'A':  (600, 7, 0.39, 1700),  # 0.39*1700/700 = 94.7%
        'C':  (800, 7, 0.35, 2000),  # 0.35*2000/700 = 100.0%
    }
    for g, (n, nb, p, pay) in design.items():
        for i in range(n):
            hit = 1 if rng.random() < p else 0
            recs.append({'race_id': f'{g}{i}', 'date': f'2026-06-{(i % 25) + 1:02d}',
                         'grade': g, 'n_bets': nb, 'hit': hit,
                         'payout': pay if hit else 0})
    rows = report(recs)
    # 検証1: グレード別に分かれ、実測ROIが真値の±4SE以内
    # （CIは標本実現値中心なので真値を稀に外すのが正常。判定は標準誤差ベースで行う）
    for s in rows:
        if s['label'] in design:
            n, nb, p, pay = design[s['label']]
            truth = 100.0 * p * pay / (nb * 100)
            se = 100.0 * ((p * (1 - p) / n) ** 0.5) * pay / (nb * 100)
            assert abs(s['roi'] - truth) <= 4 * se, \
                f"{s['label']}: 実測{s['roi']:.1f}%が真値{truth:.1f}%±4SE({4*se:.1f})を外した"
            # CIは実現値を必ず含む
            assert s['ci_lo'] <= s['roi'] <= s['ci_hi']
    # 検証2: CIの幅が0でない（ブートストラップが機能している）
    assert all(s['ci_hi'] > s['ci_lo'] for s in rows)
    # 検証3: 決定論（seed固定で再現）
    a = cluster_bootstrap_ci(recs[:100])
    b = cluster_bootstrap_ci(recs[:100])
    assert a == b
    print("\nverify_grade_roi selftest OK（集計・CI・日次分散・再現性）")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--input', help='recs.jsonl のパス（方法B）')
    ap.add_argument('--limit', type=int, help='小サンプル確認用の件数上限')
    ap.add_argument('--selftest', action='store_true', help='合成データで統計コアを検証')
    args = ap.parse_args()

    if args.selftest:
        _selftest()
        return
    if args.input:
        recs = load_jsonl(args.input, args.limit)
    else:
        recs = collect_recs()
        if args.limit:
            recs = recs[:args.limit]
    if not recs:
        print('recsが空です', file=sys.stderr)
        sys.exit(1)
    print(f"入力: {len(recs)}件"
          + (f"（--limit {args.limit} 小サンプル・ロジック確認モード）" if args.limit else ""))
    report(recs)


if __name__ == '__main__':
    main()
