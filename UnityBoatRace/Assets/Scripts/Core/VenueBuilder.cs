using UnityEngine;
using BoatRace.UI;

namespace BoatRace.Core
{
    /// <summary>
    /// 実際のボートレース場を模した会場一式を生成する。
    /// ・大時計(直径3m級・針が12時=スタート) ・赤白のターンマーク(ソフトクリーム型)
    /// ・外周のオレンジ消波装置 ・ホーム側の大型スタンド＋観客 ・広告壁 ・電光掲示板 ・ピット建屋
    /// </summary>
    public static class VenueBuilder
    {
        static Transform root;

        public static void Build(RaceManager race)
        {
            root = new GameObject("Venue").transform;

            BuildPerimeter();
            BuildWaveBreakers();
            BuildTurnMarks();
            BuildGrandstand();
            BuildAdWalls();
            BuildBigClock(race);
            BuildScoreboard(race);
            BuildPitBuilding();
        }

        // ---- 外周壁 ----
        static void BuildPerimeter()
        {
            var gray = new Color(0.55f, 0.58f, 0.62f);
            MakeBox("WallSouth", new Vector3(-150f, 1.5f, -172f), new Vector3(650f, 3f, 2f), gray);
            MakeBox("WallNorth", new Vector3(-150f, 1.5f, 172f), new Vector3(650f, 3f, 2f), gray);
            MakeBox("WallWest", new Vector3(-476f, 1.5f, 0f), new Vector3(2f, 3f, 346f), gray);
            MakeBox("WallEast", new Vector3(176f, 1.5f, 0f), new Vector3(2f, 3f, 346f), gray);
        }

        // ---- 消波装置(オレンジのフロート) ----
        static void BuildWaveBreakers()
        {
            var orange = new Color(1f, 0.5f, 0.05f);
            var parent = new GameObject("WaveBreakers").transform;
            parent.SetParent(root, false);
            for (float x = -460f; x <= 160f; x += 14f)
            {
                MakeBox("wb", new Vector3(x, 0.25f, -166f), new Vector3(3.2f, 0.5f, 1.1f), orange, parent);
                MakeBox("wb", new Vector3(x, 0.25f, 166f), new Vector3(3.2f, 0.5f, 1.1f), orange, parent);
            }
            for (float z = -155f; z <= 155f; z += 14f)
            {
                MakeBox("wb", new Vector3(-468f, 0.25f, z), new Vector3(1.1f, 0.5f, 3.2f), orange, parent);
                MakeBox("wb", new Vector3(168f, 0.25f, z), new Vector3(1.1f, 0.5f, 3.2f), orange, parent);
            }
        }

        // ---- ターンマーク(赤白ソフトクリーム型ブイ) ----
        static void BuildTurnMarks()
        {
            foreach (var (pos, name) in new[] { (TrackPath.Mark1, "TurnMark1"), (TrackPath.Mark2, "TurnMark2") })
            {
                var buoy = new GameObject(name);
                buoy.transform.SetParent(root, false);
                buoy.transform.position = pos;

                var baseCyl = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                baseCyl.transform.SetParent(buoy.transform, false);
                baseCyl.transform.localPosition = new Vector3(0f, 0.4f, 0f);
                baseCyl.transform.localScale = new Vector3(1.6f, 0.4f, 1.6f);
                Paint(baseCyl, Color.white);

                var mid = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                mid.transform.SetParent(buoy.transform, false);
                mid.transform.localPosition = new Vector3(0f, 1.1f, 0f);
                mid.transform.localScale = new Vector3(1.35f, 0.35f, 1.35f);
                Paint(mid, new Color(0.9f, 0.12f, 0.1f));

                var top = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                top.transform.SetParent(buoy.transform, false);
                top.transform.localPosition = new Vector3(0f, 1.75f, 0f);
                top.transform.localScale = new Vector3(1.0f, 1.0f, 1.0f);
                Paint(top, new Color(0.9f, 0.12f, 0.1f));
            }
        }

