using UnityEngine;
using BoatRace.Player;

namespace BoatRace.Career
{
    /// <summary>
    /// マイレーサーのキャリアデータ。名前・戦績・賞金・スキルを永続保存し、
    /// 勝利数で級別が昇格していく(B2→B1→A2→A1)。
    /// </summary>
    [System.Serializable]
    public class CareerData
    {
        public string racerName = "新川 希亮";
        public int races;
        public int wins;
        public int top3;
        public int money = 100;         // 万円
        public float startSkill = 0.55f;
        public float turnSkill = 0.55f;
        public float mental = 0.60f;

        // ストーリー進行フラグ
        public bool debutDone;
        public bool firstWinDone;
        public bool b1Done;
        public bool a2Done;
        public bool a1Done;

        public RacerRank Rank =>
            wins >= 15 ? RacerRank.A1 :
            wins >= 8 ? RacerRank.A2 :
            wins >= 3 ? RacerRank.B1 : RacerRank.B2;

        /// <summary>次の昇格までの勝利数。</summary>
        public int WinsToNextRank =>
            wins >= 15 ? 0 : wins >= 8 ? 15 - wins : wins >= 3 ? 8 - wins : 3 - wins;

        /// <summary>レース用の選手データに変換。</summary>
        public PlayerStats ToStats()
        {
            return new PlayerStats
            {
                playerName = racerName,
                rank = Rank,
                startSkill = startSkill,
                turnSkill = turnSkill,
                reactionTimeMean = Mathf.Lerp(0.19f, 0.11f, startSkill),
                mental = mental,
                experience = Mathf.Clamp01(races * 0.02f),
                weight = 52f,
            };
        }

        static readonly int[] BasePrize = { 520, 200, 130, 90, 70, 50 }; // 万円

        public int PrizeFor(int place)
        {
            if (place < 1 || place > 6) return 0;
            float mult = Rank == RacerRank.A1 ? 2.5f :
                         Rank == RacerRank.A2 ? 1.8f :
                         Rank == RacerRank.B1 ? 1.3f : 1f;
            return Mathf.RoundToInt(BasePrize[place - 1] * mult);
        }

        /// <summary>級別に応じた配枠(強い選手ほど内枠がもらえる)。boatIndex 0-5。</summary>
        public int DrawBoatIndex(System.Random rng)
        {
            switch (Rank)
            {
                case RacerRank.A1: return rng.Next(0, 3);  // 1-3号艇
                case RacerRank.A2: return rng.Next(1, 4);
                case RacerRank.B1: return rng.Next(2, 5);
                default:           return rng.Next(3, 6);  // 4-6号艇
            }
        }

        const string Key = "br_career";

        public void Save()
        {
            PlayerPrefs.SetString(Key, JsonUtility.ToJson(this));
            PlayerPrefs.Save();
        }

        public static CareerData Load()
        {
            var json = PlayerPrefs.GetString(Key, "");
            if (string.IsNullOrEmpty(json)) return new CareerData();
            try { return JsonUtility.FromJson<CareerData>(json) ?? new CareerData(); }
            catch { return new CareerData(); }
        }
    }

    /// <summary>ストーリー台本。イベントごとの会話(話者, セリフ)。</summary>
    public static class CareerStory
    {
        public static (string, string)[] Debut(string name) => new[]
        {
            ("支部長", $"{name}、いよいよデビュー戦だ。緊張してるか?"),
            (name, "…正直、手が震えてます。"),
            ("支部長", "いい緊張だ。まずは完走、そしてスタートを合わせろ。大時計の針が12時ちょうど、それがすべてだ。"),
            ("支部長", "操作は簡単だ。[スペース]で全開、[←][→]で舵。フライングだけはするなよ!"),
        };

        public static (string, string)[] FirstWin(string name) => new[]
        {
            ("支部長", $"初勝利おめでとう、{name}!! 水神祭だ!"),
            (name, "ありがとうございます…! 1マークで前が見えた瞬間、無我夢中でした。"),
            ("支部長", "その感覚を忘れるな。勝てるスタートは練習でしか作れんぞ。賞金でスタート練習を積め。"),
        };

        public static (string, string)[] PromoteB1(string name) => new[]
        {
            ("支部長", $"{name}、B1昇格だ! 配枠も少し内側がもらえるようになる。"),
            (name, "インコースの世界…戦い方が変わりますね。"),
        };

        public static (string, string)[] PromoteA2(string name) => new[]
        {
            ("支部長", "A2昇格! ここからは記念レースも見えてくる。ライバルも本気だぞ。"),
            (name, "望むところです。"),
        };

        public static (string, string)[] PromoteA1(string name) => new[]
        {
            ("支部長", $"…ついにA1だ。{name}、お前はもうトップレーサーの一人だ。"),
            (name, "ここからが本当のスタートです。SGのタイトル、獲りにいきます!"),
            ("支部長", "ああ。次の目標は賞金王だ。走り続けろ!"),
        };
    }
}
