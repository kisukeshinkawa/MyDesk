using System.Collections.Generic;

namespace BoatRace.Core
{
    public enum RacePhase
    {
        PitOut,      // ピット離れ
        Waiting,     // 待機行動(コース取り)
        Approach,    // 助走〜スタート
        Racing,      // 本走(3周)
        Finished,    // 全艇ゴール
    }

    public enum StartFlag { None, Normal, Flying, Late }

    public enum Tactic { None, Nige, Sashi, Makuri, MakuriSashi }

    /// <summary>艇ごとのレース中状態。</summary>
    [System.Serializable]
    public class BoatRaceState
    {
        public int boatNumber;
        public int course;            // 進入コース 1-6
        public float st;              // スタートタイミング
        public StartFlag startFlag = StartFlag.None;
        public Tactic tactic = Tactic.None;
        public int lap;               // 現在周回 (0起点)
        public float progress;        // 周回内進行度(m)
        public float totalProgress;   // 総進行度(順位判定用)
        public bool crossedStart;
        public bool finished;
        public float finishTime = -1f;
        public int finalPlace = -1;
        public float exhibitionTime;  // 展示タイム
    }

    /// <summary>レース全体の状態。</summary>
    public class RaceState
    {
        public RacePhase phase = RacePhase.PitOut;
        public float clock = -25f;    // 大時計。0がスタート時刻
        public float raceTime;        // スタートからの経過秒
        public readonly List<BoatRaceState> boats = new List<BoatRaceState>();
        public readonly List<int> standings = new List<int>(); // 現在順位の艇index列

        public BoatRaceState Get(int boatIndex) => boats[boatIndex];
    }
}
