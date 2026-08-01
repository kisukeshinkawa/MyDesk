using UnityEngine;

namespace BoatRace.Physics
{
    /// <summary>
    /// 燃料システム。周回ごとに燃料が減り、軽くなるぶん終盤わずかに伸びる。
    /// 燃料切れ(積載ミス)を起こすと大幅パワーダウン。
    /// </summary>
    public class FuelSystem
    {
        public float initialFuel;      // リットル
        public float fuel;
        public float consumptionRate;  // L/s (全開時)

        public FuelSystem(float initialFuel = 3.0f, float consumptionRate = 0.011f)
        {
            this.initialFuel = initialFuel;
            fuel = initialFuel;
            this.consumptionRate = consumptionRate;
        }

        public void Consume(float throttle, float dt)
        {
            fuel = Mathf.Max(0f, fuel - consumptionRate * Mathf.Clamp01(throttle) * dt);
        }

        public bool IsEmpty => fuel <= 0f;

        /// <summary>燃料残による最高速補正。軽いほど+、ガス欠で激減。</summary>
        public float SpeedModifier
        {
            get
            {
                if (IsEmpty) return 0.35f;
                float burned = 1f - fuel / initialFuel;
                return 1f + burned * 0.012f; // 燃料を使い切る頃に約+1.2%
            }
        }

        /// <summary>燃料残による加速補正。</summary>
        public float AccelerationModifier
        {
            get
            {
                if (IsEmpty) return 0.2f;
                float burned = 1f - fuel / initialFuel;
                return 1f + burned * 0.02f;
            }
        }
    }
}
