using UnityEngine;
using BoatRace.Core;

namespace BoatRace.Start
{
    /// <summary>
    /// フライングスタート方式。大時計0秒〜1秒の間にスタートラインを通過する。
    /// 0秒前=フライング(F)、1秒超=出遅れ(L)。
    /// </summary>
    public static class StartSystem
    {
        public const float LateLimit = 1.0f;

        /// <summary>ライン通過時のST判定。</summary>
        public static (float st, StartFlag flag) EvaluateCross(float clockAtCross)
        {
            if (clockAtCross < 0f) return (clockAtCross, StartFlag.Flying);
            if (clockAtCross > LateLimit) return (clockAtCross, StartFlag.Late);
            return (clockAtCross, StartFlag.Normal);
        }

        /// <summary>
        /// 助走距離distを全開加速で走り切る所要時間の概算(数値積分)。
        /// StartAIが「いつ握るか」を逆算するのに使う。
        /// </summary>
        public static float EstimateRunTime(float dist, float accel, float topSpeed,
            float initialSpeed = 0f, float dragFactor = 1f)
        {
            float t = 0f, x = 0f, v = initialSpeed;
            const float dt = 0.05f;
            while (x < dist && t < 30f)
            {
                v = Mathf.Min(topSpeed, v + accel * dt);
                v -= (v * 0.055f * dragFactor + v * v * 0.0035f) * dt; // エンジンと同じ抵抗モデル
                x += v * dt;
                t += dt;
            }
            return t;
        }
    }
}
