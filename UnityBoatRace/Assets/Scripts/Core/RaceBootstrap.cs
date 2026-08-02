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
        public bool showRacingLine = true; // AIが追う走行ラインを表示(調整用)

        void Awake()
        {
            var race = gameObject.AddComponent<RaceManager>();
            race.venueId = venueId;
            race.seed = seed;
            race.SetupRace();

            BuildWater(race);
            BuildStartLine();
            BuildBoats(race);
            VenueBuilder.Build(race);
            if (showRacingLine) BuildRacingLine();

            var cam = SetupCamera();
            var replay = gameObject.AddComponent<ReplayManager>();
            replay.Initialize(race, cam);
            var raceCam = cam.gameObject.AddComponent<RaceCamera>();
            raceCam.Initialize(race, replay);

            EnsureEventSystem();
            var flow = gameObject.AddComponent<GameFlow>();
            flow.Initialize(race, replay, new CommentarySystem(race), raceCam);
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
            for (int i = 0; i < RaceManager.BoatCount; i++)
            {
                Color c = UiKit.BoatColors[i];
                var root = new GameObject($"Boat{i + 1}");

                var hull = GameObject.CreatePrimitive(PrimitiveType.Cube);
                hull.name = "Hull";
                hull.transform.SetParent(root.transform, false);
                hull.transform.localScale = new Vector3(1.4f, 0.45f, 3.4f);
                Paint(hull, c);

                var nose = GameObject.CreatePrimitive(PrimitiveType.Cube);
                nose.name = "Nose";
                nose.transform.SetParent(root.transform, false);
                nose.transform.localPosition = new Vector3(0f, -0.02f, 1.9f);
                nose.transform.localScale = new Vector3(0.85f, 0.32f, 1.0f);
                Paint(nose, c);

                var cowl = GameObject.CreatePrimitive(PrimitiveType.Cube);
                cowl.name = "Cowl";
                cowl.transform.SetParent(root.transform, false);
                cowl.transform.localPosition = new Vector3(0f, 0.35f, -0.9f);
                cowl.transform.localScale = new Vector3(0.8f, 0.45f, 1.1f);
                Paint(cowl, new Color(0.2f, 0.2f, 0.25f));

                // 艇番表示(3Dテキスト)
                var numGo = new GameObject("Number");
                numGo.transform.SetParent(root.transform, false);
                numGo.transform.localPosition = new Vector3(0f, 1.4f, 0f);
                numGo.transform.localScale = Vector3.one * 0.65f;
                var tm = numGo.AddComponent<TextMesh>();
                tm.text = (i + 1).ToString();
                tm.fontSize = 64;
                tm.characterSize = 0.28f;
                tm.anchor = TextAnchor.MiddleCenter;
                tm.color = i == 0 ? new Color(0.1f, 0.1f, 0.1f) : c;
                tm.font = UiKit.JpFont();
                numGo.GetComponent<MeshRenderer>().material = tm.font.material;

                // 選手フィギュア(乗艇姿勢: 白いスーツ＋艇色ヘルメット)
                var body = GameObject.CreatePrimitive(PrimitiveType.Capsule);
                body.name = "RacerBody";
                body.transform.SetParent(root.transform, false);
                body.transform.localPosition = new Vector3(0f, 0.55f, -0.75f);
                body.transform.localRotation = Quaternion.Euler(35f, 0f, 0f);
                body.transform.localScale = new Vector3(0.45f, 0.42f, 0.45f);
                Paint(body, new Color(0.92f, 0.92f, 0.95f));

                var helmet = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                helmet.name = "Helmet";
                helmet.transform.SetParent(root.transform, false);
                helmet.transform.localPosition = new Vector3(0f, 0.95f, -0.5f);
                helmet.transform.localScale = Vector3.one * 0.45f;
                Paint(helmet, c);

                var handle = GameObject.CreatePrimitive(PrimitiveType.Cube);
                handle.name = "Handle";
                handle.transform.SetParent(root.transform, false);
                handle.transform.localPosition = new Vector3(0f, 0.45f, 0.5f);
                handle.transform.localScale = new Vector3(0.7f, 0.08f, 0.08f);
                Paint(handle, new Color(0.15f, 0.15f, 0.15f));

                // 引き波(航跡)ビジュアル
                var trailGo = new GameObject("WakeTrail");
                trailGo.transform.SetParent(root.transform, false);
                trailGo.transform.localPosition = new Vector3(0f, -0.15f, -1.7f);
                var trail = trailGo.AddComponent<TrailRenderer>();
                trail.time = 2.6f;
                trail.startWidth = 1.4f;
                trail.endWidth = 0.15f;
                trail.material = new Material(Shader.Find("Sprites/Default"));
                trail.startColor = new Color(1f, 1f, 1f, 0.55f);
                trail.endColor = new Color(1f, 1f, 1f, 0f);

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
            return cam;
        }

        static void EnsureEventSystem()
        {
            if (Object.FindObjectOfType<EventSystem>() != null) return;
            var es = new GameObject("EventSystem");
            es.AddComponent<EventSystem>();
            es.AddComponent<StandaloneInputModule>();
        }

        /// <summary>Built-in / URP どちらでも動くようシェーダーを自動選択。</summary>
        static Material Paint(GameObject go, Color color)
        {
            var shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            var mat = new Material(shader);
            if (mat.HasProperty("_BaseColor")) mat.SetColor("_BaseColor", color);
            if (mat.HasProperty("_Color")) mat.SetColor("_Color", color);
            go.GetComponent<Renderer>().material = mat;
            return mat;
        }
    }
}
