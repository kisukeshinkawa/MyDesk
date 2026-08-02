using UnityEngine;

namespace BoatRace.Core
{
    /// <summary>
    /// コース幾何。水面300m×600m、左回り(反時計回り)周回。
    /// 1マーク=(0,0,0)、2マーク=(-300,0,0)。ホームストレッチ z&lt;0、バックストレッチ z&gt;0。
    /// スタートライン x=-150(ホーム側)。3周1800m。
    /// </summary>
    public static class TrackPath
    {
        public static readonly Vector3 Mark1 = new Vector3(0f, 0f, 0f);
        public static readonly Vector3 Mark2 = new Vector3(-300f, 0f, 0f);
        public const float StartLineX = -150f;
        public const float StraightLength = 300f;
        public const int TotalLaps = 3;

        /// <summary>周回路の全長(半径Rのレーンの場合)。</summary>
        public static float LapLength(float r) => 2f * StraightLength + 2f * Mathf.PI * r;

        /// <summary>
        /// 位置から周回進行度 s (m) を求める。半径Rのレーン基準。
        /// s=0 はホームストレッチの2マーク側起点。全域で連続・単調になるよう
        /// 4区間(ホーム/1M旋回/バック/2M旋回)を厳密に場合分けする。
        /// </summary>
        public static float GetProgress(Vector3 pos, float r)
        {
            float piR = Mathf.PI * r;

            if (pos.x > Mark1.x)
            {
                // 1M旋回(右半平面): φは-90°(進入)→+90°(旋回明け)で連続
                float phi = Mathf.Atan2(pos.z, pos.x - Mark1.x);
                float t = Mathf.InverseLerp(-Mathf.PI * 0.5f, Mathf.PI * 0.5f, phi);
                return StraightLength + t * piR;
            }
            if (pos.x < Mark2.x)
            {
                // 2M旋回(左半平面): φを0..360°に正規化すると90°(進入)→270°(明け)で連続
                float deg = Mathf.Atan2(pos.z, pos.x - Mark2.x) * Mathf.Rad2Deg;
                float psi = deg < 0f ? deg + 360f : deg;   // 90..270
                float t = Mathf.Clamp01((psi - 90f) / 180f);
                return 2f * StraightLength + piR + t * piR;
            }
            if (pos.z < 0f) return pos.x - Mark2.x;                  // ホーム(+X方向)
            return StraightLength + piR + (Mark1.x - pos.x);         // バック(-X方向)
        }

        /// <summary>進行度 s (m) → レーン半径R上の座標。</summary>
        public static Vector3 PointAt(float s, float r)
        {
            float piR = Mathf.PI * r;
            float total = LapLength(r);
            s = Mathf.Repeat(s, total);

            if (s < StraightLength)
                return new Vector3(Mark2.x + s, 0f, -r);                          // ホーム

            s -= StraightLength;
            if (s < piR)
            {
                float phi = -Mathf.PI * 0.5f + (s / piR) * Mathf.PI;              // 1M旋回
                return Mark1 + new Vector3(Mathf.Cos(phi) * r, 0f, Mathf.Sin(phi) * r);
            }

            s -= piR;
            if (s < StraightLength)
                return new Vector3(Mark1.x - s, 0f, r);                           // バック

            s -= StraightLength;
            float phi2 = Mathf.PI * 0.5f + (s / piR) * Mathf.PI;                  // 2M旋回
            return Mark2 + new Vector3(Mathf.Cos(phi2) * r, 0f, Mathf.Sin(phi2) * r);
        }

        /// <summary>1マーク旋回ゾーンにいるか。</summary>
        public static bool InTurn1Zone(Vector3 pos) => pos.x > Mark1.x - 15f;

        /// <summary>2マーク旋回ゾーンにいるか。</summary>
        public static bool InTurn2Zone(Vector3 pos) => pos.x < Mark2.x + 15f;
    }
}
