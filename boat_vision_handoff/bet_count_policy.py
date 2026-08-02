# -*- coding: utf-8 -*-
"""
bet_count_policy.py — 点数決定の唯一の窓口（一元化モジュール・ドラフト）

改善案2（指示AD案）の実装ドラフト。EC2の /home/ubuntu/ky_ai/predictor/ に配置する想定。

設計方針:
- 点数決定ロジックをこの1ファイルに集約する。5層（gap12層 / L層 / bets_full /
  軸絞り / 質判定層）はすべてこのモジュールへの委譲に置き換える。
- 現在の方針は A2: gap12点数 + 6号艇頭除外。方式を変えるときはこのファイルだけを変える。
- すべての決定に reason 文字列を返し、呼び出し側で必ずログに出す。
- BUILD識別子で「daemンが実際にどのコードを読んでいるか」をログから判別可能にする。

★EC2適用時の確認事項（ADAPT）:
1. 雨/風+2・12R-2 の適用順序と条件の実値を race_predictor.py 132-148行の現行コードと
   突き合わせること（本ドラフトは指示V'の記述「（雨/風6m+2, 12R -2 は前段）」に基づく解釈。
   「前段」= gap判定より前に補正が入る、の意なら base 側を調整する）。
2. 最低3点保証（race_predictor 179行付近で温存とされたもの）の位置。
3. 質判定層（lgbm_predictor.py 1120-1170）からの点数決定コードを撤去し、
   投稿可否/conf判定のみ残す。グレード分類器は温存（罠3）。
"""

# daemン起動時と各予想ログに必ず出力すること。編集ごとに更新。
PREDICTOR_BUILD = "2026-08-02-policy-v1-draft"

# 投稿点数として正常なレンジ。範囲外なら設定ミス/旧コード混入を疑う（セルフチェック用）。
EXPECTED_BET_COUNT_RANGE = (3, 10)


def decide_bet_count(gap12, gap23=0.0, rain=False, wind_ms=0.0, race_no=None):
    """点数を決める唯一の関数。戻り値: (n_bets, reason)

    A2方式: gap12点数（指示V' 改修2のハードコード表・温存対象）
        gap12 > 25 → 4点
        gap12 > 15 → 6点
        gap12 >  8 → 8点
        gap23 >  8 → 8点
        それ以外   → 6点
    補正: 雨または風6m以上 +2 / 12R -2（★ADAPT: 現行コードと順序を要突合）
    クランプ: EXPECTED_BET_COUNT_RANGE 内に収める。
    """
    reasons = []
    if gap12 > 25:
        base = 4
        reasons.append(f"gap12={gap12:.1f}>25")
    elif gap12 > 15:
        base = 6
        reasons.append(f"gap12={gap12:.1f}>15")
    elif gap12 > 8:
        base = 8
        reasons.append(f"gap12={gap12:.1f}>8")
    elif gap23 > 8:
        base = 8
        reasons.append(f"gap23={gap23:.1f}>8")
    else:
        base = 6
        reasons.append(f"gap12={gap12:.1f} gap23={gap23:.1f} 標準")

    n = base
    if rain or (wind_ms is not None and wind_ms >= 6):
        n += 2
        reasons.append("荒天+2" if rain else f"風{wind_ms:.0f}m+2")
    if race_no == 12:
        n -= 2
        reasons.append("12R-2")

    lo, hi = EXPECTED_BET_COUNT_RANGE
    if n < lo:
        reasons.append(f"下限{lo}に補正")
        n = lo
    elif n > hi:
        reasons.append(f"上限{hi}に補正")
        n = hi

    reason = f"policy=A2 build={PREDICTOR_BUILD} " + " ".join(reasons)
    return n, reason


def apply_a2_filter(sim_bets, n_bets, min_bets=3):
    """A2の買い目確定: 上位n_bets点を取り、6号艇頭を除外。最低min_bets点を保証。

    sim_bets: [{'combo': '1-2-3', ...}, ...] 確率降順を前提。
    6除外で min_bets を割る場合は、6頭以外の候補を次点から補充する。
    """
    picked = [b for b in sim_bets[:n_bets]
              if not b.get('combo', '').startswith('6-')]
    if len(picked) < min_bets:
        for b in sim_bets[n_bets:]:
            if b.get('combo', '').startswith('6-'):
                continue
            picked.append(b)
            if len(picked) >= min_bets:
                break
    return picked


def self_check_bet_count(n_bets, logger=None):
    """投稿直前のセルフチェック。範囲外ならFalseを返しWARNを出す（改善案3-2）。

    呼び出し側（daemon.py の投稿処理）で False の場合の扱いを決める:
    最低限WARNログ、推奨は投稿保留+通知。
    """
    lo, hi = EXPECTED_BET_COUNT_RANGE
    ok = lo <= n_bets <= hi
    if not ok:
        msg = (f"⚠ 点数セルフチェックNG: 絞り{n_bets}点は期待レンジ[{lo},{hi}]外。"
               f" 旧コード/pyc混入の疑い (build={PREDICTOR_BUILD})")
        if logger:
            logger.warning(msg)
        else:
            print(msg)
    return ok


# ---------------------------------------------------------------- self tests
def _selftest():
    # gap12表の分岐
    assert decide_bet_count(30)[0] == 4
    assert decide_bet_count(20)[0] == 6
    assert decide_bet_count(10)[0] == 8
    assert decide_bet_count(5, gap23=10)[0] == 8
    assert decide_bet_count(5, gap23=5)[0] == 6
    # 補正
    assert decide_bet_count(20, rain=True)[0] == 8          # 6+2
    assert decide_bet_count(20, wind_ms=7)[0] == 8          # 6+2
    assert decide_bet_count(20, race_no=12)[0] == 4         # 6-2
    assert decide_bet_count(30, race_no=12)[0] == 3         # 4-2→下限3
    assert decide_bet_count(10, rain=True)[0] == 10         # 8+2=10 上限内
    # 6号艇頭除外と最低保証
    bets = [{'combo': c} for c in
            ['6-1-2', '1-2-3', '6-2-1', '2-1-3', '1-3-2', '3-1-2', '4-1-2']]
    picked = apply_a2_filter(bets, 4)                       # 上位4→6頭2つ除外→2点→補充
    assert [b['combo'] for b in picked] == ['1-2-3', '2-1-3', '1-3-2']
    picked = apply_a2_filter(bets, 6)
    assert all(not b['combo'].startswith('6-') for b in picked)
    assert len(picked) == 4
    # セルフチェック
    assert self_check_bet_count(6)
    assert not self_check_bet_count(18)
    print(f"bet_count_policy selftest OK (build={PREDICTOR_BUILD})")
    n, reason = decide_bet_count(17.3, gap23=4.0, wind_ms=7, race_no=12)
    print(f"例: 点数決定: {n}点 ({reason})")


if __name__ == '__main__':
    _selftest()
