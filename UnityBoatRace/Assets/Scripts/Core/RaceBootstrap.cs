using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.Rendering;
using BoatRace.Boat;
using BoatRace.Commentary;
using BoatRace.UI;

namespace BoatRace.Core
{
    /// <summary>
    /// シーン自動構築。空のシーンにこのコンポーネントを1つ置いてPlayするだけで
    /// 水面・マーク・6艇・演出カメラ・スマホゲー風UI(GameFlow)・リプレイが揃う。
    /// </summary>
    public class RaceBootstrap : MonoBehaviour
    {
        [Header("レース設定")]
        public int venueId = 24;   // 大村
        public int seed = 12345;

        [Header("デバッグ")]
        public bool showRacingLine = false; // AIが追う走行ラインを表示(調整用)

        public static RaceBootstrap Instance { get; private set; }

        void Awake()
        {
            Instance = this;
            var race = gameObject.AddComponent<RaceManager>();
            race.venueId = venueId;
            race.seed = seed;
            race.SetupRace();

            BuildEnvironment(race);
            BuildBoats(race);

            var cam = SetupCamera();
            var replay = gameObject.AddComponent<ReplayManager>();
            replay.Initialize(race, cam);
            var raceCam = cam.gameObject.AddComponent<RaceCamera>();
            raceCam.Initialize(race, replay);

            EnsureEventSystem();
            var flow = gameObject.AddComponent<GameFlow>();
            flow.Initialize(race, replay, new CommentarySystem(race), raceCam);
        }

        void BuildEnvironment(RaceManager race)
        {
            BuildWater(race);
            BuildStartLine();
            VenueBuilder.Build(race);
            if (showRacingLine) BuildRacingLine();
        }

        /// <summary>開催場変更時に水面・会場を作り直す(GameFlowが呼ぶ)。</summary>
        public void RebuildEnvironment(RaceManager race)
        {
            foreach (var name in new[] { "Water", "StartLine", "Venue", "RacingLine" })
            {
                var old = GameObject.Find(name);
                if (old != null) Destroy(old);
            }
            BuildEnvironment(race);
        }

        void BuildWater(RaceManager race)
        {
            float hw = Data.VenueTraits.WaterHalfWidth(race.venueId);
            Color baseColor = Data.VenueTraits.WaterBaseColor(race.venue);
            var water = GameObject.CreatePrimitive(PrimitiveType.Cube);
            water.name = "Water";
            water.transform.position = new Vector3(-150f, -0.55f, 0f);
            water.transform.localScale = new Vector3(640f, 1f, hw * 2f + 8f);

            // リアル水面シェーダー: 動く波法線+太陽のギラつき+空の映り込み+艇の落ち影
            var ws = Shader.Find("BoatRace/Water");
            if (ws != null)
            {
                var wm = new Material(ws);
                wm.SetColor("_Color", baseColor);
                wm.SetColor("_DeepColor", Color.Lerp(baseColor, new Color(0.01f, 0.05f, 0.14f), 0.60f));
                wm.SetColor("_SkyColor", new Color(0.74f, 0.88f, 0.99f));
                water.GetComponent<MeshRenderer>().material = wm;
            }
            else
            {
                // フォールバック(シェーダー未コンパイル時)
                var mat = Paint(water, baseColor);
                if (mat.HasProperty("_OutlineWidth")) mat.SetFloat("_OutlineWidth", 0f);
                water.AddComponent<WaterAnimator>().Initialize(mat, baseColor);
            }
        }

        void BuildStartLine()
        {
            var line = GameObject.CreatePrimitive(PrimitiveType.Cube);
            line.name = "StartLine";
            line.transform.position = new Vector3(TrackPath.StartLineX, 0.02f, -22f);
            line.transform.localScale = new Vector3(0.5f, 0.05f, 40f);
            Paint(line, Color.white);
        }

