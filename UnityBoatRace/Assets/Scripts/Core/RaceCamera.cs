using UnityEngine;

namespace BoatRace.Core
{
    /// <summary>
    /// レースカメラ。3モード切替:
    /// ・追尾   — 艇団を後方から追う中継風カメラ
    /// ・選手目線 — 先頭艇に乗った超低視点。水面すれすれ＋広角＋振動で
    ///             「時速80km・体感120km」の疾走感を再現(モンキーターン時は外傾ロール)
    /// ・俯瞰   — コース全体を見下ろす
    /// リプレイ再生中はReplayManagerに任せる。
    /// </summary>
    public class RaceCamera : MonoBehaviour
    {
        public enum Mode { Follow, Onboard, Overhead }
        public Mode mode = Mode.Follow;
        public int focusBoat = -1;   // ストーリーモードでプレイヤー艇を注視(-1=先頭艇)

        RaceManager race;
        ReplayManager replay;
        Camera cam;
        Vector3 velocity;

        public void Initialize(RaceManager race, ReplayManager replay)
        {
            this.race = race;
            this.replay = replay;
            cam = GetComponent<Camera>();
        }

        public string CycleMode()
        {
            mode = (Mode)(((int)mode + 1) % 3);
            return ModeLabel();
        }

        public string ModeLabel()
        {
            switch (mode)
            {
                case Mode.Onboard: return "選手目線";
                case Mode.Overhead: return "俯瞰";
                default: return "追尾";
            }
        }

        void LateUpdate()
        {
            if (race == null || race.boats.Count == 0 || cam == null) return;
            if (replay != null && replay.IsPlaying) return;

            float targetFov = 50f;
            if (!race.armed)
            {
                // レース開始前(タイトル/ロビー/出走表)は会場をゆっくり周回するシネマティックカメラ
                targetFov = 46f;
                CinematicOrbit();
            }
            else
            {
                switch (mode)
                {
                    case Mode.Follow: targetFov = 50f; FollowCam(); break;
                    case Mode.Onboard: targetFov = 78f; OnboardCam(); break;
                    case Mode.Overhead: targetFov = 52f; OverheadCam(); break;
                }
            }
            cam.fieldOfView = Mathf.Lerp(cam.fieldOfView, targetFov, Time.deltaTime * 3f);
        }

        // ---- ロビー演出: 会場をゆっくり旋回 ----
        void CinematicOrbit()
        {
            float a = Time.time * 0.05f;
            Vector3 center = new Vector3(-150f, 0f, -30f);
            Vector3 targetPos = center + new Vector3(Mathf.Cos(a) * 250f, 85f, Mathf.Sin(a) * 190f);
            transform.position = Vector3.Lerp(transform.position, targetPos, Time.deltaTime * 1.2f);
            var look = Quaternion.LookRotation(center + Vector3.up * 4f - transform.position);
            transform.rotation = Quaternion.Slerp(transform.rotation, look, Time.deltaTime * 2f);
        }

        // ---- 中継風追尾 ----
        void FollowCam()
        {
            Vector3 center = Vector3.zero;
            foreach (var b in race.boats) center += b.engine.Position;
            center /= race.boats.Count;
            float spread = 0f;
            foreach (var b in race.boats)
                spread = Mathf.Max(spread, Vector3.Distance(center, b.engine.Position));

            // プレイヤー艇がいる場合はそちらへ寄せる
            if (focusBoat >= 0 && focusBoat < race.boats.Count)
                center = Vector3.Lerp(center, race.boats[focusBoat].engine.Position, 0.55f);

            float dist = Mathf.Clamp(spread * 1.5f + 28f, 45f, 160f);
            Vector3 dir = new Vector3(-0.12f, 0.72f, -1f).normalized;
            Vector3 targetPos = center + dir * dist;

            transform.position = Vector3.SmoothDamp(transform.position, targetPos, ref velocity, 0.55f);
            var look = Quaternion.LookRotation(center + Vector3.forward * 4f - transform.position);
            transform.rotation = Quaternion.Slerp(transform.rotation, look, Time.deltaTime * 3f);
        }

        // ---- 選手目線(先頭艇) ----
        void OnboardCam()
        {
            int focus = focusBoat >= 0 ? focusBoat
                : race.state.standings.Count > 0 ? race.state.standings[0] : 0;
            var e = race.boats[focus].engine;
            Vector3 fwd = e.Forward;

            // 水面すれすれ(座面高さ約0.9m)。速度に応じたパーリンノイズ振動
            float amp = e.Speed * 0.006f;
            Vector3 shake = new Vector3(
                (Mathf.PerlinNoise(Time.time * 9f, 0.3f) - 0.5f),
                (Mathf.PerlinNoise(0.7f, Time.time * 12f) - 0.5f),
                0f) * amp;

            transform.position = e.Position + Vector3.up * 0.9f - fwd * 0.6f + shake;

            // 30m先を見る。ターン中は外傾ロール(モンキーターンの体感)
            Vector3 lookPoint = e.Position + fwd * 30f + Vector3.up * 0.5f;
            float lean = -e.Steer * 16f;
            var look = Quaternion.LookRotation(lookPoint - transform.position) * Quaternion.Euler(0f, 0f, lean);
            transform.rotation = Quaternion.Slerp(transform.rotation, look, Time.deltaTime * 14f);
        }

        // ---- 俯瞰 ----
        void OverheadCam()
        {
            Vector3 targetPos = new Vector3(-150f, 245f, -150f);
            transform.position = Vector3.SmoothDamp(transform.position, targetPos, ref velocity, 0.8f);
            var look = Quaternion.LookRotation(new Vector3(-150f, 0f, 10f) - transform.position);
            transform.rotation = Quaternion.Slerp(transform.rotation, look, Time.deltaTime * 3f);
        }
    }
}
