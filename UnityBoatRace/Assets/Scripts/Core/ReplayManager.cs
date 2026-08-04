using System.Collections.Generic;
using UnityEngine;
using BoatRace.Boat;

namespace BoatRace.Core
{
    /// <summary>
    /// レースリプレイ。10Hzで全艇の位置・向き・速度・周回を記録し、
    /// タイムライン再生(倍速可)とカメラ切替を提供する。
    /// </summary>
    public class ReplayManager : MonoBehaviour
    {
        public struct Frame
        {
            public float t;
            public Vector3[] positions;
            public float[] headings;
            public float[] speeds;
            public int[] laps;
        }

        public const float RecordHz = 10f;
        public float playbackSpeed = 1f;
        public bool IsPlaying { get; private set; }

        RaceManager race;
        readonly List<Frame> frames = new List<Frame>(4096);
        float recordTimer;
        float playTime;
        int camMode; // 0=俯瞰 1=リーダー追走
        Camera cam;

        public void Initialize(RaceManager race, Camera cam)
        {
            this.race = race;
            this.cam = cam;
            // 新しいレースが始まったら前レースの記録を破棄
            race.OnPhaseChanged += p =>
            {
                if (p == RacePhase.PitOut && !IsPlaying) frames.Clear();
            };
            // 仕様書12章: レース終了時にJSON形式で保存
            race.OnRaceFinished += SaveJson;
        }

        [System.Serializable]
        class JFrame { public float t; public Vector3[] p; public float[] h; public float[] v; public int[] lap; }
        [System.Serializable]
        class JReplay { public string venue; public System.Collections.Generic.List<JFrame> frames = new System.Collections.Generic.List<JFrame>(); }

        void SaveJson()
        {
            try
            {
                var jr = new JReplay { venue = race.venue.name };
                foreach (var f in frames)
                    jr.frames.Add(new JFrame { t = f.t, p = f.positions, h = f.headings, v = f.speeds, lap = f.laps });
                string path = System.IO.Path.Combine(Application.persistentDataPath, "replay_last.json");
                System.IO.File.WriteAllText(path, JsonUtility.ToJson(jr));
            }
            catch (System.Exception ex)
            {
                Debug.LogWarning("リプレイ保存失敗: " + ex.Message);
            }
        }

        void FixedUpdate()
        {
            if (race == null || IsPlaying) return;
            if (race.state.phase != RacePhase.Racing && race.state.phase != RacePhase.Finished) return;
            if (race.state.phase == RacePhase.Finished) return;

            recordTimer -= Time.fixedDeltaTime;
            if (recordTimer > 0f) return;
            recordTimer = 1f / RecordHz;

            int n = race.boats.Count;
            var f = new Frame
            {
                t = race.state.raceTime,
                positions = new Vector3[n],
                headings = new float[n],
                speeds = new float[n],
                laps = new int[n],
            };
            for (int i = 0; i < n; i++)
            {
                f.positions[i] = race.boats[i].engine.Position;
                f.headings[i] = race.boats[i].engine.HeadingDeg;
                f.speeds[i] = race.boats[i].engine.Speed;
                f.laps[i] = race.state.Get(i).lap;
            }
            frames.Add(f);
        }

        float playEnd = -1f; // ハイライト再生の終了時刻(-1=最後まで)

        public void StartPlayback()
        {
            if (frames.Count < 2) return;
            IsPlaying = true;
            playTime = 0f;
            playEnd = -1f;
            playbackSpeed = 1f;
            camMode = 0;
            race.simulationPaused = true;
            foreach (var b in race.boats) b.replayMode = true;
        }

        /// <summary>区間ハイライト再生(ゴール後の1M攻防自動リプレイ等)。終了で自動停止。</summary>
        public void StartHighlight(float from, float to, float speed)
        {
            if (frames.Count < 2) return;
            IsPlaying = true;
            playTime = Mathf.Max(0f, from);
            playEnd = to;
            playbackSpeed = speed;
            camMode = 1; // 追走カメラで攻防を大きく見せる
            race.simulationPaused = true;
            foreach (var b in race.boats) b.replayMode = true;
        }

        /// <summary>1周目の1マークに最初の艇が入った時刻(記録から推定)。無ければ-1。</summary>
        public float FirstTurnTime()
        {
            foreach (var f in frames)
                for (int i = 0; i < f.positions.Length; i++)
                    if (f.positions[i].x > -6f) return f.t;
            return -1f;
        }

        public void StopPlayback()
        {
            IsPlaying = false;
            race.simulationPaused = false;
            foreach (var b in race.boats) b.replayMode = false;
        }

        public void ToggleCamera() => camMode = (camMode + 1) % 2;

        void Update()
        {
            if (!IsPlaying) return;
            playTime += Time.deltaTime * playbackSpeed;
            float last = frames[frames.Count - 1].t;
            if (playTime >= last) { playTime = last; }
            // ハイライト再生は区間終端で自動停止(GameFlowが結果画面へ戻す)
            if (playEnd > 0f && playTime >= Mathf.Min(playEnd, last))
            {
                StopPlayback();
                return;
            }

            // フレーム補間
            int hi = frames.FindIndex(fr => fr.t >= playTime);
            if (hi <= 0) hi = 1;
            Frame a = frames[hi - 1], b = frames[hi];
            float u = Mathf.InverseLerp(a.t, b.t, playTime);

            int leader = 0; float best = float.MinValue;
            for (int i = 0; i < race.boats.Count; i++)
            {
                Vector3 pos = Vector3.Lerp(a.positions[i], b.positions[i], u);
                float heading = Mathf.LerpAngle(a.headings[i], b.headings[i], u);
                race.boats[i].ApplyReplayFrame(pos, heading);
                if (pos.x > best) { best = pos.x; leader = i; }
            }

            // カメラ
            if (cam != null)
            {
                if (camMode == 0)
                {
                    cam.transform.position = new Vector3(-150f, 220f, -120f);
                    cam.transform.LookAt(new Vector3(-150f, 0f, 0f));
                }
                else
                {
                    var t = race.boats[leader].transform;
                    cam.transform.position = t.position - t.forward * 18f + Vector3.up * 8f;
                    cam.transform.LookAt(t.position + t.forward * 10f);
                }
            }
        }
    }
}