        // ---- ホーム側大型スタンド＋観客 ----
        static void BuildGrandstand()
        {
            var stand = new GameObject("Grandstand").transform;
            stand.SetParent(root, false);
            var tierColor = new Color(0.78f, 0.79f, 0.82f);
            var rng = new System.Random(7);

            for (int t = 0; t < 5; t++)
            {
                float y = 1.1f + t * 2.4f;
                float z = -182f - t * 9f;
                MakeBox($"Tier{t}", new Vector3(-150f, y, z), new Vector3(460f, 2.2f, 9f), tierColor, stand);

                // 観客(カラフルなキューブ)
                for (float x = -370f; x <= 70f; x += 11f)
                {
                    if (rng.NextDouble() < 0.25) continue;
                    var c = Color.HSVToRGB((float)rng.NextDouble(), 0.55f, 0.95f);
                    MakeBox("fan", new Vector3(x + (float)rng.NextDouble() * 4f, y + 1.6f, z), new Vector3(0.8f, 1.1f, 0.8f), c, stand);
                }
            }

            // 屋根と背面壁
            MakeBox("Roof", new Vector3(-150f, 14.5f, -203f), new Vector3(475f, 0.9f, 58f), new Color(0.35f, 0.38f, 0.45f), stand);
            MakeBox("BackWall", new Vector3(-150f, 7f, -229f), new Vector3(470f, 15f, 2f), new Color(0.65f, 0.68f, 0.72f), stand);
            for (float x = -370f; x <= 70f; x += 55f)
                MakeBox("Pillar", new Vector3(x, 7f, -177.5f), new Vector3(1.2f, 14f, 1.2f), new Color(0.5f, 0.52f, 0.56f), stand);
        }

        // ---- 広告壁(架空スポンサー) ----
        static void BuildAdWalls()
        {
            string[] brands = { "DUSTALK", "BEETLE EMS", "MyDesk", "NISHIHARA", "BOAT RACE" };
            Color[] bgs = { UiKit.Cyan, new Color(0.9f, 0.3f, 0.1f), UiKit.Navy, new Color(0.1f, 0.6f, 0.3f), new Color(0.85f, 0.7f, 0.1f) };
            for (int i = 0; i < 10; i++)
            {
                float x = -420f + i * 60f;
                var bg = MakeBox("Ad", new Vector3(x, 2.6f, -171f), new Vector3(48f, 2.6f, 0.6f), bgs[i % bgs.Length]);
                MakeText3D(brands[i % brands.Length], new Vector3(x, 2.6f, -170.5f), Quaternion.identity, 2.0f, Color.white);
            }
        }

        // ---- 大時計(針が12時=スタート) ----
        static void BuildBigClock(RaceManager race)
        {
            var clock = new GameObject("BigClock");
            clock.transform.SetParent(root, false);
            clock.transform.position = new Vector3(TrackPath.StartLineX, 0f, -160f);

            MakeBox("Pole", new Vector3(0f, 5f, 0f), new Vector3(1.1f, 10f, 1.1f), new Color(0.85f, 0.85f, 0.88f), clock.transform);

            var rim = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            rim.transform.SetParent(clock.transform, false);
            rim.transform.localPosition = new Vector3(0f, 13.5f, 0f);
            rim.transform.localRotation = Quaternion.Euler(90f, 0f, 0f);
            rim.transform.localScale = new Vector3(8.4f, 0.3f, 8.4f);
            Paint(rim, new Color(0.85f, 0.1f, 0.1f));

            var face = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            face.transform.SetParent(clock.transform, false);
            face.transform.localPosition = new Vector3(0f, 13.5f, 0.25f);
            face.transform.localRotation = Quaternion.Euler(90f, 0f, 0f);
            face.transform.localScale = new Vector3(7.6f, 0.25f, 7.6f);
            Paint(face, Color.white);

            // 針(pivotを回す)
            var pivot = new GameObject("NeedlePivot");
            pivot.transform.SetParent(clock.transform, false);
            pivot.transform.localPosition = new Vector3(0f, 13.5f, 0.7f);
            var needle = GameObject.CreatePrimitive(PrimitiveType.Cube);
            needle.transform.SetParent(pivot.transform, false);
            needle.transform.localPosition = new Vector3(0f, 1.55f, 0f);
            needle.transform.localScale = new Vector3(0.35f, 3.1f, 0.12f);
            Paint(needle, new Color(0.1f, 0.1f, 0.1f));

            var driver = clock.AddComponent<BigClockNeedle>();
            driver.Initialize(race, pivot.transform);
        }