        void BuildBoats(RaceManager race)
        {
            var white = new Color(0.96f, 0.96f, 0.98f);
            var dark = new Color(0.13f, 0.14f, 0.18f);
            for (int i = 0; i < RaceManager.BoatCount; i++)
            {
                Color c = UiKit.BoatColors[i];
                bool lightColor = c.r * 0.6f + c.g * 0.3f + c.b * 0.1f > 0.6f;
                var root = new GameObject($"Boat{i + 1}");

                // ---- 艇体(ロフト生成の滑らか曲面ハル: 丸い艇首・チャイン・トランサム) ----
                var hull = new GameObject("Hull");
                hull.transform.SetParent(root.transform, false);
                hull.AddComponent<MeshFilter>().sharedMesh = GetHullMesh();
                hull.AddComponent<MeshRenderer>();
                Paint(hull, white);

                // 左右スポンソン(前方に張り出す浮き。実艇のシルエットの要)
                foreach (var sx in new[] { -0.68f, 0.68f })
                {
                    var spon = GameObject.CreatePrimitive(PrimitiveType.Cube);
                    spon.name = "Sponson";
                    spon.transform.SetParent(root.transform, false);
                    spon.transform.localPosition = new Vector3(sx, -0.03f, 0.80f);
                    spon.transform.localRotation = Quaternion.Euler(-4f, 0f, sx > 0f ? -4f : 4f);
                    spon.transform.localScale = new Vector3(0.30f, 0.24f, 1.95f);
                    Paint(spon, white);
                    var sponTip = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                    sponTip.name = "SponsonTip";
                    sponTip.transform.SetParent(root.transform, false);
                    sponTip.transform.localPosition = new Vector3(sx, 0.02f, 1.76f);
                    sponTip.transform.localScale = new Vector3(0.30f, 0.20f, 0.5f);
                    Paint(sponTip, c); // 先端は艇色(正面から見分けがつく)
                }

                // デッキの斜めストライプ2本(YAMATO艇の塗り分け風: 艇色+淡色)
                Color c2 = Color.Lerp(c, Color.white, 0.45f);
                var stripeA = GameObject.CreatePrimitive(PrimitiveType.Cube);
                stripeA.name = "DeckStripeA";
                stripeA.transform.SetParent(root.transform, false);
                stripeA.transform.localPosition = new Vector3(0.16f, 0.225f, 0.75f);
                stripeA.transform.localRotation = Quaternion.Euler(-6f, 14f, 0f);
                stripeA.transform.localScale = new Vector3(0.17f, 0.02f, 1.85f);
                Paint(stripeA, c);
                var stripeB = GameObject.CreatePrimitive(PrimitiveType.Cube);
                stripeB.name = "DeckStripeB";
                stripeB.transform.SetParent(root.transform, false);
                stripeB.transform.localPosition = new Vector3(-0.14f, 0.225f, 0.75f);
                stripeB.transform.localRotation = Quaternion.Euler(-6f, -12f, 0f);
                stripeB.transform.localScale = new Vector3(0.13f, 0.02f, 1.80f);
                Paint(stripeB, c2);

                // コックピット開口(ダークの操縦席まわり)
                var pit = GameObject.CreatePrimitive(PrimitiveType.Cube);
                pit.name = "Cockpit";
                pit.transform.SetParent(root.transform, false);
                pit.transform.localPosition = new Vector3(0f, 0.13f, -0.55f);
                pit.transform.localScale = new Vector3(0.66f, 0.10f, 1.25f);
                Paint(pit, dark);

                // 風防フェアリング(コックピット前の低い艇色パネル)
                var fair = GameObject.CreatePrimitive(PrimitiveType.Cube);
                fair.name = "Fairing";
                fair.transform.SetParent(root.transform, false);
                fair.transform.localPosition = new Vector3(0f, 0.27f, 0.16f);
                fair.transform.localRotation = Quaternion.Euler(-28f, 0f, 0f);
                fair.transform.localScale = new Vector3(0.66f, 0.06f, 0.50f);
                Paint(fair, c);

                // モーター(船尾に露出。ダーク+艇色カバー+シルバーのシャフト)
                var motor = GameObject.CreatePrimitive(PrimitiveType.Cube);
                motor.name = "Motor";
                motor.transform.SetParent(root.transform, false);
                motor.transform.localPosition = new Vector3(0f, 0.28f, -1.70f);
                motor.transform.localScale = new Vector3(0.34f, 0.42f, 0.40f);
                Paint(motor, dark);
                var motorCover = GameObject.CreatePrimitive(PrimitiveType.Cube);
                motorCover.name = "MotorCover";
                motorCover.transform.SetParent(root.transform, false);
                motorCover.transform.localPosition = new Vector3(0f, 0.51f, -1.70f);
                motorCover.transform.localScale = new Vector3(0.28f, 0.10f, 0.34f);
                Paint(motorCover, c);
                var shaft = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                shaft.name = "PropShaft";
                shaft.transform.SetParent(root.transform, false);
                shaft.transform.localPosition = new Vector3(0f, -0.06f, -1.94f);
                shaft.transform.localRotation = Quaternion.Euler(70f, 0f, 0f);
                shaft.transform.localScale = new Vector3(0.05f, 0.28f, 0.05f);
                Paint(shaft, new Color(0.72f, 0.74f, 0.80f));

                // 艇番プレート(実艇と同じく艇首の両舷。白地に黒番号)
                foreach (var side in new[] { -1f, 1f })
                {
                    var plate = GameObject.CreatePrimitive(PrimitiveType.Cube);
                    plate.name = "NumberPlate";
                    plate.transform.SetParent(root.transform, false);
                    plate.transform.localPosition = new Vector3(side * 0.54f, 0.17f, 1.20f);
                    plate.transform.localRotation = Quaternion.Euler(0f, 0f, side * -6f);
                    plate.transform.localScale = new Vector3(0.03f, 0.24f, 0.48f);
                    Paint(plate, Color.white);
                    var numGo = new GameObject("Num");
                    numGo.transform.SetParent(root.transform, false);
                    numGo.transform.localPosition = new Vector3(side * 0.575f, 0.17f, 1.20f);
                    numGo.transform.localRotation = Quaternion.Euler(0f, side * 90f, 0f);
                    var tm = numGo.AddComponent<TextMesh>();
                    tm.text = (i + 1).ToString();
                    tm.fontSize = 64;
                    tm.characterSize = 0.13f;
                    tm.anchor = TextAnchor.MiddleCenter;
                    tm.fontStyle = FontStyle.Bold;
                    tm.color = dark;
                    tm.font = UiKit.JpFont();
                    numGo.GetComponent<MeshRenderer>().material = tm.font.material;
                }

                // ハンドル
                var handleBar = GameObject.CreatePrimitive(PrimitiveType.Cube);
                handleBar.name = "Handle";
                handleBar.transform.SetParent(root.transform, false);
                handleBar.transform.localPosition = new Vector3(0f, 0.46f, 0.40f);
                handleBar.transform.localScale = new Vector3(0.68f, 0.07f, 0.07f);
                Paint(handleBar, dark);

                // ---- 選手(前傾の乗艇姿勢・カポックは白＋艇色) ----
                var body = GameObject.CreatePrimitive(PrimitiveType.Capsule);
                body.name = "RacerBody";
                body.transform.SetParent(root.transform, false);
                body.transform.localPosition = new Vector3(0f, 0.52f, -0.45f);
                body.transform.localRotation = Quaternion.Euler(42f, 0f, 0f);
                body.transform.localScale = new Vector3(0.42f, 0.45f, 0.4f);
                Paint(body, new Color(0.94f, 0.94f, 0.96f));
                var chest = GameObject.CreatePrimitive(PrimitiveType.Cube);
                chest.name = "Chest";
                chest.transform.SetParent(root.transform, false);
                chest.transform.localPosition = new Vector3(0f, 0.62f, -0.35f);
                chest.transform.localRotation = Quaternion.Euler(42f, 0f, 0f);
                chest.transform.localScale = new Vector3(0.4f, 0.3f, 0.28f);
                Paint(chest, c);
                foreach (var side in new[] { -1f, 1f })
                {
                    var arm = GameObject.CreatePrimitive(PrimitiveType.Capsule);
                    arm.name = "Arm";
                    arm.transform.SetParent(root.transform, false);
                    arm.transform.localPosition = new Vector3(side * 0.3f, 0.62f, 0.05f);
                    arm.transform.localRotation = Quaternion.Euler(72f, 0f, side * -10f);
                    arm.transform.localScale = new Vector3(0.12f, 0.42f, 0.12f);
                    Paint(arm, new Color(0.94f, 0.94f, 0.96f));
                }
                var helmet = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                helmet.name = "Helmet";
                helmet.transform.SetParent(root.transform, false);
                helmet.transform.localPosition = new Vector3(0f, 0.94f, -0.18f);
                helmet.transform.localScale = Vector3.one * 0.5f; // アニメ調に少し大きめの頭身
                Paint(helmet, lightColor && i == 0 ? Color.white : c);
                var visor = GameObject.CreatePrimitive(PrimitiveType.Cube);
                visor.name = "Visor";
                visor.transform.SetParent(root.transform, false);
                visor.transform.localPosition = new Vector3(0f, 0.90f, 0.02f);
                visor.transform.localScale = new Vector3(0.34f, 0.14f, 0.1f);
                Paint(visor, dark);

                // 引き波(航跡)ビジュアル
                var trailGo = new GameObject("WakeTrail");
                trailGo.transform.SetParent(root.transform, false);
                trailGo.transform.localPosition = new Vector3(0f, -0.12f, -1.65f);
                var trail = trailGo.AddComponent<TrailRenderer>();
                trail.time = 2.6f;
                trail.startWidth = 1.5f;
                trail.endWidth = 0.15f;
                trail.material = new Material(Shader.Find("Sprites/Default"));
                trail.startColor = new Color(1f, 1f, 1f, 0.55f);
                trail.endColor = new Color(1f, 1f, 1f, 0f);

                // 水しぶき(速度・ターンで増える)
                var sprayGo = new GameObject("Spray");
                sprayGo.transform.SetParent(root.transform, false);
                sprayGo.transform.localPosition = new Vector3(0f, 0.05f, 1.5f);
                sprayGo.transform.localRotation = Quaternion.Euler(-55f, 0f, 0f);
                var ps = sprayGo.AddComponent<ParticleSystem>();
                var main = ps.main;
                main.startLifetime = 0.45f;
                main.startSpeed = new ParticleSystem.MinMaxCurve(2.5f, 5.5f);
                main.startSize = new ParticleSystem.MinMaxCurve(0.12f, 0.45f);
                main.startColor = new Color(1f, 1f, 1f, 0.6f);
                main.gravityModifier = 1.3f;
                main.maxParticles = 200;
                main.simulationSpace = ParticleSystemSimulationSpace.World;
                var emission = ps.emission;
                emission.rateOverTime = 0f;
                var shape = ps.shape;
                shape.shapeType = ParticleSystemShapeType.Cone;
                shape.angle = 42f;
                shape.radius = 0.3f;
                var psr = sprayGo.GetComponent<ParticleSystemRenderer>();
                psr.material = new Material(Shader.Find("Sprites/Default"));

                var boat = root.AddComponent<BoatController>();
                race.RegisterBoat(boat);
            }
        }

