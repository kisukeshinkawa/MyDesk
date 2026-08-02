using UnityEngine;
using UnityEngine.UI;
using BoatRace.Core;
using BoatRace.Commentary;
using BoatRace.Data;

namespace BoatRace.UI
{
    /// <summary>
    /// ゲーム全体の画面遷移: タイトル → ホーム → 出走表 → レース → 結果。
    /// スマホゲー風UIをすべてコードで生成する。
    /// </summary>
    public class GameFlow : MonoBehaviour
    {
        RaceManager race;
        ReplayManager replay;
        CommentarySystem commentary;
        RaceHudUI hud;

        Canvas canvas;
        GameObject currentScreen;
        GameObject replayOverlay;
        Text titleBlink;
        float resultTimer = -1f;
        bool wasReplaying;

        public void Initialize(RaceManager race, ReplayManager replay, CommentarySystem commentary, RaceCamera raceCam)
        {
            this.race = race;
            this.replay = replay;
            this.commentary = commentary;

            canvas = UiKit.MakeCanvas();
            hud = new RaceHudUI(race, commentary, canvas.transform, raceCam);
            hud.SetVisible(false);
            BuildReplayOverlay();

            race.OnRaceFinished += () => resultTimer = 3f;
            ShowTitle();
        }

        void Update()
        {
            hud.Tick();

            if (resultTimer > 0f)
            {
                resultTimer -= Time.deltaTime;
                if (resultTimer <= 0f) { hud.SetVisible(false); ShowResult(); }
            }

            // リプレイ終了検知 → 結果画面へ戻る
            replayOverlay.SetActive(replay.IsPlaying);
            if (wasReplaying && !replay.IsPlaying) ShowResult();
            wasReplaying = replay.IsPlaying;

            // タイトルの「タップでスタート」点滅
            if (titleBlink != null)
            {
                var c = titleBlink.color;
                c.a = 0.45f + 0.55f * Mathf.Abs(Mathf.Sin(Time.time * 2.2f));
                titleBlink.color = c;
            }
        }

        void ClearScreen()
        {
            if (currentScreen != null) Destroy(currentScreen);
            currentScreen = null;
            titleBlink = null;
        }