        // ---- 電光掲示板(バックストレッチ側) ----
        static void BuildScoreboard(RaceManager race)
        {
            var board = new GameObject("Scoreboard");
            board.transform.SetParent(root, false);
            board.transform.position = new Vector3(-150f, 0f, 178f);

            MakeBox("Leg", new Vector3(-18f, 4f, 0f), new Vector3(1.5f, 8f, 1.5f), new Color(0.4f, 0.4f, 0.45f), board.transform);
            MakeBox("Leg", new Vector3(18f, 4f, 0f), new Vector3(1.5f, 8f, 1.5f), new Color(0.4f, 0.4f, 0.45f), board.transform);
            MakeBox("Panel", new Vector3(0f, 13f, 0f), new Vector3(60f, 12f, 1.2f), new Color(0.05f, 0.06f, 0.12f), board.transform);
            MakeText3D($"BOATRACE {race.venue.name}", new Vector3(-150f, 16f, 177f),
                Quaternion.Euler(0f, 180f, 0f), 3.2f, new Color(1f, 0.85f, 0.2f));
            MakeText3D("第 1 レース", new Vector3(-150f, 11f, 177f),
                Quaternion.Euler(0f, 180f, 0f), 2.6f, Color.white);
        }

        // ---- ピット建屋 ----
        static void BuildPitBuilding()
        {
            MakeBox("PitRoof", new Vector3(-45f, 4.6f, -50f), new Vector3(50f, 0.6f, 9f), new Color(0.3f, 0.34f, 0.42f));
            for (float x = -68f; x <= -22f; x += 15f)
                MakeBox("PitPillar", new Vector3(x, 2.3f, -53f), new Vector3(0.8f, 4.6f, 0.8f), new Color(0.6f, 0.62f, 0.66f));
            MakeText3D("P I T", new Vector3(-45f, 3.4f, -45.4f), Quaternion.identity, 2.2f, Color.white);
        }

        // ---- 小物ヘルパー ----
        static GameObject MakeBox(string name, Vector3 pos, Vector3 scale, Color color, Transform parent = null)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = name;
            go.transform.SetParent(parent != null ? parent : root, false);
            go.transform.localPosition = pos;
            go.transform.localScale = scale;
            Paint(go, color);
            return go;
        }

        static void MakeText3D(string text, Vector3 pos, Quaternion rot, float size, Color color)
        {
            var go = new GameObject("Text3D_" + text);
            go.transform.SetParent(root, false);
            go.transform.position = pos;
            go.transform.rotation = rot;
            go.transform.localScale = Vector3.one * size;
            var tm = go.AddComponent<TextMesh>();
            tm.text = text;
            tm.fontSize = 48;
            tm.characterSize = 0.12f;
            tm.anchor = TextAnchor.MiddleCenter;
            tm.fontStyle = FontStyle.Bold;
            tm.color = color;
            tm.font = UiKit.JpFont();
            go.GetComponent<MeshRenderer>().material = tm.font.material;
        }

        static void Paint(GameObject go, Color color)
        {
            var shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            var mat = new Material(shader);
            if (mat.HasProperty("_BaseColor")) mat.SetColor("_BaseColor", color);
            if (mat.HasProperty("_Color")) mat.SetColor("_Color", color);
            go.GetComponent<Renderer>().material = mat;
        }
    }

    /// <summary>大時計の針。大時計は12秒で1周し、針が12時ちょうど=スタート時刻(clock=0)。</summary>
    public class BigClockNeedle : MonoBehaviour
    {
        RaceManager race;
        Transform pivot;

        public void Initialize(RaceManager race, Transform pivot)
        {
            this.race = race;
            this.pivot = pivot;
        }

        void Update()
        {
            if (race == null || pivot == null) return;
            float angle = race.state.clock * 30f; // 360°/12s
            pivot.localRotation = Quaternion.Euler(0f, 0f, -angle);
        }
    }
}
