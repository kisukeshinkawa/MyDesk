using BoatRace.Data;
using BoatRace.Player;
using BoatRace.Setup;

namespace BoatRace.Boat
{
    /// <summary>
    /// 選手×モーター×プロペラ調整を合成した「この艇の実効性能」。
    /// 物理エンジンとAIはこのクラスだけを参照する。
    /// </summary>
    [System.Serializable]
    public class BoatStats
    {
        public int boatNumber;          // 艇番 1-6
        public PlayerStats player;
        public MotorData motor;
        public PropellerSetting propeller;

        public const float BoatHandling = 1.0f; // 艇体基準ハンドリング

        /// <summary>実効加速力 (m/s^2)。</summary>
        public float EffectiveAcceleration =>
            motor.acceleration * propeller.AccelerationModifier * player.WeightAccelModifier;

        /// <summary>実効最高速 (m/s)。</summary>
        public float EffectiveTopSpeed =>
            motor.topSpeed * propeller.TopSpeedModifier;

        /// <summary>実効旋回力。TurnPhysicsの turnRadius = speed / turnPower に使う。</summary>
        public float EffectiveTurnPower =>
            motor.turnPower * propeller.TurnModifier * (0.7f + 0.6f * player.TurnEfficiency(BoatHandling));

        /// <summary>ピット離れ性能: 出足×レスポンス。</summary>
        public float PitAcceleration =>
            EffectiveAcceleration * (0.8f + 0.4f * EngineResponse);

        /// <summary>エンジンレスポンス 0-1。モーター安定性と整備で決まる。</summary>
        public float EngineResponse =>
            motor.stability * 0.6f + propeller.balance * 0.4f;
    }
}
