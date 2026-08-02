using UnityEngine;
using BoatRace.Boat;

namespace BoatRace.Start
{
    /// <summary>
    /// ピット離れ。モーターのレスポンス×選手スキルで飛び出しの鋭さが決まり、
    /// 進入コース争いの有利不利につながる。
    /// </summary>
    public static class PitExitSystem
    {
        /// <summary>
        /// ピット位置(艇番順に並ぶ)。場によってピットの位置が違う:
        /// 2マーク側ピット(徳山・大村など)=進入位置に近く枠なりになりやすい /
        /// 1マーク側ピット=2Mまで距離があり前づけ(コース取り合戦)が起きやすい。
        /// </summary>
        public static Vector3 PitPosition(int boatIndex, int venueId)
        {
            return Data.VenueTraits.PitNear2Mark(venueId)
                ? new Vector3(-240f + boatIndex * 6f, 0f, -42f)  // 2マーク側
                : new Vector3(-60f + boatIndex * 6f, 0f, -42f);  // 1マーク側
        }

        /// <summary>ピット離れの反応遅延(秒)。小さいほど好ダッシュ。</summary>
        public static float ExitDelay(BoatStats stats, System.Random rng)
        {
            float baseDelay = 0.35f - stats.EngineResponse * 0.2f - stats.player.startSkill * 0.1f;
            float noise = (float)rng.NextDouble() * 0.1f;
            return Mathf.Max(0.05f, baseDelay + noise);
        }

        /// <summary>ピット離れ直後の加速倍率。</summary>
        public static float DashPower(BoatStats stats)
        {
            return stats.PitAcceleration / stats.EffectiveAcceleration; // 0.8〜1.2
        }
    }
}
