using UnityEngine;
using BoatRace.Boat;
using BoatRace.Start;

namespace BoatRace.AI
{
    /// <summary>
    /// スタートAI。目標STから逆算して「いつ握るか(全開にするか)」を決める。
    /// 助走距離・加速性能・大時計を見てタイミングを合わせる本物のST勝負を再現。
    /// </summary>
    public class StartAI
    {
        public const float HoldSpeed = 1.6f; // 起こし前の待機速度(モーター停止禁止)

        public float targetST;     // この艇が狙うST(選手スキルから生成)
        public float goTime;       // 大時計上の全開開始時刻(負値)
        float runTime;

        /// <summary>
        /// actualDistance = 起こし位置からラインまでの実距離。
        /// 待機行動で前へ流れた分だけ助走が浅くなる(モーター停止禁止のジレンマ)。
        /// </summary>
        public void Plan(BoatStats stats, int course, System.Random rng, float actualDistance,
            float venueDragFactor = 1f)
        {
            // 目標ST: 実戦の平均.15前後。上手い選手ほど攻める、Fを恐れて.08より早くは狙わない
            targetST = Mathf.Clamp(
                0.04f + stats.player.ComputeST(rng, pressure: course >= 5 ? 0.2f : 0f),
                0.08f, 0.35f);

            // 助走が浅いと加速しきれずST精度も落ちる
            float standard = WaitingSystem.ApproachDistance(course);
            if (actualDistance < standard * 0.8f)
                targetST += (standard * 0.8f - actualDistance) * 0.004f; // 深イン化ペナルティ

            // 「いつ握るか」の逆算。握るまでは待機速度で前進し続けて助走が
            // 減っていくため、固定点反復で自己整合させる
            goTime = -6f;
            for (int iter = 0; iter < 4; iter++)
            {
                float distAtGo = actualDistance - HoldSpeed * (goTime + 12f);
                runTime = StartSystem.EstimateRunTime(
                    Mathf.Max(20f, distAtGo), stats.EffectiveAcceleration, stats.EffectiveTopSpeed,
                    initialSpeed: HoldSpeed, dragFactor: venueDragFactor);
                goTime = Mathf.Clamp(targetST - runTime, -11.5f, -1f);
            }
        }

        /// <summary>
        /// 助走中のスロットル。goTimeまで待機速度(約1.6m/s)を保持→以降全開。
        /// ※固定スロットルだと艇は際限なく加速してしまうため速度制御にする
        /// </summary>
        public float GetThrottle(float clock, float currentSpeed)
        {
            if (clock < goTime)
                return currentSpeed > HoldSpeed ? 0f : 0.18f; // 速度保持
            return 1f;
        }

        /// <summary>
        /// 助走中はレーン維持のためラインへ直進する舵。
        /// heading90°=+X。zを増やしたい(左へ寄る)ときはheadingを90°より小さく。
        /// </summary>
        public float GetSteer(BoatPhysicsEngine engine, float laneZ)
        {
            float zError = laneZ - engine.Position.z;
            float desiredHeading = 90f - Mathf.Clamp(zError * 4f, -25f, 25f);
            float diff = Mathf.DeltaAngle(engine.HeadingDeg, desiredHeading);
            return Mathf.Clamp(diff / 25f, -1f, 1f);
        }
    }
}
