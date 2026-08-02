using UnityEngine;
using UnityEngine.UI;
using BoatRace.Core;
using BoatRace.AI;
using BoatRace.Commentary;

namespace BoatRace.UI
{
    /// <summary>
    /// レース中HUD(uGUI)。大時計・順位表・実況テロップをスマホゲー風に表示。
    /// </summary>
    public class RaceHudUI
    {
        readonly RaceManager race;
        readonly GameObject root;
        readonly Text headerText;
        readonly Text clockText;
        readonly Text windArrow;
        readonly RectTransform windArrowRT;
        readonly Text centerText;   // カウントダウン/スタート表示
        readonly Text hintText;     // プレイヤー操作ガイド
        readonly Text viewLabel;    // 視点表示(Cキー切替と連動)
        readonly RaceCamera raceCam;
        readonly Text[] standingRows = new Text[6];
        readonly Image[] rowChips = new Image[6];
        readonly Text commentaryText;

        public RaceHudUI(RaceManager race, CommentarySystem commentary, Transform canvas, RaceCamera raceCam)
        {
            this.race = race;
            root = new GameObject("RaceHUD");
            UiKit.Place(root, canvas, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);

            // 上部バー: 場名・フェーズ・大時計
            var top = UiKit.MakePanel(root.transform, new Color(0.05f, 0.12f, 0.3f, 0.85f), 16,
                new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(16f, -96f), new Vector2(470f, -14f));
            UiKit.AddStripeOverlay(top, Color.white, 0.05f);
            headerText = UiKit.MakeText(top.transform, "", 22, Color.white, TextAnchor.MiddleLeft,
                Vector2.zero, Vector2.one, new Vector2(16f, 40f), new Vector2(-64f, -4f), bold: true);
            clockText = UiKit.MakeText(top.transform, "", 26, UiKit.Yellow, TextAnchor.MiddleLeft,
                Vector2.zero, Vector2.one, new Vector2(16f, 2f), new Vector2(-10f, -44f), bold: true);

            // 風向き矢印(コース座標: 右=1マーク方向, 上=バック側)
            windArrow = UiKit.MakeText(top.transform, "➤", 30, UiKit.Yellow, TextAnchor.MiddleCenter,
                new Vector2(1f, 1f), new Vector2(1f, 1f), new Vector2(-54f, -44f), new Vector2(-12f, -6f), bold: true);
            windArrowRT = windArrow.GetComponent<RectTransform>();

            // 右側: 順位表
            var board = UiKit.MakePanel(root.transform, new Color(0.05f, 0.12f, 0.3f, 0.85f), 16,
                new Vector2(1f, 1f), new Vector2(1f, 1f), new Vector2(-450f, -370f), new Vector2(-14f, -14f));
            UiKit.AddStripeOverlay(board, Color.white, 0.04f);
            UiKit.MakeText(board.transform, "レース順位", 22, UiKit.Sky, TextAnchor.MiddleLeft,
                new Vector2(0f, 1f), new Vector2(1f, 1f), new Vector2(16f, -44f), new Vector2(-10f, -8f), bold: true);
            for (int i = 0; i < 6; i++)
            {
                float y = -52f - i * 48f;
                var chipGo = new GameObject("Chip");
                UiKit.Place(chipGo, board.transform, new Vector2(0f, 1f), new Vector2(0f, 1f),
                    new Vector2(14f, y - 40f), new Vector2(52f, y - 6f));
                rowChips[i] = chipGo.AddComponent<Image>();
                rowChips[i].sprite = UiKit.Rounded(10);
                rowChips[i].type = Image.Type.Sliced;
                standingRows[i] = UiKit.MakeText(board.transform, "", 21, Color.white, TextAnchor.MiddleLeft,
                    new Vector2(0f, 1f), new Vector2(1f, 1f), new Vector2(62f, y - 42f), new Vector2(-8f, -4f + y - 42f + 38f));
            }

            // 下部: 実況テロップ
            var ticker = UiKit.MakePanel(root.transform, new Color(0.05f, 0.12f, 0.3f, 0.85f), 16,
                new Vector2(0f, 0f), new Vector2(1f, 0f), new Vector2(16f, 14f), new Vector2(-16f, 108f));
            commentaryText = UiKit.MakeText(ticker.transform, "", 22, Color.white, TextAnchor.MiddleLeft,
                Vector2.zero, Vector2.one, new Vector2(18f, 6f), new Vector2(-14f, -6f));
            commentary.OnLine += _ => RefreshCommentary(commentary);
            RefreshCommentary(commentary);

            // 中央のカウントダウン/スタート表示
            centerText = UiKit.MakeText(root.transform, "", 130, UiKit.Yellow, TextAnchor.MiddleCenter,
                new Vector2(0.2f, 0.45f), new Vector2(0.8f, 0.75f), Vector2.zero, Vector2.zero,
                bold: true, shadow: true, outline: true);

            // プレイヤー操作ガイド(ストーリーモード)
            hintText = UiKit.MakeText(root.transform, "", 24, UiKit.Yellow, TextAnchor.MiddleCenter,
                new Vector2(0.15f, 0.13f), new Vector2(0.85f, 0.20f), Vector2.zero, Vector2.zero,
                bold: true, shadow: true, outline: true);

            // 視点切替ボタン(クリック or Cキー: 追尾→選手目線→俯瞰)
            this.raceCam = raceCam;
            var viewBtn = UiKit.MakeButton(root.transform, $"視点: {raceCam.ModeLabel()} [C]", UiKit.Cyan, 20,
                new Vector2(1f, 0f), new Vector2(1f, 0f), new Vector2(-230f, 122f), new Vector2(-16f, 176f),
                () => raceCam.CycleMode());
            viewLabel = viewBtn.GetComponentInChildren<Text>();
        }

