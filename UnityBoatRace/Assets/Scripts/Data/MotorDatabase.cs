using System.Collections.Generic;

namespace BoatRace.Data
{
    /// <summary>モーター個体性能。抽選で選手に割り当てられる。</summary>
    [System.Serializable]
    public class MotorData
    {
        public int motorNumber;
        public float acceleration;  // 加速力 (m/s^2 基準値 6.5〜8.0)
        public float topSpeed;      // 最高速 (m/s 基準値 20.5〜23.0)
        public float turnPower;     // 出足・回り足 (0.8〜1.2 倍率)
        public float stability;     // 安定性 0-1 (低いと挙動ブレ大)
        public float winRate2;      // 参考: 2連対率(%)

        /// <summary>総合評価 0-100。展示・オッズ表示用。</summary>
        public float OverallScore =>
            (acceleration - 6.5f) / 1.5f * 30f +
            (topSpeed - 20.5f) / 2.5f * 30f +
            (turnPower - 0.8f) / 0.4f * 25f +
            stability * 15f;
    }

    /// <summary>モーター生成と抽選割り当て。</summary>
    public static class MotorDatabase
    {
        /// <summary>1節分のモーター群を生成（実機は60機前後）。</summary>
        public static List<MotorData> GenerateSeasonMotors(int count, int seed)
        {
            var rng = new System.Random(seed);
            var list = new List<MotorData>(count);
            for (int i = 0; i < count; i++)
            {
                float quality = (float)rng.NextDouble(); // 0=出足悪い 1=超抜モーター
                list.Add(new MotorData
                {
                    motorNumber = i + 1,
                    acceleration = 6.5f + quality * 1.5f + Rand(rng, 0.15f),
                    topSpeed     = 20.5f + quality * 2.5f + Rand(rng, 0.2f),
                    turnPower    = 0.8f + quality * 0.4f + Rand(rng, 0.03f),
                    stability    = 0.4f + quality * 0.5f + Rand(rng, 0.05f),
                    winRate2     = 20f + quality * 40f + Rand(rng, 5f),
                });
            }
            return list;
        }

        /// <summary>抽選: 重複なしで6機割り当て。</summary>
        public static List<MotorData> RandomAssign(List<MotorData> pool, int boats, System.Random rng)
        {
            var copy = new List<MotorData>(pool);
            var assigned = new List<MotorData>(boats);
            for (int i = 0; i < boats && copy.Count > 0; i++)
            {
                int idx = rng.Next(copy.Count);
                assigned.Add(copy[idx]);
                copy.RemoveAt(idx);
            }
            return assigned;
        }

        static float Rand(System.Random rng, float amp) => ((float)rng.NextDouble() * 2f - 1f) * amp;
    }
}
