using UnityEngine;
using BoatRace.Data;
using BoatRace.Physics;

namespace BoatRace.Boat
{
    /// <summary>
    /// 艇1隻分の物理シミュレーション本体(純C#・Transform非依存)。
    /// speed += accel*dt / speed -= waterDrag、旋回・遠心力外流れ・
    /// 風・潮流・引き波・燃料減衰をすべて統合する。
    /// </summary>
    public class BoatPhysicsEngine
    {
        public readonly int index;            // 0-5
        public readonly BoatStats stats;
        readonly VenueData venue;
        readonly WindSystem wind;
        readonly CurrentSystem current;
        readonly WakePhysics wake;
        public readonly FuelSystem fuel;

        public Vector3 Position;
        public float HeadingDeg;              // 0=+Z, 90=+X
        public float Speed;                   // m/s
        public float Throttle;                // 0-1 (AI/入力が設定)
        public float Steer;                   // -1(左)〜+1(右)
        public float LastWakeDrag { get; private set; }

        // 必殺技ブースト(SkillMove発動中のみ有効)
        public float BoostTime;
        public float BoostTopMul = 1f;
        public float BoostAccelMul = 1f;
        public bool BoostWakeImmune;

        public Vector3 Forward => Quaternion.Euler(0f, HeadingDeg, 0f) * Vector3.forward;

        public BoatPhysicsEngine(int index, BoatStats stats, VenueData venue,
            WindSystem wind, CurrentSystem current, WakePhysics wake)
        {
            this.index = index;
            this.stats = stats;
            this.venue = venue;
            this.wind = wind;
            this.current = current;
            this.wake = wake;
            fuel = new FuelSystem();
        }

        public void Step(float dt)
        {
            Vector3 fwd = Forward;
            bool boosting = BoostTime > 0f;
            if (boosting) BoostTime -= dt;

            // ---- 引き波(必殺技で無効化されることがある) ----
            LastWakeDrag = boosting && BoostWakeImmune ? 0f : wake.GetWakeDrag(index, Position);

            // ---- 加速 ----
            float accel = stats.EffectiveAcceleration * fuel.AccelerationModifier * Mathf.Clamp01(Throttle);
            if (boosting) accel *= BoostAccelMul;
            Speed += accel * dt;

            // ---- 水抵抗 + 引き波抵抗 ----
            float drag = WaterPhysics.ComputeDrag(Speed, venue) + LastWakeDrag * 1.6f;
            Speed -= drag * dt;

            // ---- 風・潮流の押し ----
            Speed += (wind.SpeedPush(fwd) + current.SpeedPush(fwd)) * dt;

            // ---- 最高速制限(燃料減衰で終盤わずかに伸びる) ----
            float top = stats.EffectiveTopSpeed * fuel.SpeedModifier;
            if (boosting) top *= BoostTopMul;
            Speed = Mathf.Clamp(Speed, 0f, top);

            // ---- 旋回 ----
            float turnPower = stats.EffectiveTurnPower;
            float maxYaw = TurnPhysics.MaxYawRate(Speed, turnPower);
            float disturbance = wind.TurnDisturbance(fwd) + LastWakeDrag * 0.8f * (1f - stats.motor.stability);
            float yaw = Steer * maxYaw;
            HeadingDeg += yaw * dt;
            HeadingDeg += Mathf.Sin(Time.time * 7f + index) * disturbance * dt * 20f; // 挙動乱れ

            // 舵を切ると速度が削れる(ターンの減速)
            Speed -= Mathf.Abs(Steer) * Speed * 0.22f * dt;

            // ---- 遠心力による外流れ ----
            if (Mathf.Abs(Steer) > 0.1f && Speed > 3f)
            {
                float radius = TurnPhysics.TurnRadius(Speed, turnPower * Mathf.Abs(Steer));
                float driftAmount = TurnPhysics.OutwardDrift(Speed, radius, stats.motor.stability);
                Vector3 outward = Quaternion.Euler(0f, HeadingDeg, 0f) *
                                  (Steer > 0f ? Vector3.left : Vector3.right);
                Position += outward * driftAmount * dt;
            }

            // ---- 移動 + 潮流ドリフト ----
            Position += Forward * Speed * dt;
            Position += current.DriftVector * dt * 0.6f;

            // ---- 燃料消費・航跡記録 ----
            fuel.Consume(Throttle, dt);
            wake.Record(index, Position, Speed, dt);
        }
    }
}
