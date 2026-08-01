using System.Collections.Generic;
using BoatRace.Boat;
using BoatRace.Core;

namespace BoatRace.AI
{
    /// <summary>
    /// 展開AI(1マーク攻防)。スタート結果・コース・モーター性能から
    /// 逃げ/差し/まくり/まくり差しを決定する。
    /// </summary>
    public static class StrategyAI
    {
        /// <summary>
        /// スタート直後(1M進入前)に戦術決定。
        /// stRanks: ST順位(0が最速)。
        /// </summary>
        public static Tactic Decide(BoatStats stats, int course, int stRank, List<float> allST, System.Random rng)
        {
            if (course == 1) return Tactic.Nige;

            bool stAdvantage = stRank <= 1;                 // ST上位
            bool motorPower = stats.motor.topSpeed > 22.0f; // 伸び足あり
            float aggression = stats.player.mental * 0.5f + stats.player.turnSkill * 0.5f;

            if (course == 2)
                return (stAdvantage && motorPower && rng.NextDouble() < 0.3) ? Tactic.Makuri : Tactic.Sashi;

            if (course <= 4)
            {
                if (stAdvantage && motorPower) return Tactic.Makuri;
                if (stAdvantage) return Tactic.MakuriSashi;
                return rng.NextDouble() < aggression * 0.5f ? Tactic.MakuriSashi : Tactic.Sashi;
            }

            // 5-6コース: ダッシュ勢
            if (stAdvantage && motorPower) return Tactic.Makuri;
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
