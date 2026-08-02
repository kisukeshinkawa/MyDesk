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
        /// <summary>ピットスタールの横間隔(m)。6艇が横一列に並ぶ。</summary>
        public const float StallSpacing = 7.5f;

        /// <summary>ピット全体の中心x座標。場によって2マーク側/1マーク側が違う。</summary>
        public static float PitCenterX(int venueId)
        {
            return Data.VenueTraits.PitNear2Mark(venueId) ? -245f : -55f;
        }

        /// <summary>
        /// ピットスタール位置。実際の競艇と同じく岸側に6艇が横一列で
        /// コース(+Z)を向いて格納され、ピット離れで全艇一斉に前へ飛び出す。
        /// 2マーク側ピット(大村・徳山など)=進入まで近く枠なり /
        /// 1マーク側ピット=前づけが起きやすい。
        /// </summary>
        public static Vector3 PitPosition(int boatIndex, int venueId)
        {
            float hw = Data.VenueTraits.WaterHalfWidth(venueId);
            float x = PitCenterX(venueId) + (boatIndex - 2.5f) * StallSpacing;
            return new Vector3(x, 0f, -(hw - 22f));
        }

        /// <summary>
        /// ピット離れタイム(秒)。仕様書の式:
        /// 基準1.00s - pitOutSkill*0.35 + モーター起動遅延(±0.15) + 隣接艇干渉ペナルティ。
        /// 外枠ほど内枠の引き波・航跡に阻まれやすい。
        /// </summary>
        public static float ExitDelay(BoatStats stats, int boatIndex, System.Random rng)
        {
            float pitOutSkill = stats.player.startSkill * 0.5f + stats.EngineResponse * 0.5f;
            float motorLag = ((float)rng.NextDouble() * 2f - 1f) * 0.15f;
            float interference = boatIndex * 0.025f * (0.5f + (float)rng.NextDouble());
            return Mathf.Max(0.2f, 1.0f - pitOutSkill * 0.35f + motorLag + interference);
        }

        /// <summary>ピット離れ直後の加速倍率。</summary>
        public static float DashPower(BoatStats stats)
        {
            return stats.PitAcceleration / stats.EffectiveAcceleration; // 0.8〜1.2
        }
    }
}
