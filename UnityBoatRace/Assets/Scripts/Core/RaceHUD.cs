using UnityEngine;
using BoatRace.AI;
using BoatRace.Commentary;

namespace BoatRace.Core
{
    /// <summary>
    /// OnGUIベースの簡易HUD(uGUI不要で即動く)。
    /// 大時計・順位・ST・展示タイム・実況・リプレイ操作を表示。
    /// </summary>
    public class RaceHUD : MonoBehaviour
    {
        RaceManager race;
        ReplayManager replay;
        CommentarySystem commentary;

        public void Initialize(RaceManager race, ReplayManager replay, CommentarySystem commentary)
        {
            this.race = race;
            this.replay = replay;
            this.commentary = commentary;
        }

        void OnGUI()
        {
            if (race == null) return;
            GUI.skin.label.fontSize = 14;

            // ---- 上部: 場名・フェーズ・大時計 ----
            GUILayout.BeginArea(new Rect(10, 10, 420, 130), GUI.skin.box);
            GUILayout.Label($"■ {race.venue.name}競艇場  風 {race.wind.speed:F1}m  波 {race.venue.waveHeight * 100f:F0}cm");
            GUILayout.Label($"フェーズ: {PhaseName(race.state.phase)}");
            string clockText = race.state.phase == RacePhase.Racing || race.state.phase == RacePhase.Finished
                ? $"レースタイム {race.state.raceTime:F1}s"
                : $"大時計 {race.state.clock:F1}";
            GUILayout.Label(clockText);
            if (race.state.phase == RacePhase.Finished && !replay.IsPlaying)
            {
                if (GUILayout.Button("▶ リプレイ再生")) replay.StartPlayback();
            }
            if (replay.IsPlaying)
            {
                GUILayout.BeginHorizontal();
                if (GUILayout.Button("カメラ切替")) replay.ToggleCamera();
                if (GUILayout.Button("停止")) replay.StopPlayback();
                GUILayout.EndHorizontal();
            }
            GUILayout.EndArea();

            // ---- 左: 順位表 ----
            GUILayout.BeginArea(new Rect(10, 150, 420, 230), GUI.skin.box);
            GUILayout.Label("順位  艇  選手        コース  ST     戦法   展示");
            foreach (int idx in race.state.standings)
            {
                var bs = race.state.Get(idx);
                var st = bs.crossedStart
                    ? (bs.startFlag == StartFlag.Flying ? "F" : bs.st.ToString("F2"))
                    : "-";
                string place = bs.finished ? $"{bs.finalPlace}着" : "  ";
                GUILayout.Label(
                    $"{place}  {bs.boatNumber}号艇 {race.statsList[idx].player.playerName,-6} " +
                    $"{bs.course}   {st,-5} {StrategyAI.TacticName(bs.tactic),-5} {bs.exhibitionTime:F2}");
            }
            GUILayout.EndArea();

            // ---- 下部: 実況 ----
            if (commentary != null && commentary.history.Count > 0)
            {
                GUILayout.BeginArea(new Rect(10, Screen.height - 110, Screen.width - 20, 100), GUI.skin.box);
                int start = Mathf.Max(0, commentary.history.Count - 4);
                for (int i = start; i < commentary.history.Count; i++)
                    GUILayout.Label("🎙 " + commentary.history[i]);
                GUILayout.EndArea();
            }
        }

        static string PhaseName(RacePhase p)
        {
            switch (p)
            {
                case RacePhase.PitOut: return "ピット離れ";
                case RacePhase.Waiting: return "待機行動";
                case RacePhase.Approach: return "助走〜スタート";
                case RacePhase.Racing: return "本走(3周)";
                case RacePhase.Finished: return "レース終了";
                default: return p.ToString();
            }
        }
    }
}
