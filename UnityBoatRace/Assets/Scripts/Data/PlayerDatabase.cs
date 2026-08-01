using System.Collections.Generic;
using BoatRace.Player;

namespace BoatRace.Data
{
    /// <summary>サンプル選手データベース。実データを追加する場合はここに登録。</summary>
    public static class PlayerDatabase
    {
        public static readonly List<PlayerStats> All = new List<PlayerStats>
        {
            new PlayerStats { playerName = "白鳥 翔太", rank = RacerRank.A1, startSkill = 0.92f, turnSkill = 0.90f, reactionTimeMean = 0.12f, mental = 0.90f, experience = 0.95f, weight = 51f },
            new PlayerStats { playerName = "荒波 健",   rank = RacerRank.A1, startSkill = 0.85f, turnSkill = 0.94f, reactionTimeMean = 0.14f, mental = 0.85f, experience = 0.90f, weight = 52f },
            new PlayerStats { playerName = "早瀬 隼人", rank = RacerRank.A2, startSkill = 0.95f, turnSkill = 0.75f, reactionTimeMean = 0.11f, mental = 0.70f, experience = 0.60f, weight = 50f },
            new PlayerStats { playerName = "深堀 誠",   rank = RacerRank.A2, startSkill = 0.72f, turnSkill = 0.82f, reactionTimeMean = 0.16f, mental = 0.80f, experience = 0.85f, weight = 53f },
            new PlayerStats { playerName = "波多野 蓮", rank = RacerRank.B1, startSkill = 0.68f, turnSkill = 0.70f, reactionTimeMean = 0.17f, mental = 0.65f, experience = 0.45f, weight = 52f },
            new PlayerStats { playerName = "沖田 大和", rank = RacerRank.B1, startSkill = 0.60f, turnSkill = 0.66f, reactionTimeMean = 0.18f, mental = 0.60f, experience = 0.40f, weight = 55f },
            new PlayerStats { playerName = "渚 美咲",   rank = RacerRank.B2, startSkill = 0.55f, turnSkill = 0.62f, reactionTimeMean = 0.19f, mental = 0.72f, experience = 0.30f, weight = 47f },
            new PlayerStats { playerName = "灘 剛志",   rank = RacerRank.B2, startSkill = 0.50f, turnSkill = 0.58f, reactionTimeMean = 0.20f, mental = 0.55f, experience = 0.25f, weight = 56f },
        };

        /// <summary>ランダムに6名ピックアップ。</summary>
        public static List<PlayerStats> PickSix(System.Random rng)
        {
            var copy = new List<PlayerStats>(All);
            var result = new List<PlayerStats>(6);
            for (int i = 0; i < 6 && copy.Count > 0; i++)
            {
                int idx = rng.Next(copy.Count);
                result.Add(copy[idx]);
                copy.RemoveAt(idx);
            }
            return result;
        }
    }
}
