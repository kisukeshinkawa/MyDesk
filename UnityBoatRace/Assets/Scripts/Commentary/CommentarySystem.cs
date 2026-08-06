using System;
using System.Collections.Generic;
using UnityEngine;
using BoatRace.Core;
using BoatRace.AI;

namespace BoatRace.Commentary
{
    /// <summary>
    /// 実況AI。RaceManagerのイベントを購読し、テンプレート＋学習(CommentaryLearning)で
    /// 実況テキストを生成する。HUDが OnLine を購読して画面表示。
    /// </summary>
    public class CommentarySystem
    {
        public event Action<string> OnLine;
        public readonly List<string> history = new List<string>();

        readonly RaceManager race;
        readonly CommentaryLearning learning;
        readonly System.Random rng = new System.Random();

        static readonly Dictionary<string, string[]> Templates = new Dictionary<string, string[]>
        {
            ["standby"] = new[] {
                "各艇エンジン始動。間もなくピットアウトです。",
                "選手たちがピットで待機。緊張の時間です。",
                "モーターの音が水面に響きます。まもなく出走です。",
                "本日のメンバーが出揃いました。さあ、いよいよです。" },
            ["pit_out"] = new[] {
                "ピットアウト！ 6艇一斉にピットを離れました！",
                "ピット離れ！ コース取りに注目です！",
                "さあ出た！ ここからコース取りの駆け引きが始まります！",
                "6艇、静かに桟橋を離れました。進入はどうなるか。" },
            ["late"] = new[] {
                "{0}号艇、出遅れ(L)！ 返還・欠場となります。",
                "おっと{0}号艇、スタートに間に合わない！ 出遅れです！",
                "{0}号艇が置かれた！ まさかの出遅れ、痛恨です！" },
            ["final_lap"] = new[] {
                "最終周回灯が点灯！ 勝負はあと1周！",
                "さあ最終周回！ 逃げ切るか、捉えるか！",
                "残り1周！ ここからが本当の勝負だ！",
                "白い灯りがともった、ファイナルラップ！ 声援が大きくなる！" },
            ["approach"] = new[] {
                "全艇、スタートへ向けて助走に入ります！",
                "大時計が回り始めた！ スタート勝負です！",
                "起こしから全速へ！ 6艇が横一線でラインに向かう！",
                "小さく回って、さあ助走！ 大時計との勝負です！" },
            ["start"] = new[] {
                "スタートしました！ {0}号艇 {1} トップスタート、ST {2:F2}！",
                "一斉にスタート！ 最速は{0}号艇 {1}、ST {2:F2}です！",
                "きれいなスリット！ 行き足一番は{0}号艇 {1}、{2:F2}！",
                "スタート成立！ {0}号艇 {1}がコンマ{2:F2}で抜け出した！" },
            ["start_super"] = new[] {
                "超好スタート！！ {0}号艇 {1}、ST {2:F2}の完璧な飛び出しだーッ！！",
                "なんというスタート！ {0}号艇 {1}がST {2:F2}で突き抜けた！",
                "これはトップスタート！ {0}号艇 {1}、{2:F2}！ 大時計ぴったりだ！" },
            ["flying"] = new[] {
                "おっと！ {0}号艇 フライングか！？",
                "{0}号艇、勇み足！ フライングの模様です！",
                "勢い余った！ {0}号艇、フライング！ 返還対象です！" },
            ["mark1_first"] = new[] {
                "第1マーク、先マイは{0}号艇 {1}！ 戦法は{2}！",
                "1マークの攻防！ {0}号艇が{2}を仕掛けたーッ！",
                "運命の1マーク！ {0}号艇 {1}、{2}だ！ 各艇続けるか！",
                "先に回ったのは{0}号艇！ {2}で主導権を握りに行く！" },
            ["leader_change"] = new[] {
                "順位が入れ替わった！ 先頭は{0}号艇 {1}！",
                "{0}号艇 {1}が前に出たーッ！",
                "抜いた抜いた！ トップは{0}号艇 {1}に変わった！",
                "展開が動いた！ {0}号艇 {1}が先頭を奪う！" },
            ["lap"] = new[] {
                "{0}周目に入ります。トップは{1}号艇！",
                "バックストレッチ、{1}号艇がリードを保っています。",
                "{0}周目！ {1}号艇を各艇が追いかける展開！",
                "隊列は{1}号艇が先頭のまま{0}周目へ。差は詰まるか。" },
            ["goal_first"] = new[] {
                "ゴールイン！ 1着は{0}号艇 {1}！ 決まり手は{3}！ 勝ちタイム {2:F1}秒！",
                "決まったーッ！ {0}号艇 {1}が{3}で1着ゴールです！",
                "1着でゴールイン、{0}号艇 {1}！ 見事な{3}でした！",
                "制したのは{0}号艇 {1}！ {3}！ タイムは{2:F1}秒です！" },
            ["finish"] = new[] {
                "全艇ゴール。レース終了です。",
                "白熱したレースでした。確定までしばらくお待ちください。",
                "レース終了。場内、拍手が送られています。",
                "全艇が帰ってきました。着順の確定をお待ちください。" },
        };