        public void SetVisible(bool visible) => root.SetActive(visible);

        void RefreshCommentary(CommentarySystem commentary)
        {
            int n = commentary.history.Count;
            string lines = "";
            for (int i = Mathf.Max(0, n - 3); i < n; i++)
                lines += "🎙 " + commentary.history[i] + "\n";
            commentaryText.text = lines.TrimEnd('\n');
        }

        /// <summary>毎フレーム更新(GameFlowが呼ぶ)。</summary>
        public void Tick()
        {
            if (root == null || !root.activeSelf) return;
            if (raceCam != null) viewLabel.text = $"視点: {raceCam.ModeLabel()} [C]";

            string phaseName = race.state.phase == RacePhase.PitOut && race.state.clock < -60f
                ? "ピット係留" : PhaseName(race.state.phase);

            // 風向き: スタート進行方向(+X)に対して追い風/向かい風/横風
            float rad = race.wind.directionDeg * Mathf.Deg2Rad;
            float sinD = Mathf.Sin(rad), cosD = Mathf.Cos(rad);
            string windName = sinD > 0.4f ? "追い風" : sinD < -0.4f ? "向かい風" : "横風";
            windArrowRT.localEulerAngles = new Vector3(0f, 0f, Mathf.Atan2(cosD, sinD) * Mathf.Rad2Deg);

            headerText.text = $"{race.venue.name}  {windName} {race.wind.speed:F1}m  {phaseName}";

            // カウントダウン(-3.5〜0秒)→「スタート」フラッシュ(0〜1.3秒)
            float ck = race.state.clock;
            bool inStartWindow = (race.state.phase == RacePhase.Approach || race.state.phase == RacePhase.Racing)
                                 && ck >= -3.5f && ck < 1.3f;
            if (inStartWindow)
            {
                centerText.text = ck < 0f ? Mathf.CeilToInt(-ck).ToString() : "スタート！！";
                centerText.fontSize = ck < 0f ? 150 : 96;
                var cc = centerText.color;
                cc.a = ck < 0f ? 0.9f : Mathf.Clamp01((1.3f - ck) / 0.6f);
                centerText.color = cc;
            }
            else if (centerText.text.Length > 0)
            {
                centerText.text = "";
            }

            // プレイヤー操作ガイド
            if (race.playerBoatIndex >= 0)
            {
                if (race.state.phase == RacePhase.Approach && ck < 0.5f)
                    hintText.text = "[スペース] 全開！大時計0秒ちょうどにライン通過！(早いとF)";
                else if (race.state.phase == RacePhase.Racing && race.state.raceTime < 12f)
                    hintText.text = "[←][→] 舵　[スペース] 全開　1マークを攻めろ！";
                else if (hintText.text.Length > 0)
                    hintText.text = "";
            }
            else if (hintText.text.Length > 0)
            {
                hintText.text = "";
            }
            clockText.text = race.state.phase == RacePhase.Racing || race.state.phase == RacePhase.Finished
                ? $"⏱ {race.state.raceTime:F1}s"
                : $"大時計 {race.state.clock:F1}";

            for (int i = 0; i < 6; i++)
            {
                if (i >= race.state.standings.Count) { standingRows[i].text = ""; continue; }
                int idx = race.state.standings[i];
                var bs = race.state.Get(idx);
                rowChips[i].color = UiKit.BoatColors[idx];
                bool disq = bs.startFlag == StartFlag.Flying || bs.startFlag == StartFlag.Late;
                string st = bs.crossedStart
                    ? (bs.startFlag == StartFlag.Flying ? "F"
                       : bs.startFlag == StartFlag.Late ? "L"
                       : $".{Mathf.RoundToInt(Mathf.Abs(bs.st) * 100f):00}")
                    : "--";
                string place = disq ? "欠場 " : bs.finished ? $"{bs.finalPlace}着 " : $"{i + 1}位 ";
                string lap = bs.finished || disq ? "" : $" {bs.lap + 1}周目";
                string you = idx == race.playerBoatIndex ? "▶" : "";
                standingRows[i].text =
                    $"{you}{place}{race.statsList[idx].player.playerName}  ST{st} {StrategyAI.TacticName(bs.tactic)}{lap}";
                standingRows[i].color = idx == race.playerBoatIndex ? UiKit.Yellow : Color.white;
            }
        }

        static string PhaseName(RacePhase p)
        {
            switch (p)
            {
                case RacePhase.PitOut: return "ピット離れ・進入";
                case RacePhase.Waiting: return "待機行動";
                case RacePhase.Approach: return "回頭・助走";
                case RacePhase.Racing: return "レース中";
                case RacePhase.Finished: return "レース終了";
                default: return "";
            }
        }
    }
}
