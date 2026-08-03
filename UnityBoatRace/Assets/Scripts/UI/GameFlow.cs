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
        GameObject movePanelGo;
        Coroutine moveTimeoutCo;
        RectTransform moveLinesRT;   // 技選択背景の集中線(回転)
        bool specialSeqActive;       // 必殺技のタメ演出中

        // 展開予想システム(レース前に決まり手を予想→的中で賞金ボーナス)
        string predictedKimarite;
        bool predictionHit;
        int predictionBonus;

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
            race.OnPlayerTurnEntry += OnPlayerTurnEntry;
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
            // (技選択パネル表示中のスロー演出はリセットしない)
            bool preRace = race.armed && race.state.clock < -14f &&
                (race.state.phase == RacePhase.PitOut || race.state.phase == RacePhase.Waiting);
            ffButton.SetActive(preRace);
            if (!preRace && movePanelGo == null && !specialSeqActive && Time.timeScale != 1f)
            {
                Time.timeScale = 1f;
                ffLabel.text = "⏩ 早送り";
            }

            // 技選択の集中線をゆっくり回転(スロー中もunscaledで動く)
            if (moveLinesRT != null)
                moveLinesRT.Rotate(0f, 0f, 26f * Time.unscaledDeltaTime);

            // レースが終わったのに技選択が開いていたら閉じる
            if (movePanelGo != null && race.state.phase == RacePhase.Finished)
                CloseMovePanel();

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
            // タイトルの浮遊パーティクル(上へ漂い、上端で下へ戻す)と光条の揺らぎ
            for (int i = 0; i < titleDots.Count; i++)
            {
                if (titleDots[i] == null) continue;
                var p = titleDots[i].anchoredPosition;
                p.y += titleDotSpeed[i] * Time.unscaledDeltaTime;
                p.x += Mathf.Sin(Time.unscaledTime * 0.6f + i * 1.7f) * 6f * Time.unscaledDeltaTime;
                if (p.y > 520f) p.y = -520f;
                titleDots[i].anchoredPosition = p;
            }
            if (titleRays != null)
                for (int i = 0; i < titleRays.Length; i++)
                    if (titleRays[i] != null)
                        titleRays[i].anchoredPosition = new Vector2(
                            Mathf.Sin(Time.unscaledTime * 0.35f + i * 2.1f) * 40f,
                            Mathf.Cos(Time.unscaledTime * 0.27f + i * 1.3f) * 16f);
        }

        // ================= 必殺技選択(ターン突入でスロー演出) =================
        void OnPlayerTurnEntry(int markNo)
        {
            if (movePanelGo != null || race.PlayerMoveActive || replay.IsPlaying) return;
            if (race.state.phase != RacePhase.Racing) return;

            Time.timeScale = 0.05f; // 深いスローで完全に「タメ」の画にする
            if (raceCam != null) raceCam.selectView = true;

            // 全画面のイナイレ式技選択スクリーン
            movePanelGo = new GameObject("MoveSelect");
            UiKit.Place(movePanelGo, canvas.transform, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            UiKit.MakeFullscreenGradient(movePanelGo.transform,
                new Color(0f, 0f, 0f, 0.10f), new Color(0f, 0.02f, 0.10f, 0.72f));

            // 回転する集中線(3D越しにドラマを作る)
            var linesGo = new GameObject("Lines");
            moveLinesRT = UiKit.Place(linesGo, movePanelGo.transform, Vector2.zero, Vector2.one,
                new Vector2(-260f, -260f), new Vector2(260f, 260f));
            var linesImg = linesGo.AddComponent<Image>();
            linesImg.sprite = UiKit.SpeedLines();
            linesImg.color = new Color(1f, 1f, 1f, 0.35f);
            linesImg.raycastTarget = false;

            // 上部: マーク名バナー + プレイヤー体力バー
            UiKit.MakeBanner(movePanelGo.transform, $"{markNo}マーク攻防！　技を選択", 30,
                new Vector2(0.24f, 0.86f), new Vector2(0.76f, 0.95f), tilt: -1.5f);
            var pChip = UiKit.MakePanel(movePanelGo.transform, new Color(0.05f, 0.10f, 0.28f, 0.95f), 12,
                new Vector2(0.24f, 0.775f), new Vector2(0.76f, 0.845f), Vector2.zero, Vector2.zero);
            var pcSq = new GameObject("Sq");
            UiKit.Place(pcSq, pChip.transform, new Vector2(0f, 0f), new Vector2(0f, 1f),
                new Vector2(8f, 8f), new Vector2(40f, -8f));
            var pcImg = pcSq.AddComponent<Image>();
            pcImg.sprite = UiKit.Rounded(8);
            pcImg.type = Image.Type.Sliced;
            pcImg.color = UiKit.BoatColors[race.playerBoatIndex];
            UiKit.MakeText(pChip.transform,
                $"{career.racerName}　体力 {race.playerSP:F0}/{race.playerSPMax:F0}", 22, Color.white,
                TextAnchor.MiddleLeft, new Vector2(0f, 0f), new Vector2(1f, 1f),
                new Vector2(50f, 0f), new Vector2(-10f, 0f), bold: true, shadow: true);

            // 技カード(基本技=小さめグレー / 必殺技=大きく発光色)
            var moves = SkillMove.UnlockedAt(career != null ? career.chapter : 1);
            int n = moves.Count;
            int cols = Mathf.Min(n, 3);
            int rows = Mathf.CeilToInt(n / (float)cols);
            float cw = 0.72f / cols;
            for (int k = 0; k < n; k++)
            {
                var m = moves[k];
                int idx = SkillMove.All.IndexOf(m);
                int lv = career != null ? career.MoveLv(idx) : 1;
                int cost = m.CostAt(lv);
                bool special = m.cost > 0;
                bool usable = race.playerSP >= cost;
                int col = k % cols, row = k / cols;
                float x0 = 0.14f + col * cw + 0.008f;
                float y1 = 0.70f - row * 0.26f;
                float y0 = y1 - (special ? 0.235f : 0.19f);

                // イナイレ式カード: 紺ボディ+白の太枠(必殺技は技色の外光をさらに一段)
                var frame = UiKit.MakePanel(movePanelGo.transform,
                    usable ? (special ? m.color : new Color(0.55f, 0.62f, 0.72f)) : new Color(0.35f, 0.38f, 0.44f),
                    18, new Vector2(x0, y0), new Vector2(x0 + cw - 0.016f, y1), Vector2.zero, Vector2.zero);
                var white = UiKit.MakePanel(frame.transform, Color.white, 14,
                    Vector2.zero, Vector2.one, new Vector2(3.5f, 3.5f), new Vector2(-3.5f, -3.5f));
                var inner = UiKit.MakePanel(white.transform,
                    special ? new Color(0.10f, 0.16f, 0.38f, 0.98f) : new Color(0.22f, 0.28f, 0.40f, 0.98f), 11,
                    Vector2.zero, Vector2.one, new Vector2(3f, 3f), new Vector2(-3f, -3f));

                // 技名行: 技色の■アイコン+白太字(必殺技は右上に黄色の≫)
                var sq = UiKit.MakePanel(inner.transform, special ? m.color : new Color(0.6f, 0.66f, 0.75f), 5,
                    new Vector2(0.05f, 0.66f), new Vector2(0.14f, 0.92f), Vector2.zero, Vector2.zero);
                sq.GetComponent<Image>().raycastTarget = false;
                UiKit.MakeText(inner.transform, m.name, special ? 23 : 21, Color.white, TextAnchor.MiddleLeft,
                    new Vector2(0.17f, 0.60f), new Vector2(0.85f, 0.98f), Vector2.zero, Vector2.zero,
                    bold: true, shadow: true);
                if (special)
                    UiKit.MakeText(inner.transform, "≫", 26, UiKit.Yellow, TextAnchor.MiddleRight,
                        new Vector2(0.80f, 0.66f), new Vector2(0.96f, 0.98f), Vector2.zero, Vector2.zero,
                        bold: true, shadow: true);
                else
                    UiKit.MakeText(inner.transform, "ノーマル", 13, new Color(0.75f, 0.80f, 0.88f),
                        TextAnchor.MiddleRight,
                        new Vector2(0.60f, 0.66f), new Vector2(0.96f, 0.98f), Vector2.zero, Vector2.zero,
                        bold: true);
                if (special)
                    UiKit.MakeText(inner.transform, $"Lv {new string('★', lv)}", 14, UiKit.Yellow,
                        TextAnchor.MiddleLeft,
                        new Vector2(0.06f, 0.44f), new Vector2(0.70f, 0.62f), Vector2.zero, Vector2.zero,
                        bold: true);

                // 下段バー: 緑の体力チップ+オレンジの威力バー+大きな白数字(参考画面の文法)
                int power = Mathf.RoundToInt((m.AccelAt(lv) + m.TopAt(lv) - 2f) * 400f + 130f + lv * 30f);
                var tp = UiKit.MakePanel(inner.transform,
                    special ? new Color(0.15f, 0.72f, 0.30f) : new Color(0.45f, 0.52f, 0.60f), 8,
                    new Vector2(0.05f, 0.10f), new Vector2(0.40f, 0.40f), Vector2.zero, Vector2.zero);
                tp.GetComponent<Image>().raycastTarget = false;
                UiKit.MakeText(tp.transform, $"体力 {cost}", 17, Color.white, TextAnchor.MiddleCenter,
                    Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero, bold: true, shadow: true);
                var pw = UiKit.MakePanel(inner.transform, new Color(1f, 0.55f, 0.05f), 8,
                    new Vector2(0.42f, 0.10f), new Vector2(0.95f, 0.40f), Vector2.zero, Vector2.zero);
                pw.GetComponent<Image>().raycastTarget = false;
                var shine = UiKit.MakePanel(pw.transform, new Color(1f, 1f, 1f, 0.25f), 6,
                    new Vector2(0f, 0.55f), new Vector2(1f, 1f), new Vector2(3f, 0f), new Vector2(-3f, -2f));
                shine.GetComponent<Image>().raycastTarget = false;
                UiKit.MakeText(pw.transform, $"{power}", 26, Color.white, TextAnchor.MiddleRight,
                    Vector2.zero, Vector2.one, new Vector2(6f, 0f), new Vector2(-10f, 0f),
                    bold: true, shadow: true, outline: true);

                // クリック
                var btn = frame.AddComponent<Button>();
                btn.onClick.AddListener(() => { if (usable) PickMove(m, lv); });
                if (!usable)
                {
                    var dim = UiKit.MakePanel(frame.transform, new Color(0f, 0f, 0f, 0.55f), 14,
                        Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
                    dim.GetComponent<Image>().raycastTarget = false;
                }
            }
            moveTimeoutCo = StartCoroutine(MoveTimeout());
        }

        System.Collections.IEnumerator MoveTimeout()
        {
            yield return new WaitForSecondsRealtime(4f);
            PickMove(SkillMove.All[0], 1); // 時間切れは「差し」
        }

        void PickMove(SkillMove m, int lv)
        {
            if (movePanelGo == null) return;
            if (moveTimeoutCo != null) { StopCoroutine(moveTimeoutCo); moveTimeoutCo = null; }
            Destroy(movePanelGo);
            movePanelGo = null;
            moveLinesRT = null;

            if (m.cost > 0)
            {
                // 必殺技: タメ→カットイン→解放の3段演出
                StartCoroutine(SpecialMoveSequence(m, lv));
            }
            else
            {
                // 基本技: 演出なしでサッと発動(差をつける)
                if (raceCam != null) raceCam.selectView = false;
                Time.timeScale = 1f;
                race.ApplyPlayerMove(m, lv);
                ShowFlash(m.name, m.color);
            }
        }

        System.Collections.IEnumerator SpecialMoveSequence(SkillMove m, int lv)
        {
            specialSeqActive = true;
            Time.timeScale = 0.10f; // タメたままカットイン
            ShowMoveCutIn($"{m.name}", m.color);
            yield return new WaitForSecondsRealtime(0.95f);

            // 解放!!
            if (raceCam != null) raceCam.selectView = false;
            Time.timeScale = 1f;
            race.ApplyPlayerMove(m, lv);
            if (race.playerBoatIndex >= 0 && race.playerBoatIndex < race.boats.Count)
                race.boats[race.playerBoatIndex].BurstSpray(70);
            if (raceCam != null) raceCam.Punch(17f);
            specialSeqActive = false;
        }

        /// <summary>必殺技カットイン: 集中線+色フラッシュ+技名スライドイン(イナイレ演出)。</summary>
        void ShowMoveCutIn(string name, Color color)
        {
            var overlay = new GameObject("CutIn");
            UiKit.Place(overlay, canvas.transform, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            var tint = overlay.AddComponent<Image>();
            tint.color = new Color(color.r, color.g, color.b, 0.22f);
            tint.raycastTarget = false;

            var lines = new GameObject("SpeedLines");
            UiKit.Place(lines, overlay.transform, Vector2.zero, Vector2.one, new Vector2(-120f, -120f), new Vector2(120f, 120f));
            var li = lines.AddComponent<Image>();
            li.sprite = UiKit.SpeedLines();
            li.color = new Color(color.r, color.g, color.b, 0.9f);
            li.raycastTarget = false;

            var band = UiKit.MakePanel(overlay.transform, new Color(0f, 0f, 0f, 0.62f), 8,
                new Vector2(-0.05f, 0.54f), new Vector2(1.05f, 0.74f), Vector2.zero, Vector2.zero);
            band.GetComponent<RectTransform>().localEulerAngles = new Vector3(0f, 0f, -2.5f);
            UiKit.AddStripeOverlay(band, color, 0.25f);
            var txt = UiKit.MakeText(band.transform, name, 76, Color.white, TextAnchor.MiddleCenter,
                Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero, bold: true, shadow: true, outline: true);

            var band2 = UiKit.MakePanel(overlay.transform, color, 8,
                new Vector2(0.30f, 0.42f), new Vector2(0.70f, 0.52f), Vector2.zero, Vector2.zero);
            band2.GetComponent<RectTransform>().localEulerAngles = new Vector3(0f, 0f, 2f);
            UiKit.MakeText(band2.transform, "発　動　！！", 34, Color.white, TextAnchor.MiddleCenter,
                Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero, bold: true, shadow: true, outline: true);

            var group = overlay.AddComponent<CanvasGroup>();
            StartCoroutine(CutInRoutine(overlay, group, txt.GetComponent<RectTransform>()));
        }

        System.Collections.IEnumerator CutInRoutine(GameObject overlay, CanvasGroup group, RectTransform nameRt)
        {
            for (float t = 0f; t < 1.5f; t += Time.unscaledDeltaTime)
            {
                if (overlay == null) yield break;
                float slide = Mathf.Lerp(900f, 0f, Mathf.Clamp01(t / 0.18f));       // 技名が右から滑り込む
                nameRt.anchoredPosition = new Vector2(slide, 0f);
                group.alpha = t < 1.0f ? 1f : Mathf.Clamp01((1.5f - t) / 0.5f);      // 最後にフェード
                yield return null;
            }
            if (overlay != null) Destroy(overlay);
        }

        void CloseMovePanel()
        {
            if (moveTimeoutCo != null) { StopCoroutine(moveTimeoutCo); moveTimeoutCo = null; }
            if (movePanelGo != null) Destroy(movePanelGo);
            movePanelGo = null;
            moveLinesRT = null;
            if (raceCam != null) raceCam.selectView = false;
            Time.timeScale = 1f;
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
            titleDots.Clear();
            titleDotSpeed.Clear();
            titleRays = null;
            if (raceCam != null) raceCam.heroView = false; // 各Show*が必要な画面で改めて有効化する
        }

        GameObject NewScreen(string name)
        {
            ClearScreen();
            currentScreen = new GameObject(name);
            UiKit.Place(currentScreen, canvas.transform, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            return currentScreen;
        }

        // ================= タイトル(現代アニメアプリ調) =================
        readonly List<RectTransform> titleDots = new List<RectTransform>();
        readonly List<float> titleDotSpeed = new List<float>();
        RectTransform[] titleRays;

        void ShowTitle()
        {
            var s = NewScreen("TitleScreen");
            if (raceCam != null) raceCam.heroView = true; // 艇に寄ったキービジュアル風の画

            // 3D会場を透かせる青のベール(イナイレのタイトルの暗めブルー)
            UiKit.MakeFullscreenGradient(s.transform,
                new Color(0.06f, 0.16f, 0.45f, 0.35f), new Color(0.01f, 0.04f, 0.16f, 0.88f));

            // 全画面透明ボタン(先に敷き、上のボタンには奪わせない)
            var tap = new GameObject("Tap");
            UiKit.Place(tap, s.transform, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            var img = tap.AddComponent<Image>();
            img.color = new Color(0f, 0f, 0f, 0f);
            tap.AddComponent<Button>().onClick.AddListener(ShowHome);

            // X字のシアン稲妻光条(ロゴ背後で交差するエネルギー)
            titleRays = new RectTransform[2];
            for (int i = 0; i < 2; i++)
            {
                var ray = new GameObject("Ray");
                titleRays[i] = UiKit.Place(ray, s.transform,
                    new Vector2(0.5f, 0.62f), new Vector2(0.5f, 0.62f),
                    new Vector2(-110f, -620f), new Vector2(110f, 620f));
                titleRays[i].localEulerAngles = new Vector3(0f, 0f, i == 0 ? 38f : -38f);
                var ri = ray.AddComponent<Image>();
                ri.sprite = UiKit.VerticalGradient(
                    new Color(0.25f, 0.85f, 1f, 0f), new Color(0.35f, 0.85f, 1f, 0.30f));
                ri.raycastTarget = false;
            }

            // 浮遊パーティクル(青白い光の粒が上昇)
            titleDots.Clear();
            titleDotSpeed.Clear();
            var rng = new System.Random(9);
            for (int i = 0; i < 18; i++)
            {
                var dot = new GameObject("Dot");
                var rt = UiKit.Place(dot, s.transform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f),
                    Vector2.zero, Vector2.zero);
                float size = 5f + (float)rng.NextDouble() * 12f;
                rt.sizeDelta = new Vector2(size, size);
                rt.anchoredPosition = new Vector2(
                    (float)(rng.NextDouble() * 1600 - 800), (float)(rng.NextDouble() * 900 - 450));
                var di = dot.AddComponent<Image>();
                di.sprite = UiKit.Rounded(32);
                di.type = Image.Type.Sliced;
                di.color = new Color(0.65f, 0.9f, 1f, 0.12f + (float)rng.NextDouble() * 0.24f);
                di.raycastTarget = false;
                titleDots.Add(rt);
                titleDotSpeed.Add(12f + (float)rng.NextDouble() * 26f);
            }

            // ロゴ(イナイレ式: 黄→橙グラデ極太縁取りの斜体+重なるサブロゴ)
            var logo = new GameObject("Logo");
            titleLogoRT = UiKit.Place(logo, s.transform,
                new Vector2(0f, 0.36f), new Vector2(1f, 0.90f), Vector2.zero, Vector2.zero);
            UiKit.MakeLogoText(logo.transform, "BOATRACE", 118,
                new Color(1f, 0.93f, 0.28f), new Color(1f, 0.46f, 0.05f),
                new Color(0.08f, 0.10f, 0.30f), -4f,
                new Vector2(0f, 0.42f), new Vector2(1f, 0.95f));
            UiKit.MakeLogoText(logo.transform, "REALISM", 62,
                Color.white, new Color(0.25f, 0.72f, 1f),
                new Color(0.08f, 0.10f, 0.30f), -4f,
                new Vector2(0.18f, 0.14f), new Vector2(0.82f, 0.44f));
            UiKit.MakeText(logo.transform, "リアル競艇シミュレーション", 20, Color.white,
                TextAnchor.MiddleCenter,
                new Vector2(0f, 0.00f), new Vector2(1f, 0.12f), Vector2.zero, Vector2.zero,
                bold: true, shadow: true, outline: true);

            // Ver表記(右上・イナイレと同じ位置)
            UiKit.MakeText(s.transform, "Ver.1.0", 18, new Color(1f, 1f, 1f, 0.85f), TextAnchor.MiddleRight,
                new Vector2(0.80f, 0.955f), new Vector2(0.985f, 0.995f), Vector2.zero, Vector2.zero,
                bold: true, shadow: true);

            // タップでスタート(半透明帯+水色文字に白フチ)
            var band = new GameObject("StartBand");
            UiKit.Place(band, s.transform, new Vector2(0f, 0.185f), new Vector2(1f, 0.245f),
                Vector2.zero, Vector2.zero);
            var bandImg = band.AddComponent<Image>();
            bandImg.color = new Color(1f, 1f, 1f, 0.13f);
            bandImg.raycastTarget = false;
            titleBlink = UiKit.MakeText(s.transform, "タップでスタート", 34, new Color(0.55f, 0.85f, 1f),
                TextAnchor.MiddleCenter,
                new Vector2(0f, 0.185f), new Vector2(1f, 0.245f), Vector2.zero, Vector2.zero, bold: true);
            var blinkOl = titleBlink.gameObject.AddComponent<Outline>();
            blinkOl.effectColor = new Color(1f, 1f, 1f, 0.9f);
            blinkOl.effectDistance = new Vector2(2f, 2f);

            // 下部の小メニュー(イナイレのお知らせ列)
            string[] menuLabels = { "お知らせ", "あそびかた", "戦績" };
            System.Action[] menuActs =
            {
                () => ShowInfoPopup("お知らせ", "BOATRACE REALISM へようこそ！\n\nストーリーモードで技を磨き、\nSG制覇を目指そう。"),
                () => ShowInfoPopup("あそびかた", "レース中の操作はターン進入時の\n「技の選択」だけ！\n\n体力を使って必殺技を放ち、\n1着を勝ち取ろう。"),
                () => ShowStatsPopup(s.transform),
            };
            for (int i = 0; i < 3; i++)
            {
                int mi = i;
                var mb = new GameObject("Menu_" + menuLabels[i]);
                UiKit.Place(mb, s.transform,
                    new Vector2(0.26f + i * 0.17f, 0.065f), new Vector2(0.41f + i * 0.17f, 0.115f),
                    Vector2.zero, Vector2.zero);
                var mimg = mb.AddComponent<Image>();
                mimg.color = new Color(0f, 0f, 0f, 0f);
                mb.AddComponent<Button>().onClick.AddListener(() => menuActs[mi]());
                UiKit.MakeText(mb.transform, menuLabels[i], 20, Color.white, TextAnchor.MiddleCenter,
                    Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero, bold: true, shadow: true);
            }
            UiKit.MakeText(s.transform, "© BOATRACE REALISM Project", 14, new Color(1f, 1f, 1f, 0.65f),
                TextAnchor.MiddleCenter,
                new Vector2(0f, 0.008f), new Vector2(1f, 0.05f), Vector2.zero, Vector2.zero);
        }

        /// <summary>白カード+紺枠の汎用ポップアップ(お知らせ/あそびかた)。</summary>
        void ShowInfoPopup(string title, string body)
        {
            var inner = UiKit.MakeCard(canvas.transform,
                new Vector2(0.30f, 0.26f), new Vector2(0.70f, 0.74f), Vector2.zero, Vector2.zero);
            var outer = inner.transform.parent.gameObject;
            UiKit.MakeTag(inner.transform, title, UiKit.Yellow, UiKit.Border, 22,
                new Vector2(0.28f, 0.86f), new Vector2(0.72f, 0.99f));
            UiKit.MakeText(inner.transform, body, 20, UiKit.TextDark, TextAnchor.MiddleCenter,
                new Vector2(0.05f, 0.22f), new Vector2(0.95f, 0.84f), Vector2.zero, Vector2.zero, bold: true);
            UiKit.MakeButton(inner.transform, "とじる", UiKit.Cyan, 20,
                new Vector2(0.34f, 0.04f), new Vector2(0.66f, 0.18f), Vector2.zero, Vector2.zero,
                () => Destroy(outer));
        }

        // ================= ホーム(3D会場が見えるロビー) =================
        void ShowHome()
        {
            var s = NewScreen("HomeScreen");
            if (raceCam != null) raceCam.heroView = true; // 艇が大写しになるイナイレのホーム画
            int totalRaces = PlayerPrefs.GetInt("br_races", 0);
            int bestPayout = PlayerPrefs.GetInt("br_best", 0);

            // 左上: チーム総合能力風の通算表示(白文字+紺縁で3Dの上に直乗せ)
            UiKit.MakeText(s.transform, "通算レース", 20, Color.white, TextAnchor.MiddleLeft,
                new Vector2(0.02f, 0.935f), new Vector2(0.30f, 0.985f), Vector2.zero, Vector2.zero,
                bold: true, shadow: true, outline: true);
            var bigNum = UiKit.MakeLogoText(s.transform, $"{totalRaces} R", 46,
                Color.white, new Color(0.70f, 0.90f, 1f), UiKit.Border, 0f,
                new Vector2(0.02f, 0.855f), new Vector2(0.30f, 0.935f));
            bigNum.alignment = TextAnchor.MiddleLeft;

            // 右上: 金タグ+白ピルの実績(通貨表示風)
            UiKit.MakeTag(s.transform, "マイレーサー始動", new Color(1f, 0.78f, 0.20f), UiKit.Border, 17,
                new Vector2(0.74f, 0.945f), new Vector2(0.985f, 0.99f), skew: 10f);
            var payInner = UiKit.MakeCard(s.transform,
                new Vector2(0.74f, 0.885f), new Vector2(0.985f, 0.94f), Vector2.zero, Vector2.zero, 0.95f);
            UiKit.MakeText(payInner.transform, $"最高払戻  ¥{bestPayout:N0}", 17, UiKit.Border,
                TextAnchor.MiddleCenter, Vector2.zero, Vector2.one,
                new Vector2(8f, 0f), new Vector2(-8f, 0f), bold: true);

            // 上中央: 開催場カード(白カード+紺枠+黄斜めタグ)
            UiKit.MakeTag(s.transform, "開催場", UiKit.Yellow, UiKit.Border, 18,
                new Vector2(0.43f, 0.905f), new Vector2(0.57f, 0.95f));
            var vInner = UiKit.MakeCard(s.transform,
                new Vector2(0.35f, 0.72f), new Vector2(0.65f, 0.90f), Vector2.zero, Vector2.zero);
            var venueLabel = UiKit.MakeText(vInner.transform, "", 30, UiKit.Border, TextAnchor.MiddleCenter,
                new Vector2(0.16f, 0.42f), new Vector2(0.84f, 0.95f), Vector2.zero, Vector2.zero, bold: true);
            var infoLabel = UiKit.MakeText(vInner.transform, "", 16, UiKit.TextDark, TextAnchor.MiddleCenter,
                new Vector2(0f, 0.06f), new Vector2(1f, 0.40f), Vector2.zero, Vector2.zero);
            void RefreshVenue()
            {
                var v = CourseDatabase.Get(race.venueId);
                venueLabel.text = $"{v.id}. {v.name}";
                infoLabel.text = $"風 {Stars(v.windEffect)}　波 {v.waveHeight * 100f:F0}cm　イン {Stars(v.insideAdvantage)}";
            }
            UiKit.MakeButton(vInner.transform, "◀", UiKit.Cyan, 24,
                new Vector2(0.02f, 0.34f), new Vector2(0.15f, 0.82f), Vector2.zero, Vector2.zero,
                () => { race.venueId = race.venueId <= 1 ? 24 : race.venueId - 1; RefreshVenue(); });
            UiKit.MakeButton(vInner.transform, "▶", UiKit.Cyan, 24,
                new Vector2(0.85f, 0.34f), new Vector2(0.98f, 0.82f), Vector2.zero, Vector2.zero,
                () => { race.venueId = race.venueId >= 24 ? 1 : race.venueId + 1; RefreshVenue(); });
            RefreshVenue();

            // 左下: ストーリータグ+NEXT白カード(タップでストーリーへ)
            UiKit.MakeTag(s.transform, "ストーリー", UiKit.Yellow, UiKit.Border, 22,
                new Vector2(0.02f, 0.315f), new Vector2(0.175f, 0.37f));
            var nextInner = UiKit.MakeCard(s.transform,
                new Vector2(0.02f, 0.205f), new Vector2(0.36f, 0.31f), Vector2.zero, Vector2.zero);
            var nextOuter = nextInner.transform.parent.gameObject;
            UiKit.MakeTag(nextInner.transform, "NEXT ▶", UiKit.Yellow, UiKit.Border, 15,
                new Vector2(0.03f, 0.58f), new Vector2(0.30f, 0.94f), skew: 8f);
            string chTitle = career.allClear ? "フリー挑戦" :
                $"第{career.chapter}章 「{career.Current.title}」";
            UiKit.MakeText(nextInner.transform, chTitle, 21, UiKit.Border, TextAnchor.MiddleLeft,
                new Vector2(0.05f, 0.06f), new Vector2(0.98f, 0.56f), Vector2.zero, Vector2.zero, bold: true);
            var nextBtn = nextOuter.AddComponent<Button>();
            nextBtn.targetGraphic = nextOuter.GetComponent<Image>();
            nextBtn.onClick.AddListener(ShowCareer);

            // 下部: 水色フッター+イナイレ式アイコンボタン
            var foot = UiKit.MakePanel(s.transform, new Color(0.55f, 0.80f, 0.98f, 0.90f), 12,
                new Vector2(0f, 0f), new Vector2(1f, 0.14f), new Vector2(-6f, -6f), new Vector2(6f, 0f));
            UiKit.AddStripeOverlay(foot, Color.white, 0.18f);
            UiKit.MakeIconNav(foot.transform, "◀", "タイトル", new Color(0.45f, 0.55f, 0.70f),
                new Vector2(0.015f, 0.10f), new Vector2(0.145f, 0.93f), ShowTitle);
            UiKit.MakeIconNav(foot.transform, "★", "ストーリー", new Color(0.85f, 0.30f, 0.70f),
                new Vector2(0.16f, 0.10f), new Vector2(0.29f, 0.93f), ShowCareer);
            UiKit.MakeIconNav(foot.transform, "▶", "観戦レース", UiKit.Red,
                new Vector2(0.305f, 0.10f), new Vector2(0.435f, 0.93f),
                () =>
                {
                    race.playerBoatIndex = -1;
                    race.playerOverride = null;
                    if (raceCam != null) { raceCam.focusBoat = -1; raceCam.heroView = false; }
                    race.seed = System.Environment.TickCount;
                    race.SetupRace();
                    if (RaceBootstrap.Instance != null) RaceBootstrap.Instance.RebuildEnvironment(race);
                    ShowEntry();
                });
            UiKit.MakeIconNav(foot.transform, "■", "戦績", new Color(0.10f, 0.62f, 0.35f),
                new Vector2(0.45f, 0.10f), new Vector2(0.58f, 0.93f), () => ShowStatsPopup(s.transform));
            UiKit.MakeChip(foot.transform, "選手・モーター・ペラは毎レース抽選", new Color(1f, 1f, 1f, 0.85f),
                UiKit.Border, 14,
                new Vector2(0.60f, 0.28f), new Vector2(0.985f, 0.72f), Vector2.zero, Vector2.zero);
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
            if (career.condition != 0)
                UiKit.MakeTag(s.transform,
                    career.condition == 1 ? "スランプ中 -10%" : "覚醒中 +20%",
                    career.condition == 1 ? new Color(0.45f, 0.50f, 0.62f) : new Color(1f, 0.55f, 0.10f),
                    Color.white, 17,
                    new Vector2(0.80f, 0.925f), new Vector2(0.985f, 0.97f));

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
                $"Lv.{career.level}　体力 {career.MaxStamina}　(XP {career.xp}/{career.XpNeed})\n" +
                $"出走 {career.races} 回　勝利 {career.wins} 勝 (3着内 {career.top3})\n" +
                $"獲得賞金 {career.money:N0} 万円\n" +
                $"装備 {(career.equipProp >= 0 && career.equipProp < career.parts.Count ? CareerData.PartName(career.parts[career.equipProp]) : "ペラなし")}" +
                $" / {(career.equipTilt >= 0 && career.equipTilt < career.parts.Count ? CareerData.PartName(career.parts[career.equipTilt]) : "チルトなし")}",
                22, UiKit.TextDark, TextAnchor.UpperLeft,
                new Vector2(0.06f, 0.08f), new Vector2(0.94f, 0.76f), Vector2.zero, Vector2.zero, bold: true);

            // 右: スキルと練習
            var skill = UiKit.MakePanel(s.transform, UiKit.PanelWhite, 20,
                new Vector2(0.52f, 0.28f), new Vector2(0.95f, 0.83f), Vector2.zero, Vector2.zero);
            UiKit.MakeText(skill.transform,
                $"スタート {career.startSkill * 100f:F0}　ターン {career.turnSkill * 100f:F0}　スピード {career.speedSkill * 100f:F0}\n" +
                $"メンタル {career.mental * 100f:F0}　整備力 {career.mechanicSkill * 100f:F0}\n" +
                $"整備: キャブ{career.maintCarb} 電装{career.maintElec} ギア{career.maintGear} / ペラ P{career.propPitch} D{career.propDia} B{career.propBal}",
                19, UiKit.TextDark, TextAnchor.UpperLeft,
                new Vector2(0.07f, 0.56f), new Vector2(0.93f, 0.96f), Vector2.zero, Vector2.zero, bold: true);
            void Train(string label, int cost, System.Action apply, float y)
            {
                UiKit.MakeButton(skill.transform, $"{label} ({cost}万)", UiKit.Cyan, 17,
                    new Vector2(0.07f, y), new Vector2(0.93f, y + 0.095f), Vector2.zero, Vector2.zero,
                    () =>
                    {
                        if (career.money < cost) return;
                        career.money -= cost;
                        apply();
                        career.Save();
                        ShowCareer();
                    });
            }
            Train("スタート練習 +3", 100, () => career.startSkill = Mathf.Min(0.95f, career.startSkill + 0.03f), 0.43f);
            Train("旋回練習 +3", 100, () => career.turnSkill = Mathf.Min(0.95f, career.turnSkill + 0.03f), 0.325f);
            Train("スピード練習 +3", 100, () => career.speedSkill = Mathf.Min(0.95f, career.speedSkill + 0.03f), 0.22f);
            Train("メンタル強化 +3", 80, () => career.mental = Mathf.Min(0.95f, career.mental + 0.03f), 0.115f);
            Train("整備研修 +3", 80, () => career.mechanicSkill = Mathf.Min(0.95f, career.mechanicSkill + 0.03f), 0.01f);

            string raceLabel = career.allClear ? "SG覇者として出走▶" : $"第{career.chapter}章に出走▶";
            UiKit.MakeButton(s.transform, "↩ ホーム", UiKit.Cyan, 20,
                new Vector2(0.03f, 0.11f), new Vector2(0.145f, 0.22f), Vector2.zero, Vector2.zero, ShowHome);
            UiKit.MakeButton(s.transform, "技強化", new Color(0.62f, 0.2f, 0.75f), 22,
                new Vector2(0.16f, 0.11f), new Vector2(0.29f, 0.22f), Vector2.zero, Vector2.zero,
                () => ShowMoveUpgradePopup(s.transform));
            UiKit.MakeButton(s.transform, "🎰 ガチャ", new Color(0.9f, 0.35f, 0.55f), 20,
                new Vector2(0.305f, 0.11f), new Vector2(0.42f, 0.22f), Vector2.zero, Vector2.zero,
                () => ShowGachaPopup(s.transform, ""));
            UiKit.MakeButton(s.transform, "🔧 ガレージ", new Color(0.35f, 0.42f, 0.55f), 20,
                new Vector2(0.435f, 0.11f), new Vector2(0.565f, 0.22f), Vector2.zero, Vector2.zero,
                () => ShowGaragePopup(s.transform));
            UiKit.MakeButton(s.transform, raceLabel, UiKit.Red, 28,
                new Vector2(0.58f, 0.10f), new Vector2(0.79f, 0.235f), Vector2.zero, Vector2.zero, StartCareerRace);
            UiKit.MakeButton(s.transform, "🛒 ショップ", new Color(0.9f, 0.55f, 0.1f), 20,
                new Vector2(0.805f, 0.11f), new Vector2(0.965f, 0.22f), Vector2.zero, Vector2.zero,
                () => ShowShopPopup(s.transform));

            if (!career.debutDone)
            {
                career.debutDone = true;
                career.Save();
                ShowDialog(CareerStory.Debut(career.racerName), null);
            }
        }

        /// <summary>ショップ(アイテムは次のレースで自動消費)。</summary>
        void ShowShopPopup(Transform parent)
        {
            var pop = UiKit.MakePanel(parent, UiKit.PanelWhite, 22,
                new Vector2(0.24f, 0.22f), new Vector2(0.76f, 0.80f), Vector2.zero, Vector2.zero);
            UiKit.MakeBanner(pop.transform, $"ショップ　所持金 {career.money:N0}万円", 24,
                new Vector2(0.10f, 0.85f), new Vector2(0.90f, 0.99f));

            void Item(string label, string desc, int cost, int owned, System.Action buy, float y)
            {
                UiKit.MakeText(pop.transform, $"{label}　所持{owned}\n{desc}", 20, UiKit.TextDark,
                    TextAnchor.MiddleLeft,
                    new Vector2(0.06f, y), new Vector2(0.66f, y + 0.18f), Vector2.zero, Vector2.zero, bold: true);
                UiKit.MakeButton(pop.transform, $"{cost}万で購入", career.money >= cost ? UiKit.Cyan : new Color(0.5f, 0.5f, 0.55f), 18,
                    new Vector2(0.68f, y + 0.02f), new Vector2(0.94f, y + 0.15f), Vector2.zero, Vector2.zero,
                    () =>
                    {
                        if (career.money < cost) return;
                        career.money -= cost;
                        buy();
                        career.Save();
                        Destroy(pop);
                        ShowShopPopup(parent);
                    });
            }
            Item("エナジードリンク", "次レースの初期SP+30(必殺技が早く使える)", 200, career.itemDrink,
                () => career.itemDrink++, 0.60f);
            Item("新品ペラ", "次レースのモーターを強化(出足・伸びUP)", 300, career.itemProp,
                () => career.itemProp++, 0.38f);
            Item("勝守り", "次レースのST安定＋メンタルUP", 150, career.itemCharm,
                () => career.itemCharm++, 0.16f);

            UiKit.MakeButton(pop.transform, "閉じる", UiKit.Navy, 20,
                new Vector2(0.36f, 0.02f), new Vector2(0.64f, 0.12f), Vector2.zero, Vector2.zero,
                () => Destroy(pop));
        }

        /// <summary>技強化: 賞金で技レベルUP(効果も消費体力も上がる)。</summary>
        void ShowMoveUpgradePopup(Transform parent)
        {
            var pop = UiKit.MakePanel(parent, UiKit.PanelWhite, 22,
                new Vector2(0.20f, 0.16f), new Vector2(0.80f, 0.84f), Vector2.zero, Vector2.zero);
            UiKit.MakeBanner(pop.transform, $"技強化　所持金 {career.money:N0}万円", 24,
                new Vector2(0.10f, 0.87f), new Vector2(0.90f, 0.99f));

            float y = 0.62f;
            foreach (var m in SkillMove.All)
            {
                if (m.cost == 0) continue;
                int idx = SkillMove.All.IndexOf(m);
                int lv = career.MoveLv(idx);
                bool unlocked = m.unlockChapter <= career.chapter;
                bool maxed = lv >= SkillMove.MaxLv;
                int upCost = m.UpgradeCost(lv);
                string info = unlocked
                    ? $"{m.name}　Lv{lv}{(maxed ? "(MAX)" : "")}\n体力{m.CostAt(lv)}消費 / 加速x{m.AccelAt(lv):F2} 最高速x{m.TopAt(lv):F2}"
                    : $"{m.name}　(第{m.unlockChapter}章で習得)";
                UiKit.MakeText(pop.transform, info, 19, unlocked ? UiKit.TextDark : new Color(0.6f, 0.6f, 0.65f),
                    TextAnchor.MiddleLeft,
                    new Vector2(0.06f, y), new Vector2(0.64f, y + 0.19f), Vector2.zero, Vector2.zero, bold: true);
                if (unlocked && !maxed)
                    UiKit.MakeButton(pop.transform, $"{upCost}万で強化",
                        career.money >= upCost ? new Color(0.62f, 0.2f, 0.75f) : new Color(0.5f, 0.5f, 0.55f), 17,
                        new Vector2(0.66f, y + 0.03f), new Vector2(0.94f, y + 0.16f), Vector2.zero, Vector2.zero,
                        () =>
                        {
                            if (career.money < upCost) return;
                            career.money -= upCost;
                            if (career.moveLv == null || career.moveLv.Length < SkillMove.All.Count)
                                career.moveLv = new int[SkillMove.All.Count];
                            career.moveLv[idx] = lv + 1;
                            career.Save();
                            Destroy(pop);
                            ShowMoveUpgradePopup(parent);
                        });
                y -= 0.21f;
            }
            UiKit.MakeButton(pop.transform, "閉じる", UiKit.Navy, 20,
                new Vector2(0.36f, 0.02f), new Vector2(0.64f, 0.11f), Vector2.zero, Vector2.zero,
                () => Destroy(pop));
        }

        /// <summary>ガチャ: プロペラ/チルトを入手して装備。型(スタート/ターン/スピード)を作る。</summary>
        void ShowGachaPopup(Transform parent, string resultMsg)
        {
            var pop = UiKit.MakePanel(parent, UiKit.PanelWhite, 22,
                new Vector2(0.14f, 0.10f), new Vector2(0.86f, 0.88f), Vector2.zero, Vector2.zero);
            UiKit.MakeBanner(pop.transform, $"ガチャ・装備　所持金 {career.money:N0}万円", 24,
                new Vector2(0.10f, 0.89f), new Vector2(0.90f, 0.995f));

            UiKit.MakeButton(pop.transform, "🎰 ガチャを回す (100万)",
                career.money >= 100 ? new Color(0.9f, 0.35f, 0.55f) : new Color(0.5f, 0.5f, 0.55f), 22,
                new Vector2(0.26f, 0.76f), new Vector2(0.74f, 0.87f), Vector2.zero, Vector2.zero,
                () =>
                {
                    if (career.money < 100) return;
                    career.money -= 100;
                    var rng = new System.Random(System.Environment.TickCount);
                    double r = rng.NextDouble();
                    var part = new CareerData.PartData
                    {
                        kind = rng.Next(0, 2),
                        arch = rng.Next(0, 3),
                        rarity = r < 0.60 ? 1 : r < 0.90 ? 2 : 3,
                    };
                    career.parts.Add(part);
                    career.Save();
                    Destroy(pop);
                    ShowGachaPopup(parent, $"{CareerData.PartName(part)} をゲット！{(part.rarity >= 3 ? "　激レア!!" : "")}");
                });
            if (!string.IsNullOrEmpty(resultMsg))
                UiKit.MakeText(pop.transform, resultMsg, 22, UiKit.Red, TextAnchor.MiddleCenter,
                    new Vector2(0f, 0.68f), new Vector2(1f, 0.76f), Vector2.zero, Vector2.zero,
                    bold: true, shadow: true);

            // 所持パーツ(レア度順に各6件まで表示)。クリックで装備
            void Column(int kind, float xMin, float xMax)
            {
                UiKit.MakeText(pop.transform, kind == 0 ? "プロペラ" : "チルト", 20, UiKit.Cyan,
                    TextAnchor.MiddleCenter,
                    new Vector2(xMin, 0.60f), new Vector2(xMax, 0.67f), Vector2.zero, Vector2.zero, bold: true);
                var indices = new List<int>();
                for (int i = 0; i < career.parts.Count; i++)
                    if (career.parts[i].kind == kind) indices.Add(i);
                indices.Sort((a, b) => career.parts[b].rarity.CompareTo(career.parts[a].rarity));
                float y = 0.50f;
                foreach (int i in indices.GetRange(0, Mathf.Min(6, indices.Count)))
                {
                    bool equipped = kind == 0 ? career.equipProp == i : career.equipTilt == i;
                    var p = career.parts[i];
                    UiKit.MakeButton(pop.transform,
                        $"{CareerData.PartName(p)}{(equipped ? " ●装備中" : "")}",
                        equipped ? new Color(0.1f, 0.62f, 0.35f) : UiKit.Cyan, 15,
                        new Vector2(xMin, y), new Vector2(xMax, y + 0.075f), Vector2.zero, Vector2.zero,
                        () =>
                        {
                            if (kind == 0) career.equipProp = i; else career.equipTilt = i;
                            career.Save();
                            Destroy(pop);
                            ShowGachaPopup(parent, "");
                        });
                    y -= 0.085f;
                }
                if (indices.Count == 0)
                    UiKit.MakeText(pop.transform, "(未所持)", 17, new Color(0.6f, 0.6f, 0.65f),
                        TextAnchor.MiddleCenter,
                        new Vector2(xMin, 0.48f), new Vector2(xMax, 0.56f), Vector2.zero, Vector2.zero);
            }
            Column(0, 0.05f, 0.48f);
            Column(1, 0.52f, 0.95f);

            UiKit.MakeButton(pop.transform, "閉じる", UiKit.Navy, 20,
                new Vector2(0.38f, 0.015f), new Vector2(0.62f, 0.09f), Vector2.zero, Vector2.zero,
                () => Destroy(pop));
        }

        /// <summary>ガレージ(仕様書6章): モーター整備(次レース1節限り)とペラ調整(永続)。</summary>
        void ShowGaragePopup(Transform parent)
        {
            var pop = UiKit.MakePanel(parent, UiKit.PanelWhite, 22,
                new Vector2(0.16f, 0.10f), new Vector2(0.84f, 0.88f), Vector2.zero, Vector2.zero);
            UiKit.MakeBanner(pop.transform, $"ガレージ　所持金 {career.money:N0}万円　(整備力 {career.mechanicSkill * 100f:F0})", 22,
                new Vector2(0.08f, 0.89f), new Vector2(0.92f, 0.995f));

            // モーター整備(レベル0-4・次レースで消費)
            void Maint(string label, string effect, System.Func<int> get, System.Action inc, float y)
            {
                UiKit.MakeText(pop.transform, $"{label}　Lv{get()}/4　({effect})", 19, UiKit.TextDark,
                    TextAnchor.MiddleLeft,
                    new Vector2(0.06f, y), new Vector2(0.66f, y + 0.09f), Vector2.zero, Vector2.zero, bold: true);
                bool can = get() < 4 && career.money >= 5;
                UiKit.MakeButton(pop.transform, "5万で整備",
                    can ? UiKit.Cyan : new Color(0.5f, 0.5f, 0.55f), 16,
                    new Vector2(0.68f, y + 0.005f), new Vector2(0.94f, y + 0.085f), Vector2.zero, Vector2.zero,
                    () =>
                    {
                        if (get() >= 4 || career.money < 5) return;
                        career.money -= 5;
                        inc();
                        career.Save();
                        Destroy(pop);
                        ShowGaragePopup(parent);
                    });
            }
            UiKit.MakeText(pop.transform, "■ モーター整備(次レース限り・整備力で効果UP)", 18, UiKit.Cyan,
                TextAnchor.MiddleLeft, new Vector2(0.06f, 0.78f), new Vector2(0.94f, 0.86f),
                Vector2.zero, Vector2.zero, bold: true);
            Maint("キャブ整備", "出足UP", () => career.maintCarb, () => career.maintCarb++, 0.68f);
            Maint("電装整備", "回り足UP", () => career.maintElec, () => career.maintElec++, 0.58f);
            Maint("ギア整備", "ターンUP", () => career.maintGear, () => career.maintGear++, 0.48f);

            // ペラ調整(永続セッティング)
            UiKit.MakeText(pop.transform, "■ プロペラ調整(あなたの永続セッティング)", 18, UiKit.Cyan,
                TextAnchor.MiddleLeft, new Vector2(0.06f, 0.38f), new Vector2(0.94f, 0.46f),
                Vector2.zero, Vector2.zero, bold: true);
            void Tune(string label, System.Func<int> get, System.Action<int> set, int min, int max, string hint, float y)
            {
                UiKit.MakeText(pop.transform, $"{label} {get():+0;-0;0}　{hint}", 18, UiKit.TextDark,
                    TextAnchor.MiddleLeft,
                    new Vector2(0.06f, y), new Vector2(0.62f, y + 0.08f), Vector2.zero, Vector2.zero, bold: true);
                UiKit.MakeButton(pop.transform, "−", UiKit.Navy, 20,
                    new Vector2(0.66f, y), new Vector2(0.76f, y + 0.08f), Vector2.zero, Vector2.zero,
                    () => { set(Mathf.Max(min, get() - 1)); career.Save(); Destroy(pop); ShowGaragePopup(parent); });
                UiKit.MakeButton(pop.transform, "＋", UiKit.Navy, 20,
                    new Vector2(0.79f, y), new Vector2(0.89f, y + 0.08f), Vector2.zero, Vector2.zero,
                    () => { set(Mathf.Min(max, get() + 1)); career.Save(); Destroy(pop); ShowGaragePopup(parent); });
            }
            Tune("ピッチ", () => career.propPitch, v => career.propPitch = v, -5, 5, "大=伸び/小=出足", 0.29f);
            Tune("直径", () => career.propDia, v => career.propDia = v, -5, 5, "大=最高速", 0.20f);
            Tune("バランス", () => career.propBal, v => career.propBal = v, -3, 3, "ターン安定", 0.11f);

            UiKit.MakeButton(pop.transform, "閉じる", UiKit.Navy, 20,
                new Vector2(0.38f, 0.015f), new Vector2(0.62f, 0.09f), Vector2.zero, Vector2.zero,
                () => Destroy(pop));
        }

        void StartCareerRace()
        {
            if (!career.allClear) race.venueId = career.Current.venueId; // 章の指定会場

            // レベルに応じた体力 + アイテム自動消費
            race.playerSPMax = career.MaxStamina;
            race.playerSPInit = career.MaxStamina;
            if (career.itemDrink > 0) { career.itemDrink--; race.playerSPInit = career.MaxStamina + 30f; }

            // ガチャ装備(プロペラ/チルト)+ガレージ整備で「型」を作る。整備力で効果が変わる
            var (pa, pt, ptr, pst) = career.PartBonus();
            float mech = 0.8f + career.mechanicSkill * 0.7f;
            race.pAccelBonus = pa + career.maintCarb * 0.07f * mech;
            race.pTopBonus = pt;
            race.pTurnBonus = ptr + (career.maintElec * 0.020f + career.maintGear * 0.020f) * mech;
            race.playerPropOverride = new BoatRace.Setup.PropellerSetting
            {
                pitch = Mathf.Clamp(career.propPitch * 0.5f, -3f, 3f),
                diameter = Mathf.Clamp(career.propDia * 0.35f, -2f, 2f),
                balance = Mathf.Clamp01(0.62f + career.propBal * 0.09f + career.mechanicSkill * 0.12f),
            };
            race.playerMotorBoost = career.itemProp > 0;
            if (career.itemProp > 0) career.itemProp--;
            var stats = career.ToStats();
            stats.startSkill = Mathf.Min(0.97f, stats.startSkill + pst); // スタート型装備の効果

            // スランプ・覚醒(能力-10% / +20%)
            float cond = career.ConditionMul;
            if (cond != 1f)
            {
                stats.startSkill = Mathf.Clamp(stats.startSkill * cond, 0.20f, 0.97f);
                stats.turnSkill = Mathf.Clamp(stats.turnSkill * cond, 0.20f, 0.97f);
                stats.speedSkill = Mathf.Clamp(stats.speedSkill * cond, 0.20f, 0.97f);
            }
            if (career.itemCharm > 0)
            {
                career.itemCharm--;
                stats.mental = Mathf.Min(0.98f, stats.mental + 0.15f);
                stats.startSkill = Mathf.Min(0.97f, stats.startSkill + 0.04f);
            }
            career.Save();

            race.playerOverride = stats;
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

            // 展開予想(ストーリーモードのみ): 決まり手を当てると賞金ボーナス
            predictedKimarite = null;
            predictionHit = false;
            if (race.playerBoatIndex >= 0)
            {
                UiKit.MakeTag(s.transform, "展開予想", UiKit.Yellow, UiKit.Border, 18,
                    new Vector2(0.02f, 0.135f), new Vector2(0.16f, 0.18f));
                var predInner = UiKit.MakeCard(s.transform,
                    new Vector2(0.17f, 0.125f), new Vector2(0.70f, 0.19f), Vector2.zero, Vector2.zero, 0.95f);
                UiKit.MakeText(predInner.transform, "1着の決まり手は？ 的中で賞金ボーナス！", 15, UiKit.TextDark,
                    TextAnchor.MiddleLeft, new Vector2(0.02f, 0.55f), new Vector2(0.98f, 0.98f),
                    Vector2.zero, Vector2.zero, bold: true);
                string[] preds = { "逃げ", "まくり", "差し" };
                var predImgs = new Image[3];
                var predTxts = new Text[3];
                for (int p = 0; p < 3; p++)
                {
                    int pi = p;
                    var pb = UiKit.MakePanel(predInner.transform, new Color(0.90f, 0.93f, 0.98f), 10,
                        new Vector2(0.03f + p * 0.33f, 0.06f), new Vector2(0.33f + p * 0.33f, 0.54f),
                        Vector2.zero, Vector2.zero);
                    predImgs[p] = pb.GetComponent<Image>();
                    predTxts[p] = UiKit.MakeText(pb.transform, preds[p], 18, UiKit.Border,
                        TextAnchor.MiddleCenter, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero,
                        bold: true);
                    pb.AddComponent<Button>().onClick.AddListener(() =>
                    {
                        predictedKimarite = preds[pi];
                        for (int q = 0; q < 3; q++)
                        {
                            predImgs[q].color = q == pi ? UiKit.Yellow : new Color(0.90f, 0.93f, 0.98f);
                            predTxts[q].color = UiKit.Border;
                        }
                    });
                }
            }

            UiKit.MakeButton(s.transform, "レーススタート！", UiKit.Red, 38,
                new Vector2(0.30f, 0.02f), new Vector2(0.70f, 0.12f), Vector2.zero, Vector2.zero,
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
                if (predictedKimarite != null)
                {
                    string pRes = predictionHit
                        ? $"展開予想「{predictedKimarite}」的中！！ ボーナス +{predictionBonus}万円"
                        : $"展開予想「{predictedKimarite}」はずれ… (決まり手: {race.kimarite})";
                    UiKit.MakeText(s.transform, pRes, 22,
                        predictionHit ? UiKit.Yellow : new Color(0.8f, 0.85f, 0.95f),
                        TextAnchor.MiddleCenter,
                        new Vector2(0f, 0.115f), new Vector2(1f, 0.155f), Vector2.zero, Vector2.zero,
                        bold: true, shadow: true);
                }
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

                // 展開予想の採点(的中で賞金ボーナス)
                predictionBonus = 0;
                if (predictedKimarite != null && valid.Count > 0 && !string.IsNullOrEmpty(race.kimarite))
                {
                    predictionHit = race.kimarite.Contains(predictedKimarite);
                    if (predictionHit)
                    {
                        predictionBonus = 20 + career.chapter * 10; // 万円(章が進むほど増額)
                        career.money += predictionBonus;
                    }
                }

                // スランプ・覚醒: 連敗3で不調(-10%)、2着以内3連続で覚醒(+20%)
                int prevCond = career.condition;
                if (lastCareerPlace >= 1 && lastCareerPlace <= 2) { career.winStreak++; career.loseStreak = 0; }
                else if (lastCareerPlace < 0 || lastCareerPlace >= 4) { career.loseStreak++; career.winStreak = 0; }
                else { career.winStreak = 0; career.loseStreak = 0; }
                if (career.condition == 1 && lastCareerPlace >= 1 && lastCareerPlace <= 3) career.condition = 0;
                if (career.condition == 2 && (lastCareerPlace < 0 || lastCareerPlace >= 4)) career.condition = 0;
                if (career.loseStreak >= 3) career.condition = 1;
                else if (career.winStreak >= 3) career.condition = 2;

                // XP獲得とレベルアップ(体力最大値が伸びる)
                int[] xpTable = { 60, 42, 32, 24, 18, 14 };
                int xpGain = lastCareerPlace >= 1 ? xpTable[Mathf.Clamp(lastCareerPlace - 1, 0, 5)] : 10;
                bool leveled = career.AddXp(xpGain);

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

                        // 新必殺技の習得アナウンス
                        var newMove = SkillMove.NewlyUnlocked(career.chapter);
                        if (newMove != null && pendingStory != null)
                        {
                            var extended = new (string, string)[pendingStory.Length + 1];
                            pendingStory.CopyTo(extended, 0);
                            extended[extended.Length - 1] =
                                ("システム", $"必殺技『{newMove.name}』を習得！！ ターン突入時に発動できるぞ！(SP{newMove.cost}消費)");
                            pendingStory = extended;
                        }
                    }
                    else
                    {
                        pendingStory = CareerStory.Retry(career.racerName);
                    }
                }
                if (leveled)
                {
                    var line = ("システム", $"レベルアップ！！ Lv{career.level}になった！ 体力最大値が {career.MaxStamina} に成長！");
                    if (pendingStory == null) pendingStory = new[] { line };
                    else
                    {
                        var e = new (string, string)[pendingStory.Length + 1];
                        pendingStory.CopyTo(e, 0);
                        e[e.Length - 1] = line;
                        pendingStory = e;
                    }
                }
                if (career.condition != prevCond)
                {
                    var cLine = career.condition == 1
                        ? ("記者", "連敗続きでスランプに突入…。能力-10%。1回好走すれば抜け出せるぞ！")
                        : career.condition == 2
                            ? ("記者", "3連続の好走で覚醒状態！！ 次のレースは能力+20%だ！")
                            : prevCond == 1
                                ? ("記者", "スランプ脱出！ 動きにキレが戻ってきた！")
                                : ("記者", "覚醒状態が終了。平常心で次のレースへ。");
                    if (pendingStory == null) pendingStory = new[] { cLine };
                    else
                    {
                        var e2 = new (string, string)[pendingStory.Length + 1];
                        pendingStory.CopyTo(e2, 0);
                        e2[e2.Length - 1] = cLine;
                        pendingStory = e2;
                    }
                }
                // モーター整備は1節(1レース)限りで消費
                career.maintCarb = career.maintElec = career.maintGear = 0;
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
