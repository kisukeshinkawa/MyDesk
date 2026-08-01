using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;
using BoatRace.Core;

namespace BoatRace.Commentary
{
    /// <summary>
    /// 実況AIの学習。過去レースのログとテンプレート使用回数を永続化し、
    /// 使い回しの少ないフレーズを優先選択(飽き防止)＋展開パターンを蓄積する。
    /// 将来はこのログをLLM(Bedrock Claude等)のfew-shotに渡して生成品質を上げる。
    /// </summary>
    public class CommentaryLearning
    {
        [Serializable]
        class SaveData
        {
            public List<string> usageKeys = new List<string>();
            public List<int> usageCounts = new List<int>();
            public List<string> raceLogs = new List<string>();
        }

        readonly Dictionary<string, int> usage = new Dictionary<string, int>();
        readonly List<string> raceLogs = new List<string>();

        string SavePath => Path.Combine(Application.persistentDataPath, "commentary_learning.json");

        /// <summary>使用回数が少ないテンプレートを重み付きで選ぶ(学習型選択)。</summary>
        public string PickTemplate(string eventKey, string[] options, System.Random rng)
        {
            var weights = options
                .Select(o => 1f / (1f + GetCount(eventKey + "|" + o)))
                .ToArray();
            float total = weights.Sum();
            float r = (float)rng.NextDouble() * total;
            for (int i = 0; i < options.Length; i++)
            {
                r -= weights[i];
                if (r <= 0f) return options[i];
            }
            return options[options.Length - 1];
        }

        public void RecordUsage(string eventKey, string template)
        {
            string key = eventKey + "|" + template;
            usage[key] = GetCount(key) + 1;
        }

        /// <summary>レース結果を展開パターンとしてログ化(勝ち戦法・ST・場)。</summary>
        public void RecordRace(RaceManager race)
        {
            var winner = race.state.boats.FirstOrDefault(b => b.finalPlace == 1);
            if (winner == null) return;
            string log = $"{race.venue.name}|win:{winner.boatNumber}コース{winner.course}|" +
                         $"tactic:{winner.tactic}|st:{winner.st:F2}";
            raceLogs.Add(log);
            if (raceLogs.Count > 500) raceLogs.RemoveAt(0);
        }

        int GetCount(string key) => usage.TryGetValue(key, out int c) ? c : 0;

        public void Save()
        {
            try
            {
                var data = new SaveData { raceLogs = raceLogs };
                foreach (var kv in usage) { data.usageKeys.Add(kv.Key); data.usageCounts.Add(kv.Value); }
                File.WriteAllText(SavePath, JsonUtility.ToJson(data));
            }
            catch (Exception e) { Debug.LogWarning($"実況学習の保存失敗: {e.Message}"); }
        }

        public void Load()
        {
            try
            {
                if (!File.Exists(SavePath)) return;
                var data = JsonUtility.FromJson<SaveData>(File.ReadAllText(SavePath));
                usage.Clear();
                for (int i = 0; i < data.usageKeys.Count; i++)
                    usage[data.usageKeys[i]] = data.usageCounts[i];
                raceLogs.Clear();
                raceLogs.AddRange(data.raceLogs);
            }
            catch (Exception e) { Debug.LogWarning($"実況学習の読込失敗: {e.Message}"); }
        }
    }
}
