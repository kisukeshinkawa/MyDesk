using System.Collections.Generic;
using UnityEngine;
using BoatRace.Player;

namespace BoatRace.Career
{
    /// <summary>ストーリーの章定義(仕様書 第9章準拠)。</summary>
    public struct Chapter
    {
        public string title;
        public int venueId;
        public string grade;      // 新人/B2/B1/G3/G2/SG
        public int requiredPlace; // クリアに必要な着順(6=完走でOK, 1=優勝)
        public Chapter(string t, int v, string g, int p) { title = t; venueId = v; grade = g; requiredPlace = p; }
    }

    /// <summary>
    /// マイレーサーのキャリアデータ。仕様書の8章構成:
    /// 新人(桐生・戸田)→B2(浜名湖・尼崎)→B1(住之江)→G3(丸亀)→G2(住之江)→SG(蒲郡)。
    /// </summary>
    [System.Serializable]
    public class CareerData
    {
        public string racerName = "新川 希亮";
        public int chapter = 1;         // 現在の章(1-8)。9=全章クリア
        public int races;
        public int wins;
        public int top3;
        public int money = 100;         // 万円
        public float startSkill = 0.55f;
        public float turnSkill = 0.55f;
        public float mental = 0.60f;
        public float speedSkill = 0.55f;
        public float mechanicSkill = 0.50f;

        // ガレージ: モーター整備(次レース1節限り・レベル0-4)とペラ調整(永続セッティング)
        public int maintCarb;    // キャブ整備 → 出足
        public int maintElec;    // 電装整備 → 回り足
        public int maintGear;    // ギア整備 → ターン
        public int propPitch;    // -5〜+5 大=伸び重視/小=出足重視
        public int propDia;      // -5〜+5 大=トップスピード
        public int propBal;      // -3〜+3 ターン安定性
        public bool debutDone;
        public bool allClear;

        // アイテム所持数(次レースで自動消費)
        public int itemDrink;   // エナジードリンク: 初期体力+30
        public int itemProp;    // 新品ペラ: モーター強化
        public int itemCharm;   // 勝守り: ST安定+メンタルUP

        // スランプ・覚醒(連敗3でスランプ-10%、連続好走3で覚醒+20%)
        public int winStreak;    // 2着以内の連続回数
        public int loseStreak;   // 4着以下/事故の連続回数
        public int condition;    // 0=通常 1=スランプ 2=覚醒
        public string ConditionLabel => condition == 1 ? "スランプ" : condition == 2 ? "覚醒" : "通常";
        public float ConditionMul => condition == 1 ? 0.90f : condition == 2 ? 1.20f : 1f;

        // 経営(仕様書⑦): ファン・疲労・スポンサー・専属整備士・整備ミニゲーム結果
        public int fans = 300;          // ファン数(シナリオ: 初期300人)
        public int fatigue;             // 疲労0-100。練習・出走で蓄積、60以上でレースに悪影響
        public List<int> sponsorIds = new List<int>();
        public bool hasMechanic;        // 専属整備士(整備ゾーン拡大。人件費8万/レース)
        public int tuneQuality;         // ペラ調整結果(0=未実施 1=失敗 2=普通 3=良 4=完璧 -1=故障中)

        // スポンサー定義(名前, 契約条件, 収入万円/レース)
        public static readonly (string name, string cond, int income)[] SponsorDefs =
        {
            ("DUSTALK",      "通算3勝",       8),
            ("BEETLE EMS",   "ファン2,000人", 12),
            ("NISHIHARA HD", "第5章到達",     20),
        };
        public bool SponsorUnlocked(int id) =>
            id == 0 ? wins >= 3 : id == 1 ? fans >= 2000 : chapter >= 5;
        public int SponsorIncome
        {
            get { int s = 0; foreach (var id in sponsorIds) s += SponsorDefs[id].income; return s; }
        }
        // レースごとの支出(整備費5万+整備士の人件費)
        public int RaceExpense => 5 + (hasMechanic ? 8 : 0);

