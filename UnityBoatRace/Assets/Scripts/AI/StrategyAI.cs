using System.Collections.Generic;
using BoatRace.Boat;
using BoatRace.Core;
using BoatRace.Data;

namespace BoatRace.AI
{
    /// <summary>
    /// 展開AI(1マーク攻防)。スタート結果・コース・モーター性能に加え、
    /// 会場の決まり手傾向(まくり水面/差し水面)と風・波を織り込んで
    /// 逃げ/差し/まくり/まくり差しを決定する(実際のセオリー準拠)。
    /// ・向かい風 = ダッシュ勢の助走が効いてまくり増
    /// ・追い風   = スロー勢有利で差し・逃げ増
    /// ・荒れ水面 = 全速で握れずまくり減、差しが残る
    /// </summary>
    public static class StrategyAI
    {
        /// <summary>
        /// スタート直後(1M進入前)に戦術決定。
        /// stRanks: ST順位(0が最速)。wind: 風ベクトル(+X=追い風)。
        /// </summary>
        public static Tactic Decide(BoatStats stats, int course, int stRank, List<float> allST,
            VenueData venue, UnityEngine.Vector3 wind, System.Random rng)
        {
            if (course == 1) return Tactic.Nige;

            bool stAdvantage = stRank <= 1;                 // ST上位
            bool motorPower = stats.motor.topSpeed > 22.0f; // 伸び足あり
            float aggression = stats.player.mental * 0.5f + stats.player.turnSkill * 0.5f;

            // 会場×気象の決まり手補正(-0.5〜+0.5程度)
            float headwind = UnityEngine.Mathf.Clamp(-wind.x / 6f, -1f, 1f); // +=向かい風
            float makuriMod = (venue.makuriBias - 0.5f) + headwind * 0.35f - venue.waveHeight * 1.6f;
            float sashiMod = (venue.sashiBias - 0.5f) - headwind * 0.20f + venue.waveHeight * 1.0f;

            if (course == 2)
                return (stAdvantage && motorPower && rng.NextDouble() < 0.28 + makuriMod * 0.35)
                    ? Tactic.Makuri : Tactic.Sashi;

            if (course <= 4)
            {
                if (stAdvantage && motorPower &&
                    rng.NextDouble() < 0.62 + makuriMod * 0.5) return Tactic.Makuri;
                if (stAdvantage)
                    return rng.NextDouble() < 0.55 + sashiMod * 0.4
                        ? Tactic.MakuriSashi : Tactic.Makuri;
                return rng.NextDouble() < aggression * 0.45 + sashiMod * 0.3
                    ? Tactic.Sashi : Tactic.MakuriSashi;
            }

            // 5-6コース: ダッシュ勢。伸びとSTが揃えば全速まくり、届かなければまくり差し
            if (stAdvantage && motorPower &&
                rng.NextDouble() < 0.66 + makuriMod * 0.5) return Tactic.Makuri;
            return Tactic.MakuriSashi;
        }

        public static string TacticName(Tactic t)
        {
            switch (t)
            {
                case Tactic.Nige: return "逃げ";
                case Tactic.Sashi: return "差し";
                case Tactic.Makuri: return "まくり";
                case Tactic.MakuriSashi: return "まくり差し";
                default: return "-";
            }
        }
    }
}
