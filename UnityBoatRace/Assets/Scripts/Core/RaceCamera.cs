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
        public bool selectView;      // 技選択中: 自艇に寄るドラマチックカメラ
        public bool heroView;        // タイトル/ホーム: 艇に大きく寄る(イナイレのロビー画)

        RaceManager race;
        ReplayManager replay;
        Camera cam;
        Vector3 velocity;
        float fovPunch;

        /// <summary>技発動時のFOVパンチ(一瞬広角になって疾走感が出る)。</summary>
        public void Punch(float amount) => fovPunch = amount;

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

        void Update()
        {
            // 仕様書: PCはCキーでカメラ切替
            if (race != null && race.armed && Input.GetKeyDown(KeyCode.C)) CycleMode();
        }

        void LateUpdate()
        {
            if (race == null || race.boats.Count == 0 || cam == null) return;
            if (replay != null && replay.IsPlaying) return;

            // 技選択中: スローの中で自艇へ寄る(イナイレのタメ画)。unscaled時間で動かす
            if (selectView && race.playerBoatIndex >= 0 && race.playerBoatIndex < race.boats.Count)
            {
                var pe = race.boats[race.playerBoatIndex].engine;
                Vector3 pfwd = pe.Forward;
                Vector3 pside = Vector3.Cross(Vector3.up, pfwd);
                Vector3 targetP = pe.Position + pfwd * 7.5f + pside * 4.5f + Vector3.up * 2.2f;
                float udt = Time.unscaledDeltaTime;
                transform.position = Vector3.Lerp(transform.position, targetP, udt * 4.5f);
                var lookP = Quaternion.LookRotation(pe.Position + Vector3.up * 0.6f - transform.position);
                transform.rotation = Quaternion.Slerp(transform.rotation, lookP, udt * 5f);
                cam.fieldOfView = Mathf.Lerp(cam.fieldOfView, 34f, udt * 4f);
                return;
            }

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
                    case Mode.Follow: FollowCam(); targetFov = followFov; break;
                    case Mode.Onboard: targetFov = 78f; OnboardCam(); break;
                    case Mode.Overhead: targetFov = 52f; OverheadCam(); break;
                }
            }
            fovPunch = Mathf.Lerp(fovPunch, 0f, Time.deltaTime * 2.2f);
            cam.fieldOfView = Mathf.Lerp(cam.fieldOfView, targetFov + fovPunch, Time.deltaTime * 5f);
        }

        // ---- ロビー演出: 会場をゆっくり旋回 ----
        void CinematicOrbit()
        {
            // ヒーロービュー: 艇団へ大きく寄る低視点(キャラが大写しになるロビー画)
            if (heroView && race.boats.Count > 0)
            {
                // 中央付近の1艇を主役にして寄る(全体平均だと遠くなるため)
                var hero = race.boats[Mathf.Min(2, race.boats.Count - 1)].engine;
                Vector3 hc = hero.Position;
                float ha = Time.time * 0.09f;
                Vector3 hp = hc + new Vector3(Mathf.Cos(ha) * 11f, 2.0f, Mathf.Sin(ha) * 11f);
                transform.position = Vector3.Lerp(transform.position, hp, Time.deltaTime * 1.6f);
                var hl = Quaternion.LookRotation(hc + Vector3.up * 1.1f - transform.position);
                transform.rotation = Quaternion.Slerp(transform.rotation, hl, Time.deltaTime * 2.5f);
                return;
            }

            float a = Time.time * 0.05f;
            Vector3 center = new Vector3(-150f, 0f, -30f);
            Vector3 targetPos = center + new Vector3(Mathf.Cos(a) * 250f, 85f, Mathf.Sin(a) * 190f);
            transform.position = Vector3.Lerp(transform.position, targetPos, Time.deltaTime * 1.2f);
            var look = Quaternion.LookRotation(center + Vector3.up * 4f - transform.position);
            transform.rotation = Quaternion.Slerp(transform.rotation, look, Time.deltaTime * 2f);
        }

        float followFov = 30f;

        // ---- 中継風追尾(実際のレース中継準拠) ----
        // スタンド側の高所カメラがパン+望遠ズームで艇団を追う。
        // 圧縮効果で艇団が密集して見え、白い引き波が画面を横切る「あの画」になる。
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

            // スタンド側(-Z)のカメラ台。x方向は艇団を少し先読みしてパン。
            // スタンド建屋は z=-57 から岸側に建つため、カメラは必ず水面側(z>-54)に留める
            // (建屋の裏に入ると壁で画面が塞がる)。岸寄りの艇団を狙うときは上段から見下ろす。
            float wantZ = Mathf.Min(center.z, 0f) - 76f;
            float camZ = Mathf.Max(wantZ, -54f);
            float camY = 9f + Mathf.Min((camZ - wantZ) * 0.12f, 8f);
            Vector3 targetPos = new Vector3(center.x - 14f, camY, camZ);
            transform.position = Vector3.SmoothDamp(transform.position, targetPos, ref velocity, 0.6f);
            var look = Quaternion.LookRotation(center + Vector3.up * 0.8f - transform.position);
            transform.rotation = Quaternion.Slerp(transform.rotation, look, Time.deltaTime * 4.5f);

            // 望遠ズーム: 艇団の広がりに応じて画角を調整(望遠=圧縮効果)
            float dist = Vector3.Distance(transform.position, center);
            followFov = Mathf.Clamp(
                Mathf.Atan2(Mathf.Max(spread, 13f), Mathf.Max(dist, 30f)) * Mathf.Rad2Deg * 2.3f,
                17f, 46f);
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

        // ---- 俯瞰(艇団を追う低めのドローン視点) ----
        void OverheadCam()
        {
            Vector3 center = Vector3.zero;
            foreach (var b in race.boats) center += b.engine.Position;
            center /= race.boats.Count;
            if (focusBoat >= 0 && focusBoat < race.boats.Count)
                center = Vector3.Lerp(center, race.boats[focusBoat].engine.Position, 0.5f);
            Vector3 targetPos = center + new Vector3(0f, 130f, -55f);
            transform.position = Vector3.SmoothDamp(transform.position, targetPos, ref velocity, 0.7f);
            var look = Quaternion.LookRotation(center - transform.position);
            transform.rotation = Quaternion.Slerp(transform.rotation, look, Time.deltaTime * 3f);
        }
    }
}
