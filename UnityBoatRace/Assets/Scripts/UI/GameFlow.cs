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
        /// <summary>ビルド識別子。画面右上に表示され、更新が届いたか一目で分かる。</summary>
        public const string Build = "B20-実データ24場+中継カメラ";

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
        Text moveTimerText;          // 技選択の残り時間サークル
        float moveDeadline;

        // 展開予想システム(展開/2着/荒れ度を予想→的中で賞金ボーナス)
        string predictedKimarite;
        int predictedSecond = -1;   // 2着予想(艇index)
        int predictedRough = -1;    // 荒れ度予想(0=堅い 1=普通 2=波乱)
        bool predictionHit;
        int predictionBonus;
        string predictionSummary;

        // 舟券(観戦レース: ベットコインで2連単/3連単を購入)
        int betType;                // 0=2連単 1=3連単
        int betFirst = -1, betSecond = -1, betThird = -1;
        int betAmount;
        float betOdds;
        bool betWon;
        int betPayout;

        // レース倍速(x1/x2/x4)。スロー演出後はこの速度に復帰する
        float raceSpeed = 1f;

        // 演出: スタートスロー(大時計0秒付近をスローモーションで見せる)
        bool startSlowActive, startSlowDone;
        bool stTelopPending; // スタート成立後にST一覧テロップを出す予約
        GameObject broadcastStrip; // 実中継風の左端縦艇番プレート(スタート前のみ)

        // 固定ライバル名鑑(シナリオ第6章: 個性を持った実在感あるライバル)
        static readonly (string name, Color hair, string line)[] Rivals =
        {
            ("赤城 烈",   new Color(0.85f, 0.20f, 0.15f), "イン逃げは俺の庭だ。1コースは誰にも渡さねぇ！"),
            ("蒼井 隼人", new Color(0.20f, 0.45f, 0.90f), "…風が読める。今日のまくりは、決まるよ。"),
            ("黄島 大河", new Color(0.95f, 0.75f, 0.15f), "ダッシュ勝負なら負けねぇぞ！ 外から全部飲み込んでやる！"),
            ("緑川 静",   new Color(0.20f, 0.65f, 0.35f), "静かに、確実に。差しというのは芸術なんですよ。"),
            ("黒部 剛",   new Color(0.20f, 0.22f, 0.28f), "パワーで押し切る。それだけだ。"),
            ("白鳥 翔太", new Color(0.85f, 0.88f, 0.92f), "スタートは僕の世界。ST.10の景色、見せてあげるよ。"),
            ("紫村 京",   new Color(0.60f, 0.30f, 0.70f), "ふふ…君と同じ節で走れるなんて、面白くなってきた。"),
            ("橙田 昇",   new Color(0.95f, 0.50f, 0.15f), "熱くいこうぜ！！ 先輩の意地、見せてやるよ！"),
        };

        /// <summary>レジェンド選手のステータスを艇に適用(実在モデルの持ち味を反映)。</summary>
        void ApplyLegend(BoatRace.Boat.BoatStats bs, LegendRacer l)
        {
            var p = bs.player;
            p.playerName = l.name;
            p.rank = BoatRace.Player.RacerRank.A1;
            p.startSkill = l.start;
            p.turnSkill = l.turn;
            p.speedSkill = l.speed;
            p.mental = l.mental;
            p.reactionTimeMean = l.st;
            p.experience = 0.95f;
        }

        /// <summary>話者名→顔シートのスプライト(AI生成画像)。無ければnull。</summary>
        Sprite FaceSpriteOf(string name)
        {
            if (string.IsNullOrEmpty(name)) return null;
            if (name.StartsWith("天才 ")) return FaceSpriteOf(name.Substring(3));
            if (career != null && name == career.racerName) return FaceArt.Get(13);
            for (int i = 0; i < LegendRacer.All.Length; i++)
                if (LegendRacer.All[i].name == name) return FaceArt.Get(1 + i);
            for (int i = 0; i < Rivals.Length; i++)
                if (Rivals[i].name == name) return FaceArt.Get(14 + i);
            // NPC(Art/npcs.pngがあれば): 支部長/実況アナ/記者/整備士
            if (name.Contains("支部長") || name.Contains("会長")) return FaceArt.Npc(0);
            if (name.Contains("実況") || name.Contains("アナ")) return FaceArt.Npc(1);
            if (name.Contains("記者")) return FaceArt.Npc(2);
            if (name.Contains("整備")) return FaceArt.Npc(3);
            return null;
        }

        /// <summary>顔を描く: AI生成の顔シートがあればそれ、無ければ手続き生成アニメ顔。</summary>
        GameObject MakeFaceAt(Transform parent, string person, Vector2 aMin, Vector2 aMax)
        {
            var sp = FaceSpriteOf(person);
            if (sp != null)
            {
                var frame = UiKit.MakePanel(parent, UiKit.Border, 20, aMin, aMax, Vector2.zero, Vector2.zero);
                frame.GetComponent<Image>().raycastTarget = false;
                var bg = UiKit.MakePanel(frame.transform, Color.white, 16,
                    Vector2.zero, Vector2.one, new Vector2(3f, 3f), new Vector2(-3f, -3f));
                bg.GetComponent<Image>().raycastTarget = false;
                var imgGo = new GameObject("FaceImg");
                UiKit.Place(imgGo, frame.transform, Vector2.zero, Vector2.one,
                    new Vector2(3f, 3f), new Vector2(-3f, -3f));
                var img = imgGo.AddComponent<Image>();
                img.sprite = sp;
                img.preserveAspect = true;
                img.raycastTarget = false;
                return frame;
            }
            var (seed, hair) = FaceOf(person);
            return UiKit.MakeFace(parent, seed, hair, aMin, aMax);
        }

        /// <summary>話者名→顔(シード+髪色)。同じ名前は常に同じ顔になる。</summary>
        (int seed, Color hair) FaceOf(string speaker)
        {
            if (career != null && speaker == career.racerName)
                return (2, new Color(0.16f, 0.30f, 0.62f));
            for (int i = 0; i < Rivals.Length; i++)
                if (Rivals[i].name == speaker) return (100 + i * 7, Rivals[i].hair);
            for (int i = 0; i < LegendRacer.All.Length; i++)
                if (LegendRacer.All[i].name == speaker) return (300 + i * 13, LegendRacer.All[i].hair);
            switch (speaker)
            {
                case "記者": return (31, new Color(0.35f, 0.26f, 0.20f));
                case "マネージャー": return (45, new Color(0.88f, 0.45f, 0.60f));
                case "整備士": return (53, new Color(0.46f, 0.48f, 0.52f));
                case "インタビュアー": return (61, new Color(0.62f, 0.46f, 0.28f));
                case "システム": return (77, new Color(0.40f, 0.62f, 0.82f));
            }
            int h = 0;
            foreach (char ch in speaker) h = h * 31 + ch;
            h = Mathf.Abs(h);
            var pal = new[]
            {
                new Color(0.45f, 0.30f, 0.20f), new Color(0.25f, 0.40f, 0.75f),
                new Color(0.70f, 0.35f, 0.25f), new Color(0.30f, 0.55f, 0.40f),
                new Color(0.55f, 0.40f, 0.65f), new Color(0.30f, 0.32f, 0.38f),
            };
            return (h, pal[h % pal.Length]);
        }

        /// <summary>能力値→ウマ娘風ランク(S/A/B/C/D/E)と色。</summary>
        static (string rank, Color color) RankOf(float v) =>
            v >= 0.90f ? ("S", new Color(1.00f, 0.72f, 0.10f)) :
            v >= 0.80f ? ("A", new Color(0.95f, 0.35f, 0.25f)) :
            v >= 0.70f ? ("B", new Color(0.75f, 0.35f, 0.80f)) :
            v >= 0.60f ? ("C", new Color(0.25f, 0.70f, 0.35f)) :
            v >= 0.50f ? ("D", new Color(0.30f, 0.55f, 0.90f)) :
                         ("E", new Color(0.55f, 0.58f, 0.64f));

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

            // 素材の読み込み状況をConsoleへ(トラブル時の一次診断)
            Debug.Log($"[素材チェック] Build={Build} " +
                $"フォント:{(Resources.Load<Font>("Fonts/MPLUSRounded1c-ExtraBold") != null ? "OK" : "なし")} " +
                $"顔シート:{(Resources.Load<Texture2D>("Art/faces") != null ? "OK" : "なし")} " +
                $"KV:{(Resources.Load<Texture2D>("Art/title_kv") != null ? "OK" : "なし")} " +
                $"ロゴ:{(Resources.Load<Texture2D>("Art/logo_teido") != null ? "OK" : "なし")} " +
                $"艇シート:{(Resources.Load<Texture2D>("Art/boats") != null ? "OK" : "なし")} " +
                $"3Dモデル:{(Resources.Load<GameObject>("Models/boat") != null ? "OK" : "なし")} " +
                $"会場モデル:{(Resources.Load<GameObject>("Models/omura_venue") != null ? "OK" : "なし")}");

            canvas = UiKit.MakeCanvas();
            hud = new RaceHudUI(race, commentary, canvas.transform, raceCam);
            hud.SetVisible(false);
            BuildReplayOverlay();

            // ピット離れ〜待機行動(T-100〜-14)は実時間で長いので早送りできるように
            var ffBtn = UiKit.MakeButton(canvas.transform, "⏩ 早送り", UiKit.Navy, 22,
                new Vector2(1f, 0f), new Vector2(1f, 0f), new Vector2(-230f, 186f), new Vector2(-16f, 234f),
                () =>
                {
                    bool pre = race.armed && race.state.clock < -14f &&
                        (race.state.phase == RacePhase.PitOut || race.state.phase == RacePhase.Waiting);
                    if (pre)
                    {
                        Time.timeScale = Time.timeScale > 1f ? 1f : 5f;
                        ffLabel.text = Time.timeScale > 1f ? "▶ 等速に戻す" : "⏩ 早送り";
                    }
                    else
                    {
                        // 仕様UX「1プレイを短く」: レース中はx1→x2→x4の倍速サイクル
                        raceSpeed = raceSpeed >= 4f ? 1f : raceSpeed * 2f;
                        Time.timeScale = raceSpeed;
                        ffLabel.text = $"⏩ 倍速 x{raceSpeed:F0}";
                    }
                });
            ffLabel = ffBtn.GetComponentInChildren<Text>();
            ffButton = ffBtn.gameObject;
            ffButton.SetActive(false);

            race.OnRaceFinished += () => { resultTimer = 3f; RecordStats(); };
            race.OnFinalLap += () => ShowFlash("最終周回！", new Color(0.9f, 0.62f, 0.05f));
            // 絵コンテv3: 進入確定テロップ(助走開始時)とST一覧テロップ(スタート直後)
            race.OnPhaseChanged += p =>
            {
                if (replay != null && replay.IsPlaying) return;
                if (p == RacePhase.Approach) ShowEntryTelop();
                if (p == RacePhase.Racing) stTelopPending = true;
            };
            race.OnPlayerTurnEntry += OnPlayerTurnEntry;
            race.OnBoatFinished += (idx, place) =>
            {
                if (place == 1)
                {
                    // 勝利カットイン(仕様書⑩): 自分が勝ったらファンファーレ+カットイン
                    if (idx == race.playerBoatIndex)
                    {
                        ShowMoveCutIn("WINNER！！", new Color(1f, 0.78f, 0.10f));
                        AudioKit.Fanfare();
                        AudioKit.Cheer(0.9f);
                    }
                    else
                    {
                        ShowFlash($"ゴール！ {idx + 1}号艇！", UiKit.Red);
                        AudioKit.Cheer(0.6f);
                    }
                }
                else if (place == 2)
                {
                    // 写真判定(仕様書⑩): 1-2着の着差0.15秒以内
                    float t1 = -1f, t2 = race.state.Get(idx).finishTime;
                    foreach (var bi in race.state.standings)
                    {
                        var bb = race.state.Get(bi);
                        if (bb.finalPlace == 1) { t1 = bb.finishTime; break; }
                    }
                    if (t1 >= 0f && Mathf.Abs(t2 - t1) < 0.15f)
                        ShowFlash("写真判定！！", new Color(0.25f, 0.30f, 0.45f));
                }
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

            // 早送り(スタート前)/倍速(レース中x1→x2→x4)ボタン
            bool preRace = race.armed && race.state.clock < -14f &&
                (race.state.phase == RacePhase.PitOut || race.state.phase == RacePhase.Waiting);
            bool racingNow = race.armed && !replay.IsPlaying &&
                (race.state.phase == RacePhase.Approach || race.state.phase == RacePhase.Racing);
            ffButton.SetActive(preRace || racingNow);
            if (racingNow && !preRace) ffLabel.text = $"⏩ 倍速 x{raceSpeed:F0}";
            if (!race.armed) raceSpeed = 1f;
            if (!preRace && movePanelGo == null && !specialSeqActive && !startSlowActive &&
                Time.timeScale != raceSpeed)
            {
                Time.timeScale = raceSpeed;
                if (!racingNow) ffLabel.text = "⏩ 早送り";
            }

            // 実中継風: スタート前だけ左端に縦の艇番プレート(1〜6+選手名)
            bool preStart = race.armed && !replay.IsPlaying &&
                (race.state.phase == RacePhase.PitOut || race.state.phase == RacePhase.Waiting ||
                 race.state.phase == RacePhase.Approach);
            if (preStart && broadcastStrip == null && movePanelGo == null)
            {
                broadcastStrip = new GameObject("BroadcastStrip");
                UiKit.Place(broadcastStrip, canvas.transform,
                    new Vector2(0.005f, 0.28f), new Vector2(0.15f, 0.80f), Vector2.zero, Vector2.zero);
                for (int i = 0; i < 6; i++)
                {
                    Color bc = UiKit.BoatColors[i];
                    bool lightBc = bc.r * 0.6f + bc.g * 0.3f + bc.b * 0.1f > 0.6f;
                    float top = 1f - i * (1f / 6f);
                    var plate = UiKit.MakePanel(broadcastStrip.transform, bc, 8,
                        new Vector2(0f, top - 0.145f), new Vector2(1f, top - 0.01f),
                        Vector2.zero, Vector2.zero);
                    plate.GetComponent<Image>().raycastTarget = false;
                    plate.AddComponent<SkewFx>().skewX = 6f;
                    UiKit.MakeText(plate.transform,
                        $"{i + 1} {race.statsList[i].player.playerName}", 17,
                        lightBc ? UiKit.Navy : Color.white, TextAnchor.MiddleLeft,
                        Vector2.zero, Vector2.one, new Vector2(10f, 0f), new Vector2(-4f, 0f),
                        bold: true, shadow: !lightBc);
                }
            }
            else if (!preStart && broadcastStrip != null)
            {
                Destroy(broadcastStrip);
                broadcastStrip = null;
            }

            // ST一覧テロップ: スタートスローが明けてから(絵コンテv3 CUT08)
            if (stTelopPending && race.armed && race.state.phase == RacePhase.Racing &&
                race.state.clock > 1.4f && !startSlowActive && !replay.IsPlaying)
            {
                stTelopPending = false;
                StartCoroutine(StTelopSeq());
            }

            // 演出: スタートスロー(仕様書⑩)。大時計0秒の攻防をスロー+ホーンで見せる
            if (!race.armed) { startSlowDone = false; startSlowActive = false; stTelopPending = false; }
            else if (!replay.IsPlaying && movePanelGo == null && !specialSeqActive &&
                (race.state.phase == RacePhase.Approach || race.state.phase == RacePhase.Racing))
            {
                if (!startSlowDone && race.state.clock >= -0.05f)
                {
                    startSlowDone = true;
                    startSlowActive = true;
                    Time.timeScale = 0.35f;
                    AudioKit.Horn();
                }
                if (startSlowActive && race.state.clock > 1.1f)
                {
                    startSlowActive = false;
                    Time.timeScale = raceSpeed;
                }
            }

            // 技選択の集中線をゆっくり回転(スロー中もunscaledで動く)
            if (moveLinesRT != null)
                moveLinesRT.Rotate(0f, 0f, 26f * Time.unscaledDeltaTime);
            if (movePanelGo != null && moveTimerText != null)
                moveTimerText.text = Mathf.Max(0f, moveDeadline - Time.unscaledTime).ToString("F1");

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

            // ---- TEIDOモック「1M攻防」下部シート ----
            // 敵情報: 自分以外の最上位艇(読み合いの相手)
            int enemyIdx = -1;
            foreach (var bi in race.state.standings)
                if (bi != race.playerBoatIndex) { enemyIdx = bi; break; }
            var advScores = EntryScores();
            float psc = advScores[race.playerBoatIndex];
            float esc = enemyIdx >= 0 ? advScores[enemyIdx] : psc;
            int advPct = Mathf.RoundToInt(psc / Mathf.Max(0.01f, psc + esc) * 100f);

            var sheet = UiKit.MakePanel(movePanelGo.transform, new Color(0.88f, 0.94f, 0.99f, 0.97f), 26,
                new Vector2(0f, 0f), new Vector2(1f, 0.47f), new Vector2(6f, -30f), new Vector2(-6f, 0f));

            // ヘッダ: 自分(顔+青帯名+体力バー) vs 敵(赤タグ+パワー)
            MakeFaceAt(sheet.transform, career.racerName,
                new Vector2(0.015f, 0.72f), new Vector2(0.115f, 0.99f));
            UiKit.MakeTag(sheet.transform, $"{career.racerName}　{race.playerBoatIndex + 1}号艇",
                UiKit.Cyan, Color.white, 19,
                new Vector2(0.125f, 0.86f), new Vector2(0.43f, 0.985f), skew: 10f);
            UiKit.MakeText(sheet.transform, $"体力 {race.playerSP:F0}/{race.playerSPMax:F0}", 14,
                UiKit.Navy, TextAnchor.MiddleLeft,
                new Vector2(0.13f, 0.795f), new Vector2(0.36f, 0.855f), Vector2.zero, Vector2.zero, bold: true);
            var tpBg = UiKit.MakePanel(sheet.transform, new Color(0.78f, 0.84f, 0.90f), 6,
                new Vector2(0.13f, 0.735f), new Vector2(0.37f, 0.79f), Vector2.zero, Vector2.zero);
            var tpFill = UiKit.MakePanel(tpBg.transform, UiKit.Emerald, 6,
                new Vector2(0.02f, 0.14f),
                new Vector2(Mathf.Clamp01(race.playerSP / Mathf.Max(1f, race.playerSPMax)) * 0.96f + 0.02f, 0.86f),
                Vector2.zero, Vector2.zero);
            tpFill.GetComponent<Image>().raycastTarget = false;
            UiKit.MakeChip(sheet.transform, $"優勢度 {advPct}%",
                advPct >= 50 ? UiKit.Cyan : UiKit.Red, Color.white, 14,
                new Vector2(0.39f, 0.735f), new Vector2(0.55f, 0.845f), Vector2.zero, Vector2.zero);

            string eName = enemyIdx >= 0 ? race.statsList[enemyIdx].player.playerName : "―";
            string eTac = enemyIdx >= 0 ? AI.StrategyAI.TacticName(race.state.Get(enemyIdx).tactic) : "";
            int ePow = enemyIdx >= 0
                ? Mathf.RoundToInt((race.statsList[enemyIdx].player.turnSkill
                    + race.statsList[enemyIdx].player.speedSkill) * 300f)
                : 0;
            UiKit.MakeTag(sheet.transform, $"{eName}：{eTac}", UiKit.Red, Color.white, 15,
                new Vector2(0.57f, 0.875f), new Vector2(0.985f, 0.985f), skew: -10f);
            UiKit.MakeText(sheet.transform, $"{ePow}", 30, UiKit.Red, TextAnchor.MiddleRight,
                new Vector2(0.70f, 0.72f), new Vector2(0.975f, 0.87f), Vector2.zero, Vector2.zero,
                bold: true, shadow: true, outline: true);

            // プロンプト+残り時間サークル
            UiKit.MakeText(sheet.transform, $"{markNo}マーク！ 技を選択しろ！", 20, UiKit.Navy,
                TextAnchor.MiddleCenter,
                new Vector2(0.04f, 0.62f), new Vector2(0.80f, 0.71f), Vector2.zero, Vector2.zero, bold: true);
            var timerOuter = UiKit.MakePanel(sheet.transform, UiKit.Navy, 40,
                new Vector2(0.845f, 0.575f), new Vector2(0.955f, 0.735f), Vector2.zero, Vector2.zero);
            var timerInner = UiKit.MakePanel(timerOuter.transform, Color.white, 36,
                Vector2.zero, Vector2.one, new Vector2(4f, 4f), new Vector2(-4f, -4f));
            timerInner.GetComponent<Image>().raycastTarget = false;
            moveTimerText = UiKit.MakeText(timerInner.transform, "4.0", 22, UiKit.Orange,
                TextAnchor.MiddleCenter, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero, bold: true);
            moveDeadline = Time.unscaledTime + 4f;

            // 技カード2列(TEIDOモック: 白カード+上端ストライプ+TP緑+パワー橙)+温存カード
            var moves = SkillMove.UnlockedAt(career != null ? career.chapter : 1);
            int slot = 0;
            void CardAt(int index, System.Action<GameObject> build)
            {
                int col = index % 2, row = index / 2;
                float x0 = 0.03f + col * 0.485f;
                float y1 = 0.585f - row * 0.19f;
                var frame = UiKit.MakePanel(sheet.transform, UiKit.Navy, 18,
                    new Vector2(x0, y1 - 0.175f), new Vector2(x0 + 0.455f, y1), Vector2.zero, Vector2.zero);
                var sh2 = frame.AddComponent<Shadow>();
                sh2.effectColor = new Color(0.02f, 0.08f, 0.20f, 0.35f);
                sh2.effectDistance = new Vector2(0f, -4f);
                build(frame);
            }
            foreach (var m in moves)
            {
                var mv = m;
                int idx = SkillMove.All.IndexOf(mv);
                int lv = career != null ? career.MoveLv(idx) : 1;
                int cost = mv.CostAt(lv);
                bool special = mv.cost > 0;
                bool usable = race.playerSP >= cost;
                int power = Mathf.RoundToInt((mv.AccelAt(lv) + mv.TopAt(lv) - 2f) * 400f + 130f + lv * 30f);
                CardAt(slot++, frame =>
                {
                    var inner = UiKit.MakePanel(frame.transform, Color.white, 14,
                        Vector2.zero, Vector2.one, new Vector2(3.5f, 3.5f), new Vector2(-3.5f, -3.5f));
                    var strip = UiKit.MakePanel(inner.transform,
                        special ? mv.color : new Color(0.72f, 0.78f, 0.86f), 6,
                        new Vector2(0f, 0.86f), new Vector2(1f, 1f), new Vector2(3f, 0f), new Vector2(-3f, -2f));
                    UiKit.AddStripeOverlay(strip, Color.white, 0.30f);
                    strip.GetComponent<Image>().raycastTarget = false;
                    UiKit.MakeText(inner.transform,
                        special ? $"{mv.name}  Lv{lv}" : $"{mv.name} (ノーマル)",
                        special ? 19 : 17, UiKit.Navy, TextAnchor.MiddleLeft,
                        new Vector2(0.05f, 0.42f), new Vector2(0.95f, 0.84f), Vector2.zero, Vector2.zero,
                        bold: true);
                    UiKit.MakeText(inner.transform, $"TP {cost}", 16,
                        special ? new Color(0f, 0.47f, 0.42f) : new Color(0.45f, 0.52f, 0.60f),
                        TextAnchor.MiddleLeft,
                        new Vector2(0.06f, 0.05f), new Vector2(0.45f, 0.40f), Vector2.zero, Vector2.zero,
                        bold: true);
                    UiKit.MakeText(inner.transform, $"{power}", 28, UiKit.Orange, TextAnchor.MiddleRight,
                        new Vector2(0.45f, 0.02f), new Vector2(0.94f, 0.42f), Vector2.zero, Vector2.zero,
                        bold: true, shadow: true);
                    var btn = frame.AddComponent<Button>();
                    btn.onClick.AddListener(() => { if (usable) PickMove(mv, lv); });
                    if (!usable)
                    {
                        var dim = UiKit.MakePanel(frame.transform, new Color(0f, 0f, 0f, 0.5f), 16,
                            Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
                        dim.GetComponent<Image>().raycastTarget = false;
                    }
                });
            }
            // 温存カード(TEIDOモック: 紺地「技を使用しない」)
            CardAt(slot, frame =>
            {
                var inner = UiKit.MakePanel(frame.transform, new Color(0.07f, 0.19f, 0.37f), 14,
                    Vector2.zero, Vector2.one, new Vector2(3.5f, 3.5f), new Vector2(-3.5f, -3.5f));
                UiKit.MakeText(inner.transform, "■ 技を使用しない", 18, Color.white, TextAnchor.MiddleLeft,
                    new Vector2(0.06f, 0.42f), new Vector2(0.95f, 0.90f), Vector2.zero, Vector2.zero, bold: true);
                UiKit.MakeText(inner.transform, "温存 (体力回復に専念)", 14, new Color(0.62f, 0.76f, 0.91f),
                    TextAnchor.MiddleLeft,
                    new Vector2(0.06f, 0.06f), new Vector2(0.95f, 0.40f), Vector2.zero, Vector2.zero, bold: true);
                frame.AddComponent<Button>().onClick.AddListener(PickNone);
            });
            moveTimeoutCo = StartCoroutine(MoveTimeout());
        }

        System.Collections.IEnumerator MoveTimeout()
        {
            yield return new WaitForSecondsRealtime(4f);
            PickNone(); // 時間切れは「温存」
        }

        /// <summary>温存: 技を使わずターンに入る(体力を守る選択)。</summary>
        void PickNone()
        {
            if (movePanelGo == null) return;
            if (moveTimeoutCo != null) { StopCoroutine(moveTimeoutCo); moveTimeoutCo = null; }
            Destroy(movePanelGo);
            movePanelGo = null;
            moveLinesRT = null;
            moveTimerText = null;
            if (raceCam != null) raceCam.selectView = false;
            Time.timeScale = raceSpeed;
            ShowFlash("温存！", new Color(0.10f, 0.25f, 0.50f));
        }

        void PickMove(SkillMove m, int lv)
        {
            if (movePanelGo == null) return;
            if (moveTimeoutCo != null) { StopCoroutine(moveTimeoutCo); moveTimeoutCo = null; }
            Destroy(movePanelGo);
            movePanelGo = null;
            moveLinesRT = null;
            moveTimerText = null;

            if (m.cost > 0)
            {
                // 必殺技: タメ→カットイン→解放の3段演出
                StartCoroutine(SpecialMoveSequence(m, lv));
            }
            else
            {
                // 基本技: 演出なしでサッと発動(差をつける)
                if (raceCam != null) raceCam.selectView = false;
                Time.timeScale = raceSpeed;
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
            Time.timeScale = raceSpeed;
            race.ApplyPlayerMove(m, lv);
            if (race.playerBoatIndex >= 0 && race.playerBoatIndex < race.boats.Count)
                race.boats[race.playerBoatIndex].BurstSpray(70);
            if (raceCam != null) raceCam.Punch(17f);
            AudioKit.Cheer(0.5f);
            specialSeqActive = false;
        }

        /// <summary>必殺技カットイン: 集中線+色フラッシュ+技名スライドイン(イナイレ演出)。</summary>
        void ShowMoveCutIn(string name, Color color)
        {
            AudioKit.Whoosh();
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
            moveTimerText = null;
            if (raceCam != null) raceCam.selectView = false;
            Time.timeScale = 1f;
        }

        /// <summary>画面中央のフラッシュバナー(最終周回・ゴールなどの速報演出)。</summary>
        // ================= レーステロップ(絵コンテv3の下部帯) =================
        static readonly string[] MaruNum = { "①", "②", "③", "④", "⑤", "⑥" };

        /// <summary>進入確定テロップ。スロー勢(1-3コース)/ダッシュ勢(4-6コース)を艇番で表示。</summary>
        void ShowEntryTelop()
        {
            var byCourse = new int[6];
            for (int i = 0; i < 6; i++)
            {
                int c = Mathf.Clamp(race.state.Get(i).course, 1, 6);
                byCourse[c - 1] = i;
            }
            string slow = "", dash = "";
            for (int c = 0; c < 6; c++)
            {
                string s = MaruNum[byCourse[c]];
                if (c < 3) slow += s; else dash += s;
            }
            ShowTelop($"進入確定　{slow} スロー ／ {dash} ダッシュ", UiKit.Navy);
        }

        /// <summary>実中継の順序: 「スタート正常/フライング」→ 2.3秒後にST一覧。</summary>
        System.Collections.IEnumerator StTelopSeq()
        {
            bool anyF = false, anyL = false;
            for (int i = 0; i < 6; i++)
            {
                var f = race.state.Get(i).startFlag;
                if (f == StartFlag.Flying) anyF = true;
                if (f == StartFlag.Late) anyL = true;
            }
            ShowTelop(anyF ? "フライング発生！　該当艇は返還欠場" :
                      anyL ? "出遅れ発生　該当艇は返還欠場" : "スタート正常",
                anyF || anyL ? new Color(0.72f, 0.10f, 0.10f, 0.95f) : UiKit.Navy);
            yield return new WaitForSecondsRealtime(2.3f);
            ShowStTelop();
        }

        /// <summary>ST一覧テロップ。コース順に .12 形式(F=フライング/L=出遅れ)。</summary>
        void ShowStTelop()
        {
            var order = new List<int>();
            for (int i = 0; i < 6; i++) order.Add(i);
            order.Sort((a, b) => race.state.Get(a).course.CompareTo(race.state.Get(b).course));
            var sb = new System.Text.StringBuilder("ST一覧　");
            foreach (int i in order)
            {
                var bs = race.state.Get(i);
                string stStr = bs.startFlag == StartFlag.Flying ? "F" :
                               bs.startFlag == StartFlag.Late ? "L" :
                               $".{Mathf.Clamp(Mathf.RoundToInt(bs.st * 100f), 0, 99):00}";
                sb.Append($"{MaruNum[i]}{stStr}　");
            }
            ShowTelop(sb.ToString().TrimEnd('　'), new Color(0.04f, 0.10f, 0.22f, 0.94f));
        }

        /// <summary>画面下部の横帯テロップ(4秒で消える)。実況の邪魔をしない位置。</summary>
        void ShowTelop(string text, Color bg)
        {
            var band = UiKit.MakePanel(canvas.transform, bg, 12,
                new Vector2(0.02f, 0.315f), new Vector2(0.98f, 0.375f), Vector2.zero, Vector2.zero);
            var edge = new GameObject("Edge");
            UiKit.Place(edge, band.transform, new Vector2(0f, 0f), new Vector2(0.012f, 1f), Vector2.zero, Vector2.zero);
            var ei = edge.AddComponent<Image>();
            ei.color = UiKit.Yellow;
            ei.raycastTarget = false;
            UiKit.MakeText(band.transform, text, 30, Color.white, TextAnchor.MiddleCenter,
                Vector2.zero, Vector2.one, new Vector2(18f, 0f), new Vector2(-8f, 0f), bold: true, shadow: true);
            var group = band.AddComponent<CanvasGroup>();
            StartCoroutine(TelopRoutine(band, group));
        }

        System.Collections.IEnumerator TelopRoutine(GameObject band, CanvasGroup group)
        {
            var rt = band.GetComponent<RectTransform>();
            for (float t = 0f; t < 4.2f; t += Time.unscaledDeltaTime)
            {
                if (band == null) yield break;
                float appear = Mathf.Clamp01(t / 0.20f);
                rt.anchoredPosition = new Vector2(Mathf.Lerp(-60f, 0f, appear), rt.anchoredPosition.y);
                group.alpha = t < 3.6f ? appear : Mathf.Clamp01((4.2f - t) / 0.6f);
                yield return null;
            }
            if (band != null) Destroy(band);
        }

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
            AudioKit.Bgm(true);
            AudioKit.Crowd(0f);

            // 3D会場を透かせる青のベール(暗めに締めて背景の雑味を隠す)
            UiKit.MakeFullscreenGradient(s.transform,
                new Color(0.03f, 0.10f, 0.34f, 0.55f), new Color(0.01f, 0.03f, 0.13f, 0.96f));

            // AI生成キービジュアル(Art/title_kv.png)。縦長絵を中央に高さフィットで置く
            var kvSprite = FaceArt.LoadArt("title_kv");
            if (kvSprite != null)
            {
                var kvGo = new GameObject("KeyVisual");
                UiKit.Place(kvGo, s.transform, new Vector2(0.24f, 0f), new Vector2(0.76f, 1f),
                    Vector2.zero, Vector2.zero);
                var kvImg = kvGo.AddComponent<Image>();
                kvImg.sprite = kvSprite;
                kvImg.preserveAspect = true;
                kvImg.raycastTarget = false;
            }

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
                    new Vector2(-70f, -620f), new Vector2(70f, 620f));
                titleRays[i].localEulerAngles = new Vector3(0f, 0f, i == 0 ? 38f : -38f);
                var ri = ray.AddComponent<Image>();
                ri.sprite = UiKit.VerticalGradient(
                    new Color(0.30f, 0.85f, 1f, 0f), new Color(0.45f, 0.88f, 1f, 0.13f));
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

            // ロゴ: AI生成「艇道」筆文字(Art/logo_teido.png)があればそれ、無ければテキストロゴ
            var logo = new GameObject("Logo");
            titleLogoRT = UiKit.Place(logo, s.transform,
                new Vector2(0f, 0.36f), new Vector2(1f, 0.90f), Vector2.zero, Vector2.zero);
            var logoSprite = FaceArt.LoadArt("logo_teido");
            if (logoSprite != null)
            {
                var lgGo = new GameObject("LogoImg");
                UiKit.Place(lgGo, logo.transform, new Vector2(0.12f, 0.18f), new Vector2(0.88f, 1f),
                    Vector2.zero, Vector2.zero);
                var lgImg = lgGo.AddComponent<Image>();
                lgImg.sprite = logoSprite;
                lgImg.preserveAspect = true;
                lgImg.raycastTarget = false;
                UiKit.MakeText(logo.transform, "-TEIDO- リアル競艇シミュレーション", 22, Color.white,
                    TextAnchor.MiddleCenter,
                    new Vector2(0f, 0.02f), new Vector2(1f, 0.16f), Vector2.zero, Vector2.zero,
                    bold: true, shadow: true, outline: true);
            }
            else
            {
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
            }

            // Ver表記(右上)。ビルド番号入り=更新が届いたかここで確認できる
            UiKit.MakeText(s.transform, $"Ver.1.0 [{Build}]", 17, new Color(1f, 1f, 1f, 0.85f),
                TextAnchor.MiddleRight,
                new Vector2(0.60f, 0.955f), new Vector2(0.985f, 0.995f), Vector2.zero, Vector2.zero,
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
            AudioKit.Bgm(true);
            AudioKit.Crowd(0f);
            int totalRaces = PlayerPrefs.GetInt("br_races", 0);
            int bestPayout = PlayerPrefs.GetInt("br_best", 0);

            // 左上: チーム総合能力(TEIDOモック: 数字が画面の主役)
            int totalPower = Mathf.RoundToInt(
                (career.startSkill + career.turnSkill + career.speedSkill +
                 career.mental + career.mechanicSkill) * 40000f + career.level * 800f);
            UiKit.MakeText(s.transform, "チーム総合能力", 18, Color.white, TextAnchor.MiddleLeft,
                new Vector2(0.02f, 0.945f), new Vector2(0.32f, 0.99f), Vector2.zero, Vector2.zero,
                bold: true, shadow: true, outline: true);
            var bigNum = UiKit.MakeLogoText(s.transform, $"{totalPower:N0}", 44,
                Color.white, new Color(0.51f, 0.91f, 1f), UiKit.Border, 0f,
                new Vector2(0.02f, 0.865f), new Vector2(0.34f, 0.945f));
            bigNum.alignment = TextAnchor.MiddleLeft;

            // 右上: コインピル2段(資金/BC)+シーズンバナー(TEIDOモック)
            void CoinPill(string txt, float y0, float y1)
            {
                var p = UiKit.MakePanel(s.transform, new Color(0.024f, 0.118f, 0.235f, 0.78f), 18,
                    new Vector2(0.76f, y0), new Vector2(0.985f, y1), Vector2.zero, Vector2.zero);
                var po = p.AddComponent<Outline>();
                po.effectColor = Color.white;
                po.effectDistance = new Vector2(2f, 2f);
                UiKit.MakeText(p.transform, txt, 16, Color.white, TextAnchor.MiddleCenter,
                    Vector2.zero, Vector2.one, new Vector2(8f, 0f), new Vector2(-8f, 0f), bold: true);
            }
            CoinPill($"¥ {career.money:N0}万", 0.945f, 0.99f);
            CoinPill($"BC {PlayerPrefs.GetInt("br_betcoin", 1000):N0}", 0.895f, 0.94f);
            UiKit.MakeTag(s.transform, $"⚡開催中: 第{career.seasonNo}シーズン",
                new Color(1f, 0.78f, 0.20f), new Color(0.35f, 0.21f, 0f), 15,
                new Vector2(0.72f, 0.84f), new Vector2(0.985f, 0.885f), skew: 8f);

            // ストーリー進行中はホームの開催場を次章の指定会場に同期(会場とストーリーの一致)
            if (!career.allClear && race.venueId != career.Current.venueId)
            {
                race.venueId = career.Current.venueId;
                if (RaceBootstrap.Instance != null) RaceBootstrap.Instance.RebuildEnvironment(race);
            }

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
                infoLabel.text = $"〈{v.Character}〉イン{v.insideAdvantage * 100f:F0}%　風 {Stars(v.windEffect)}　波 {v.waveHeight * 100f:F0}cm";
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
                $"第{career.chapter}章 「{career.Current.title}」\n" +
                $"＠{CourseDatabase.Get(career.Current.venueId).name}・{career.Current.grade}戦";
            UiKit.MakeText(nextInner.transform, chTitle, 17, UiKit.Border, TextAnchor.MiddleLeft,
                new Vector2(0.05f, 0.03f), new Vector2(0.98f, 0.56f), Vector2.zero, Vector2.zero, bold: true);
            var nextBtn = nextOuter.AddComponent<Button>();
            nextBtn.targetGraphic = nextOuter.GetComponent<Image>();
            nextBtn.onClick.AddListener(ShowCareer);

            // 下部5連タブ(TEIDO設計書4-2: 台形斜めカット、選択中=白地+黄上ライン)
            System.Action spectate = () =>
            {
                race.playerBoatIndex = -1;
                race.playerOverride = null;
                if (raceCam != null) { raceCam.focusBoat = -1; raceCam.heroView = false; }
                race.seed = System.Environment.TickCount;
                race.SetupRace();
                if (RaceBootstrap.Instance != null) RaceBootstrap.Instance.RebuildEnvironment(race);
                // 実在モデルのレジェンド級が2〜4名ゲスト参戦(舟券の狙い目になる)
                var lrng = new System.Random(race.seed);
                var usedBoat = new List<int>();
                var usedLeg = new List<int>();
                int guests = 2 + lrng.Next(0, 3);
                for (int k = 0; k < guests * 2 && usedBoat.Count < guests; k++)
                {
                    int bi = lrng.Next(6);
                    int li = lrng.Next(LegendRacer.All.Length);
                    if (usedBoat.Contains(bi) || usedLeg.Contains(li)) continue;
                    usedBoat.Add(bi);
                    usedLeg.Add(li);
                    ApplyLegend(race.statsList[bi], LegendRacer.All[li]);
                }
                ShowEntry();
            };
            var foot = UiKit.MakePanel(s.transform, new Color(0.024f, 0.34f, 0.66f), 0,
                new Vector2(0f, 0f), new Vector2(1f, 0.115f), new Vector2(-6f, -6f), new Vector2(6f, 0f));
            var whiteLine = UiKit.MakePanel(foot.transform, Color.white, 0,
                new Vector2(0f, 1f), new Vector2(1f, 1f), new Vector2(0f, -4f), new Vector2(0f, 0f));
            whiteLine.GetComponent<Image>().raycastTarget = false;
            string[] tabLabels = { "ラウンジ", "戦績", "ストーリー", "観戦", "ストア" };
            string[] tabIcons = { "★", "▤", "▶", "◎", "¥" };
            System.Action[] tabActs =
            {
                ShowTitle,
                () => ShowStatsPopup(s.transform),
                ShowCareer,
                spectate,
                () => ShowShopPopup(s.transform),
            };
            for (int t = 0; t < 5; t++)
            {
                int ti = t;
                bool active = t == 2; // 中央「ストーリー」が選択中
                var tb = UiKit.MakePanel(foot.transform,
                    active ? Color.white : new Color(1f, 1f, 1f, 0.02f), 10,
                    new Vector2(0.004f + t * 0.199f, 0.06f), new Vector2(0.195f + t * 0.199f, 0.97f),
                    Vector2.zero, Vector2.zero);
                tb.AddComponent<SkewFx>().skewX = 9f; // 台形斜めカット
                if (active)
                {
                    var yLine = UiKit.MakePanel(tb.transform, UiKit.Yellow, 4,
                        new Vector2(0.15f, 0.90f), new Vector2(0.85f, 0.99f), Vector2.zero, Vector2.zero);
                    yLine.GetComponent<Image>().raycastTarget = false;
                }
                Color fg = active ? UiKit.Cyan : new Color(0.81f, 0.91f, 1f);
                UiKit.MakeText(tb.transform, tabIcons[t], 24, fg, TextAnchor.MiddleCenter,
                    new Vector2(0f, 0.42f), new Vector2(1f, 0.95f), Vector2.zero, Vector2.zero, bold: true);
                UiKit.MakeText(tb.transform, tabLabels[t], 15, fg, TextAnchor.MiddleCenter,
                    new Vector2(0f, 0.04f), new Vector2(1f, 0.42f), Vector2.zero, Vector2.zero, bold: true);
                tb.AddComponent<Button>().onClick.AddListener(() =>
                {
                    AudioKit.Click();
                    tabActs[ti]();
                });
            }
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
            AudioKit.Bgm(true);
            AudioKit.Crowd(0f);
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

            // 左: レーサーカード(顔+やる気チップ=ウマ娘の育成カード風)
            var card = UiKit.MakePanel(s.transform, UiKit.PanelWhite, 20,
                new Vector2(0.05f, 0.28f), new Vector2(0.48f, 0.83f), Vector2.zero, Vector2.zero);
            UiKit.AddStripeOverlay(card, UiKit.Sky, 0.10f);
            UiKit.MakeText(card.transform, career.racerName, 36, UiKit.TextDark, TextAnchor.MiddleLeft,
                new Vector2(0.06f, 0.80f), new Vector2(0.60f, 0.98f), Vector2.zero, Vector2.zero, bold: true);
            UiKit.MakeChip(card.transform, career.RankLabel, UiKit.Red, Color.white, 24,
                new Vector2(0.62f, 0.82f), new Vector2(0.80f, 0.97f), Vector2.zero, Vector2.zero);

            // やる気(ウマ娘の絶好調〜絶不調)
            string mot; Color motC;
            if (career.condition == 2) { mot = "絶好調↑↑"; motC = new Color(1f, 0.50f, 0.10f); }
            else if (career.condition == 1) { mot = "絶不調↓↓"; motC = new Color(0.35f, 0.40f, 0.55f); }
            else if (career.fatigue >= 60) { mot = "不調↓"; motC = new Color(0.35f, 0.55f, 0.80f); }
            else if (career.fatigue <= 20) { mot = "好調↑"; motC = new Color(0.55f, 0.80f, 0.20f); }
            else { mot = "普通→"; motC = new Color(0.60f, 0.62f, 0.68f); }
            UiKit.MakeChip(card.transform, mot, motC, Color.white, 20,
                new Vector2(0.82f, 0.82f), new Vector2(0.97f, 0.97f), Vector2.zero, Vector2.zero);

            // 自分の顔(AI生成→無ければ立ち絵)
            MakeFaceAt(card.transform, career.racerName,
                new Vector2(0.70f, 0.30f), new Vector2(0.955f, 0.76f));

            UiKit.MakeText(card.transform,
                $"Lv.{career.level}　体力 {career.MaxStamina}　(XP {career.xp}/{career.XpNeed})\n" +
                $"出走 {career.races} 回　勝利 {career.wins} 勝 (3着内 {career.top3})\n" +
                $"資金 {career.money:N0} 万円　ファン {career.fans:N0} 人\n" +
                $"疲労 {career.fatigue}/100{(career.fatigue >= 60 ? " ⚠要休養!" : "")}　" +
                $"第{career.seasonNo}S {career.seasonRaces}/12戦{career.seasonWins}勝 称号{career.titles.Count}\n" +
                $"スポンサー {career.sponsorIds.Count} 社 (+{career.SponsorIncome}万/R)　支出 {career.RaceExpense}万/R\n" +
                $"装備 {(career.equipProp >= 0 && career.equipProp < career.parts.Count ? CareerData.PartName(career.parts[career.equipProp]) : "ペラなし")}" +
                $" / {(career.equipTilt >= 0 && career.equipTilt < career.parts.Count ? CareerData.PartName(career.parts[career.equipTilt]) : "チルトなし")}",
                18, UiKit.TextDark, TextAnchor.UpperLeft,
                new Vector2(0.06f, 0.08f), new Vector2(0.68f, 0.76f), Vector2.zero, Vector2.zero, bold: true);

            // 右: 能力(ウマ娘風ランクチップ+バー)と練習
            var skill = UiKit.MakePanel(s.transform, UiKit.PanelWhite, 20,
                new Vector2(0.52f, 0.28f), new Vector2(0.95f, 0.83f), Vector2.zero, Vector2.zero);
            void StatRow(string label, float v, float y)
            {
                UiKit.MakeText(skill.transform, label, 16, UiKit.TextDark, TextAnchor.MiddleLeft,
                    new Vector2(0.06f, y), new Vector2(0.28f, y + 0.065f), Vector2.zero, Vector2.zero, bold: true);
                var (rk, rc) = RankOf(v);
                UiKit.MakeChip(skill.transform, rk, rc, Color.white, 17,
                    new Vector2(0.285f, y), new Vector2(0.365f, y + 0.065f), Vector2.zero, Vector2.zero);
                var barBg = UiKit.MakePanel(skill.transform, new Color(0.88f, 0.91f, 0.95f), 8,
                    new Vector2(0.385f, y + 0.008f), new Vector2(0.87f, y + 0.057f), Vector2.zero, Vector2.zero);
                var fill = UiKit.MakePanel(barBg.transform, rc, 8,
                    new Vector2(0.012f, 0.12f), new Vector2(Mathf.Clamp01(v) * 0.976f + 0.012f, 0.88f),
                    Vector2.zero, Vector2.zero);
                fill.GetComponent<Image>().raycastTarget = false;
                UiKit.MakeText(skill.transform, $"{v * 100f:F0}", 15, UiKit.TextDark, TextAnchor.MiddleRight,
                    new Vector2(0.875f, y), new Vector2(0.94f, y + 0.065f), Vector2.zero, Vector2.zero, bold: true);
            }
            StatRow("スタート", career.startSkill, 0.905f);
            StatRow("ターン", career.turnSkill, 0.830f);
            StatRow("スピード", career.speedSkill, 0.755f);
            StatRow("メンタル", career.mental, 0.680f);
            StatRow("整備力", career.mechanicSkill, 0.605f);
            UiKit.MakeText(skill.transform,
                $"整備: キャブ{career.maintCarb} 電装{career.maintElec} ギア{career.maintGear} / ペラ P{career.propPitch} D{career.propDia} B{career.propBal}",
                13, new Color(0.45f, 0.50f, 0.58f), TextAnchor.MiddleLeft,
                new Vector2(0.06f, 0.540f), new Vector2(0.94f, 0.595f), Vector2.zero, Vector2.zero);
            void Train(string label, int cost, System.Action apply, float y)
            {
                UiKit.MakeButton(skill.transform, $"{label} ({cost}万)", UiKit.Cyan, 16,
                    new Vector2(0.07f, y), new Vector2(0.93f, y + 0.082f), Vector2.zero, Vector2.zero,
                    () =>
                    {
                        if (career.money < cost) return;
                        career.money -= cost;
                        // 練習は疲労が溜まる(トレーニング施設Lvで軽減)
                        career.fatigue = Mathf.Min(100,
                            career.fatigue + Mathf.Max(6, 15 - 3 * career.facTraining));
                        apply();
                        // 練習イベント(ウマ娘のトレーニングイベント風・たまに発生)
                        bool fanEvent = new System.Random(System.Environment.TickCount ^ cost)
                            .NextDouble() < 0.22;
                        if (fanEvent) career.fans += 50;
                        career.Save();
                        ShowCareer();
                        if (fanEvent)
                            ShowDialog(new[]
                            {
                                ("マネージャー", "練習を見学に来てたファンが盛り上がってたぞ！ ファン+50人だ！"),
                            }, null);
                    });
            }
            Train("スタート練習 +3", 100, () => career.startSkill = Mathf.Min(0.95f, career.startSkill + 0.03f), 0.445f);
            Train("旋回練習 +3", 100, () => career.turnSkill = Mathf.Min(0.95f, career.turnSkill + 0.03f), 0.358f);
            Train("スピード練習 +3", 100, () => career.speedSkill = Mathf.Min(0.95f, career.speedSkill + 0.03f), 0.271f);
            Train("メンタル強化 +3", 80, () => career.mental = Mathf.Min(0.95f, career.mental + 0.03f), 0.184f);
            Train("整備研修 +3", 80, () => career.mechanicSkill = Mathf.Min(0.95f, career.mechanicSkill + 0.03f), 0.097f);
            UiKit.MakeButton(skill.transform, "休養する (無料・疲労回復)", new Color(0.10f, 0.62f, 0.35f), 16,
                new Vector2(0.07f, 0.01f), new Vector2(0.93f, 0.092f), Vector2.zero, Vector2.zero,
                () =>
                {
                    career.fatigue = 0;
                    career.Save();
                    ShowCareer();
                });

            string raceLabel = career.allClear ? "SG覇者として出走▶" : $"第{career.chapter}章に出走▶";
            UiKit.MakeButton(s.transform, "↩ ホーム", UiKit.Cyan, 17,
                new Vector2(0.02f, 0.11f), new Vector2(0.115f, 0.22f), Vector2.zero, Vector2.zero, ShowHome);
            UiKit.MakeButton(s.transform, "技強化", new Color(0.62f, 0.2f, 0.75f), 18,
                new Vector2(0.125f, 0.11f), new Vector2(0.235f, 0.22f), Vector2.zero, Vector2.zero,
                () => ShowMoveUpgradePopup(s.transform));
            UiKit.MakeButton(s.transform, "ガチャ", new Color(0.9f, 0.35f, 0.55f), 18,
                new Vector2(0.245f, 0.11f), new Vector2(0.35f, 0.22f), Vector2.zero, Vector2.zero,
                () => ShowGachaPopup(s.transform, ""));
            UiKit.MakeButton(s.transform, "ガレージ", new Color(0.35f, 0.42f, 0.55f), 18,
                new Vector2(0.36f, 0.11f), new Vector2(0.475f, 0.22f), Vector2.zero, Vector2.zero,
                () => ShowGaragePopup(s.transform));
            UiKit.MakeButton(s.transform, "施設", new Color(0.15f, 0.55f, 0.60f), 18,
                new Vector2(0.485f, 0.11f), new Vector2(0.585f, 0.22f), Vector2.zero, Vector2.zero,
                () => ShowFacilityPopup(s.transform));
            UiKit.MakeButton(s.transform, raceLabel, UiKit.Red, 26,
                new Vector2(0.595f, 0.10f), new Vector2(0.815f, 0.235f), Vector2.zero, Vector2.zero, StartCareerRace);
            UiKit.MakeButton(s.transform, "ショップ", new Color(0.9f, 0.55f, 0.1f), 18,
                new Vector2(0.825f, 0.11f), new Vector2(0.965f, 0.22f), Vector2.zero, Vector2.zero,
                () => ShowShopPopup(s.transform));

            if (!career.debutDone)
            {
                career.debutDone = true;
                career.Save();
                ShowDialog(CareerStory.Debut(career.racerName), null);
            }
        }

        /// <summary>ショップ(アイテム+万円⇄ベットコイン両替所)。</summary>
        void ShowShopPopup(Transform parent)
        {
            var pop = UiKit.MakePanel(parent, UiKit.PanelWhite, 22,
                new Vector2(0.22f, 0.10f), new Vector2(0.78f, 0.88f), Vector2.zero, Vector2.zero);
            int bc = PlayerPrefs.GetInt("br_betcoin", 1000);
            UiKit.MakeBanner(pop.transform, $"ショップ　{career.money:N0}万円 / {bc:N0}BC", 22,
                new Vector2(0.08f, 0.885f), new Vector2(0.92f, 0.985f));

            void Item(string label, string desc, int cost, string ownedLabel, bool canBuy,
                System.Action buy, float y, string btnLabel = null)
            {
                UiKit.MakeText(pop.transform, $"{label}　{ownedLabel}\n{desc}", 15, UiKit.TextDark,
                    TextAnchor.MiddleLeft,
                    new Vector2(0.05f, y), new Vector2(0.66f, y + 0.115f), Vector2.zero, Vector2.zero, bold: true);
                UiKit.MakeButton(pop.transform, canBuy ? (btnLabel ?? $"{cost}万で購入") : "－",
                    canBuy && career.money >= cost ? UiKit.Cyan : new Color(0.5f, 0.5f, 0.55f), 14,
                    new Vector2(0.68f, y + 0.008f), new Vector2(0.95f, y + 0.105f), Vector2.zero, Vector2.zero,
                    () =>
                    {
                        if (!canBuy || career.money < cost) return;
                        career.money -= cost;
                        buy();
                        career.Save();
                        Destroy(pop);
                        ShowShopPopup(parent);
                    });
            }
            Item("エナジードリンク", "次レースの初期SP+30(必殺技が早く使える)", 200, $"所持{career.itemDrink}",
                true, () => career.itemDrink++, 0.745f);
            Item("新品ペラ", "次レースのモーターを強化(出足・伸びUP)", 300, $"所持{career.itemProp}",
                true, () => career.itemProp++, 0.625f);
            Item("勝守り", "次レースのST安定＋メンタルUP", 150, $"所持{career.itemCharm}",
                true, () => career.itemCharm++, 0.505f);
            Item("専属整備士と契約", "ペラ調整の成功ゾーン拡大(人件費8万/レース)", 500,
                career.hasMechanic ? "契約済み" : "未契約",
                !career.hasMechanic, () => career.hasMechanic = true, 0.385f);
            // 両替所(万円⇄BC): 賞金で舟券を買い、払戻を資金に戻せる経済ループ
            Item("BC両替所", "100万円 → 500BC(舟券の軍資金に)", 100, $"残高{bc:N0}BC",
                true, () =>
                {
                    PlayerPrefs.SetInt("br_betcoin", PlayerPrefs.GetInt("br_betcoin", 1000) + 500);
                    PlayerPrefs.Save();
                }, 0.265f, "両替する");
            Item("BC換金所", "1000BC → 100万円(舟券の稼ぎを資金化)", 0, $"残高{bc:N0}BC",
                bc >= 1000, () =>
                {
                    PlayerPrefs.SetInt("br_betcoin", PlayerPrefs.GetInt("br_betcoin", 1000) - 1000);
                    PlayerPrefs.Save();
                    career.money += 100;
                }, 0.145f, "換金する");

            UiKit.MakeButton(pop.transform, "閉じる", UiKit.Navy, 18,
                new Vector2(0.36f, 0.015f), new Vector2(0.64f, 0.105f), Vector2.zero, Vector2.zero,
                () => Destroy(pop));
        }

        /// <summary>設備投資(シナリオ第10章): 4施設をLv3まで強化。維持費3万/Lv/レース。</summary>
        void ShowFacilityPopup(Transform parent)
        {
            var pop = UiKit.MakePanel(parent, UiKit.PanelWhite, 22,
                new Vector2(0.20f, 0.14f), new Vector2(0.80f, 0.86f), Vector2.zero, Vector2.zero);
            UiKit.MakeBanner(pop.transform, $"設備投資　所持金 {career.money:N0}万円", 24,
                new Vector2(0.10f, 0.88f), new Vector2(0.90f, 0.99f));
            UiKit.MakeText(pop.transform, "施設1Lvにつき維持費3万円/レースがかかる。投資は計画的に！",
                15, new Color(0.45f, 0.50f, 0.58f), TextAnchor.MiddleCenter,
                new Vector2(0.04f, 0.80f), new Vector2(0.96f, 0.865f), Vector2.zero, Vector2.zero, bold: true);

            void Fac(string name, string desc, int lv, System.Action up, float y)
            {
                UiKit.MakeText(pop.transform,
                    $"{name}　Lv{lv}{(lv >= 3 ? "(MAX)" : "")}\n{desc}", 17, UiKit.TextDark,
                    TextAnchor.MiddleLeft,
                    new Vector2(0.06f, y), new Vector2(0.64f, y + 0.14f), Vector2.zero, Vector2.zero, bold: true);
                int cost = (lv + 1) * 300;
                bool can = lv < 3 && career.money >= cost;
                UiKit.MakeButton(pop.transform, lv >= 3 ? "MAX" : $"{cost}万で強化",
                    can ? UiKit.Cyan : new Color(0.5f, 0.5f, 0.55f), 15,
                    new Vector2(0.66f, y + 0.02f), new Vector2(0.94f, y + 0.12f), Vector2.zero, Vector2.zero,
                    () =>
                    {
                        if (!can) return;
                        career.money -= cost;
                        up();
                        career.Save();
                        Destroy(pop);
                        ShowFacilityPopup(parent);
                    });
            }
            Fac("トレーニング施設", "練習の疲労蓄積を軽減(-3/Lv)", career.facTraining,
                () => career.facTraining++, 0.63f);
            Fac("シミュレーター", "レースの獲得XP+15%/Lv", career.facSim,
                () => career.facSim++, 0.47f);
            Fac("整備工場", "ペラ調整の成功ゾーンを拡大", career.facGarage,
                () => career.facGarage++, 0.31f);
            Fac("分析AI", "展開予想の的中ボーナス+10万/Lv", career.facAnalysis,
                () => career.facAnalysis++, 0.15f);

            UiKit.MakeButton(pop.transform, "閉じる", UiKit.Navy, 18,
                new Vector2(0.38f, 0.02f), new Vector2(0.62f, 0.11f), Vector2.zero, Vector2.zero,
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

            // 疲労(シナリオ第2章: 練習しすぎはミスの元)。60以上で体力2割減+メンタル低下
            if (career.fatigue >= 60)
            {
                race.playerSPInit *= 0.8f;
                stats.mental = Mathf.Max(0.20f, stats.mental - 0.12f);
            }
            // 故障中(ランダムイベント): 出足・伸びダウン
            if (career.tuneQuality == -1)
            {
                race.pAccelBonus -= 0.10f;
                race.pTopBonus -= 0.15f;
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

            // 対戦相手の配役: 序盤はライバル、章が進むほど実在モデルのレジェンド級が参戦
            // (〜3章:ライバルのみ / 4章〜:1人 / G3(6章)〜:3人 / SG(8章):5人)
            int legendCount = career.allClear ? 5
                : career.chapter >= 8 ? 5 : career.chapter >= 6 ? 3 : career.chapter >= 4 ? 1 : 0;
            var castLines = new List<(string, string)>();
            var usedRival = new List<int>();
            var usedLegend = new List<int>();
            int opp = 0;
            for (int i = 0; i < race.statsList.Count; i++)
            {
                if (i == race.playerBoatIndex) continue;
                if (opp < legendCount)
                {
                    int li = (career.chapter * 3 + opp * 5 + i) % LegendRacer.All.Length;
                    while (usedLegend.Contains(li)) li = (li + 1) % LegendRacer.All.Length;
                    usedLegend.Add(li);
                    var l = LegendRacer.All[li];
                    ApplyLegend(race.statsList[i], l);
                    castLines.Add((l.name, l.line));
                }
                else
                {
                    int rid = (career.chapter * 2 + i * 3) % Rivals.Length;
                    while (usedRival.Contains(rid)) rid = (rid + 1) % Rivals.Length;
                    usedRival.Add(rid);
                    race.statsList[i].player.playerName = Rivals[rid].name;
                    castLines.Add((Rivals[rid].name, Rivals[rid].line));
                }
                opp++;
            }

            // 天才選手イベント(仕様書⑪): 強化ライバルが1人参戦
            if (career.geniusPending == 1)
            {
                for (int i = 0; i < race.statsList.Count; i++)
                {
                    if (i == race.playerBoatIndex) continue;
                    var gp = race.statsList[i].player;
                    gp.playerName = "天才 " + gp.playerName;
                    gp.startSkill = Mathf.Min(0.97f, gp.startSkill + 0.18f);
                    gp.turnSkill = Mathf.Min(0.97f, gp.turnSkill + 0.15f);
                    gp.speedSkill = Mathf.Min(0.97f, gp.speedSkill + 0.15f);
                    break;
                }
                career.geniusPending = 0;
                career.Save();
            }

            // パドックの意気込み会話(レジェンドがいれば必ず口上に登場)→ 出走表へ
            if (castLines.Count >= 2)
            {
                ShowDialog(new[]
                {
                    castLines[0],
                    castLines[1],
                    (career.racerName, "……望むところだ。今日の1着は俺が獲る！"),
                }, ShowEntry);
            }
            else ShowEntry();
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
                new Vector2(0.145f, 0.72f), new Vector2(0.38f, 0.98f), Vector2.zero, Vector2.zero);
            dialogSpeaker = chip.GetComponentInChildren<Text>();
            dialogBody = UiKit.MakeText(panel.transform, "", 26, Color.white, TextAnchor.UpperLeft,
                new Vector2(0.155f, 0.10f), new Vector2(0.97f, 0.68f), Vector2.zero, Vector2.zero, bold: true);
            UiKit.MakeText(panel.transform, "▼ タップで進む", 18, new Color(1f, 1f, 1f, 0.6f), TextAnchor.LowerRight,
                new Vector2(0.6f, 0.02f), new Vector2(0.97f, 0.14f), Vector2.zero, Vector2.zero);
            dialogFaceHolder = new GameObject("FaceHolder");
            UiKit.Place(dialogFaceHolder, panel.transform,
                new Vector2(0.012f, 0.08f), new Vector2(0.135f, 0.96f), Vector2.zero, Vector2.zero);
            RenderDialogLine();
        }

        GameObject dialogFaceHolder;

        void RenderDialogLine()
        {
            dialogSpeaker.text = dialogLines[dialogIdx].Item1;
            dialogBody.text = dialogLines[dialogIdx].Item2;
            // 話者の立ち絵(AI生成顔→無ければアニメ顔)を差し替え
            if (dialogFaceHolder != null)
            {
                foreach (Transform c in dialogFaceHolder.transform) Destroy(c.gameObject);
                MakeFaceAt(dialogFaceHolder.transform, dialogLines[dialogIdx].Item1,
                    Vector2.zero, Vector2.one);
            }
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

            // AI予想(仕様書⑥): 総合スコア順に◎○▲△✕✕
            float[] aiScores = EntryScores();
            string[] aiMarks = AssignMarks(aiScores);
            UiKit.MakeButton(s.transform, "データ分析", new Color(0.20f, 0.55f, 0.85f), 18,
                new Vector2(0.855f, 0.915f), new Vector2(0.985f, 0.975f), Vector2.zero, Vector2.zero,
                () => ShowAnalysisPopup(s.transform, aiScores, aiMarks));

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
                var leg = LegendRacer.Find(st.player.playerName);
                UiKit.MakeText(ribbon.transform,
                    leg != null
                        ? $"{i + 1}号艇　{st.player.playerName}〈{leg.moniker}〉"
                        : $"{i + 1}号艇　{st.player.playerName}",
                    leg != null ? 22 : 25,
                    lightRibbon ? UiKit.Navy : Color.white, TextAnchor.MiddleLeft,
                    Vector2.zero, Vector2.one, new Vector2(16f, 0f), new Vector2(-8f, 0f),
                    bold: true, shadow: !lightRibbon);

                if (i == race.playerBoatIndex)
                    UiKit.MakeChip(card.transform, "YOU", UiKit.Red, Color.white, 20,
                        new Vector2(0.80f, 0.70f), new Vector2(0.97f, 0.94f), Vector2.zero, Vector2.zero);

                // AI予想印(◎が本命)
                UiKit.MakeChip(card.transform, aiMarks[i],
                    aiMarks[i] == "◎" ? UiKit.Yellow : Color.white,
                    aiMarks[i] == "◎" ? UiKit.Red : UiKit.Border, 22,
                    new Vector2(0.66f, 0.70f), new Vector2(0.78f, 0.94f), Vector2.zero, Vector2.zero);

                // 選手の顔(AI生成顔シート→無ければアニメ顔アバター)
                MakeFaceAt(card.transform, st.player.playerName,
                    new Vector2(0.815f, 0.05f), new Vector2(0.965f, 0.62f));

                // 艇のイラスト(Art/boats.pngがあれば表示)
                var boatArt = FaceArt.Boat(i);
                float infoW = 0.80f;
                if (boatArt != null)
                {
                    infoW = 0.575f;
                    var bGo = new GameObject("BoatArt");
                    UiKit.Place(bGo, card.transform, new Vector2(0.585f, 0.04f), new Vector2(0.805f, 0.62f),
                        Vector2.zero, Vector2.zero);
                    var bImg = bGo.AddComponent<Image>();
                    bImg.sprite = boatArt;
                    bImg.preserveAspect = true;
                    bImg.raycastTarget = false;
                }

                string entry = BoatRace.Start.WaitingSystem.IsSlowStart(bs.course) ? "スロー" : "ダッシュ";
                // 実際の出走表と同じ情報構成: 級別・勝率・進入・平均ST / モーター番号・2連対率・展示
                UiKit.MakeText(card.transform,
                    $"{st.player.rank}級　勝率 {WinRateOf(st.player):F2}　{bs.course}コース({entry})　ST .{Mathf.RoundToInt(st.player.reactionTimeMean * 100f):00}",
                    16, UiKit.TextDark, TextAnchor.MiddleLeft,
                    new Vector2(0f, 0.34f), new Vector2(infoW, 0.62f), new Vector2(18f, 0f), new Vector2(-4f, 0f));
                UiKit.MakeText(card.transform,
                    $"M{st.motor.motorNumber}号機〈{MotorGrade(st.motor.OverallScore)}〉2連率 {st.motor.winRate2:F0}%　展示 {bs.exhibitionTime:F2}",
                    16, UiKit.Cyan, TextAnchor.MiddleLeft,
                    new Vector2(0f, 0.06f), new Vector2(infoW, 0.32f), new Vector2(18f, 0f), new Vector2(-4f, 0f), bold: true);
            }

            // 展開予想(ストーリーモードのみ): 展開/2着/荒れ度を予想して的中ボーナス
            predictedKimarite = null;
            predictedSecond = -1;
            predictedRough = -1;
            predictionHit = false;
            predictionSummary = null;
            betType = 0; betFirst = -1; betSecond = -1; betThird = -1;
            betAmount = 0; betWon = false; betPayout = 0;
            if (race.playerBoatIndex >= 0)
            {
                // ストーリー: 予想+舟券+ペラ調整+モーターを1列に(舟券は全レースで買える)
                UiKit.MakeTag(s.transform, "予想・舟券", UiKit.Yellow, UiKit.Border, 15,
                    new Vector2(0.02f, 0.135f), new Vector2(0.155f, 0.18f));
                var predInfo = UiKit.MakeChip(s.transform, "未予想",
                    new Color(1f, 1f, 1f, 0.92f), UiKit.Border, 13,
                    new Vector2(0.315f, 0.13f), new Vector2(0.425f, 0.185f), Vector2.zero, Vector2.zero);
                UiKit.MakeButton(s.transform, "予想 ▶", new Color(0.20f, 0.55f, 0.85f), 16,
                    new Vector2(0.165f, 0.125f), new Vector2(0.31f, 0.19f), Vector2.zero, Vector2.zero,
                    () => ShowPredictPopup(s.transform, predInfo.GetComponentInChildren<Text>()));
                var betInfo = UiKit.MakeChip(s.transform,
                    $"BC {PlayerPrefs.GetInt("br_betcoin", 1000):N0}",
                    new Color(1f, 1f, 1f, 0.92f), UiKit.Border, 13,
                    new Vector2(0.575f, 0.13f), new Vector2(0.72f, 0.185f), Vector2.zero, Vector2.zero);
                UiKit.MakeButton(s.transform, "舟券 ▶", new Color(0.95f, 0.60f, 0.05f), 16,
                    new Vector2(0.43f, 0.125f), new Vector2(0.57f, 0.19f), Vector2.zero, Vector2.zero,
                    () => ShowBetPopup(s.transform, aiScores, null,
                        betInfo.GetComponentInChildren<Text>()));

                // 整備ミニゲーム(仕様書④): タイミング操作でペラ調整(1レース1回)
                bool tuned = career.tuneQuality != 0;
                var tuneBtn = UiKit.MakeButton(s.transform, tuned ? "整備済" : "ペラ調整",
                    tuned ? new Color(0.55f, 0.60f, 0.68f) : new Color(0.95f, 0.45f, 0.10f), 16,
                    new Vector2(0.725f, 0.125f), new Vector2(0.85f, 0.19f), Vector2.zero, Vector2.zero,
                    () => { });
                var tuneLabel = tuneBtn.GetComponentInChildren<Text>();
                tuneBtn.onClick.AddListener(() =>
                {
                    if (career.tuneQuality == 0) ShowTunePopup(s.transform, tuneLabel);
                });

                // モーター抽選結果(シナリオ第3章)
                var pm = race.statsList[race.playerBoatIndex].motor;
                string mGrade = pm.OverallScore >= 70f ? "エース機"
                    : pm.OverallScore >= 40f ? "中堅機" : "ワースト機";
                if (career.tuneQuality == -1) mGrade = "故障中";
                UiKit.MakeChip(s.transform, mGrade,
                    pm.OverallScore >= 70f ? UiKit.Yellow : new Color(1f, 1f, 1f, 0.92f),
                    UiKit.Border, 14,
                    new Vector2(0.855f, 0.13f), new Vector2(0.985f, 0.185f), Vector2.zero, Vector2.zero);
            }
            else
            {
                // 観戦レース: 舟券に集中できるレイアウト
                UiKit.MakeTag(s.transform, "舟券", UiKit.Yellow, UiKit.Border, 18,
                    new Vector2(0.02f, 0.135f), new Vector2(0.13f, 0.18f));
                var wallet = UiKit.MakeChip(s.transform, $"BC {PlayerPrefs.GetInt("br_betcoin", 1000):N0}",
                    new Color(1f, 1f, 1f, 0.92f), UiKit.Border, 17,
                    new Vector2(0.38f, 0.13f), new Vector2(0.56f, 0.185f), Vector2.zero, Vector2.zero);
                var betInfo = UiKit.MakeChip(s.transform, "未購入",
                    new Color(1f, 1f, 1f, 0.92f), UiKit.Border, 15,
                    new Vector2(0.57f, 0.13f), new Vector2(0.90f, 0.185f), Vector2.zero, Vector2.zero);
                UiKit.MakeButton(s.transform, "舟券を買う ▶", new Color(0.95f, 0.60f, 0.05f), 18,
                    new Vector2(0.14f, 0.125f), new Vector2(0.37f, 0.19f), Vector2.zero, Vector2.zero,
                    () => ShowBetPopup(s.transform, aiScores,
                        wallet.GetComponentInChildren<Text>(), betInfo.GetComponentInChildren<Text>()));
            }

            UiKit.MakeButton(s.transform, "レーススタート！", UiKit.Red, 38,
                new Vector2(0.30f, 0.02f), new Vector2(0.70f, 0.12f), Vector2.zero, Vector2.zero,
                () =>
                {
                    ClearScreen();
                    hud.SetVisible(true);
                    race.armed = true;
                    raceSpeed = 1f;
                    AudioKit.Bgm(false);
                    AudioKit.Crowd(0.22f); // 場内のざわめき
                });
            UiKit.MakeButton(s.transform, "↩ ホーム", UiKit.Cyan, 24,
                new Vector2(0.02f, 0.02f), new Vector2(0.16f, 0.10f), Vector2.zero, Vector2.zero, ShowHome);
        }

        // ================= データ分析・整備・舟券(仕様書④⑥⑨) =================

        /// <summary>全国勝率(出走表表示用)。スキルを実艇スケール(3.5〜8.0前後)へ換算。</summary>
        static float WinRateOf(BoatRace.Player.PlayerStats p) =>
            3.2f + (p.startSkill + p.turnSkill + p.speedSkill + p.mental) * 1.2f;

        /// <summary>AI総合スコア: ST+ターン+スピード+モーター+コース補正(仕様書②の合成式)。</summary>
        float[] EntryScores()
        {
            var sc = new float[6];
            for (int i = 0; i < 6; i++)
            {
                var st = race.statsList[i];
                var bs = race.state.Get(i);
                sc[i] = st.motor.OverallScore / 100f
                      + st.player.startSkill * 0.9f
                      + st.player.turnSkill * 0.7f
                      + st.player.speedSkill * 0.5f
                      + (6 - bs.course) * 0.14f * (0.5f + race.venue.insideAdvantage);
            }
            return sc;
        }

        /// <summary>スコア順位→予想印(◎○▲△✕✕)。</summary>
        static string[] AssignMarks(float[] scores)
        {
            var order = new List<int>();
            for (int i = 0; i < scores.Length; i++) order.Add(i);
            order.Sort((a, b) => scores[b].CompareTo(scores[a]));
            string[] symbols = { "◎", "○", "▲", "△", "✕", "✕" };
            var marks = new string[scores.Length];
            for (int r = 0; r < order.Count; r++) marks[order[r]] = symbols[Mathf.Min(r, 5)];
            return marks;
        }

        /// <summary>データ分析ポップアップ: コース・平均ST・モーター・AI予想(仕様書⑥)。</summary>
        void ShowAnalysisPopup(Transform parent, float[] scores, string[] marks)
        {
            var inner = UiKit.MakeCard(parent,
                new Vector2(0.16f, 0.14f), new Vector2(0.84f, 0.86f), Vector2.zero, Vector2.zero);
            var outer = inner.transform.parent.gameObject;
            UiKit.MakeTag(inner.transform, "データ分析　AI予想", UiKit.Yellow, UiKit.Border, 22,
                new Vector2(0.28f, 0.90f), new Vector2(0.72f, 0.99f));
            for (int i = 0; i < 6; i++)
            {
                var st = race.statsList[i];
                var bs = race.state.Get(i);
                float top = 0.86f - i * 0.105f;
                var sq = UiKit.MakePanel(inner.transform, UiKit.BoatColors[i], 6,
                    new Vector2(0.04f, top - 0.085f), new Vector2(0.085f, top), Vector2.zero, Vector2.zero);
                sq.GetComponent<Image>().raycastTarget = false;
                UiKit.MakeText(inner.transform,
                    $"{marks[i]}　{i + 1}号艇 {st.player.playerName}　{bs.course}コース　" +
                    $"平均ST .{Mathf.RoundToInt(st.player.reactionTimeMean * 100f):00}　" +
                    $"モーター{MotorGrade(st.motor.OverallScore)}({st.motor.OverallScore:F0})　" +
                    $"展示{bs.exhibitionTime:F2}",
                    19, marks[i] == "◎" ? new Color(0.80f, 0.20f, 0.10f) : UiKit.TextDark,
                    TextAnchor.MiddleLeft,
                    new Vector2(0.11f, top - 0.09f), new Vector2(0.97f, top), Vector2.zero, Vector2.zero,
                    bold: marks[i] == "◎");
            }
            // 会場特性(実場の傾向): 決まり手の出方と狙い目が変わる
            var vd = race.venue;
            UiKit.MakeText(inner.transform,
                $"〈{vd.Character}〉{vd.trait}",
                14, new Color(0.30f, 0.36f, 0.48f), TextAnchor.MiddleLeft,
                new Vector2(0.04f, 0.19f), new Vector2(0.96f, 0.255f), Vector2.zero, Vector2.zero, bold: true);
            int best = 0;
            for (int i = 1; i < 6; i++) if (scores[i] > scores[best]) best = i;
            UiKit.MakeText(inner.transform,
                $"AI予想: 本命は{best + 1}号艇。コース・モーター・ST・会場傾向を総合評価。",
                17, UiKit.Cyan, TextAnchor.MiddleCenter,
                new Vector2(0.04f, 0.135f), new Vector2(0.96f, 0.185f), Vector2.zero, Vector2.zero, bold: true);
            // コース別1着率(これまでの全レースの蓄積データ)
            int cn = PlayerPrefs.GetInt("br_cw_n", 0);
            string cw = "コース別1着率: ";
            for (int c = 1; c <= 6; c++)
                cw += $"{c}={(cn > 0 ? PlayerPrefs.GetInt($"br_cw_{c}", 0) * 100 / cn : 0)}% ";
            UiKit.MakeText(inner.transform, cw + $"(全{cn}R)", 15,
                new Color(0.45f, 0.50f, 0.58f), TextAnchor.MiddleCenter,
                new Vector2(0.02f, 0.075f), new Vector2(0.98f, 0.130f), Vector2.zero, Vector2.zero, bold: true);
            UiKit.MakeButton(inner.transform, "とじる", UiKit.Navy, 19,
                new Vector2(0.38f, 0.008f), new Vector2(0.62f, 0.068f), Vector2.zero, Vector2.zero,
                () => Destroy(outer));
        }

        /// <summary>整備ミニゲーム(仕様書④): 動くカーソルをゾーン内で止めてペラ調整。</summary>
        void ShowTunePopup(Transform parent, Text tuneLabel)
        {
            var inner = UiKit.MakeCard(parent,
                new Vector2(0.24f, 0.30f), new Vector2(0.76f, 0.72f), Vector2.zero, Vector2.zero);
            var outer = inner.transform.parent.gameObject;
            UiKit.MakeTag(inner.transform, "ペラ調整　タイミングでストップ！", UiKit.Yellow, UiKit.Border, 20,
                new Vector2(0.16f, 0.86f), new Vector2(0.84f, 0.98f));
            UiKit.MakeText(inner.transform,
                career.hasMechanic ? "専属整備士のサポートで成功ゾーン拡大中！" : "中央の黄色ゾーンで止めろ！",
                16, UiKit.TextDark, TextAnchor.MiddleCenter,
                new Vector2(0.04f, 0.70f), new Vector2(0.96f, 0.84f), Vector2.zero, Vector2.zero, bold: true);

            // バー+成功ゾーン+カーソル
            var bar = UiKit.MakePanel(inner.transform, new Color(0.85f, 0.89f, 0.95f), 10,
                new Vector2(0.08f, 0.42f), new Vector2(0.92f, 0.60f), Vector2.zero, Vector2.zero);
            float zone = 0.16f + (career.hasMechanic ? 0.12f : 0f) + career.mechanicSkill * 0.10f
                       + career.facGarage * 0.05f; // 整備工場Lvでさらに拡大
            var zoneGo = UiKit.MakePanel(bar.transform, UiKit.Yellow, 8,
                new Vector2(0.5f - zone * 0.5f, 0.08f), new Vector2(0.5f + zone * 0.5f, 0.92f),
                Vector2.zero, Vector2.zero);
            zoneGo.GetComponent<Image>().raycastTarget = false;
            var cursor = UiKit.MakePanel(bar.transform, UiKit.Red, 4,
                new Vector2(0f, -0.15f), new Vector2(0f, 1.15f), new Vector2(-4f, 0f), new Vector2(4f, 0f));
            cursor.GetComponent<Image>().raycastTarget = false;
            var cursorRt = cursor.GetComponent<RectTransform>();

            bool stopped = false;
            float t0 = Time.unscaledTime;
            var driver = outer.AddComponent<TuneDriver>();
            driver.tick = () =>
            {
                if (stopped) return;
                float u = Mathf.PingPong((Time.unscaledTime - t0) * 0.85f, 1f);
                cursorRt.anchorMin = new Vector2(u, -0.15f);
                cursorRt.anchorMax = new Vector2(u, 1.15f);
            };
            UiKit.MakeButton(inner.transform, "ストップ！", UiKit.Red, 26,
                new Vector2(0.30f, 0.06f), new Vector2(0.70f, 0.30f), Vector2.zero, Vector2.zero,
                () =>
                {
                    if (stopped) return;
                    stopped = true;
                    float u = cursorRt.anchorMin.x;
                    float d = Mathf.Abs(u - 0.5f);
                    int q = d <= zone * 0.175f ? 4 : d <= zone * 0.5f ? 3 : d <= zone * 1.1f ? 2 : 1;
                    // 成功度に応じて次レースの出足・伸びが変動(失敗はマイナス)
                    float ab = q == 4 ? 0.12f : q == 3 ? 0.07f : q == 2 ? 0.02f : -0.05f;
                    float tb = q == 4 ? 0.18f : q == 3 ? 0.10f : q == 2 ? 0.03f : -0.06f;
                    race.pAccelBonus += ab;
                    race.pTopBonus += tb;
                    career.tuneQuality = q;
                    career.Save();
                    string msg = q == 4 ? "パーフェクト！！ 出足も伸びも絶好調！"
                        : q == 3 ? "グッド！ 仕上がり良好！"
                        : q == 2 ? "まずまず。悪くない仕上がり。"
                        : "失敗…ペラが歪んだ。出足ダウン…";
                    if (tuneLabel != null) tuneLabel.text = "整備済み";
                    Destroy(outer);
                    ShowFlash(msg, q >= 3 ? new Color(0.95f, 0.60f, 0.05f) : new Color(0.45f, 0.50f, 0.62f));
                });
        }

        /// <summary>展開予想入力(仕様書①): 決まり手/2着/荒れ度を選択→的中で賞金ボーナス。</summary>
        void ShowPredictPopup(Transform parent, Text infoText)
        {
            var inner = UiKit.MakeCard(parent,
                new Vector2(0.20f, 0.08f), new Vector2(0.80f, 0.92f), Vector2.zero, Vector2.zero);
            var outer = inner.transform.parent.gameObject;
            UiKit.MakeTag(inner.transform, "展開予想", UiKit.Yellow, UiKit.Border, 22,
                new Vector2(0.34f, 0.915f), new Vector2(0.66f, 0.995f));

            int selK = -1, selS = -1, selR = -1;
            var lightBg = new Color(0.90f, 0.93f, 0.98f);
            string[] kimas = { "逃げ", "まくり", "差し" };
            string[] roughs = { "堅い(〜30倍)", "普通", "波乱(100倍〜)" };

            UiKit.MakeText(inner.transform, "1着の決まり手", 17, UiKit.Border, TextAnchor.MiddleLeft,
                new Vector2(0.05f, 0.845f), new Vector2(0.60f, 0.905f), Vector2.zero, Vector2.zero, bold: true);
            var kImgs = new Image[3];
            for (int p = 0; p < 3; p++)
            {
                int pi = p;
                var pb = UiKit.MakePanel(inner.transform, lightBg, 10,
                    new Vector2(0.05f + p * 0.31f, 0.755f), new Vector2(0.33f + p * 0.31f, 0.845f),
                    Vector2.zero, Vector2.zero);
                kImgs[p] = pb.GetComponent<Image>();
                UiKit.MakeText(pb.transform, kimas[p], 18, UiKit.Border, TextAnchor.MiddleCenter,
                    Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero, bold: true);
                pb.AddComponent<Button>().onClick.AddListener(() =>
                {
                    selK = selK == pi ? -1 : pi;
                    for (int q = 0; q < 3; q++) kImgs[q].color = q == selK ? UiKit.Yellow : lightBg;
                });
            }

            UiKit.MakeText(inner.transform, "2着の艇", 17, UiKit.Border, TextAnchor.MiddleLeft,
                new Vector2(0.05f, 0.665f), new Vector2(0.60f, 0.725f), Vector2.zero, Vector2.zero, bold: true);
            var sImgs = new Image[6];
            for (int b = 0; b < 6; b++)
            {
                int bb = b;
                var pb = UiKit.MakePanel(inner.transform, lightBg, 10,
                    new Vector2(0.05f + b * 0.152f, 0.565f), new Vector2(0.185f + b * 0.152f, 0.665f),
                    Vector2.zero, Vector2.zero);
                sImgs[b] = pb.GetComponent<Image>();
                UiKit.MakeText(pb.transform, $"{b + 1}", 21, UiKit.Border, TextAnchor.MiddleCenter,
                    Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero, bold: true);
                pb.AddComponent<Button>().onClick.AddListener(() =>
                {
                    selS = selS == bb ? -1 : bb;
                    for (int q = 0; q < 6; q++) sImgs[q].color = q == selS ? UiKit.Yellow : lightBg;
                });
            }

            UiKit.MakeText(inner.transform, "荒れ度(3連単の払戻)", 17, UiKit.Border, TextAnchor.MiddleLeft,
                new Vector2(0.05f, 0.475f), new Vector2(0.70f, 0.535f), Vector2.zero, Vector2.zero, bold: true);
            var rImgs = new Image[3];
            for (int p = 0; p < 3; p++)
            {
                int pi = p;
                var pb = UiKit.MakePanel(inner.transform, lightBg, 10,
                    new Vector2(0.05f + p * 0.31f, 0.375f), new Vector2(0.33f + p * 0.31f, 0.475f),
                    Vector2.zero, Vector2.zero);
                rImgs[p] = pb.GetComponent<Image>();
                UiKit.MakeText(pb.transform, roughs[p], 15, UiKit.Border, TextAnchor.MiddleCenter,
                    Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero, bold: true);
                pb.AddComponent<Button>().onClick.AddListener(() =>
                {
                    selR = selR == pi ? -1 : pi;
                    for (int q = 0; q < 3; q++) rImgs[q].color = q == selR ? UiKit.Yellow : lightBg;
                });
            }

            UiKit.MakeText(inner.transform,
                "的中ごとにボーナス！ 展開+2着+荒れ度の全的中を狙え！", 15, UiKit.Cyan,
                TextAnchor.MiddleCenter,
                new Vector2(0.04f, 0.27f), new Vector2(0.96f, 0.34f), Vector2.zero, Vector2.zero, bold: true);
            UiKit.MakeButton(inner.transform, "決定！", UiKit.Red, 22,
                new Vector2(0.55f, 0.06f), new Vector2(0.82f, 0.19f), Vector2.zero, Vector2.zero,
                () =>
                {
                    predictedKimarite = selK >= 0 ? kimas[selK] : null;
                    predictedSecond = selS;
                    predictedRough = selR;
                    if (infoText != null)
                    {
                        string t = "";
                        if (selK >= 0) t += kimas[selK] + " ";
                        if (selS >= 0) t += $"2着{selS + 1} ";
                        if (selR >= 0) t += new[] { "堅", "普", "荒" }[selR];
                        infoText.text = t == "" ? "未予想" : t.Trim();
                    }
                    Destroy(outer);
                });
            UiKit.MakeButton(inner.transform, "やめる", UiKit.Navy, 18,
                new Vector2(0.18f, 0.06f), new Vector2(0.42f, 0.19f), Vector2.zero, Vector2.zero,
                () => Destroy(outer));
        }

        /// <summary>舟券購入(仕様書⑨): 2連単/3連単・オッズは実力スコアの確率ベース。</summary>
        void ShowBetPopup(Transform parent, float[] scores, Text walletText, Text infoText)
        {
            var inner = UiKit.MakeCard(parent,
                new Vector2(0.16f, 0.06f), new Vector2(0.84f, 0.94f), Vector2.zero, Vector2.zero);
            var outer = inner.transform.parent.gameObject;
            UiKit.MakeTag(inner.transform, "舟券購入", UiKit.Yellow, UiKit.Border, 22,
                new Vector2(0.36f, 0.925f), new Vector2(0.64f, 0.995f));

            int mode = 0; // 0=2連単 1=3連単
            int selFirst = -1, selSecond = -1, selThird = -1, amount = 100;
            var lightBg = new Color(0.90f, 0.93f, 0.98f);

            float Sum() { float s = 0f; foreach (var v in scores) s += v; return s; }
            float OddsNow()
            {
                float sum = Sum();
                float p1 = scores[selFirst] / sum;
                float p2 = scores[selSecond] / (sum - scores[selFirst]);
                if (mode == 0)
                    return Mathf.Clamp(Mathf.Round(0.80f / Mathf.Max(0.002f, p1 * p2) * 10f) / 10f, 1.2f, 300f);
                float p3 = scores[selThird] / (sum - scores[selFirst] - scores[selSecond]);
                return Mathf.Clamp(Mathf.Round(0.75f / Mathf.Max(0.0004f, p1 * p2 * p3) * 10f) / 10f, 2f, 9999f);
            }
            bool Complete() => selFirst >= 0 && selSecond >= 0 && (mode == 0 || selThird >= 0);

            var oddsText = UiKit.MakeText(inner.transform, "", 21, UiKit.Border, TextAnchor.MiddleCenter,
                new Vector2(0.04f, 0.275f), new Vector2(0.96f, 0.35f), Vector2.zero, Vector2.zero, bold: true);

            var rowImgs = new Image[3][];
            GameObject thirdRow = null;
            var tabImgs = new Image[2];

            void RepaintRows()
            {
                for (int r = 0; r < 3; r++)
                    for (int b = 0; b < 6; b++)
                        if (rowImgs[r] != null && rowImgs[r][b] != null)
                            rowImgs[r][b].color =
                                (r == 0 && b == selFirst) || (r == 1 && b == selSecond) || (r == 2 && b == selThird)
                                    ? UiKit.Yellow : lightBg;
            }
            void Refresh()
            {
                string kind = mode == 0 ? "2連単" : "3連単";
                if (Complete())
                {
                    string num = mode == 0 ? $"{selFirst + 1}-{selSecond + 1}"
                        : $"{selFirst + 1}-{selSecond + 1}-{selThird + 1}";
                    oddsText.text = $"{kind} {num}　オッズ {OddsNow():F1}倍　賭け金 {amount}BC";
                }
                else oddsText.text = $"{kind}: 着順を選択　賭け金 {amount}BC";
            }

            // 券種タブ
            for (int m = 0; m < 2; m++)
            {
                int mm = m;
                var tb = UiKit.MakePanel(inner.transform, m == 0 ? UiKit.Yellow : lightBg, 10,
                    new Vector2(0.05f + m * 0.20f, 0.845f), new Vector2(0.23f + m * 0.20f, 0.915f),
                    Vector2.zero, Vector2.zero);
                tabImgs[m] = tb.GetComponent<Image>();
                UiKit.MakeText(tb.transform, m == 0 ? "2連単" : "3連単", 17, UiKit.Border,
                    TextAnchor.MiddleCenter, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero, bold: true);
                tb.AddComponent<Button>().onClick.AddListener(() =>
                {
                    mode = mm;
                    tabImgs[0].color = mode == 0 ? UiKit.Yellow : lightBg;
                    tabImgs[1].color = mode == 1 ? UiKit.Yellow : lightBg;
                    if (thirdRow != null) thirdRow.SetActive(mode == 1);
                    Refresh();
                });
            }

            string[] rowLabels = { "1着", "2着", "3着" };
            for (int row = 0; row < 3; row++)
            {
                var rowGo = new GameObject("Row" + row);
                UiKit.Place(rowGo, inner.transform,
                    new Vector2(0f, 0.685f - row * 0.145f), new Vector2(1f, 0.83f - row * 0.145f),
                    Vector2.zero, Vector2.zero);
                if (row == 2) { thirdRow = rowGo; rowGo.SetActive(false); }
                rowImgs[row] = new Image[6];
                UiKit.MakeText(rowGo.transform, rowLabels[row], 19, UiKit.Border, TextAnchor.MiddleLeft,
                    new Vector2(0.05f, 0f), new Vector2(0.14f, 1f), Vector2.zero, Vector2.zero, bold: true);
                for (int b = 0; b < 6; b++)
                {
                    int rb = row, bb = b;
                    var pb = UiKit.MakePanel(rowGo.transform, lightBg, 10,
                        new Vector2(0.15f + b * 0.135f, 0.06f), new Vector2(0.275f + b * 0.135f, 0.94f),
                        Vector2.zero, Vector2.zero);
                    rowImgs[row][b] = pb.GetComponent<Image>();
                    UiKit.MakeText(pb.transform, $"{b + 1}", 21, UiKit.Border, TextAnchor.MiddleCenter,
                        Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero, bold: true);
                    pb.AddComponent<Button>().onClick.AddListener(() =>
                    {
                        if (rb == 0) selFirst = bb;
                        else if (rb == 1) selSecond = bb;
                        else selThird = bb;
                        // 同じ艇の重複選択を解除
                        if (rb != 0 && selFirst == bb) selFirst = -1;
                        if (rb != 1 && selSecond == bb) selSecond = -1;
                        if (rb != 2 && selThird == bb) selThird = -1;
                        RepaintRows();
                        Refresh();
                    });
                }
            }

            int[] amounts = { 100, 300, 500 };
            for (int a = 0; a < 3; a++)
            {
                int aa = amounts[a];
                UiKit.MakeButton(inner.transform, $"{aa}BC", UiKit.Cyan, 16,
                    new Vector2(0.05f + a * 0.165f, 0.15f), new Vector2(0.20f + a * 0.165f, 0.245f),
                    Vector2.zero, Vector2.zero,
                    () => { amount = aa; Refresh(); });
            }
            UiKit.MakeButton(inner.transform, "購入！", UiKit.Red, 21,
                new Vector2(0.72f, 0.15f), new Vector2(0.94f, 0.245f), Vector2.zero, Vector2.zero,
                () =>
                {
                    if (!Complete()) return;
                    int coins = PlayerPrefs.GetInt("br_betcoin", 1000);
                    if (coins < amount) { oddsText.text = "ベットコインが足りない！"; return; }
                    coins -= amount;
                    PlayerPrefs.SetInt("br_betcoin", coins);
                    PlayerPrefs.Save();
                    betType = mode;
                    betFirst = selFirst; betSecond = selSecond; betThird = mode == 1 ? selThird : -1;
                    betAmount = amount; betOdds = OddsNow();
                    if (walletText != null) walletText.text = $"BC {coins:N0}";
                    if (infoText != null)
                    {
                        string num = mode == 0 ? $"{betFirst + 1}-{betSecond + 1}"
                            : $"{betFirst + 1}-{betSecond + 1}-{betThird + 1}";
                        infoText.text = $"購入: {num} × {betAmount}BC ({betOdds:F1}倍)";
                    }
                    Destroy(outer);
                });
            UiKit.MakeButton(inner.transform, "やめる", UiKit.Navy, 17,
                new Vector2(0.04f, 0.03f), new Vector2(0.24f, 0.12f), Vector2.zero, Vector2.zero,
                () => Destroy(outer));
            Refresh();
        }

        // ================= 結果 =================
        void ShowResult()
        {
            hud.SetVisible(false);
            AudioKit.Crowd(0.06f);
            AudioKit.Bgm(true);
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
                new Vector2(0.16f, 0.315f), new Vector2(0.84f, 0.87f), Vector2.zero, Vector2.zero);

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
                UiKit.MakeText(s.transform, $"3連単 {a + 1}-{b + 1}-{c + 1}　払戻 ¥{payout:N0}", 28, UiKit.Yellow,
                    TextAnchor.MiddleCenter, new Vector2(0f, 0.25f), new Vector2(1f, 0.31f),
                    Vector2.zero, Vector2.zero, bold: true, shadow: true);
            }

            // ストーリーモード: 自分の成績と賞金
            bool careerRace = race.playerBoatIndex >= 0;
            if (careerRace)
            {
                string res = lastCareerPlace >= 1 ? $"{lastCareerPlace}着" : "F/L 返還";
                string prz = lastCareerPrize > 0 ? $"賞金 +{lastCareerPrize}万円" : "賞金なし";
                UiKit.MakeText(s.transform,
                    $"あなた({career.racerName})　{res}　{prz}　通算 {career.wins}勝",
                    24, Color.white, TextAnchor.MiddleCenter,
                    new Vector2(0f, 0.20f), new Vector2(1f, 0.25f), Vector2.zero, Vector2.zero,
                    bold: true, shadow: true, outline: true);
                if (predictionSummary != null)
                {
                    UiKit.MakeText(s.transform, predictionSummary, 20,
                        predictionBonus > 0 ? UiKit.Yellow : new Color(0.8f, 0.85f, 0.95f),
                        TextAnchor.MiddleCenter,
                        new Vector2(0f, 0.16f), new Vector2(1f, 0.20f), Vector2.zero, Vector2.zero,
                        bold: true, shadow: true);
                }
            }
            if (betAmount > 0)
            {
                // 舟券の精算結果(2連単/3連単。ボタンと重ならない帯に出す)
                string num = betType == 0 ? $"{betFirst + 1}-{betSecond + 1}"
                    : $"{betFirst + 1}-{betSecond + 1}-{betThird + 1}";
                string kind = betType == 0 ? "2連単" : "3連単";
                string bRes = betWon
                    ? $"舟券的中！！ {kind} {num}　払戻 +{betPayout:N0} BC"
                    : $"舟券はずれ… ({kind} {num} × {betAmount}BC)　残高 {PlayerPrefs.GetInt("br_betcoin", 1000):N0} BC";
                float by0 = careerRace ? 0.12f : 0.18f;
                float by1 = careerRace ? 0.16f : 0.23f;
                UiKit.MakeText(s.transform, bRes, 20,
                    betWon ? UiKit.Yellow : new Color(0.8f, 0.85f, 0.95f), TextAnchor.MiddleCenter,
                    new Vector2(0f, by0), new Vector2(1f, by1), Vector2.zero, Vector2.zero,
                    bold: true, shadow: true, outline: true);
            }

            // ボタン列は最下段に分離(テキストと重ならない)
            UiKit.MakeButton(s.transform, "▶ リプレイ", UiKit.Cyan, 26,
                new Vector2(0.16f, 0.015f), new Vector2(0.38f, 0.105f), Vector2.zero, Vector2.zero,
                () => { ClearScreen(); replay.StartPlayback(); });
            if (careerRace)
            {
                UiKit.MakeButton(s.transform, "★ ストーリーへ", new Color(0.62f, 0.2f, 0.75f), 24,
                    new Vector2(0.40f, 0.015f), new Vector2(0.60f, 0.105f), Vector2.zero, Vector2.zero, ShowCareer);
            }
            else
            {
                UiKit.MakeButton(s.transform, "もう一度", UiKit.Red, 26,
                    new Vector2(0.40f, 0.015f), new Vector2(0.60f, 0.105f), Vector2.zero, Vector2.zero,
                    () => { race.seed = System.Environment.TickCount; race.SetupRace(); ShowEntry(); });
            }
            UiKit.MakeButton(s.transform, "ホームへ", UiKit.Yellow, 26,
                new Vector2(0.62f, 0.015f), new Vector2(0.84f, 0.105f), Vector2.zero, Vector2.zero,
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
            // コース別1着データの蓄積(仕様書⑥のデータ分析用)
            if (valid.Count > 0)
            {
                int wc = race.state.Get(valid[0]).course;
                PlayerPrefs.SetInt($"br_cw_{wc}", PlayerPrefs.GetInt($"br_cw_{wc}", 0) + 1);
                PlayerPrefs.SetInt("br_cw_n", PlayerPrefs.GetInt("br_cw_n", 0) + 1);
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

                // 展開予想の採点(展開/2着/荒れ度の各的中で賞金ボーナス。分析AI施設で増額)
                predictionBonus = 0;
                predictionHit = false;
                predictionSummary = null;
                if ((predictedKimarite != null || predictedSecond >= 0 || predictedRough >= 0)
                    && valid.Count > 0)
                {
                    string sum = "";
                    if (predictedKimarite != null && !string.IsNullOrEmpty(race.kimarite))
                    {
                        bool h = race.kimarite.Contains(predictedKimarite);
                        if (h) predictionBonus += 20 + career.chapter * 10;
                        predictionHit |= h;
                        sum += $"展開{(h ? "○" : "×")} ";
                    }
                    if (predictedSecond >= 0)
                    {
                        bool h = valid.Count >= 2 && valid[1] == predictedSecond;
                        if (h) predictionBonus += 30 + career.chapter * 10;
                        predictionHit |= h;
                        sum += $"2着{(h ? "○" : "×")} ";
                    }
                    if (predictedRough >= 0 && valid.Count >= 3)
                    {
                        int pay = ComputePayout(valid[0], valid[1], valid[2]);
                        int cls = pay < 3000 ? 0 : pay < 10000 ? 1 : 2;
                        bool h = cls == predictedRough;
                        if (h) predictionBonus += 20;
                        predictionHit |= h;
                        sum += $"荒れ度{(h ? "○" : "×")}";
                    }
                    if (predictionHit && career.facAnalysis > 0)
                        predictionBonus += career.facAnalysis * 10;
                    career.money += predictionBonus;
                    predictionSummary = predictionBonus > 0
                        ? $"展開予想 {sum.Trim()}　ボーナス +{predictionBonus}万円"
                        : $"展開予想 {sum.Trim()}　残念…";
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
                xpGain = Mathf.RoundToInt(xpGain * (1f + 0.15f * career.facSim)); // シミュレーター施設
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

                // 優勝インタビュー(ウマ娘のウイニング演出風)
                if (lastCareerPlace == 1)
                {
                    AppendStory(("インタビュアー",
                        $"優勝インタビューです！ {career.racerName}選手、見事な{race.kimarite}でした！"));
                    AppendStory((career.racerName,
                        "応援ありがとうございます！！ 次のレースも、全力で1着を獲りにいきます！"));
                }
                // モーター整備・ペラ調整は1節(1レース)限りで消費
                career.maintCarb = career.maintElec = career.maintGear = 0;
                career.tuneQuality = 0;

                // ---- 経営決算(仕様書⑦): 収入=賞金+スポンサー / 支出=整備費+人件費 ----
                career.fatigue = Mathf.Min(100, career.fatigue + 8);
                int sponsorIn = career.SponsorIncome;
                int expense = career.RaceExpense;
                career.money += sponsorIn - expense;

                // ファン数(勝つほど増える。事故は激減)
                int fanDelta = lastCareerPlace == 1 ? 150 + career.chapter * 30
                    : lastCareerPlace >= 1 && lastCareerPlace <= 3 ? 50
                    : lastCareerPlace >= 4 ? 10 : -100;
                career.fans = Mathf.Max(0, career.fans + fanDelta);

                // スポンサー契約(条件達成で自動オファー→契約)
                for (int sp = 0; sp < CareerData.SponsorDefs.Length; sp++)
                {
                    if (career.sponsorIds.Contains(sp) || !career.SponsorUnlocked(sp)) continue;
                    career.sponsorIds.Add(sp);
                    var def = CareerData.SponsorDefs[sp];
                    AppendStory(("マネージャー",
                        $"『{def.name}』とスポンサー契約成立！！ 条件「{def.cond}」達成で毎レース+{def.income}万円だ！"));
                }

                // ランダムイベント(仕様書⑪): 故障/ファンイベント/天才選手出現
                var evRng = new System.Random(System.Environment.TickCount ^ career.races);
                double roll = evRng.NextDouble();
                if (roll < 0.08)
                {
                    career.tuneQuality = -1;
                    AppendStory(("整備士", "まずい、モーターに異音が…故障だ！ 次のレースは出足が落ちる。ペラ調整でカバーしろ！"));
                }
                else if (roll < 0.16)
                {
                    career.fans += 200;
                    career.money = Mathf.Max(0, career.money - 10);
                    AppendStory(("マネージャー", "ファンイベント開催！ 参加費10万円かかったが、ファンが200人増えたぞ！"));
                }
                else if (roll < 0.24 && career.geniusPending == 0)
                {
                    career.geniusPending = 1;
                    AppendStory(("記者", "速報だ！ 噂の天才ルーキーが次のレースに参戦するらしい！ 全能力が桁違いだ、要注意！！"));
                }

                // シーズン集計(12レース=1シーズン。終了時にランキングと称号)
                career.seasonRaces++;
                if (lastCareerPlace == 1) career.seasonWins++;
                career.seasonPrize += lastCareerPrize + predictionBonus;
                if (career.seasonRaces >= 12)
                {
                    var sRng = new System.Random(1000 + career.seasonNo);
                    int better = 0;
                    for (int ri = 0; ri < Rivals.Length; ri++)
                        if (400 + sRng.Next(0, 2200) + career.seasonNo * 60 > career.seasonPrize) better++;
                    int rank = better + 1;
                    AppendStory(("記者",
                        $"第{career.seasonNo}シーズン終了！ 全12戦 {career.seasonWins}勝・獲得賞金{career.seasonPrize:N0}万円！"));
                    AppendStory(("記者", $"シーズン賞金ランキングは 9人中 {rank}位 だ！"));
                    string title = rank == 1 ? $"S{career.seasonNo}賞金王"
                        : career.seasonWins >= 5 ? $"S{career.seasonNo}多勝利"
                        : rank <= 3 ? $"S{career.seasonNo}表彰台" : null;
                    if (title != null)
                    {
                        career.titles.Add(title);
                        AppendStory(("システム", $"称号『{title}』を獲得！！"));
                    }
                    career.seasonNo++;
                    career.seasonRaces = 0;
                    career.seasonWins = 0;
                    career.seasonPrize = 0;
                }

                // 破産(仕様書⑦): 資金マイナスでゲームオーバー→再起
                if (career.money < 0)
                {
                    career.money = 50;
                    career.fans = Mathf.Max(100, career.fans / 2);
                    career.condition = 1;
                    career.sponsorIds.Clear();
                    AppendStory(("記者", "資金がマイナスに…破産だ！！ スポンサーは全て離れ、ファンも激減…"));
                    AppendStory(("マネージャー", "…だが再起のチャンスはある。手元の50万円からやり直しだ。"));
                }
                career.Save();
            }
            // 舟券精算(ストーリー/観戦どちらでも。仕様書⑨: 2連単/3連単)
            if (betAmount > 0)
            {
                betWon = betType == 0
                    ? valid.Count >= 2 && valid[0] == betFirst && valid[1] == betSecond
                    : valid.Count >= 3 && valid[0] == betFirst && valid[1] == betSecond && valid[2] == betThird;
                betPayout = betWon ? Mathf.RoundToInt(betAmount * betOdds) : 0;
                if (betWon)
                {
                    int coins = PlayerPrefs.GetInt("br_betcoin", 1000) + betPayout;
                    PlayerPrefs.SetInt("br_betcoin", coins);
                }
            }
            // 救済: BCが尽きても常に賭けられるよう場から補填(最低300BC保証)
            if (PlayerPrefs.GetInt("br_betcoin", 1000) < 300)
                PlayerPrefs.SetInt("br_betcoin", 300);
            PlayerPrefs.Save();
        }

        /// <summary>結果画面のストーリー会話に1行追加。</summary>
        void AppendStory((string, string) line)
        {
            if (pendingStory == null) { pendingStory = new[] { line }; return; }
            var e = new (string, string)[pendingStory.Length + 1];
            pendingStory.CopyTo(e, 0);
            e[e.Length - 1] = line;
            pendingStory = e;
        }

        int ComputePayout(int first, int second, int third)
        {
            var f = race.state.Get(first);
            float odds = 6f + (f.course - 1) * 14f
                       + Mathf.Abs(race.state.Get(second).course - f.course) * 6f
                       + race.state.Get(third).course * 3f;
            var rng = new System.Random(race.seed);
            odds *= 0.7f + (float)rng.NextDouble() * 1.4f;
            return Mathf.Max(500, Mathf.RoundToInt(odds) * 100); // 最低払戻500円(0円表示を防ぐ)
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

    /// <summary>整備ミニゲームのカーソル駆動(毎フレームtickを呼ぶだけの小型ドライバ)。</summary>
    public class TuneDriver : MonoBehaviour
    {
        public System.Action tick;
        void Update() => tick?.Invoke();
    }
}