        /// <summary>AIが追う走行ライン(1コース基準)を水面に描く。調整・検証用。</summary>
        void BuildRacingLine()
        {
            const float r = 16f;
            var go = new GameObject("RacingLine");
            var lr = go.AddComponent<LineRenderer>();
            const int points = 240;
            lr.positionCount = points;
            lr.loop = true;
            lr.startWidth = 0.35f;
            lr.endWidth = 0.35f;
            lr.material = new Material(Shader.Find("Sprites/Default"));
            lr.startColor = new Color(0.2f, 1f, 0.9f, 0.45f);
            lr.endColor = new Color(0.2f, 1f, 0.9f, 0.45f);
            float lap = TrackPath.LapLength(r);
            for (int i = 0; i < points; i++)
                lr.SetPosition(i, TrackPath.PointAt(lap * i / points, r) + Vector3.up * 0.05f);
        }

        Camera SetupCamera()
        {
            var cam = Camera.main;
            if (cam == null)
            {
                var go = new GameObject("Main Camera");
                go.tag = "MainCamera";
                cam = go.AddComponent<Camera>();
                go.AddComponent<AudioListener>();
            }
            cam.transform.position = new Vector3(-90f, 60f, -110f);
            cam.transform.LookAt(new Vector3(-120f, 0f, -30f));
            cam.fieldOfView = 50f;

            var light = new GameObject("Sun").AddComponent<Light>();
            light.type = LightType.Directional;
            light.transform.rotation = Quaternion.Euler(55f, -30f, 0f);
            light.intensity = 1.28f;             // アニメ調のパキッとした明るさ
            light.shadows = LightShadows.Soft;   // 影で立体感を出す
            light.shadowStrength = 0.6f;

            // 画質を鮮明に: MSAA 4x・影距離・高解像度シャドウ・異方性フィルタ
            QualitySettings.antiAliasing = 4;
            QualitySettings.shadowDistance = 350f;
            QualitySettings.shadowResolution = UnityEngine.ShadowResolution.VeryHigh;
            QualitySettings.shadowCascades = 4;
            QualitySettings.anisotropicFiltering = AnisotropicFiltering.ForceEnable;
            cam.allowMSAA = true;

            // 空: 手続きスカイボックス(本物の太陽と大気散乱。3D感の土台)
            cam.clearFlags = CameraClearFlags.Skybox;
            var skyShader = Shader.Find("Skybox/Procedural");
            if (skyShader != null)
            {
                var sky = new Material(skyShader);
                sky.SetFloat("_SunSize", 0.04f);
                sky.SetFloat("_AtmosphereThickness", 0.85f);
                sky.SetColor("_SkyTint", new Color(0.46f, 0.66f, 0.95f));
                sky.SetColor("_GroundColor", new Color(0.52f, 0.60f, 0.66f));
                sky.SetFloat("_Exposure", 1.25f);
                RenderSettings.skybox = sky;
            }
            RenderSettings.sun = light;
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.62f, 0.72f, 0.85f);
            RenderSettings.ambientEquatorColor = new Color(0.55f, 0.60f, 0.66f);
            RenderSettings.ambientGroundColor = new Color(0.30f, 0.34f, 0.38f);

