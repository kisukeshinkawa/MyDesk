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
        float waveTime;

        public void Initialize(int index, BoatStats stats, VenueData venue,
            WindSystem wind, CurrentSystem current, WakePhysics wake)
        {
            this.venue = venue;
            engine = new BoatPhysicsEngine(index, stats, venue, wind, current, wake);
            startAI = new StartAI();
            turnAI = new TurnAI();
        }

        /// <summary>物理1ステップ実行(RaceManagerが呼ぶ)。</summary>
        public void SimStep(float dt)
        {
            if (replayMode) return;
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
        }

        /// <summary>リプレイ再生時に外部から姿勢を適用する。</summary>
        public void ApplyReplayFrame(Vector3 pos, float headingDeg)
        {
            transform.position = pos + Vector3.up * 0.25f;
            transform.rotation = Quaternion.Euler(0f, headingDeg, 0f);
        }
    }
}
