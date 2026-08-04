using UnityEngine;
using BoatRace.AI;
using BoatRace.Data;
using BoatRace.Physics;

namespace BoatRace.Boat
{
    /// <summary>
    /// 艇のMonoBehaviour。物理エンジン(BoatPhysicsEngine)とAIを保持し、
    /// シミュレーション結果をTransformへ反映する。
    /// </summary>
    public class BoatController : MonoBehaviour
    {
        public BoatPhysicsEngine engine;
        public StartAI startAI;
        public TurnAI turnAI;
        public bool replayMode;

        VenueData venue;
        ParticleSystem spray;
        TrailRenderer trail;
        Color boostColor = Color.white;
        float waveTime;

        /// <summary>必殺技発動中の航跡色。</summary>
        public void SetBoostColor(Color c) => boostColor = c;

        /// <summary>必殺技解放の水しぶき爆発。</summary>
        public void BurstSpray(int count)
        {
            if (spray != null) spray.Emit(count);
        }

        public void Initialize(int index, BoatStats stats, VenueData venue,
            WindSystem wind, CurrentSystem current, WakePhysics wake)
        {
            this.venue = venue;
            engine = new BoatPhysicsEngine(index, stats, venue, wind, current, wake);
            startAI = new StartAI();
            turnAI = new TurnAI();
            if (spray == null) spray = GetComponentInChildren<ParticleSystem>();
            if (trail == null) trail = GetComponentInChildren<TrailRenderer>();
            if (trail != null) trail.Clear();
        }

        /// <summary>物理1ステップ実行(RaceManagerが呼ぶ)。</summary>
        public void SimStep(float dt)
        {
            if (replayMode || engine == null) return;
            engine.Step(dt);
            SyncTransform();
        }

        /// <summary>エンジン状態→Transform反映(波の上下動つき)。</summary>
        public void SyncTransform()
        {
            waveTime += Time.deltaTime;
            float bob = WaterPhysics.WaveOffset(engine.Position, waveTime, venue);
            transform.position = engine.Position + Vector3.up * (0.25f + bob);
            transform.rotation = Quaternion.Euler(
                Mathf.Sin(waveTime * 2.1f) * venue.waveHeight * 8f,
                engine.HeadingDeg,
                -engine.Steer * 14f); // 旋回時のバンク

            // 水しぶき: 速度に比例し、ターン中は倍増。技発動中はさらに激しく
            if (spray != null)
            {
                // 実映像準拠: 全速航走で常に白い飛沫の柱、ターンでローステール倍増
                var emission = spray.emission;
                float boost = engine.BoostTime > 0f ? 2.4f : 1f;
                emission.rateOverTime = engine.Speed * (4.5f + Mathf.Abs(engine.Steer) * 14f) * boost;
            }
            // 技発動中は航跡が技の色に光る(イナイレ的オーラ)
            if (trail != null)
            {
                bool boosting = engine.BoostTime > 0f;
                trail.startColor = boosting
                    ? new Color(boostColor.r, boostColor.g, boostColor.b, 0.85f)
                    : new Color(1f, 1f, 1f, 0.75f);
                trail.startWidth = boosting ? 3.2f : 2.6f;
            }
        }

        /// <summary>リプレイ再生時に外部から姿勢を適用する。</summary>
        public void ApplyReplayFrame(Vector3 pos, float headingDeg)
        {
            transform.position = pos + Vector3.up * 0.25f;
            transform.rotation = Quaternion.Euler(0f, headingDeg, 0f);
        }

        // ロビー等で停止中の浮遊アニメ(TEIDO設計: ±3cm/周期3秒。愛着形成)
        void Update()
        {
            if (replayMode || engine == null || engine.Speed > 0.5f) return;
            waveTime += Time.deltaTime;
            float bob = Mathf.Sin(waveTime * 2.09f) * 0.03f;
            transform.position = engine.Position + Vector3.up * (0.25f + bob);
            transform.rotation = Quaternion.Euler(
                Mathf.Sin(waveTime * 0.7f) * 1.2f,
                engine.HeadingDeg,
                Mathf.Sin(waveTime * 0.9f) * 1.5f);
        }
    }
}
