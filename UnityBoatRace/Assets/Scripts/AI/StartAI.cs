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
        public float targetST;     // この艇が狙うST(選手スキルから生成)
        public float goTime;       // 大時計上の全開開始時刻(負値)
        float runTime;

        public void Plan(BoatStats stats, int course, System.Random rng)
        {
            // 目標ST: 上手い選手ほど攻める(0.10前後)。慎重派は0.15〜0.20
            targetST = Mathf.Max(0.05f, stats.player.ComputeST(rng, pressure: course >= 5 ? 0.2f : 0f));

            float dist = WaitingSystem.ApproachDistance(course);
            runTime = StartSystem.EstimateRunTime(dist, stats.EffectiveAcceleration, stats.EffectiveTopSpeed);
            goTime = targetST - runTime;
        }

        /// <summary>助走中のスロットル。goTimeまで待機微速→以降全開。</summary>
        public float GetThrottle(float clock)
        {
            if (clock < goTime) return 0.12f;   // 待機中の微速前進
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
