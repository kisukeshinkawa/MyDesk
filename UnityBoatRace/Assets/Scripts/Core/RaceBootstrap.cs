using UnityEngine;
using BoatRace.Boat;
using BoatRace.Commentary;

namespace BoatRace.Core
{
    /// <summary>
    /// シーン自動構築。空のシーンにこのコンポーネントを1つ置いてPlayするだけで
    /// 水面・マーク・スタートライン・6艇・カメラ・HUD・リプレイが揃う。
    /// (本格的な3Dモデル/水シェーダーは後からこの生成物と差し替える)
    /// </summary>
    public class RaceBootstrap : MonoBehaviour
    {
        [Header("レース設定")]
        public int venueId = 24;   // 大村
        public int seed = 12345;

        // 艇色: 1白 2黒 3赤 4青 5黄 6緑
        static readonly Color[] BoatColors =
        {
            Color.white, new Color(0.15f, 0.15f, 0.15f), new Color(0.9f, 0.15f, 0.1f),
            new Color(0.1f, 0.3f, 0.9f), new Color(0.95f, 0.85f, 0.1f), new Color(0.1f, 0.7f, 0.25f),
        };

        void Awake()
        {
            var race = gameObject.AddComponent<RaceManager>();
            race.venueId = venueId;
            race.seed = seed;
            race.SetupRace();

            BuildWater();
            BuildMarks();
            BuildStartLine();
            BuildBoats(race);

            var cam = SetupCamera();
            var replay = gameObject.AddComponent<ReplayManager>();
            replay.Initialize(race, cam);

            var hud = gameObject.AddComponent<RaceHUD>();
            hud.Initialize(race, replay, new CommentarySystem(race));
        }

        void BuildWater()
        {
            var water = GameObject.CreatePrimitive(PrimitiveType.Cube);
            water.name = "Water";
            water.transform.position = new Vector3(-150f, -0.5f, 0f);
            water.transform.localScale = new Vector3(600f, 1f, 300f);
            Paint(water, new Color(0.05f, 0.28f, 0.45f));
        }

        void BuildMarks()
        {
            foreach (var (pos, name) in new[] { (TrackPath.Mark1, "Mark1"), (TrackPath.Mark2, "Mark2") })
            {
                var mark = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                mark.name = name;
                mark.transform.position = pos + Vector3.up * 0.8f;
                mark.transform.localScale = new Vector3(1.6f, 0.8f, 1.6f);
                Paint(mark, new Color(1f, 0.45f, 0f)); // オレンジブイ
            }
        }

        void BuildStartLine()
        {
            var line = GameObject.CreatePrimitive(PrimitiveType.Cube);
            line.name = "StartLine";
            line.transform.position = new Vector3(TrackPath.StartLineX, 0.02f, -22f);
            line.transform.localScale = new Vector3(0.5f, 0.05f, 36f);
            Paint(line, Color.white);
        }

        void BuildBoats(RaceManager race)
        {
            for (int i = 0; i < RaceManager.BoatCount; i++)
            {
                var root = new GameObject($"Boat{i + 1}");
                var hull = GameObject.CreatePrimitive(PrimitiveType.Cube);
                hull.name = "Hull";
                hull.transform.SetParent(root.transform, false);
                hull.transform.localScale = new Vector3(1.3f, 0.5f, 3.2f);
                Paint(hull, BoatColors[i]);

                var nose = GameObject.CreatePrimitive(PrimitiveType.Cube);
                nose.name = "Nose";
                nose.transform.SetParent(root.transform, false);
                nose.transform.localPosition = new Vector3(0f, 0f, 1.8f);
                nose.transform.localScale = new Vector3(0.8f, 0.35f, 0.9f);
                Paint(nose, BoatColors[i]);

                var boat = root.AddComponent<BoatController>();
                race.RegisterBoat(boat);
            }
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
            cam.transform.position = new Vector3(-150f, 200f, -160f);
            cam.transform.LookAt(new Vector3(-150f, 0f, -10f));
            cam.backgroundColor = new Color(0.55f, 0.75f, 0.9f);

            var light = new GameObject("Sun").AddComponent<Light>();
            light.type = LightType.Directional;
            light.transform.rotation = Quaternion.Euler(55f, -30f, 0f);
            light.intensity = 1.1f;
            return cam;
        }

        /// <summary>Built-in / URP どちらでも動くようシェーダーを自動選択。</summary>
        static void Paint(GameObject go, Color color)
        {
            var shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            var mat = new Material(shader);
            if (mat.HasProperty("_BaseColor")) mat.SetColor("_BaseColor", color);
            if (mat.HasProperty("_Color")) mat.SetColor("_Color", color);
            go.GetComponent<Renderer>().material = mat;
        }
    }
}
