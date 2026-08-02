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

                // ---- 艇体(実艇プロポーション: 全長3.4m級・低く平たい) ----
                var hull = GameObject.CreatePrimitive(PrimitiveType.Cube);
                hull.name = "Hull";
                hull.transform.SetParent(root.transform, false);
                hull.transform.localPosition = new Vector3(0f, 0.02f, -0.3f);
                hull.transform.localScale = new Vector3(1.35f, 0.34f, 2.6f);
                Paint(hull, white);

                // 尖った艇首(上に反ったウェッジ)
                var bow = GameObject.CreatePrimitive(PrimitiveType.Cube);
                bow.name = "Bow";
                bow.transform.SetParent(root.transform, false);
                bow.transform.localPosition = new Vector3(0f, 0.14f, 1.45f);
                bow.transform.localRotation = Quaternion.Euler(-9f, 0f, 0f);
                bow.transform.localScale = new Vector3(1.0f, 0.24f, 1.5f);
                Paint(bow, white);
                var bowTip = GameObject.CreatePrimitive(PrimitiveType.Cube);
                bowTip.name = "BowTip";
                bowTip.transform.SetParent(root.transform, false);
                bowTip.transform.localPosition = new Vector3(0f, 0.24f, 2.15f);
                bowTip.transform.localRotation = Quaternion.Euler(-9f, 45f, 0f);
                bowTip.transform.localScale = new Vector3(0.72f, 0.22f, 0.72f);
                Paint(bowTip, c); // 艇首は艇色(正面からも見分けがつく)

                // 尾翼フィン(艇色のアクセント)
                var fin = GameObject.CreatePrimitive(PrimitiveType.Cube);
                fin.name = "TailFin";
                fin.transform.SetParent(root.transform, false);
                fin.transform.localPosition = new Vector3(0f, 0.42f, -1.62f);
                fin.transform.localScale = new Vector3(0.08f, 0.4f, 0.5f);
                Paint(fin, c);

                // デッキの艇色ライン(左右)
                foreach (var sx in new[] { -0.58f, 0.58f })
                {
                    var stripeGo = GameObject.CreatePrimitive(PrimitiveType.Cube);
                    stripeGo.name = "DeckStripe";
                    stripeGo.transform.SetParent(root.transform, false);
                    stripeGo.transform.localPosition = new Vector3(sx, 0.21f, 0.1f);
                    stripeGo.transform.localScale = new Vector3(0.18f, 0.05f, 3.1f);
                    Paint(stripeGo, c);
                }

                // カウリング(エンジンカバー: 丸みのあるカプセル・艇色)
                var cowl = GameObject.CreatePrimitive(PrimitiveType.Capsule);
                cowl.name = "Cowl";
                cowl.transform.SetParent(root.transform, false);
                cowl.transform.localPosition = new Vector3(0f, 0.42f, -1.05f);
                cowl.transform.localRotation = Quaternion.Euler(90f, 0f, 0f);
                cowl.transform.localScale = new Vector3(0.75f, 0.65f, 0.62f);
                Paint(cowl, c);

                // 両舷の艇番プレート(白地に黒番号)
                foreach (var side in new[] { -1f, 1f })
                {
                    var plate = GameObject.CreatePrimitive(PrimitiveType.Cube);
                    plate.name = "NumberPlate";
                    plate.transform.SetParent(root.transform, false);
                    plate.transform.localPosition = new Vector3(side * 0.41f, 0.42f, -1.05f);
                    plate.transform.localScale = new Vector3(0.03f, 0.34f, 0.4f);
                    Paint(plate, Color.white);
                    var numGo = new GameObject("Num");
                    numGo.transform.SetParent(root.transform, false);
                    numGo.transform.localPosition = new Vector3(side * 0.44f, 0.42f, -1.05f);
                    numGo.transform.localRotation = Quaternion.Euler(0f, side * 90f, 0f);
                    var tm = numGo.AddComponent<TextMesh>();
                    tm.text = (i + 1).ToString();
                    tm.fontSize = 64;
                    tm.characterSize = 0.16f;
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
                handleBar.transform.localPosition = new Vector3(0f, 0.52f, 0.45f);
                handleBar.transform.localScale = new Vector3(0.72f, 0.07f, 0.07f);
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
            light.intensity = 1.15f;
            light.shadows = LightShadows.Soft;   // 影で立体感を出す
            light.shadowStrength = 0.55f;

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