            // 遠景を空気感でぼかす(フォグ)。山並みがフォグ越しに霞む距離感
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogStartDistance = 280f;
            RenderSettings.fogEndDistance = 1500f;
            RenderSettings.fogColor = new Color(0.72f, 0.87f, 0.98f);

            BuildScenery();
            return cam;
        }

        /// <summary>遠景(山並みシルエット+雲)。フォグ越しに霞んで奥行きが出る。</summary>
        void BuildScenery()
        {
            if (GameObject.Find("Scenery") != null) return;
            var root = new GameObject("Scenery");
            var rng = new System.Random(7);
            float R(float a, float b) => a + (float)rng.NextDouble() * (b - a);

            // 山並み(会場の周囲リング。輪郭線なし・影も落とさない)
            for (int i = 0; i < 16; i++)
            {
                float ang = i / 16f * Mathf.PI * 2f + R(-0.10f, 0.10f);
                float r = R(850f, 1150f);
                var m = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                m.name = "Mountain";
                m.transform.SetParent(root.transform, false);
                m.transform.position = new Vector3(-150f + Mathf.Cos(ang) * r, -35f, Mathf.Sin(ang) * r);
                m.transform.localScale = new Vector3(R(420f, 780f), R(120f, 260f), R(250f, 420f));
                var mm = Paint(m, new Color(R(0.30f, 0.40f), R(0.46f, 0.56f), R(0.55f, 0.66f)));
                if (mm.HasProperty("_OutlineWidth")) mm.SetFloat("_OutlineWidth", 0f);
                m.GetComponent<MeshRenderer>().shadowCastingMode = ShadowCastingMode.Off;
            }

            // 雲(白い扁平球を高い空に。巨大な影を落とさないようにする)
            for (int i = 0; i < 12; i++)
            {
                float ang = R(0f, Mathf.PI * 2f);
                float r = R(420f, 1100f);
                var c = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                c.name = "Cloud";
                c.transform.SetParent(root.transform, false);
                c.transform.position = new Vector3(-150f + Mathf.Cos(ang) * r, R(160f, 300f), Mathf.Sin(ang) * r);
                c.transform.localScale = new Vector3(R(130f, 280f), R(20f, 38f), R(80f, 160f));
                var cm = Paint(c, Color.white);
                if (cm.HasProperty("_OutlineWidth")) cm.SetFloat("_OutlineWidth", 0f);
                c.GetComponent<MeshRenderer>().shadowCastingMode = ShadowCastingMode.Off;
            }
        }

