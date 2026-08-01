using System.Collections.Generic;
using BoatRace.Boat;
using BoatRace.Data;
using BoatRace.Physics;

namespace BoatRace.Start
{
    /// <summary>
    /// 展示タイムシステム。
    /// 展示タイム = baseTime - モーター補正 - 選手スキル補正 + 風補正 + 波補正
    /// 本番前に計算して舟券予想(オッズ表示)の材料にする。
    /// </summary>
    public static class ExhibitionSystem
    {
        public const float BaseTime = 6.80f; // 150m直線の基準タイム(秒)

        public static float ComputeExhibitionTime(BoatStats stats, VenueData venue, WindSystem wind, System.Random rng)
        {
            float motorMod  = (stats.motor.OverallScore - 50f) * 0.004f;          // ±0.2s
            float skillMod  = (stats.player.turnSkill - 0.5f) * 0.10f;
            float windMod   = wind.speed * 0.012f * venue.windEffect;
            float waveMod   = venue.waveHeight * 1.5f;
            float noise     = ((float)rng.NextDouble() * 2f - 1f) * 0.03f;
            return BaseTime - motorMod - skillMod + windMod + waveMod + noise;
        }

        /// <summary>全艇の展示を実施し、タイム昇順の艇index順位も返す。</summary>
        public static (float[] times, int[] ranking) RunExhibition(
            List<BoatStats> boats, VenueData venue, WindSystem wind, System.Random rng)
        {
            int n = boats.Count;
            var times = new float[n];
            for (int i = 0; i < n; i++)
                times[i] = ComputeExhibitionTime(boats[i], venue, wind, rng);

            var ranking = new int[n];
            for (int i = 0; i < n; i++) ranking[i] = i;
            System.Array.Sort(ranking, (a, b) => times[a].CompareTo(times[b]));
            return (times, ranking);
        }
    }
}
