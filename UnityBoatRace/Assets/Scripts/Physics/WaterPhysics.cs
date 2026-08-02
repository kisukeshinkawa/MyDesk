using UnityEngine;
using BoatRace.Data;

namespace BoatRace.Physics
{
    /// <summary>水抵抗の計算。drag = speed * waterResistance (+波・水質補正)。</summary>
    public static class WaterPhysics
    {
        public const float BaseResistance = 0.055f;

        /// <summary>会場の水質・波による抵抗倍率(基準1.0)。STの逆算にも使う。</summary>
        public static float ResistanceFactor(VenueData venue)
        {
            float f = 1f;
            // 海水は浮力が高く抵抗わずかに減、汽水は中間
            switch (venue.waterType)
            {
                case WaterType.Seawater: f *= 0.96f; break;
                case WaterType.Brackish: f *= 0.98f; break;
                case WaterType.Tidal:    f *= 0.97f; break;
            }
            // 波が高いほど抵抗増
            f *= 1f + venue.waveHeight * 2.5f;
            return f;
        }

        /// <summary>速度に対する減速量 (m/s^2)。</summary>
        public static float ComputeDrag(float speed, VenueData venue)
        {
            float resistance = BaseResistance * ResistanceFactor(venue);
            return speed * resistance + speed * speed * 0.0035f;
        }

        /// <summary>波による艇の上下動(見た目用)。</summary>
        public static float WaveOffset(Vector3 pos, float time, VenueData venue)
        {
            return Mathf.Sin(pos.x * 0.08f + time * 1.7f) *
                   Mathf.Cos(pos.z * 0.06f + time * 1.3f) *
                   venue.waveHeight;
        }
    }
}
