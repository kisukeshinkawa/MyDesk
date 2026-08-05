using System.Collections.Generic;
using UnityEngine;

namespace BoatRace.Career
{
    /// <summary>
    /// ターンで発動する技(基本技+必殺技)。モンキーターンのアニメの技体系に寄せた構成:
    /// ・モンキーターン = 立ち乗り全速旋回(現代競艇の代名詞・最初の必殺技)
    /// ・全速ターン/ツケマイ/ウィリーターン = レースの実績で「ひらめく」隠し技
    /// 基本技はSP消費なし。必殺技は章クリアまたは実績条件で習得する。
    /// </summary>
    public class SkillMove
    {
        public string id;
        public string name;
        public int cost;            // SP消費(0=基本技)
        public int unlockChapter;   // 習得する章(99=実績条件でのみ習得)
        public string unlockFeat;   // 実績条件キー(makuri2/sashi2/st3など。null=章で習得)
        public string unlockDesc;   // 実績条件の説明(技強化画面のヒント表示)
        public float radiusFactor;  // 旋回半径倍率(小=鋭い)
        public float throttle;      // 技中のスロットル
        public float duration;      // 半オート実行時間(秒)
        public float topMul;        // 最高速倍率
        public float accelMul;      // 加速倍率
        public bool wakeImmune;     // 引き波無効
        public Color color;         // カットイン色

        public static readonly List<SkillMove> All = new List<SkillMove>
        {
            new SkillMove { id = "sashi", name = "差し", cost = 0, unlockChapter = 1,
                radiusFactor = 0.80f, throttle = 0.72f, duration = 3.0f, topMul = 1f, accelMul = 1f,
                color = new Color(0.1f, 0.55f, 0.95f) },
            new SkillMove { id = "makuri", name = "まくり", cost = 0, unlockChapter = 1,
                radiusFactor = 1.35f, throttle = 1f, duration = 3.0f, topMul = 1f, accelMul = 1f,
                color = new Color(0.95f, 0.35f, 0.1f) },
            // 最初の必殺技: 立ち乗りの全速旋回(モンキーターン)
            new SkillMove { id = "monkey", name = "モンキーターン", cost = 25, unlockChapter = 1,
                radiusFactor = 0.72f, throttle = 0.98f, duration = 3.5f, topMul = 1.03f, accelMul = 1.30f,
                color = new Color(0.15f, 0.9f, 1f) },
            new SkillMove { id = "godspeed", name = "ゴッドスピード", cost = 40, unlockChapter = 4,
                radiusFactor = 1.30f, throttle = 1f, duration = 4.5f, topMul = 1.15f, accelMul = 1.45f,
                color = new Color(1f, 0.75f, 0.05f) },
            new SkillMove { id = "phantom", name = "ファントム差し", cost = 35, unlockChapter = 6,
                radiusFactor = 0.58f, throttle = 0.90f, duration = 4.0f, topMul = 1.04f, accelMul = 1.25f,
                wakeImmune = true, color = new Color(0.7f, 0.3f, 1f) },
            // ---- 実績で「ひらめく」隠し技(モンキーターンの名勝負オマージュ) ----
            new SkillMove { id = "zensoku", name = "全速ターン", cost = 35, unlockChapter = 99,
                unlockFeat = "makuri2", unlockDesc = "まくりで1着を2回",
                radiusFactor = 1.28f, throttle = 1f, duration = 4.0f, topMul = 1.10f, accelMul = 1.42f,
                color = new Color(1f, 0.45f, 0.08f) },
            new SkillMove { id = "tsukemai", name = "ツケマイ", cost = 30, unlockChapter = 99,
                unlockFeat = "sashi2", unlockDesc = "差しで1着を2回",
                radiusFactor = 0.92f, throttle = 1f, duration = 3.5f, topMul = 1.05f, accelMul = 1.30f,
                wakeImmune = true, color = new Color(0.05f, 0.35f, 0.85f) },
            new SkillMove { id = "wheelie", name = "ウィリーターン", cost = 45, unlockChapter = 99,
                unlockFeat = "st3", unlockDesc = "ST .08以内のスタートを3回",
                radiusFactor = 1.32f, throttle = 1f, duration = 4.5f, topMul = 1.20f, accelMul = 1.50f,
                color = new Color(1f, 0.82f, 0.10f) },
        };

        /// <summary>この章までに習得済みの技一覧(実績条件を考慮しない旧API)。</summary>
        public static List<SkillMove> UnlockedAt(int chapter)
        {
            var list = new List<SkillMove>();
            foreach (var m in All)
                if (m.unlockChapter <= chapter) list.Add(m);
            return list;
        }

        /// <summary>キャリア状態から習得済みの技一覧(章+実績ひらめき)。</summary>
        public static List<SkillMove> UnlockedFor(CareerData c)
        {
            if (c == null) return UnlockedAt(1);
            var list = new List<SkillMove>();
            foreach (var m in All)
                if (m.unlockChapter <= c.chapter ||
                    (m.unlockFeat != null && c.featMoves.Contains(m.id)))
                    list.Add(m);
            return list;
        }

        /// <summary>この章で新たに習得した技(なければnull)。</summary>
        public static SkillMove NewlyUnlocked(int chapter)
        {
            foreach (var m in All)
                if (m.unlockChapter == chapter) return m;
            return null;
        }

        // ---- 技レベル(Lv1-5)によるスケーリング。強くなるほど消費体力も増える ----
        public const int MaxLv = 5;
        public int CostAt(int lv) => Mathf.RoundToInt(cost * (1f + 0.25f * (lv - 1)));
        public float AccelAt(int lv) => accelMul + 0.08f * (lv - 1);
        public float TopAt(int lv) => topMul + 0.02f * (lv - 1);
        public float RadiusAt(int lv) =>
            radiusFactor < 1f ? radiusFactor * (1f - 0.04f * (lv - 1))   // 差し系はより鋭く
                              : radiusFactor + 0.03f * (lv - 1);          // まくり系はより大きく速く
        public float DurationAt(int lv) => duration + 0.3f * (lv - 1);
        public int UpgradeCost(int currentLv) => 200 + currentLv * 150;   // 万円
    }
}
