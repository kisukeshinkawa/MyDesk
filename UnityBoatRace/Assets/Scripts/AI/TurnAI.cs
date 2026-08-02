using UnityEngine;
using BoatRace.Boat;
using BoatRace.Core;

namespace BoatRace.AI
{
    /// <summary>
    /// ターンAI。TrackPathの周回ラインをpure pursuitで追従し、
    /// 戦術(StrategyAI)に応じて旋回半径を変える。
    /// </summary>
    public class TurnAI
    {
        public float laneRadius = 16f;     // 自艇の基準レーン半径
        public float radiusFactor = 1f;    // 戦術による旋回半径倍率
        bool reachedFirstTurn;             // 1周1Mに到達するまでは車線キープ

        public void Configure(int course, Tactic tactic)
        {
            reachedFirstTurn = false;
            laneRadius = 12f + course * 1.6f;
            switch (tactic)
            {
                case Tactic.Nige:        radiusFactor = 0.90f; break;
                case Tactic.Sashi:       radiusFactor = 0.80f; break; // 内を鋭く差す
                case Tactic.Makuri:      radiusFactor = 1.35f; break; // 外を全速で回す
                case Tactic.MakuriSashi: radiusFactor = 1.10f; break;
                default:                 radiusFactor = 1f;    break;
            }
        }

        /// <summary>
        /// 現在位置から追従目標へ向かう舵入力を返す。
        /// スタート〜1周1Mまでは実際の競艇同様、自分のコースの車線を直進キープし、
        /// 位置取り勝負(戦術による内外の駆け引き)は1マークから始まる。
        /// </summary>
        public float GetSteer(BoatPhysicsEngine engine, float laneZ)
        {
            if (!reachedFirstTurn)
            {
                if (TrackPath.InTurn1Zone(engine.Position))
                {
                    reachedFirstTurn = true;
                }
                else
                {
                    // 車線キープ(90°=+X直進、ズレたぶんだけ緩やかに戻す)
                    float zError = laneZ - engine.Position.z;
                    float desired = 90f - Mathf.Clamp(zError * 4f, -20f, 20f);
                    return Mathf.Clamp(Mathf.DeltaAngle(engine.HeadingDeg, desired) / 30f, -1f, 1f);
                }
            }

            float r = EffectiveRadius(engine);
            float s = TrackPath.GetProgress(engine.Position, r);
            // 先読み距離は速度に比例(速いほど遠くを見る)。低速時の過敏な蛇行と
            // 高速時の反応遅れの両方を防ぐ
            float lookahead = Mathf.Clamp(engine.Speed * 0.85f, 8f, 22f);
            Vector3 target = TrackPath.PointAt(s + lookahead, r);

            Vector3 to = target - engine.Position;
            float desiredHeading = Mathf.Atan2(to.x, to.z) * Mathf.Rad2Deg;
            float diff = Mathf.DeltaAngle(engine.HeadingDeg, desiredHeading);
            return Mathf.Clamp(diff / 30f, -1f, 1f);
        }

        /// <summary>ターン中のスロットル。旋回半径が小さいほど緩める(握り込みは戦術次第)。</summary>
        public float GetThrottle(BoatPhysicsEngine engine)
        {
            bool inTurn = TrackPath.InTurn1Zone(engine.Position) || TrackPath.InTurn2Zone(engine.Position);
            if (!inTurn) return 1f;

            // まくり(半径大)は全開維持、差し(半径小)は一瞬緩めて向きを変える
            float ease = Mathf.InverseLerp(1.4f, 0.75f, radiusFactor);
            return Mathf.Lerp(1f, 0.62f, ease * 0.9f);
        }

        float EffectiveRadius(BoatPhysicsEngine engine)
        {
            float physicalMin = Physics.TurnPhysics.TurnRadius(engine.Speed, engine.stats.EffectiveTurnPower);
            return Mathf.Max(physicalMin * 0.6f, laneRadius * radiusFactor);
        }
    }
}
