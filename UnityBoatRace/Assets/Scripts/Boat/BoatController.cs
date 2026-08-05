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
        // モンキーターン風の技演出: 立ち乗り(選手が立つ)とウィリー(艇首上げ)
        float boostStand, boostWheelie, standCur, wheelieCur;
        readonly System.Collections.Generic.List<Transform> racerParts =
            new System.Collections.Generic.List<Transform>();
        readonly System.Collections.Generic.List<Vector3> racerBase =
            new System.Collections.Generic.List<Vector3>();

        /// <summary>必殺技発動中の航跡色。</summary>
        public void SetBoostColor(Color c) => boostColor = c;

        /// <summary>技の3D演出量(stand=選手の立ち上がり0-1, wheelie=艇首上げ角度[deg])。</summary>
        public void SetBoostStyle(float stand, float wheelie)
        {
            boostStand = stand;
            boostWheelie = wheelie;
        }

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
            // 選手パーツを収集(手続き生成艇のみ。立ち乗り演出に使う)
            if (racerParts.Count == 0)
                foreach (Transform c in transform)
                    if (c.name == "RacerBody" || c.name == "Chest" || c.name == "Arm" ||
                        c.name == "Helmet" || c.name == "Visor")
                    {
                        racerParts.Add(c);
                        racerBase.Add(c.localPosition);
                    }
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
            bool boostingNow = engine.BoostTime > 0f;
            // 技演出をなめらかに出し入れ(立ち乗り/艇首上げ)
            standCur = Mathf.MoveTowards(standCur, boostingNow ? boostStand : 0f, Time.deltaTime * 3.5f);
            wheelieCur = Mathf.MoveTowards(wheelieCur, boostingNow ? boostWheelie : 0f, Time.deltaTime * 26f);
            transform.position = engine.Position + Vector3.up * (0.25f + bob);
            transform.rotation = Quaternion.Euler(
                Mathf.Sin(waveTime * 2.1f) * venue.waveHeight * 8f - wheelieCur, // ウィリー=艇首上げ
                engine.HeadingDeg,
                -engine.Steer * 14f); // 旋回時のバンク
            // 立ち乗り(モンキーターン): 選手パーツを持ち上げて前へ
            for (int i = 0; i < racerParts.Count; i++)
                if (racerParts[i] != null)
                    racerParts[i].localPosition = racerBase[i] +
                        new Vector3(0f, 0.24f, 0.10f) * standCur;

            // 水しぶき: 速度に比例し、ターン中は倍増。技発動中はさらに激しく
            if (spray != null)
            {
                // 実映像準拠: 全速航走で常に白い飛沫の柱、ターンでローステール倍増
                var emission = spray.emission;
                float boost = engine.BoostTime > 0f ? 2.4f : 1f;
                emission.rateOverTime = engine.Speed * (2.6f + Mathf.Abs(engine.Steer) * 10f) * boost;
            }
            // 技発動中は航跡が技の色に光る(イナイレ的オーラ)
            if (trail != null)
            {
                bool boosting = engine.BoostTime > 0f;
                trail.startColor = boosting
                    ? new Color(boostColor.r, boostColor.g, boostColor.b, 0.85f)
                    : new Color(1f, 1f, 1f, 0.62f);
                trail.startWidth = boosting ? 2.8f : 2.0f;
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