        // レベル成長(XPはレース結果で獲得。レベルで体力最大値が伸びる)
        public int level = 1;
        public int xp;
        public int XpNeed => 80 + level * 40;
        public int MaxStamina => Mathf.Min(200, 100 + (level - 1) * 10);
        public bool AddXp(int amount)
        {
            xp += amount;
            bool leveled = false;
            while (xp >= XpNeed) { xp -= XpNeed; level++; leveled = true; }
            return leveled;
        }

        // 技レベル(SkillMove.All と同じ並び)
        public int[] moveLv = new int[8];
        public int MoveLv(int moveIndex)
        {
            if (moveLv == null || moveIndex >= moveLv.Length) return 1;
            return Mathf.Max(1, moveLv[moveIndex]);
        }

        // ガチャ装備: プロペラ/チルト
        [System.Serializable]
        public class PartData
        {
            public int kind;    // 0=プロペラ 1=チルト
            public int arch;    // 0=スタート型 1=ターン型 2=スピード型
            public int rarity;  // 1-3(★)
        }
        public List<PartData> parts = new List<PartData>();
        public int equipProp = -1;
        public int equipTilt = -1;

        public static string PartName(PartData p)
        {
            string stars = new string('★', p.rarity);
            string kind = p.kind == 0 ? "ペラ" : "チルト";
            string arch = p.arch == 0 ? "スタート型" : p.arch == 1 ? "ターン型" : "スピード型";
            return $"{stars} {kind}({arch})";
        }

        /// <summary>装備中パーツの合計ボーナス(accel, top, turn, startSkill)。</summary>
        public (float accel, float top, float turn, float start) PartBonus()
        {
            float a = 0f, t = 0f, tr = 0f, st = 0f;
            void Apply(int idx)
            {
                if (idx < 0 || idx >= parts.Count) return;
                var p = parts[idx];
                float r = p.rarity;
                if (p.arch == 0) { a += 0.13f * r; st += 0.015f * r; }
                else if (p.arch == 1) { tr += 0.035f * r; }
                else { t += 0.22f * r; }
            }
            Apply(equipProp);
            Apply(equipTilt);
            return (a, t, tr, st);
        }

        public static readonly Chapter[] Chapters =
        {
            new Chapter("デビュー戦",     1,  "新人", 6),  // 桐生: 完走でクリア
            new Chapter("初勝利を目指して", 2,  "新人", 1),  // 戸田: 優勝
            new Chapter("B2昇格戦",       6,  "B2",  3),  // 浜名湖: 3着以内
            new Chapter("地方巡業",       13, "B2",  3),  // 尼崎: 3着以内
            new Chapter("B1への挑戦",     12, "B1",  2),  // 住之江: 2着以内
            new Chapter("G3記念",         15, "G3",  3),  // 丸亀: 3着以内
            new Chapter("地区選手権",     12, "G2",  2),  // 住之江: 2着以内
            new Chapter("クラシック",     7,  "SG",  1),  // 蒲郡: 優勝=SG制覇!
        };

        public Chapter Current => Chapters[Mathf.Clamp(chapter, 1, 8) - 1];

        /// <summary>ランク表示(仕様書: 新人→B2→B1→A2→A1→SG)。</summary>
        public string RankLabel
        {
            get
            {
                if (allClear) return "SG覇者";
                if (chapter <= 2) return "新人";
                if (chapter <= 4) return "B2";
                if (chapter == 5) return "B1";
                if (chapter == 6) return "A2";
                if (chapter == 7) return "A1";
                return "A1";
            }
        }

        RacerRank RankEnum
        {
            get
            {
                if (chapter <= 4) return RacerRank.B2;
                if (chapter == 5) return RacerRank.B1;
                if (chapter <= 7) return RacerRank.A2;
                return RacerRank.A1;
            }
        }

        public PlayerStats ToStats()
        {
            return new PlayerStats
            {
                playerName = racerName,
                rank = RankEnum,
                startSkill = startSkill,
                turnSkill = turnSkill,
                reactionTimeMean = Mathf.Lerp(0.19f, 0.11f, startSkill),
                mental = mental,
                experience = Mathf.Clamp01(races * 0.02f),
                weight = 52f,
                speedSkill = speedSkill,
                mechanicSkill = mechanicSkill,
            };
        }