        public CommentarySystem(RaceManager race)
        {
            this.race = race;
            learning = new CommentaryLearning();
            learning.Load();

            bool firstMark1Done = false;

            race.OnPhaseChanged += phase =>
            {
                if (phase == RacePhase.PitOut) { firstMark1Done = false; Say("standby"); }
                if (phase == RacePhase.Approach) Say("approach");
                if (phase == RacePhase.Finished) { Say("finish"); learning.RecordRace(race); learning.Save(); }
            };

            race.OnPitOpen += () => Say("pit_out");
            race.OnFinalLap += () => Say("final_lap");

            race.OnStartResults += () =>
            {
                int best = -1; float bestST = float.MaxValue;
                for (int i = 0; i < race.state.boats.Count; i++)
                {
                    var bs = race.state.Get(i);
                    if (bs.startFlag == StartFlag.Flying) Say("flying", bs.boatNumber);
                    else if (bs.startFlag == StartFlag.Late) Say("late", bs.boatNumber);
                    else if (bs.st < bestST) { bestST = bs.st; best = i; }
                }
                if (best >= 0)
                    Say(bestST <= 0.05f ? "start_super" : "start",
                        best + 1, race.statsList[best].player.playerName, bestST);
            };

            race.OnMarkRounded += (idx, mark, lap) =>
            {
                if (mark == 1 && lap == 1 && !firstMark1Done)
                {
                    firstMark1Done = true;
                    var bs = race.state.Get(idx);
                    Say("mark1_first", bs.boatNumber, race.statsList[idx].player.playerName,
                        StrategyAI.TacticName(bs.tactic));
                }
                else if (mark == 2 && lap > 1 && idx == race.state.standings[0])
                {
                    Say("lap", lap, race.state.Get(idx).boatNumber);
                }
            };

            race.OnLeaderChanged += idx =>
                Say("leader_change", race.state.Get(idx).boatNumber, race.statsList[idx].player.playerName);

            race.OnBoatFinished += (idx, place) =>
            {
                if (place == 1)
                    Say("goal_first", race.state.Get(idx).boatNumber,
                        race.statsList[idx].player.playerName, race.state.Get(idx).finishTime,
                        race.kimarite);
            };
        }

        void Say(string key, params object[] args)
        {
            if (!Templates.TryGetValue(key, out var options)) return;
            string template = learning.PickTemplate(key, options, rng);
            string line = string.Format(template, args);
            history.Add(line);
            if (history.Count > 50) history.RemoveAt(0);
            learning.RecordUsage(key, template);
            Debug.Log($"[実況] {line}");
            OnLine?.Invoke(line);
        }
    }
}
