using System.Collections.Generic;
using UnityEngine;

namespace BoatRace.Career
{
    /// <summary>
    /// ターンで発動する技(基本技+必殺技)。
    /// 基本技はSP消費なし。SPが尽きると基本技(差し/まくり)しか選べない。
    /// 必殺技は章クリアで習得していく。
    /// </summary>
    public class SkillMove
    {
        public string id;
        public string name;
        public int cost;            // SP消費(0=基本技)
        public int unlockChapter;   // 習得する章
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
            new SkillMove { id = "lightning", name = "⚡ライトニングターン", cost = 30, unlockChapter = 2,
                radiusFactor = 0.60f, throttle = 0.95f, duration = 3.5f, topMul = 1.02f, accelMul = 1.35f,
                color = new Color(0.15f, 0.9f, 1f) },
            new SkillMove { id = "godspeed", name = "👹ゴッドスピード", cost = 40, unlockChapter = 4,
                radiusFactor = 1.30f, throttle = 1f, duration = 4.5f, topMul = 1.15f, accelMul = 1.45f,
                color = new Color(1f, 0.75f, 0.05f) },
            new SkillMove { id = "phantom", name = "🌀ファントム差し", cost = 35, unlockChapter = 6,
                radiusFactor = 0.58f, throttle = 0.90f, duration = 4.0f, topMul = 1.04f, accelMul = 1.25f,
                wakeImmune = true, color = new Color(0.7f, 0.3f, 1f) },
        };

        /// <summary>この章までに習得済みの技一覧。</summary>
        public static List<SkillMove> UnlockedAt(int chapter)
        {
            var list = new List<SkillMove>();
            foreach (var m in All)
                if (m.unlockChapter <= chapter) list.Add(m);
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
