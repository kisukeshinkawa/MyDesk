using UnityEngine;
using BoatRace.Data;

namespace BoatRace.Physics
{
    /// <summary>潮流シミュレーション。江戸川など潮の流れが強い場ほど艇を流す。</summary>
    public class CurrentSystem
    {
        public float directionDeg;
        public float strength;   // m/s
        readonly VenueData venue;
        float time;

        public CurrentSystem(VenueData venue, System.Random rng)
        {
            this.venue = venue;
            // 潮流はコース長軸(X)方向のどちらかに流れる想定
            directionDeg = rng.NextDouble() < 0.5 ? 90f : 270f;
            strength = venue.currentStrength * 0.8f;
        }

        public void Step(float dt) => time += dt;

        /// <summary>艇を押し流すベクトル。満ち引きでゆっくり脈動する。</summary>
        public Vector3 DriftVector
        {
            get
            {
                float pulse = 0.85f + 0.15f * Mathf.Sin(time * 0.05f);
                return Quaternion.Euler(0f, directionDeg, 0f) * Vector3.forward * (strength * pulse);
            }
        }

        /// <summary>進行方向への速度補正。</summary>
        public float SpeedPush(Vector3 boatForward)
        {
            return Vector3.Dot(DriftVector, boatForward) * 0.4f;
        }
    }
}