        GameObject NewScreen(string name)
        {
            ClearScreen();
            currentScreen = new GameObject(name);
            UiKit.Place(currentScreen, canvas.transform, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            return currentScreen;
        }

        // ================= タイトル =================
        void ShowTitle()
        {
            var s = NewScreen("TitleScreen");
            UiKit.MakeFullscreenGradient(s.transform, UiKit.Sky, UiKit.Navy);

            UiKit.MakeText(s.transform, "BOATRACE", 110, Color.white, TextAnchor.MiddleCenter,
                new Vector2(0f, 0.60f), new Vector2(1f, 0.85f), Vector2.zero, Vector2.zero, bold: true, shadow: true);
            UiKit.MakeText(s.transform, "R E A L I S M", 44, UiKit.Yellow, TextAnchor.MiddleCenter,
                new Vector2(0f, 0.50f), new Vector2(1f, 0.62f), Vector2.zero, Vector2.zero, bold: true, shadow: true);
            UiKit.MakeText(s.transform, "リアル競艇シミュレーション", 26, Color.white, TextAnchor.MiddleCenter,
                new Vector2(0f, 0.43f), new Vector2(1f, 0.50f), Vector2.zero, Vector2.zero);
            titleBlink = UiKit.MakeText(s.transform, "－ タップでスタート －", 34, Color.white, TextAnchor.MiddleCenter,
                new Vector2(0f, 0.16f), new Vector2(1f, 0.26f), Vector2.zero, Vector2.zero, bold: true, shadow: true);

            // 全画面透明ボタン
            var tap = new GameObject("Tap");
            UiKit.Place(tap, s.transform, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            var img = tap.AddComponent<Image>();
            img.color = new Color(0f, 0f, 0f, 0f);
            tap.AddComponent<Button>().onClick.AddListener(ShowHome);
        }

        // ================= ホーム =================
        void ShowHome()
        {
            var s = NewScreen("HomeScreen");
            UiKit.MakeFullscreenGradient(s.transform, new Color(0.85f, 0.95f, 1f), UiKit.Sky);

            UiKit.MakeText(s.transform, "BOATRACE REALISM", 40, UiKit.Navy, TextAnchor.MiddleCenter,
                new Vector2(0f, 0.88f), new Vector2(1f, 0.98f), Vector2.zero, Vector2.zero, bold: true);

            // 開催場セレクタ
            var panel = UiKit.MakePanel(s.transform, UiKit.PanelWhite, 22,
                new Vector2(0.25f, 0.50f), new Vector2(0.75f, 0.82f), Vector2.zero, Vector2.zero);
            UiKit.MakeText(panel.transform, "開催場", 24, UiKit.TextDark, TextAnchor.MiddleCenter,
                new Vector2(0f, 0.72f), new Vector2(1f, 0.95f), Vector2.zero, Vector2.zero, bold: true);
            var venueLabel = UiKit.MakeText(panel.transform, "", 40, UiKit.Cyan, TextAnchor.MiddleCenter,
                new Vector2(0.2f, 0.38f), new Vector2(0.8f, 0.70f), Vector2.zero, Vector2.zero, bold: true);
            var infoLabel = UiKit.MakeText(panel.transform, "", 20, UiKit.TextDark, TextAnchor.MiddleCenter,
                new Vector2(0f, 0.08f), new Vector2(1f, 0.36f), Vector2.zero, Vector2.zero);

            void RefreshVenue()
            {
                var v = CourseDatabase.Get(race.venueId);
                venueLabel.text = $"{v.id}. {v.name}";
                infoLabel.text = $"風影響 {Stars(v.windEffect)}　波 {v.waveHeight * 100f:F0}cm\nイン有利度 {Stars(v.insideAdvantage)}";
            }
            UiKit.MakeButton(panel.transform, "◀", UiKit.Cyan, 30,
                new Vector2(0.03f, 0.42f), new Vector2(0.17f, 0.66f), Vector2.zero, Vector2.zero,
                () => { race.venueId = race.venueId <= 1 ? 24 : race.venueId - 1; RefreshVenue(); });
            UiKit.MakeButton(panel.transform, "▶", UiKit.Cyan, 30,
                new Vector2(0.83f, 0.42f), new Vector2(0.97f, 0.66f), Vector2.zero, Vector2.zero,
                () => { race.venueId = race.venueId >= 24 ? 1 : race.venueId + 1; RefreshVenue(); });
            RefreshVenue();

            UiKit.MakeButton(s.transform, "出走表へ ▶", UiKit.Yellow, 36,
                new Vector2(0.30f, 0.28f), new Vector2(0.70f, 0.42f), Vector2.zero, Vector2.zero,
                () =>
                {
                    race.seed = System.Environment.TickCount;
                    race.SetupRace();
                    ShowEntry();
                }).GetComponentInChildren<Text>().color = UiKit.Navy;

            UiKit.MakeText(s.transform, "選手×モーター×プロペラ抽選は毎レース変わります", 20, UiKit.Navy, TextAnchor.MiddleCenter,
                new Vector2(0f, 0.18f), new Vector2(1f, 0.26f), Vector2.zero, Vector2.zero);
        }

        // ================= 出走表 =================
        void ShowEntry()
        {
            var s = NewScreen("EntryScreen");
            UiKit.MakeFullscreenGradient(s.transform, new Color(0.85f, 0.95f, 1f), UiKit.Sky);

            UiKit.MakeText(s.transform, $"出走表　{race.venue.name}", 38, UiKit.Navy, TextAnchor.MiddleCenter,
                new Vector2(0f, 0.90f), new Vector2(1f, 1f), Vector2.zero, Vector2.zero, bold: true);

            for (int i = 0; i < 6; i++)
            {
                int col = i % 2, row = i / 2;
                var card = UiKit.MakePanel(s.transform, UiKit.PanelWhite, 18,
                    new Vector2(0.05f + col * 0.475f, 0.645f - row * 0.235f),
                    new Vector2(0.475f + col * 0.475f, 0.865f - row * 0.235f),
                    Vector2.zero, Vector2.zero);

                // 艇色バー
                var bar = new GameObject("Bar");
                UiKit.Place(bar, card.transform, new Vector2(0f, 0f), new Vector2(0f, 1f),
                    new Vector2(0f, 4f), new Vector2(14f, -4f));
                var barImg = bar.AddComponent<Image>();
                barImg.sprite = UiKit.Rounded(6);
                barImg.type = Image.Type.Sliced;
                barImg.color = UiKit.BoatColors[i];

                var st = race.statsList[i];
                var bs = race.state.Get(i);
                string grade = MotorGrade(st.motor.OverallScore);
                UiKit.MakeText(card.transform, $"{i + 1}号艇  {st.player.playerName}", 26, UiKit.TextDark,
                    TextAnchor.MiddleLeft, new Vector2(0f, 0.62f), new Vector2(1f, 0.95f),
                    new Vector2(28f, 0f), new Vector2(-8f, 0f), bold: true);
                UiKit.MakeText(card.transform,
                    $"級別 {st.player.rank}　進入 {bs.course}コース　平均ST .{Mathf.RoundToInt(st.player.reactionTimeMean * 100f):00}",
                    20, UiKit.TextDark, TextAnchor.MiddleLeft,
                    new Vector2(0f, 0.34f), new Vector2(1f, 0.60f), new Vector2(28f, 0f), new Vector2(-8f, 0f));
                UiKit.MakeText(card.transform,
                    $"モーター評価 {grade}　展示タイム {bs.exhibitionTime:F2}",
                    20, UiKit.Cyan, TextAnchor.MiddleLeft,
                    new Vector2(0f, 0.06f), new Vector2(1f, 0.32f), new Vector2(28f, 0f), new Vector2(-8f, 0f), bold: true);
            }

            UiKit.MakeButton(s.transform, "レーススタート！", UiKit.Red, 38,
                new Vector2(0.30f, 0.02f), new Vector2(0.70f, 0.13f), Vector2.zero, Vector2.zero,
                () =>
                {
                    ClearScreen();
                    hud.SetVisible(true);
                    race.armed = true;
                });
            UiKit.MakeButton(s.transform, "↩ ホーム", UiKit.Cyan, 24,
                new Vector2(0.02f, 0.02f), new Vector2(0.16f, 0.10f), Vector2.zero, Vector2.zero, ShowHome);
        }

        // ================= 結果 =================
        void ShowResult()
        {
            hud.SetVisible(false);
            var s = NewScreen("ResultScreen");
            UiKit.MakeFullscreenGradient(s.transform, UiKit.Navy, new Color(0.02f, 0.06f, 0.16f));

            UiKit.MakeText(s.transform, $"レース結果　{race.venue.name}", 42, UiKit.Yellow, TextAnchor.MiddleCenter,
                new Vector2(0f, 0.89f), new Vector2(1f, 0.99f), Vector2.zero, Vector2.zero, bold: true, shadow: true);

            var panel = UiKit.MakePanel(s.transform, new Color(1f, 1f, 1f, 0.10f), 22,
                new Vector2(0.16f, 0.30f), new Vector2(0.84f, 0.87f), Vector2.zero, Vector2.zero);

            for (int i = 0; i < race.state.standings.Count; i++)
            {
                int idx = race.state.standings[i];
                var bs = race.state.Get(idx);
                var st = race.statsList[idx];
                float top = 0.98f - i * 0.155f;

                var chip = new GameObject("Chip");
                UiKit.Place(chip, panel.transform, new Vector2(0.04f, top - 0.13f), new Vector2(0.10f, top - 0.02f),
                    Vector2.zero, Vector2.zero);
                var ci = chip.AddComponent<Image>();
                ci.sprite = UiKit.Rounded(8);
                ci.type = Image.Type.Sliced;
                ci.color = UiKit.BoatColors[idx];

                string stStr = bs.startFlag == StartFlag.Flying ? "F" : $".{Mathf.RoundToInt(Mathf.Abs(bs.st) * 100f):00}";
                string time = bs.finished ? $"{bs.finishTime:F1}s" : "－";
                UiKit.MakeText(panel.transform,
                    $"{i + 1}着　{idx + 1}号艇 {st.player.playerName}　ST{stStr}　{AI.StrategyAI.TacticName(bs.tactic)}　{time}",
                    26, Color.white, TextAnchor.MiddleLeft,
                    new Vector2(0.13f, top - 0.14f), new Vector2(0.98f, top), Vector2.zero, Vector2.zero, bold: i == 0);
            }

            // 3連単風の払戻表示(お楽しみ要素)
            if (race.state.standings.Count >= 3)
            {
                int a = race.state.standings[0], b = race.state.standings[1], c = race.state.standings[2];
                int payout = ComputePayout(a, b, c);
                UiKit.MakeText(s.transform, $"3連単 {a + 1}-{b + 1}-{c + 1}　払戻 ¥{payout:N0}", 30, UiKit.Yellow,
                    TextAnchor.MiddleCenter, new Vector2(0f, 0.21f), new Vector2(1f, 0.29f),
                    Vector2.zero, Vector2.zero, bold: true, shadow: true);
            }

            UiKit.MakeButton(s.transform, "▶ リプレイ", UiKit.Cyan, 28,
                new Vector2(0.16f, 0.05f), new Vector2(0.38f, 0.16f), Vector2.zero, Vector2.zero,
                () => { ClearScreen(); replay.StartPlayback(); });
            UiKit.MakeButton(s.transform, "もう一度", UiKit.Red, 28,
                new Vector2(0.40f, 0.05f), new Vector2(0.60f, 0.16f), Vector2.zero, Vector2.zero,
                () => { race.seed = System.Environment.TickCount; race.SetupRace(); ShowEntry(); });
            UiKit.MakeButton(s.transform, "ホームへ", UiKit.Yellow, 28,
                new Vector2(0.62f, 0.05f), new Vector2(0.84f, 0.16f), Vector2.zero, Vector2.zero,
                () => { race.SetupRace(); ShowHome(); }).GetComponentInChildren<Text>().color = UiKit.Navy;
        }

        // ================= リプレイ操作 =================
        void BuildReplayOverlay()
        {
            replayOverlay = new GameObject("ReplayOverlay");
            UiKit.Place(replayOverlay, canvas.transform, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            UiKit.MakeText(replayOverlay.transform, "● REPLAY", 30, UiKit.Red, TextAnchor.MiddleLeft,
                new Vector2(0.02f, 0.90f), new Vector2(0.4f, 0.98f), Vector2.zero, Vector2.zero, bold: true, shadow: true);
            UiKit.MakeButton(replayOverlay.transform, "カメラ切替", UiKit.Cyan, 24,
                new Vector2(0.70f, 0.90f), new Vector2(0.84f, 0.98f), Vector2.zero, Vector2.zero,
                () => replay.ToggleCamera());
            UiKit.MakeButton(replayOverlay.transform, "終了", UiKit.Red, 24,
                new Vector2(0.86f, 0.90f), new Vector2(0.97f, 0.98f), Vector2.zero, Vector2.zero,
                () => replay.StopPlayback());
            replayOverlay.SetActive(false);
        }

        int ComputePayout(int first, int second, int third)
        {
            var f = race.state.Get(first);
            float odds = 6f + (f.course - 1) * 14f
                       + Mathf.Abs(race.state.Get(second).course - f.course) * 6f
                       + race.state.Get(third).course * 3f;
            var rng = new System.Random(race.seed);
            odds *= 0.7f + (float)rng.NextDouble() * 1.4f;
            return Mathf.RoundToInt(odds) * 100;
        }

        static string MotorGrade(float score)
        {
            if (score >= 75f) return "S";
            if (score >= 55f) return "A";
            if (score >= 35f) return "B";
            return "C";
        }

        static string Stars(float v01)
        {
            int n = Mathf.Clamp(Mathf.RoundToInt(v01 * 5f), 1, 5);
            return new string('★', n) + new string('☆', 5 - n);
        }
    }
}
