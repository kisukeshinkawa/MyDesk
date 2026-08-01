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
            ["pit_out"] = new[] {
                "さあ6艇、一斉にピットを離れました！",
                "ピット離れ！ コース取りに注目です！" },
            ["approach"] = new[] {
                "全艇、スタートへ向けて助走に入ります！",
                "大時計が回り始めた！ スタート勝負です！" },
            ["start"] = new[] {
                "スタートしました！ {0}号艇 {1} トップスタート、ST {2:F2}！",
                "一斉にスタート！ 最速は{0}号艇 {1}、ST {2:F2}です！" },
            ["flying"] = new[] {
                "おっと！ {0}号艇 フライングか！？",
                "{0}号艇、勇み足！ フライングの模様です！" },
            ["mark1_first"] = new[] {
                "第1マーク、先マイは{0}号艇 {1}！ 戦法は{2}！",
                "1マークの攻防！ {0}号艇が{2}を仕掛けたーッ！" },
            ["leader_change"] = new[] {
                "順位が入れ替わった！ 先頭は{0}号艇 {1}！",
                "{0}号艇 {1}が前に出たーッ！" },
            ["lap"] = new[] {
                "{0}周目に入ります。トップは{1}号艇！",
                "バックストレッチ、{1}号艇がリードを保っています。" },
            ["goal_first"] = new[] {
                "ゴールイン！ 1着は{0}号艇 {1}！ 勝ちタイム {2:F1}秒！",
                "決まったーッ！ {0}号艇 {1}が1着でゴールです！" },
            ["finish"] = new[] {
                "全艇ゴール。レース終了です。",
                "白熱したレースでした。確定までしばらくお待ちください。" },
        };

        public CommentarySystem(RaceManager race)
        {
            this.race = race;
            learning = new CommentaryLearning();
            learning.Load();

            race.OnPhaseChanged += phase =>
            {
                if (phase == RacePhase.PitOut) Say("pit_out");
                if (phase == RacePhase.Approach) Say("approach");
                if (phase == RacePhase.Finished) { Say("finish"); learning.RecordRace(race); learning.Save(); }
            };

            race.OnStartResults += () =>
            {
                int best = -1; float bestST = float.MaxValue;
                for (int i = 0; i < race.state.boats.Count; i++)
                {
                    var bs = race.state.Get(i);
                    if (bs.startFlag == StartFlag.Flying) Say("flying", bs.boatNumber);
                    else if (bs.st < bestST) { bestST = bs.st; best = i; }
                }
                if (best >= 0)
                    Say("start", best + 1, race.statsList[best].player.playerName, bestST);
            };

            bool firstMark1Done = false;
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
                        race.statsList[idx].player.playerName, race.state.Get(idx).finishTime);
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
