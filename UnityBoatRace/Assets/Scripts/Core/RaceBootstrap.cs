using UnityEngine;
using UnityEngine.EventSystems;
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
            var mat = Paint(water, baseColor);
            if (mat.HasProperty("_Glossiness")) mat.SetFloat("_Glossiness", 0.85f);
            if (mat.HasProperty("_Smoothness")) mat.SetFloat("_Smoothness", 0.85f);
            if (mat.HasProperty("_OutlineWidth")) mat.SetFloat("_OutlineWidth", 0f); // 水面に輪郭線は不要
            water.AddComponent<WaterAnimator>().Initialize(mat, baseColor);
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

                // ---- 艇体(実艇YAMATO風: 白ベース・低平・前デッキ+左右スポンソン) ----
                var hull = GameObject.CreatePrimitive(PrimitiveType.Cube);
                hull.name = "Hull";
                hull.transform.SetParent(root.transform, false);
                hull.transform.localPosition = new Vector3(0f, 0.00f, -0.35f);
                hull.transform.localScale = new Vector3(1.18f, 0.28f, 2.5f);
                Paint(hull, white);

                // 前デッキ(艇首へなだらかに上がる一枚板)
                var deck = GameObject.CreatePrimitive(PrimitiveType.Cube);
                deck.name = "ForeDeck";
                deck.transform.SetParent(root.transform, false);
                deck.transform.localPosition = new Vector3(0f, 0.15f, 0.80f);
                deck.transform.localRotation = Quaternion.Euler(-6f, 0f, 0f);
                deck.transform.localScale = new Vector3(1.16f, 0.10f, 2.1f);
                Paint(deck, white);

                // 丸い艇首(球をつぶして滑らかな先端に)
                var nose = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                nose.name = "Nose";
                nose.transform.SetParent(root.transform, false);
                nose.transform.localPosition = new Vector3(0f, 0.15f, 1.88f);
                nose.transform.localScale = new Vector3(0.92f, 0.20f, 0.95f);
                Paint(nose, white);

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

            // 画質を鮮明に: MSAA 4x・影距離・異方性フィルタ
            QualitySettings.antiAliasing = 4;
            QualitySettings.shadowDistance = 350f;
            QualitySettings.anisotropicFiltering = AnisotropicFiltering.ForceEnable;
            cam.allowMSAA = true;

            // 遠景を空気感でぼかす(フォグ・アニメ調の明るい空色)
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogStartDistance = 280f;
            RenderSettings.fogEndDistance = 1000f;
            RenderSettings.fogColor = new Color(0.72f, 0.87f, 0.98f);
            return cam;
        }

        static void EnsureEventSystem()
        {
            if (Object.FindFirstObjectByType<EventSystem>() != null) return;
            var es = new GameObject("EventSystem");
            es.AddComponent<EventSystem>();
            es.AddComponent<StandaloneInputModule>();
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