        static void EnsureEventSystem()
        {
            if (Object.FindFirstObjectByType<EventSystem>() != null) return;
            var es = new GameObject("EventSystem");
            es.AddComponent<EventSystem>();
            es.AddComponent<StandaloneInputModule>();
        }

        static Mesh hullMeshCache;

        /// <summary>
        /// 競艇ハルのロフト生成(断面リング8点×7ステーション+船尾/艇首キャップ)。
        /// 三角形の巻き方向はPythonで外向き法線を数値検証済み。
        /// </summary>
        static Mesh GetHullMesh()
        {
            if (hullMeshCache != null) return hullMeshCache;
            float[] zs = { -1.85f, -1.20f, -0.40f, 0.40f, 1.10f, 1.70f, 2.05f };
            float[] ws = { 0.52f, 0.58f, 0.62f, 0.66f, 0.64f, 0.45f, 0.10f };
            float[] dy = { 0.16f, 0.17f, 0.18f, 0.20f, 0.24f, 0.27f, 0.30f };
            float[] ky = { -0.14f, -0.15f, -0.16f, -0.16f, -0.12f, -0.02f, 0.18f };
            int S = zs.Length;

            var verts = new List<Vector3>();
            for (int s = 0; s < S; s++)
            {
                float w = ws[s], d = dy[s], k = ky[s], m = (d + k) * 0.5f;
                verts.Add(new Vector3(0f, d + 0.03f, zs[s]));         // デッキ中央(クラウン)
                verts.Add(new Vector3(0.85f * w, d, zs[s]));          // デッキ右端
                verts.Add(new Vector3(w, m, zs[s]));                  // 右チャイン
                verts.Add(new Vector3(0.55f * w, k, zs[s]));          // 右ボトム
                verts.Add(new Vector3(0f, k - 0.02f, zs[s]));         // キール
                verts.Add(new Vector3(-0.55f * w, k, zs[s]));         // 左ボトム
                verts.Add(new Vector3(-w, m, zs[s]));                 // 左チャイン
                verts.Add(new Vector3(-0.85f * w, d, zs[s]));         // デッキ左端
            }

            var tris = new List<int>();
            for (int s = 0; s < S - 1; s++)
                for (int i = 0; i < 8; i++)
                {
                    int a = s * 8 + i, b = s * 8 + (i + 1) % 8;
                    int c = (s + 1) * 8 + (i + 1) % 8, d2 = (s + 1) * 8 + i;
                    tris.Add(a); tris.Add(c); tris.Add(b);
                    tris.Add(a); tris.Add(d2); tris.Add(c);
                }

            // トランサム(船尾の平面)
            int stern = verts.Count;
            verts.Add(new Vector3(0f, (dy[0] + ky[0]) * 0.5f, zs[0]));
            for (int i = 0; i < 8; i++)
            {
                int a = i, b = (i + 1) % 8;
                tris.Add(stern); tris.Add(a); tris.Add(b);
            }
            // ノーズ(丸い艇首の先端)
            int noseIdx = verts.Count;
            verts.Add(new Vector3(0f, dy[S - 1] - 0.02f, zs[S - 1] + 0.10f));
            int last = (S - 1) * 8;
            for (int i = 0; i < 8; i++)
            {
                int a = last + i, b = last + (i + 1) % 8;
                tris.Add(noseIdx); tris.Add(b); tris.Add(a);
            }

            var mesh = new Mesh { name = "KyoteiHull" };
            mesh.SetVertices(verts);
            mesh.SetTriangles(tris, 0);
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            hullMeshCache = mesh;
            return mesh;
        }

        /// <summary>トゥーンシェーダー優先(イナイレ風セルシェーディング)。</summary>
        static Material Paint(GameObject go, Color color)
        {
            var shader = Shader.Find("BoatRace/Toon")
                ?? Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            var mat = new Material(shader);
            if (mat.HasProperty("_BaseColor")) mat.SetColor("_BaseColor", color);
            if (mat.HasProperty("_Color")) mat.SetColor("_Color", color);
            go.GetComponent<Renderer>().material = mat;
            return mat;
        }
    }
}
