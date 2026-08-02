using System.Collections.Generic;
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
        GameObject ffButton;
        Text ffLabel;
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

            // ピット離れ〜待機行動(T-100〜-14)は実時間で長いので早送りできるように
            var ffBtn = UiKit.MakeButton(canvas.transform, "⏩ 早送り", UiKit.Navy, 22,
                new Vector2(1f, 0f), new Vector2(1f, 0f), new Vector2(-230f, 186f), new Vector2(-16f, 234f),
                () =>
                {
                    Time.timeScale = Time.timeScale > 1f ? 1f : 5f;
                    ffLabel.text = Time.timeScale > 1f ? "▶ 等速に戻す" : "⏩ 早送り";
                });
            ffLabel = ffBtn.GetComponentInChildren<Text>();
            ffButton = ffBtn.gameObject;
            ffButton.SetActive(false);

            race.OnRaceFinished += () => { resultTimer = 3f; RecordStats(); };
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

            // 早送りボタン: スタート前のみ有効。T-14以降は自動で等速へ
            bool preRace = race.armed && race.state.clock < -14f &&
                (race.state.phase == RacePhase.PitOut || race.state.phase == RacePhase.Waiting);
            ffButton.SetActive(preRace);
            if (!preRace && Time.timeScale != 1f)
            {
                Time.timeScale = 1f;
                ffLabel.text = "⏩ 早送り";
            }

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
            UiKit.AddStripeOverlay(s, Color.white, 0.06f);

            UiKit.MakeText(s.transform, "BOATRACE", 110, Color.white, TextAnchor.MiddleCenter,
                new Vector2(0f, 0.60f), new Vector2(1f, 0.85f), Vector2.zero, Vector2.zero,
                bold: true, shadow: true, outline: true);
            UiKit.MakeText(s.transform, "R E A L I S M", 44, UiKit.Yellow, TextAnchor.MiddleCenter,
                new Vector2(0f, 0.50f), new Vector2(1f, 0.62f), Vector2.zero, Vector2.zero,
                bold: true, shadow: true, outline: true);
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

        // ================= ホーム(3D会場が見えるロビー) =================
        void ShowHome()
        {
            var s = NewScreen("HomeScreen");
            // 背景に3D会場と艇がそのまま見える(全画面グラデは敷かない)

            // 上部バー: ロゴ＋通算成績チップ
            var topBar = UiKit.MakePanel(s.transform, new Color(0.05f, 0.12f, 0.30f, 0.93f), 12,
                new Vector2(0f, 0.925f), new Vector2(1f, 1f), new Vector2(-6f, 0f), new Vector2(6f, 4f));
            UiKit.AddStripeOverlay(topBar, Color.white, 0.05f);
            UiKit.MakeText(topBar.transform, "⚡ BOATRACE REALISM", 30, Color.white, TextAnchor.MiddleLeft,
                new Vector2(0f, 0f), new Vector2(0.5f, 1f), new Vector2(24f, 0f), Vector2.zero,
                bold: true, shadow: true, outline: true);
            int totalRaces = PlayerPrefs.GetInt("br_races", 0);
            int bestPayout = PlayerPrefs.GetInt("br_best", 0);
            UiKit.MakeChip(topBar.transform, $"通算 {totalRaces}R", UiKit.Yellow, UiKit.Navy, 20,
                new Vector2(0.62f, 0.18f), new Vector2(0.79f, 0.82f), Vector2.zero, Vector2.zero);
            UiKit.MakeChip(topBar.transform, $"最高払戻 ¥{bestPayout:N0}", UiKit.Cyan, Color.white, 20,
                new Vector2(0.81f, 0.18f), new Vector2(0.99f, 0.82f), Vector2.zero, Vector2.zero);

            // 開催場カード(コンパクト・上中央)
            var vCard = UiKit.MakePanel(s.transform, UiKit.PanelWhite, 18,
                new Vector2(0.33f, 0.70f), new Vector2(0.67f, 0.905f), Vector2.zero, Vector2.zero);
            UiKit.MakeText(vCard.transform, "開催場", 18, UiKit.Cyan, TextAnchor.MiddleCenter,
                new Vector2(0f, 0.74f), new Vector2(1f, 0.98f), Vector2.zero, Vector2.zero, bold: true);
            var venueLabel = UiKit.MakeText(vCard.transform, "", 34, UiKit.TextDark, TextAnchor.MiddleCenter,
                new Vector2(0.16f, 0.36f), new Vector2(0.84f, 0.74f), Vector2.zero, Vector2.zero, bold: true);
            var infoLabel = UiKit.MakeText(vCard.transform, "", 17, UiKit.TextDark, TextAnchor.MiddleCenter,
                new Vector2(0f, 0.04f), new Vector2(1f, 0.34f), Vector2.zero, Vector2.zero);
            void RefreshVenue()
            {
                var v = CourseDatabase.Get(race.venueId);
                venueLabel.text = $"{v.id}. {v.name}";
                infoLabel.text = $"風 {Stars(v.windEffect)}　波 {v.waveHeight * 100f:F0}cm　イン {Stars(v.insideAdvantage)}";
            }
            UiKit.MakeButton(vCard.transform, "◀", UiKit.Cyan, 26,
                new Vector2(0.02f, 0.30f), new Vector2(0.14f, 0.78f), Vector2.zero, Vector2.zero,
                () => { race.venueId = race.venueId <= 1 ? 24 : race.venueId - 1; RefreshVenue(); });
            UiKit.MakeButton(vCard.transform, "▶", UiKit.Cyan, 26,
                new Vector2(0.86f, 0.30f), new Vector2(0.98f, 0.78f), Vector2.zero, Vector2.zero,
                () => { race.venueId = race.venueId >= 24 ? 1 : race.venueId + 1; RefreshVenue(); });
            RefreshVenue();

            // NEXTレースバナー(左)
            var next = UiKit.MakePanel(s.transform, UiKit.PanelWhite, 16,
                new Vector2(0.03f, 0.30f), new Vector2(0.30f, 0.44f), Vector2.zero, Vector2.zero);
            UiKit.AddStripeOverlay(next, UiKit.Sky, 0.15f);
            UiKit.MakeChip(next.transform, "NEXT ▶", UiKit.Yellow, UiKit.Navy, 18,
                new Vector2(0.04f, 0.58f), new Vector2(0.44f, 0.94f), Vector2.zero, Vector2.zero);
            UiKit.MakeText(next.transform, $"第{totalRaces + 1}R  {race.venue.name}", 24, UiKit.TextDark,
                TextAnchor.MiddleLeft,
                new Vector2(0.06f, 0.06f), new Vector2(1f, 0.55f), Vector2.zero, Vector2.zero, bold: true);

            // 下部ナビバー
            var nav = UiKit.MakePanel(s.transform, new Color(0.05f, 0.12f, 0.30f, 0.93f), 12,
                new Vector2(0f, 0f), new Vector2(1f, 0.125f), new Vector2(-6f, -4f), new Vector2(6f, 0f));
            UiKit.AddStripeOverlay(nav, Color.white, 0.05f);
            UiKit.MakeButton(nav.transform, "タイトルへ", new Color(0.45f, 0.5f, 0.58f), 22,
                new Vector2(0.02f, 0.16f), new Vector2(0.16f, 0.84f), Vector2.zero, Vector2.zero, ShowTitle);
            UiKit.MakeButton(nav.transform, "戦績", new Color(0.1f, 0.62f, 0.35f), 22,
                new Vector2(0.18f, 0.16f), new Vector2(0.32f, 0.84f), Vector2.zero, Vector2.zero,
                () => ShowStatsPopup(s.transform));
            UiKit.MakeButton(nav.transform, "出走表へ　▶", UiKit.Red, 30,
                new Vector2(0.36f, 0.10f), new Vector2(0.64f, 0.90f), Vector2.zero, Vector2.zero,
                () =>
                {
                    race.seed = System.Environment.TickCount;
                    race.SetupRace();
                    if (RaceBootstrap.Instance != null) RaceBootstrap.Instance.RebuildEnvironment(race);
                    ShowEntry();
                });
            UiKit.MakeChip(nav.transform, "選手・モーター・ペラは毎レース抽選", new Color(0f, 0f, 0f, 0.25f), Color.white, 16,
                new Vector2(0.68f, 0.22f), new Vector2(0.98f, 0.78f), Vector2.zero, Vector2.zero);
        }

        void ShowStatsPopup(Transform parent)
        {
            var pop = UiKit.MakePanel(parent, UiKit.PanelWhite, 22,
                new Vector2(0.32f, 0.30f), new Vector2(0.68f, 0.72f), Vector2.zero, Vector2.zero);
            UiKit.MakeBanner(pop.transform, "戦績", 26, new Vector2(0.2f, 0.82f), new Vector2(0.8f, 0.99f));
            UiKit.MakeText(pop.transform,
                $"通算レース数　{PlayerPrefs.GetInt("br_races", 0)} レース\n" +
                $"最高払戻　¥{PlayerPrefs.GetInt("br_best", 0):N0}\n" +
                $"フライング目撃数　{PlayerPrefs.GetInt("br_f", 0)} 回",
                24, UiKit.TextDark, TextAnchor.MiddleCenter,
                new Vector2(0f, 0.25f), new Vector2(1f, 0.80f), Vector2.zero, Vector2.zero, bold: true);
            UiKit.MakeButton(pop.transform, "閉じる", UiKit.Cyan, 22,
                new Vector2(0.32f, 0.05f), new Vector2(0.68f, 0.22f), Vector2.zero, Vector2.zero,
                () => Destroy(pop));
        }

        // ================= 出走表 =================
        void ShowEntry()
        {
            var s = NewScreen("EntryScreen");
            UiKit.MakeFullscreenGradient(s.transform, new Color(0.85f, 0.95f, 1f), UiKit.Sky);
            UiKit.AddStripeOverlay(s, Color.white, 0.07f);

            UiKit.MakeBanner(s.transform, $"出走表　{race.venue.name}", 30,
                new Vector2(0.25f, 0.905f), new Vector2(0.75f, 0.985f), tilt: -1.2f);

            for (int i = 0; i < 6; i++)
            {
                int col = i % 2, row = i / 2;
                var card = UiKit.MakePanel(s.transform, UiKit.PanelWhite, 18,
                    new Vector2(0.05f + col * 0.475f, 0.645f - row * 0.235f),
                    new Vector2(0.475f + col * 0.475f, 0.865f - row * 0.235f),
                    Vector2.zero, Vector2.zero);
                var cardShadow = card.AddComponent<Shadow>();
                cardShadow.effectColor = new Color(0f, 0f, 0f, 0.25f);
                cardShadow.effectDistance = new Vector2(0f, -5f);

                var st = race.statsList[i];
                var bs = race.state.Get(i);
                Color bc = UiKit.BoatColors[i];
                bool lightRibbon = bc.r * 0.6f + bc.g * 0.3f + bc.b * 0.1f > 0.6f;

                // 上部の艇色リボン(チケット風)
                var ribbon = new GameObject("Ribbon");
                UiKit.Place(ribbon, card.transform, new Vector2(0f, 0.66f), new Vector2(1f, 1f),
                    new Vector2(4f, 0f), new Vector2(-4f, -4f));
                var ribImg = ribbon.AddComponent<Image>();
                ribImg.sprite = UiKit.Rounded(14);
                ribImg.type = Image.Type.Sliced;
                ribImg.color = bc;
                UiKit.AddStripeOverlay(ribbon, lightRibbon ? Color.black : Color.white, 0.06f);
                UiKit.MakeText(ribbon.transform, $"{i + 1}号艇　{st.player.playerName}", 25,
                    lightRibbon ? UiKit.Navy : Color.white, TextAnchor.MiddleLeft,
                    Vector2.zero, Vector2.one, new Vector2(16f, 0f), new Vector2(-8f, 0f),
                    bold: true, shadow: !lightRibbon);

                string entry = BoatRace.Start.WaitingSystem.IsSlowStart(bs.course) ? "スロー" : "ダッシュ";
                string grade = MotorGrade(st.motor.OverallScore);
                UiKit.MakeText(card.transform,
                    $"級別 {st.player.rank}　{bs.course}コース({entry})　平均ST .{Mathf.RoundToInt(st.player.reactionTimeMean * 100f):00}",
                    20, UiKit.TextDark, TextAnchor.MiddleLeft,
                    new Vector2(0f, 0.34f), new Vector2(1f, 0.62f), new Vector2(18f, 0f), new Vector2(-8f, 0f));
                UiKit.MakeText(card.transform,
                    $"モーター評価 {grade}　展示タイム {bs.exhibitionTime:F2}",
                    20, UiKit.Cyan, TextAnchor.MiddleLeft,
                    new Vector2(0f, 0.06f), new Vector2(1f, 0.32f), new Vector2(18f, 0f), new Vector2(-8f, 0f), bold: true);
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

            var valid = new List<int>();
            foreach (int idx2 in race.state.standings)
            {
                var b2 = race.state.Get(idx2);
                if (b2.startFlag != StartFlag.Flying && b2.startFlag != StartFlag.Late)
                    valid.Add(idx2);
            }

            string header = valid.Count == 0
                ? $"レース結果　{race.venue.name}　レース不成立(全艇返還)"
                : $"レース結果　{race.venue.name}　決まり手: {race.kimarite}";
            UiKit.MakeBanner(s.transform, header, 30,
                new Vector2(0.14f, 0.895f), new Vector2(0.86f, 0.975f), tilt: -1f);

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

                bool disq = bs.startFlag == StartFlag.Flying || bs.startFlag == StartFlag.Late;
                string stStr = bs.startFlag == StartFlag.Flying ? "F"
                    : bs.startFlag == StartFlag.Late ? "L"
                    : $".{Mathf.RoundToInt(Mathf.Abs(bs.st) * 100f):00}";
                string placeStr = disq
                    ? (bs.startFlag == StartFlag.Flying ? "Ｆ欠場" : "Ｌ出遅")
                    : $"{bs.finalPlace}着";
                string time = disq ? "返還" : bs.finished ? $"{bs.finishTime:F1}s" : "－";
                UiKit.MakeText(panel.transform,
                    $"{placeStr}　{idx + 1}号艇 {st.player.playerName}　ST{stStr}　{AI.StrategyAI.TacticName(bs.tactic)}　{time}",
                    26, disq ? new Color(1f, 0.45f, 0.4f) : Color.white, TextAnchor.MiddleLeft,
                    new Vector2(0.13f, top - 0.14f), new Vector2(0.98f, top), Vector2.zero, Vector2.zero, bold: i == 0);
            }

            // 3連単風の払戻表示(F/L欠場艇は除外した有効着順から)
            if (valid.Count >= 3)
            {
                int a = valid[0], b = valid[1], c = valid[2];
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

        /// <summary>レース終了ごとの戦績記録(通算R数・最高払戻・F目撃数)。</summary>
        void RecordStats()
        {
            PlayerPrefs.SetInt("br_races", PlayerPrefs.GetInt("br_races", 0) + 1);

            int flyings = 0;
            var valid = new List<int>();
            foreach (int idx in race.state.standings)
            {
                var bs = race.state.Get(idx);
                if (bs.startFlag == StartFlag.Flying) flyings++;
                if (bs.startFlag != StartFlag.Flying && bs.startFlag != StartFlag.Late) valid.Add(idx);
            }
            if (flyings > 0)
                PlayerPrefs.SetInt("br_f", PlayerPrefs.GetInt("br_f", 0) + flyings);
            if (valid.Count >= 3)
            {
                int payout = ComputePayout(valid[0], valid[1], valid[2]);
                if (payout > PlayerPrefs.GetInt("br_best", 0))
                    PlayerPrefs.SetInt("br_best", payout);
            }
            PlayerPrefs.Save();
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
