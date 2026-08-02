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

        /// <summary>
        /// actualDistance = 起こし位置からラインまでの実距離。
        /// 待機行動で前へ流れた分だけ助走が浅くなる(モーター停止禁止のジレンマ)。
        /// </summary>
        public void Plan(BoatStats stats, int course, System.Random rng, float actualDistance)
        {
            // 目標ST: 上手い選手ほど攻める(0.10前後)。慎重派は0.15〜0.20
            targetST = Mathf.Max(0.05f, stats.player.ComputeST(rng, pressure: course >= 5 ? 0.2f : 0f));

            // 助走が浅いと加速しきれずST精度も落ちる
            float standard = WaitingSystem.ApproachDistance(course);
            if (actualDistance < standard * 0.8f)
                targetST += (standard * 0.8f - actualDistance) * 0.004f; // 深イン化ペナルティ

            runTime = StartSystem.EstimateRunTime(actualDistance, stats.EffectiveAcceleration, stats.EffectiveTopSpeed,
                initialSpeed: 1.1f);
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
