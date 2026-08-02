using UnityEngine;
using BoatRace.Data;
using BoatRace.Start;
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
        static float hw;        // 水面のz方向半幅(会場ごとに違う)
        static Color accent;    // 会場アクセント色

        public static void Build(RaceManager race)
        {
            root = new GameObject("Venue").transform;
            hw = VenueTraits.WaterHalfWidth(race.venueId);
            accent = VenueTraits.AccentColor(race.venueId);

            BuildPerimeter();
            BuildWaveBreakers();
            BuildTurnMarks();
            BuildGrandstand();
            BuildAdWalls();
            BuildBigClock(race);
            BuildScoreboard(race);
            BuildPitStalls(race);
            BuildWindNets();
            BuildDangerLights();
            BuildDistanceMarkers();
        }

        // ---- 距離標識ポール(スタートラインまで 200/150/100/80/45/5m) ----
        static void BuildDistanceMarkers()
        {
            // 実物: 内側に縞模様のポールが並び、選手が助走距離の目安にする
            (float dist, Color stripe)[] markers =
            {
                (200f, new Color(0.2f, 0.2f, 0.2f)),   // 黒(ダッシュ勢の目安)
                (150f, new Color(1f, 0.5f, 0f)),        // オレンジ(見透し線)
                (100f, new Color(0.95f, 0.8f, 0.1f)),   // 黄
                (80f,  new Color(0.95f, 0.8f, 0.1f)),   // 黄
                (45f,  new Color(0.9f, 0.15f, 0.1f)),   // 赤
                (5f,   new Color(0.9f, 0.15f, 0.1f)),   // 赤
            };
            foreach (var (dist, stripe) in markers)
            {
                float x = TrackPath.StartLineX - dist;
                // 内側(マーク寄り)にポール
                for (int seg = 0; seg < 4; seg++)
                {
                    var band = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                    band.name = $"Marker{dist}m";
                    band.transform.SetParent(root, false);
                    band.transform.position = new Vector3(x, 0.5f + seg * 0.8f, -5f);
                    band.transform.localScale = new Vector3(0.45f, 0.4f, 0.45f);
                    Paint(band, seg % 2 == 0 ? stripe : Color.white);
                }
                MakeText3D($"{dist:F0}", new Vector3(x, 4.2f, -5f), Quaternion.identity, 1.6f, Color.white);
            }
        }

        // ---- 外周壁 ----
        static void BuildPerimeter()
        {
            var gray = new Color(0.55f, 0.58f, 0.62f);
            MakeBox("WallSouth", new Vector3(-150f, 1.5f, -(hw + 2f)), new Vector3(650f, 3f, 2f), gray);
            MakeBox("WallNorth", new Vector3(-150f, 1.5f, hw + 2f), new Vector3(650f, 3f, 2f), gray);
            MakeBox("WallWest", new Vector3(-476f, 1.5f, 0f), new Vector3(2f, 3f, hw * 2f + 6f), gray);
            MakeBox("WallEast", new Vector3(176f, 1.5f, 0f), new Vector3(2f, 3f, hw * 2f + 6f), gray);
        }

        // ---- 消波装置(オレンジのフロート) ----
        static void BuildWaveBreakers()
        {
            var orange = new Color(1f, 0.5f, 0.05f);
            var parent = new GameObject("WaveBreakers").transform;
            parent.SetParent(root, false);
            float zEdge = hw - 6f;
            for (float x = -460f; x <= 160f; x += 14f)
            {
                MakeBox("wb", new Vector3(x, 0.25f, -zEdge), new Vector3(3.2f, 0.5f, 1.1f), orange, parent);
                MakeBox("wb", new Vector3(x, 0.25f, zEdge), new Vector3(3.2f, 0.5f, 1.1f), orange, parent);
            }
            for (float z = -(zEdge - 10f); z <= zEdge - 10f; z += 14f)
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
                float z = -(hw + 12f) - t * 9f;
                MakeBox($"Tier{t}", new Vector3(-150f, y, z), new Vector3(460f, 2.2f, 9f), tierColor, stand);

                // 観客(カラフルなキューブ)
                for (float x = -370f; x <= 70f; x += 11f)
                {
                    if (rng.NextDouble() < 0.25) continue;
                    var c = Color.HSVToRGB((float)rng.NextDouble(), 0.55f, 0.95f);
                    MakeBox("fan", new Vector3(x + (float)rng.NextDouble() * 4f, y + 1.6f, z), new Vector3(0.8f, 1.1f, 0.8f), c, stand);
                }
            }

            // 屋根(会場アクセント色)と背面壁
            MakeBox("Roof", new Vector3(-150f, 14.5f, -(hw + 33f)), new Vector3(475f, 0.9f, 58f), accent, stand);
            MakeBox("BackWall", new Vector3(-150f, 7f, -(hw + 59f)), new Vector3(470f, 15f, 2f), new Color(0.65f, 0.68f, 0.72f), stand);
            for (float x = -370f; x <= 70f; x += 55f)
                MakeBox("Pillar", new Vector3(x, 7f, -(hw + 7.5f)), new Vector3(1.2f, 14f, 1.2f), new Color(0.5f, 0.52f, 0.56f), stand);
        }

        // ---- 広告壁(架空スポンサー) ----
        static void BuildAdWalls()
        {
            string[] brands = { "DUSTALK", "BEETLE EMS", "MyDesk", "NISHIHARA", "BOAT RACE" };
            Color[] bgs = { UiKit.Cyan, new Color(0.9f, 0.3f, 0.1f), UiKit.Navy, new Color(0.1f, 0.6f, 0.3f), new Color(0.85f, 0.7f, 0.1f) };
            for (int i = 0; i < 10; i++)
            {
                float x = -420f + i * 60f;
                MakeBox("Ad", new Vector3(x, 2.6f, -(hw + 1f)), new Vector3(48f, 2.6f, 0.6f), bgs[i % bgs.Length]);
                MakeText3D(brands[i % brands.Length], new Vector3(x, 2.6f, -(hw + 0.5f)), Quaternion.identity, 2.0f, Color.white);
            }
        }

        // ---- 大時計(針が12時=スタート) ----
        static void BuildBigClock(RaceManager race)
        {
            var clock = new GameObject("BigClock");
            clock.transform.SetParent(root, false);
            clock.transform.position = new Vector3(TrackPath.StartLineX, 0f, -(hw - 10f));

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

            // 白針(60秒針・長針): T-75に45秒位置から始動し、12時=スタート
            var whitePivot = new GameObject("WhiteNeedlePivot");
            whitePivot.transform.SetParent(clock.transform, false);
            whitePivot.transform.localPosition = new Vector3(0f, 13.5f, 0.7f);
            var whiteNeedle = GameObject.CreatePrimitive(PrimitiveType.Cube);
            whiteNeedle.transform.SetParent(whitePivot.transform, false);
            whiteNeedle.transform.localPosition = new Vector3(0f, 1.6f, 0f);
            whiteNeedle.transform.localScale = new Vector3(0.32f, 3.2f, 0.12f);
            Paint(whiteNeedle, Color.white);
            var whiteRim = GameObject.CreatePrimitive(PrimitiveType.Cube);
            whiteRim.transform.SetParent(whitePivot.transform, false);
            whiteRim.transform.localPosition = new Vector3(0f, 3.1f, 0f);
            whiteRim.transform.localScale = new Vector3(0.55f, 0.55f, 0.13f);
            Paint(whiteRim, new Color(0.1f, 0.1f, 0.1f)); // 針先の視認マーク

            // 黄針(12秒針・短針): T-12に始動。選手が実際に見るのはこちら
            var yellowPivot = new GameObject("YellowNeedlePivot");
            yellowPivot.transform.SetParent(clock.transform, false);
            yellowPivot.transform.localPosition = new Vector3(0f, 13.5f, 0.9f);
            var yellowNeedle = GameObject.CreatePrimitive(PrimitiveType.Cube);
            yellowNeedle.transform.SetParent(yellowPivot.transform, false);
            yellowNeedle.transform.localPosition = new Vector3(0f, 1.1f, 0f);
            yellowNeedle.transform.localScale = new Vector3(0.42f, 2.2f, 0.12f);
            Paint(yellowNeedle, new Color(1f, 0.85f, 0.1f));

            var driver = clock.AddComponent<BigClockNeedle>();
            driver.Initialize(race, whitePivot.transform, yellowPivot.transform);

            // 最終周回灯(大時計付近)
            var lamp = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            lamp.name = "FinalLapLamp";
            lamp.transform.SetParent(clock.transform, false);
            lamp.transform.localPosition = new Vector3(0f, 19.2f, 0f);
            lamp.transform.localScale = Vector3.one * 1.8f;
            finalLampMat = Paint2(lamp, FinalLampOff);
        }

        static Material finalLampMat;
        static readonly Color FinalLampOff = new Color(0.25f, 0.2f, 0.05f);
        static readonly Color FinalLampOn = new Color(1f, 0.75f, 0.05f);

        /// <summary>最終周回灯の点灯/消灯(RaceManagerが呼ぶ)。</summary>
        public static void SetFinalLamp(bool lit)
        {
            if (finalLampMat == null) return;
            Color c = lit ? FinalLampOn : FinalLampOff;
            if (finalLampMat.HasProperty("_BaseColor")) finalLampMat.SetColor("_BaseColor", c);
            if (finalLampMat.HasProperty("_Color")) finalLampMat.SetColor("_Color", c);
        }

        // ---- 電光掲示板(バックストレッチ側) ----
        static void BuildScoreboard(RaceManager race)
        {
            float bz = hw + 8f;
            var board = new GameObject("Scoreboard");
            board.transform.SetParent(root, false);
            board.transform.position = new Vector3(-150f, 0f, bz);

            MakeBox("Leg", new Vector3(-18f, 4f, 0f), new Vector3(1.5f, 8f, 1.5f), new Color(0.4f, 0.4f, 0.45f), board.transform);
            MakeBox("Leg", new Vector3(18f, 4f, 0f), new Vector3(1.5f, 8f, 1.5f), new Color(0.4f, 0.4f, 0.45f), board.transform);
            MakeBox("Panel", new Vector3(0f, 14f, 0f), new Vector3(84f, 16f, 1.2f), new Color(0.05f, 0.06f, 0.12f), board.transform);
            MakeText3D($"BOATRACE {race.venue.name}", new Vector3(-150f, 18f, bz - 1f),
                Quaternion.Euler(0f, 180f, 0f), 3.4f, new Color(1f, 0.85f, 0.2f));
            MakeText3D("第 1 レース　大型映像", new Vector3(-150f, 12f, bz - 1f),
                Quaternion.Euler(0f, 180f, 0f), 2.6f, Color.white);
        }

        // ---- 本番ピット(水面図準拠: 岸側に6艇が横一列のスタール式) ----
        static void BuildPitStalls(RaceManager race)
        {
            var deckColor = new Color(0.45f, 0.47f, 0.52f);
            var roofColor = new Color(0.25f, 0.28f, 0.34f);
            var dividerColor = new Color(0.7f, 0.72f, 0.76f);

            Vector3 p0 = PitExitSystem.PitPosition(0, race.venueId);
            float cx = PitExitSystem.PitCenterX(race.venueId);
            float stallZ = p0.z;              // 艇の格納z
            float width = PitExitSystem.StallSpacing * 6f + 8f;

            // 岸側の桟橋デッキと屋根
            MakeBox("PitDeck", new Vector3(cx, 0.45f, stallZ - 7f), new Vector3(width, 0.9f, 8f), deckColor);
            MakeBox("PitRoof", new Vector3(cx, 6.2f, stallZ - 4f), new Vector3(width, 0.5f, 14f), roofColor);
            for (int k = 0; k <= 6; k++)
            {
                float x = cx + (k - 3f) * PitExitSystem.StallSpacing;
                MakeBox("PitPillar", new Vector3(x, 3.1f, stallZ - 9.5f), new Vector3(0.5f, 6.2f, 0.5f), dividerColor);
                // スタール仕切り(艇と艇の間の桟橋)
                MakeBox("PitDivider", new Vector3(x, 0.3f, stallZ), new Vector3(0.5f, 0.6f, 7.5f), dividerColor);
            }

            // 各スタールの艇番プレート
            for (int i = 0; i < 6; i++)
            {
                Vector3 sp = PitExitSystem.PitPosition(i, race.venueId);
                MakeText3D((i + 1).ToString(), new Vector3(sp.x, 5f, stallZ - 3.5f),
                    Quaternion.identity, 2.4f, UiKit.BoatColors[i] == Color.white ? Color.white : UiKit.BoatColors[i]);
            }
            MakeText3D("本番ピット", new Vector3(cx, 7.4f, stallZ - 4f),
                Quaternion.identity, 2.4f, Color.white);
        }

        // ---- 防風ネット(バック側の緑のネット) ----
        static void BuildWindNets()
        {
            var netGreen = new Color(0.25f, 0.55f, 0.3f, 1f);
            foreach (var x in new[] { -350f, -150f, 50f })
                MakeBox("WindNet", new Vector3(x, 6.5f, hw + 3f), new Vector3(160f, 7f, 0.5f), netGreen);
        }

        // ---- 危険信号灯(水面図: 東西両端) ----
        static void BuildDangerLights()
        {
            foreach (var x in new[] { -470f, 170f })
            {
                MakeBox("SignalPole", new Vector3(x, 4f, 0f), new Vector3(0.7f, 8f, 0.7f), new Color(0.75f, 0.75f, 0.78f));
                var lamp = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                lamp.name = "SignalLamp";
                lamp.transform.SetParent(root, false);
                lamp.transform.position = new Vector3(x, 8.6f, 0f);
                lamp.transform.localScale = Vector3.one * 1.6f;
                Paint(lamp, new Color(0.95f, 0.1f, 0.08f));
            }
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
            Paint2(go, color);
        }

        static Material Paint2(GameObject go, Color color)
        {
            var shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            var mat = new Material(shader);
            if (mat.HasProperty("_BaseColor")) mat.SetColor("_BaseColor", color);
            if (mat.HasProperty("_Color")) mat.SetColor("_Color", color);
            go.GetComponent<Renderer>().material = mat;
            return mat;
        }
    }

    /// <summary>
    /// 大時計の2針駆動。
    /// 白針(60秒針): T-75に45秒位置から始動し1周60秒、12時ちょうど=スタート成立時刻。
    /// 黄針(12秒針): T-12に12時から始動し1周12秒。選手が起こしで見るのはこちら。
    /// </summary>
    public class BigClockNeedle : MonoBehaviour
    {
        RaceManager race;
        Transform whitePivot;
        Transform yellowPivot;

        public void Initialize(RaceManager race, Transform whitePivot, Transform yellowPivot)
        {
            this.race = race;
            this.whitePivot = whitePivot;
            this.yellowPivot = yellowPivot;
        }

        void Update()
        {
            if (race == null) return;
            float clock = race.state.clock;
            if (whitePivot != null)
            {
                float wc = Mathf.Max(clock, -75f);   // T-75で45秒位置(-450°≡-90°)に静止→始動
                whitePivot.localRotation = Quaternion.Euler(0f, 0f, -wc * 6f);
            }
            if (yellowPivot != null)
            {
                float yc = Mathf.Max(clock, -12f);   // T-12まで12時に静止→始動
                yellowPivot.localRotation = Quaternion.Euler(0f, 0f, -yc * 30f);
            }
        }
    }
}
