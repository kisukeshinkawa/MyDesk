using UnityEngine;

namespace BoatRace.Setup
{
    /// <summary>
    /// プロペラ調整。pitch/diameter/balance が加速・最高速・旋回の補正倍率になる。
    /// ピッチを上げると最高速寄り、下げると加速寄り。バランスが悪いと全性能ダウン。
    /// </summary>
    [System.Serializable]
    public class PropellerSetting
    {
        [Range(-3f, 3f)] public float pitch;      // 基準からの角度調整(度)
        [Range(-2f, 2f)] public float diameter;   // 基準からの径調整(mm)
        [Range(0f, 1f)]  public float balance;    // 叩き精度 0-1 (1=完璧)

        public float AccelerationModifier =>
            (1f - pitch * 0.03f + diameter * 0.01f) * BalanceFactor;

        public float TopSpeedModifier =>
            (1f + pitch * 0.025f - diameter * 0.005f) * BalanceFactor;

        public float TurnModifier =>
            (1f - Mathf.Abs(pitch) * 0.01f + diameter * 0.015f) * BalanceFactor;

        float BalanceFactor => 0.94f + balance * 0.06f;

        public static PropellerSetting Default() =>
            new PropellerSetting { pitch = 0f, diameter = 0f, balance = 0.8f };

        /// <summary>整備巧者ほど当たり調整を引きやすい。</summary>
        public static PropellerSetting RandomTuned(System.Random rng, float tuningSkill)
        {
            return new PropellerSetting
            {
                pitch    = ((float)rng.NextDouble() * 2f - 1f) * 2f,
                diameter = ((float)rng.NextDouble() * 2f - 1f) * 1.5f,
                balance  = 0.5f + (float)rng.NextDouble() * 0.5f * tuningSkill + 0.2f * tuningSkill,
            };
        }
    }
}