        static readonly int[] BasePrize = { 520, 200, 130, 90, 70, 50 }; // 万円

        public int PrizeFor(int place)
        {
            if (place < 1 || place > 6) return 0;
            float mult = 1f + (Mathf.Clamp(chapter, 1, 8) - 1) * 0.35f; // 章が進むほど高額
            return Mathf.RoundToInt(BasePrize[place - 1] * mult);
        }

        /// <summary>章のグレードに応じた配枠(格上の節ほど厳しい枠になる)。</summary>
        public int DrawBoatIndex(System.Random rng)
        {
            if (chapter <= 2) return rng.Next(3, 6);   // 新人: 4-6号艇
            if (chapter <= 4) return rng.Next(2, 5);   // B2: 3-5号艇
            if (chapter <= 6) return rng.Next(1, 4);   // B1/G3: 2-4号艇
            return rng.Next(0, 3);                     // G2/SG: 1-3号艇
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
            try
            {
                var d = JsonUtility.FromJson<CareerData>(json) ?? new CareerData();
                if (d.chapter < 1) d.chapter = 1;
                return d;
            }
            catch { return new CareerData(); }
        }
    }

    /// <summary>ストーリー台本(章ごとの導入と支部長の会話)。</summary>
    public static class CareerStory
    {
        public static (string, string)[] Debut(string name) => new[]
        {
            ("支部長", $"{name}、いよいよデビュー戦だ。舞台は桐生。緊張してるか?"),
            (name, "…正直、手が震えてます。"),
            ("支部長", "いい緊張だ。デビュー戦の目標はまず完走。スタートは大時計の針が12時ちょうど、それがすべてだ。"),
            ("支部長", "操作は[スペース]で全開、[←][→]で舵。フライングだけはするなよ!"),
        };

        public static (string, string)[] ChapterClear(int clearedChapter, string name)
        {
            switch (clearedChapter)
            {
                case 1: return new[]
                {
                    ("支部長", $"完走おめでとう、{name}! これでお前もプロのレーサーだ。"),
                    (name, "水面の景色…忘れません。次は勝ちます。"),
                    ("支部長", "次戦は戸田。狭い水面だ。初勝利、獲ってこい!"),
                };
                case 2: return new[]
                {
                    ("支部長", $"初勝利!! やったな{name}! 水神祭だ!"),
                    (name, "1マークで前が空いた瞬間、無我夢中でした…!"),
                    ("支部長", "次は浜名湖でB2昇格戦だ。賞金で練習も忘れるな。"),
                };
                case 3: return new[]
                {
                    ("支部長", "B2昇格だ! 配枠も内寄りがもらえるようになる。"),
                    (name, "コースが変われば戦い方も変わりますね。"),
                };
                case 4: return new[]
                {
                    ("支部長", "地方巡業お疲れさん。地力がついてきたな。次は住之江、B1への挑戦だ。"),
                };
                case 5: return new[]
                {
                    ("支部長", $"B1昇格! {name}、ここからは記念レーサーの世界だ。丸亀のG3に招待が来てるぞ。"),
                };
                case 6: return new[]
                {
                    ("支部長", "G3制覇! 見事だ! 次は地区選手権(G2)、住之江のナイターだ。"),
                };
                case 7: return new[]
                {
                    ("支部長", "地区選手権突破…! ついに来たぞ、SG「クラシック」の出場権だ!"),
                    (name, "蒲郡…! 競艇界の頂点に、挑みます!"),
                };
                case 8: return new[]
                {
                    ("実況", $"ゴォォール!! 制したのは{name}!! SGクラシック、新王者の誕生です!!"),
                    ("支部長", $"…やったな。{name}、お前は日本一のレーサーだ。"),
                    (name, "ここまで来られたのは、みんなのおかげです。…次は賞金王、獲ります!"),
                };
                default: return null;
            }
        }

        public static (string, string)[] Retry(string name) => new[]
        {
            ("支部長", "惜しかったな。だがレースは水物だ。整備と練習で次に備えろ。"),
            (name, "…もう一度、挑戦します!"),
        };
    }
}
