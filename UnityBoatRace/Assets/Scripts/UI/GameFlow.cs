using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using BoatRace.Career;
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
        RaceCamera raceCam;

        // ストーリーモード
        CareerData career;
        int lastCareerPlace;
        int lastCareerPrize;
        (string, string)[] pendingStory;
        GameObject dialogGo;
        Text dialogSpeaker;
        Text dialogBody;
        (string, string)[] dialogLines;
        int dialogIdx;
        System.Action dialogDone;

        Canvas canvas;
        GameObject currentScreen;
        GameObject replayOverlay;
        GameObject ffButton;
        Text ffLabel;
        Text titleBlink;
        RectTransform titleLogoRT;
        float resultTimer = -1f;
        bool wasReplaying;

        public void Initialize(RaceManager race, ReplayManager replay, CommentarySystem commentary, RaceCamera raceCam)
        {
            this.race = race;
            this.replay = replay;
            this.commentary = commentary;
            this.raceCam = raceCam;
            career = CareerData.Load();

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
            race.OnFinalLap += () => ShowFlash("最終周回！", new Color(0.9f, 0.62f, 0.05f));
            race.OnBoatFinished += (idx, place) =>
            {
                if (place == 1) ShowFlash($"ゴール！ {idx + 1}号艇！", UiKit.Red);
            };
            ShowTitle();
        }

        void Update()
        {
            // Play中のスクリプト差し替え(ドメインリロード)でInitialize前の状態になった場合は何もしない
            if (hud == null || race == null || replay == null) return;

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

            // タイトルの「タップでスタート」点滅とロゴの揺れ
            if (titleBlink != null)
            {
                var c = titleBlink.color;
                c.a = 0.45f + 0.55f * Mathf.Abs(Mathf.Sin(Time.time * 2.2f));
                titleBlink.color = c;
            }
            if (titleLogoRT != null)
            {
                float bob = 1f + Mathf.Sin(Time.time * 1.4f) * 0.015f;
                titleLogoRT.localScale = new Vector3(bob, bob, 1f);
            }
        }

        /// <summary>画面中央のフラッシュバナー(最終周回・ゴールなどの速報演出)。</summary>
        void ShowFlash(string text, Color color)
        {
            var banner = UiKit.MakePanel(canvas.transform, color, 18,
                new Vector2(0.20f, 0.62f), new Vector2(0.80f, 0.76f), Vector2.zero, Vector2.zero);
            banner.GetComponent<RectTransform>().localEulerAngles = new Vector3(0f, 0f, -1.5f);
            UiKit.AddStripeOverlay(banner, Color.white, 0.10f);
            UiKit.MakeText(banner.transform, text, 52, Color.white, TextAnchor.MiddleCenter,
                Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero, bold: true, shadow: true, outline: true);
            var group = banner.AddComponent<CanvasGroup>();
            StartCoroutine(FlashRoutine(banner, group));
        }

        System.Collections.IEnumerator FlashRoutine(GameObject banner, CanvasGroup group)
        {
            var rt = banner.GetComponent<RectTransform>();
            for (float t = 0f; t < 1.9f; t += Time.deltaTime)
            {
                if (banner == null) yield break;
                float appear = Mathf.Clamp01(t / 0.15f);
                rt.localScale = Vector3.one * Mathf.Lerp(1.5f, 1f, appear);
                group.alpha = t < 1.4f ? appear : Mathf.Clamp01((1.9f - t) / 0.5f);
                yield return null;
            }
            if (banner != null) Destroy(banner);
        }

        void ClearScreen()
        {
            if (currentScreen != null) Destroy(currentScreen);
            currentScreen = null;
            titleBlink = null;
            titleLogoRT = null;
        }

        GameObject NewScreen(string name)
        {
            ClearScreen();
            currentScreen = new GameObject(name);
            UiKit.Place(currentScreen, canvas.transform, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            return currentScreen;
        }

        // ================= タイトル(3D会場が背景のロゴ画面) =================
        void ShowTitle()
        {
            var s = NewScreen("TitleScreen");
            // シネマティックカメラの3D会場を透かせ、下ほど濃い紺のベールで文字を立たせる
            UiKit.MakeFullscreenGradient(s.transform,
                new Color(0.03f, 0.10f, 0.28f, 0.20f), new Color(0.02f, 0.06f, 0.18f, 0.92f));
            UiKit.AddStripeOverlay(s, Color.white, 0.045f);

            // ロゴ(レイヤー構成: 落ち影→本体→帯→サブタイトル)
            var logo = new GameObject("Logo");
            titleLogoRT = UiKit.Place(logo, s.transform,
                new Vector2(0f, 0.42f), new Vector2(1f, 0.88f), Vector2.zero, Vector2.zero);
            UiKit.MakeText(logo.transform, "BOATRACE", 118, new Color(0f, 0.1f, 0.3f, 0.55f),
                TextAnchor.MiddleCenter,
                new Vector2(0f, 0.42f), new Vector2(1f, 0.95f), new Vector2(6f, -6f), new Vector2(6f, -6f), bold: true);
            UiKit.MakeText(logo.transform, "BOATRACE", 118, Color.white, TextAnchor.MiddleCenter,
                new Vector2(0f, 0.42f), new Vector2(1f, 0.95f), Vector2.zero, Vector2.zero,
                bold: true, shadow: true, outline: true);
            var ribbon = UiKit.MakePanel(logo.transform, UiKit.Red, 12,
                new Vector2(0.30f, 0.20f), new Vector2(0.70f, 0.42f), Vector2.zero, Vector2.zero);
            ribbon.GetComponent<RectTransform>().localEulerAngles = new Vector3(0f, 0f, -1.6f);
            UiKit.AddStripeOverlay(ribbon, Color.white, 0.08f);
            UiKit.MakeText(ribbon.transform, "R E A L I S M", 40, UiKit.Yellow, TextAnchor.MiddleCenter,
                Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero, bold: true, shadow: true, outline: true);
            UiKit.MakeChip(logo.transform, "リアル競艇シミュレーション", new Color(0f, 0f, 0f, 0.35f), Color.white, 22,
                new Vector2(0.36f, 0.02f), new Vector2(0.64f, 0.17f), Vector2.zero, Vector2.zero);

            titleBlink = UiKit.MakeText(s.transform, "－ タップでスタート －", 34, Color.white, TextAnchor.MiddleCenter,
                new Vector2(0f, 0.15f), new Vector2(1f, 0.25f), Vector2.zero, Vector2.zero, bold: true, shadow: true);
            UiKit.MakeText(s.transform, "Ver 1.0　BOATRACE REALISM Project", 16,
                new Color(1f, 1f, 1f, 0.55f), TextAnchor.MiddleCenter,
                new Vector2(0f, 0.02f), new Vector2(1f, 0.07f), Vector2.zero, Vector2.zero);

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
            UiKit.MakeButton(nav.transform, "タイトルへ", new Color(0.45f, 0.5f, 0.58f), 20,
                new Vector2(0.02f, 0.16f), new Vector2(0.13f, 0.84f), Vector2.zero, Vector2.zero, ShowTitle);
            UiKit.MakeButton(nav.transform, "戦績", new Color(0.1f, 0.62f, 0.35f), 20,
                new Vector2(0.145f, 0.16f), new Vector2(0.245f, 0.84f), Vector2.zero, Vector2.zero,
                () => ShowStatsPopup(s.transform));
            UiKit.MakeButton(nav.transform, "★ ストーリー", new Color(0.62f, 0.2f, 0.75f), 26,
                new Vector2(0.27f, 0.10f), new Vector2(0.47f, 0.90f), Vector2.zero, Vector2.zero, ShowCareer);
            UiKit.MakeButton(nav.transform, "観戦レース　▶", UiKit.Red, 26,
                new Vector2(0.50f, 0.10f), new Vector2(0.72f, 0.90f), Vector2.zero, Vector2.zero,
                () =>
                {
                    race.playerBoatIndex = -1;
                    race.playerOverride = null;
                    if (raceCam != null) raceCam.focusBoat = -1;
                    race.seed = System.Environment.TickCount;
                    race.SetupRace();
                    if (RaceBootstrap.Instance != null) RaceBootstrap.Instance.RebuildEnvironment(race);
                    ShowEntry();
                });
            UiKit.MakeChip(nav.transform, "選手・モーター・ペラは毎レース抽選", new Color(0f, 0f, 0f, 0.25f), Color.white, 15,
                new Vector2(0.74f, 0.22f), new Vector2(0.99f, 0.78f), Vector2.zero, Vector2.zero);
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

        // ================= ストーリーモード: マイレーサー =================
        void ShowCareer()
        {
            var s = NewScreen("CareerScreen");
            UiKit.MakeFullscreenGradient(s.transform, new Color(0.16f, 0.08f, 0.25f, 0.55f),
                new Color(0.05f, 0.03f, 0.12f, 0.92f));
            UiKit.AddStripeOverlay(s, Color.white, 0.05f);
            UiKit.MakeBanner(s.transform, "マイレーサー　ストーリーモード", 30,
                new Vector2(0.22f, 0.90f), new Vector2(0.78f, 0.98f), tilt: -1.2f);

            // 現在の章(仕様書の8章構成)
            var ch = career.Current;
            string goal = ch.requiredPlace >= 6 ? "完走" : ch.requiredPlace == 1 ? "優勝" : $"{ch.requiredPlace}着以内";
            string chapterInfo = career.allClear
                ? "全章クリア！ SG覇者としてフリー挑戦中"
                : $"第{career.chapter}章「{ch.title}」　{CourseDatabase.Get(ch.venueId).name} / {ch.grade}戦　目標: {goal}";
            UiKit.MakeChip(s.transform, chapterInfo, new Color(0f, 0f, 0f, 0.45f), UiKit.Yellow, 22,
                new Vector2(0.12f, 0.845f), new Vector2(0.88f, 0.895f), Vector2.zero, Vector2.zero);

            // 左: レーサーカード
            var card = UiKit.MakePanel(s.transform, UiKit.PanelWhite, 20,
                new Vector2(0.05f, 0.28f), new Vector2(0.48f, 0.83f), Vector2.zero, Vector2.zero);
            UiKit.AddStripeOverlay(card, UiKit.Sky, 0.10f);
            UiKit.MakeText(card.transform, career.racerName, 40, UiKit.TextDark, TextAnchor.MiddleLeft,
                new Vector2(0.06f, 0.80f), new Vector2(0.72f, 0.98f), Vector2.zero, Vector2.zero, bold: true);
            UiKit.MakeChip(card.transform, career.RankLabel, UiKit.Red, Color.white, 26,
                new Vector2(0.74f, 0.80f), new Vector2(0.96f, 0.96f), Vector2.zero, Vector2.zero);
            UiKit.MakeText(card.transform,
                $"出走　{career.races} 回\n勝利　{career.wins} 勝　(3着内 {career.top3})\n獲得賞金　{career.money:N0} 万円",
                24, UiKit.TextDark, TextAnchor.UpperLeft,
                new Vector2(0.06f, 0.10f), new Vector2(0.94f, 0.76f), Vector2.zero, Vector2.zero, bold: true);

            // 右: スキルと練習
            var skill = UiKit.MakePanel(s.transform, UiKit.PanelWhite, 20,
                new Vector2(0.52f, 0.28f), new Vector2(0.95f, 0.83f), Vector2.zero, Vector2.zero);
            UiKit.MakeText(skill.transform,
                $"スタート技術　{career.startSkill * 100f:F0}\n旋回技術　{career.turnSkill * 100f:F0}\nメンタル　{career.mental * 100f:F0}",
                26, UiKit.TextDark, TextAnchor.UpperLeft,
                new Vector2(0.07f, 0.55f), new Vector2(0.93f, 0.96f), Vector2.zero, Vector2.zero, bold: true);
            void Train(string label, int cost, System.Action apply, float y)
            {
                UiKit.MakeButton(skill.transform, $"{label} ({cost}万)", UiKit.Cyan, 20,
                    new Vector2(0.07f, y), new Vector2(0.93f, y + 0.13f), Vector2.zero, Vector2.zero,
                    () =>
                    {
                        if (career.money < cost) return;
                        career.money -= cost;
                        apply();
                        career.Save();
                        ShowCareer();
                    });
            }
            Train("スタート練習 +3", 100, () => career.startSkill = Mathf.Min(0.95f, career.startSkill + 0.03f), 0.38f);
            Train("旋回練習 +3", 100, () => career.turnSkill = Mathf.Min(0.95f, career.turnSkill + 0.03f), 0.22f);
            Train("メンタル強化 +3", 80, () => career.mental = Mathf.Min(0.95f, career.mental + 0.03f), 0.06f);

            string raceLabel = career.allClear ? "SG覇者として出走　▶" : $"第{career.chapter}章に出走　▶";
            UiKit.MakeButton(s.transform, raceLabel, UiKit.Red, 34,
                new Vector2(0.30f, 0.10f), new Vector2(0.70f, 0.24f), Vector2.zero, Vector2.zero, StartCareerRace);
            UiKit.MakeButton(s.transform, "↩ ホーム", UiKit.Cyan, 22,
                new Vector2(0.04f, 0.11f), new Vector2(0.18f, 0.21f), Vector2.zero, Vector2.zero, ShowHome);

            if (!career.debutDone)
            {
                career.debutDone = true;
                career.Save();
                ShowDialog(CareerStory.Debut(career.racerName), null);
            }
        }

        void StartCareerRace()
        {
            if (!career.allClear) race.venueId = career.Current.venueId; // 章の指定会場
            race.playerOverride = career.ToStats();
            race.playerBoatIndex = career.DrawBoatIndex(new System.Random(System.Environment.TickCount));
            race.seed = System.Environment.TickCount;
            race.SetupRace();
            if (RaceBootstrap.Instance != null) RaceBootstrap.Instance.RebuildEnvironment(race);
            if (raceCam != null)
            {
                raceCam.focusBoat = race.playerBoatIndex;
                raceCam.mode = RaceCamera.Mode.Follow;
            }
            ShowEntry();
        }

        // ================= 会話ウィンドウ =================
        void ShowDialog((string, string)[] lines, System.Action onDone)
        {
            if (lines == null || lines.Length == 0) { onDone?.Invoke(); return; }
            if (dialogGo != null) Destroy(dialogGo);
            dialogLines = lines;
            dialogIdx = 0;
            dialogDone = onDone;

            dialogGo = new GameObject("Dialog");
            UiKit.Place(dialogGo, canvas.transform, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            var dim = dialogGo.AddComponent<Image>();
            dim.color = new Color(0f, 0f, 0f, 0.35f);
            dialogGo.AddComponent<Button>().onClick.AddListener(AdvanceDialog);

            var panel = UiKit.MakePanel(dialogGo.transform, new Color(0.05f, 0.10f, 0.28f, 0.97f), 20,
                new Vector2(0.08f, 0.05f), new Vector2(0.92f, 0.30f), Vector2.zero, Vector2.zero);
            UiKit.AddStripeOverlay(panel, Color.white, 0.05f);
            var chip = UiKit.MakeChip(panel.transform, "", UiKit.Yellow, UiKit.Navy, 22,
                new Vector2(0.02f, 0.72f), new Vector2(0.24f, 0.98f), Vector2.zero, Vector2.zero);
            dialogSpeaker = chip.GetComponentInChildren<Text>();
            dialogBody = UiKit.MakeText(panel.transform, "", 26, Color.white, TextAnchor.UpperLeft,
                new Vector2(0.03f, 0.10f), new Vector2(0.97f, 0.68f), Vector2.zero, Vector2.zero, bold: true);
            UiKit.MakeText(panel.transform, "▼ タップで進む", 18, new Color(1f, 1f, 1f, 0.6f), TextAnchor.LowerRight,
                new Vector2(0.6f, 0.02f), new Vector2(0.97f, 0.14f), Vector2.zero, Vector2.zero);
            RenderDialogLine();
        }

        void RenderDialogLine()
        {
            dialogSpeaker.text = dialogLines[dialogIdx].Item1;
            dialogBody.text = dialogLines[dialogIdx].Item2;
        }

        void AdvanceDialog()
        {
            dialogIdx++;
            if (dialogIdx >= dialogLines.Length)
            {
                Destroy(dialogGo);
                dialogGo = null;
                var done = dialogDone;
                dialogDone = null;
                done?.Invoke();
                return;
            }
            RenderDialogLine();
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

                if (i == race.playerBoatIndex)
                    UiKit.MakeChip(card.transform, "YOU", UiKit.Red, Color.white, 20,
                        new Vector2(0.80f, 0.70f), new Vector2(0.97f, 0.94f), Vector2.zero, Vector2.zero);

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

                // 1着ハイライト
                if (i == 0 && bs.finished && bs.finalPlace == 1)
                {
                    var hl = UiKit.MakePanel(panel.transform, new Color(1f, 0.85f, 0.2f, 0.18f), 12,
                        new Vector2(0.02f, top - 0.15f), new Vector2(0.98f, top + 0.005f), Vector2.zero, Vector2.zero);
                    UiKit.MakeChip(hl.transform, "WIN", UiKit.Yellow, UiKit.Navy, 20,
                        new Vector2(0.88f, 0.15f), new Vector2(0.99f, 0.85f), Vector2.zero, Vector2.zero);
                }

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

            // ストーリーモード: 自分の成績と賞金
            bool careerRace = race.playerBoatIndex >= 0;
            if (careerRace)
            {
                string res = lastCareerPlace >= 1 ? $"{lastCareerPlace}着" : "F/L 返還";
                UiKit.MakeText(s.transform,
                    $"あなた({career.racerName})　{res}　賞金 +{lastCareerPrize}万円　通算 {career.wins}勝",
                    26, Color.white, TextAnchor.MiddleCenter,
                    new Vector2(0f, 0.155f), new Vector2(1f, 0.205f), Vector2.zero, Vector2.zero,
                    bold: true, shadow: true, outline: true);
            }

            UiKit.MakeButton(s.transform, "▶ リプレイ", UiKit.Cyan, 28,
                new Vector2(0.16f, 0.05f), new Vector2(0.38f, 0.16f), Vector2.zero, Vector2.zero,
                () => { ClearScreen(); replay.StartPlayback(); });
            if (careerRace)
            {
                UiKit.MakeButton(s.transform, "★ ストーリーへ", new Color(0.62f, 0.2f, 0.75f), 26,
                    new Vector2(0.40f, 0.05f), new Vector2(0.60f, 0.16f), Vector2.zero, Vector2.zero, ShowCareer);
            }
            else
            {
                UiKit.MakeButton(s.transform, "もう一度", UiKit.Red, 28,
                    new Vector2(0.40f, 0.05f), new Vector2(0.60f, 0.16f), Vector2.zero, Vector2.zero,
                    () => { race.seed = System.Environment.TickCount; race.SetupRace(); ShowEntry(); });
            }
            UiKit.MakeButton(s.transform, "ホームへ", UiKit.Yellow, 28,
                new Vector2(0.62f, 0.05f), new Vector2(0.84f, 0.16f), Vector2.zero, Vector2.zero,
                () => { race.SetupRace(); ShowHome(); }).GetComponentInChildren<Text>().color = UiKit.Navy;

            // 昇格・初勝利などのストーリー会話
            if (pendingStory != null)
            {
                var story = pendingStory;
                pendingStory = null;
                ShowDialog(story, null);
            }
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

            // ストーリーモード: 賞金・勝利数・昇格・会話イベント
            if (race.playerBoatIndex >= 0 && career != null)
            {
                var pbs = race.state.Get(race.playerBoatIndex);
                bool pDisq = pbs.startFlag == StartFlag.Flying || pbs.startFlag == StartFlag.Late;
                lastCareerPlace = pDisq || pbs.finalPlace < 1 ? -1 : pbs.finalPlace;
                lastCareerPrize = lastCareerPlace > 0 ? career.PrizeFor(lastCareerPlace) : 0;

                career.races++;
                career.money += lastCareerPrize;
                if (lastCareerPlace == 1) career.wins++;
                if (lastCareerPlace >= 1 && lastCareerPlace <= 3) career.top3++;

                // 章クリア判定(仕様書の目標着順)
                pendingStory = null;
                if (!career.allClear)
                {
                    var chNow = career.Current;
                    bool cleared = lastCareerPlace >= 1 && lastCareerPlace <= chNow.requiredPlace;
                    if (cleared)
                    {
                        pendingStory = CareerStory.ChapterClear(career.chapter, career.racerName);
                        if (career.chapter >= 8) career.allClear = true;
                        else career.chapter++;
                    }
                    else
                    {
                        pendingStory = CareerStory.Retry(career.racerName);
                    }
                }
                career.Save();
            }
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
