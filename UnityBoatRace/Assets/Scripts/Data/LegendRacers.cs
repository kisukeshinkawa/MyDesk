using UnityEngine;

namespace BoatRace.Data
{
    /// <summary>
    /// 実在トップレーサーをモデルにしたレジェンド選手名鑑(名前はもじりのパロディ)。
    /// 各選手の実際の持ち味(ST・ターン・伸び・メンタル)を数値に翻訳している。
    /// 章が進むほど(G3→SG)レースに参戦してくる。
    /// </summary>
    public class LegendRacer
    {
        public string name;      // もじり名
        public string moniker;   // 異名
        public Color hair;
        public float start, turn, speed, mental;
        public float st;         // 平均ST(小さいほど速い)
        public string line;      // パドック口上

        static LegendRacer L(string name, string moniker, Color hair,
            float start, float turn, float speed, float mental, float st, string line) =>
            new LegendRacer { name = name, moniker = moniker, hair = hair,
                start = start, turn = turn, speed = speed, mental = mental, st = st, line = line };

        // 顔シート(Art/faces.png)の並び順と1対1対応。並びを変えると顔がズレるので注意
        public static readonly LegendRacer[] All =
        {
            L("今村 豊", "伝説のスタート", new Color(0.20f, 0.22f, 0.28f),
                0.95f, 0.88f, 0.84f, 0.90f, 0.10f,
                "スタートは呼吸だよ。大時計と心を合わせるんだ。"),
            L("植木 通彦", "不死鳥", new Color(0.16f, 0.18f, 0.24f),
                0.87f, 0.90f, 0.88f, 0.95f, 0.13f,
                "何度でも蘇る。艇道とは、そういうものだ。"),
            L("瓜生 正義", "鋼の心臓", new Color(0.25f, 0.28f, 0.35f),
                0.88f, 0.86f, 0.85f, 0.95f, 0.12f,
                "プレッシャー？ それはご馳走の匂いって意味かい。"),
            L("田中 信一郎", "豪腕まくり", new Color(0.55f, 0.30f, 0.15f),
                0.84f, 0.87f, 0.91f, 0.84f, 0.13f,
                "外から全部、薙ぎ倒す！ ついて来られるか！？"),
            L("野中 和夫", "艇王", new Color(0.30f, 0.28f, 0.30f),
                0.89f, 0.92f, 0.90f, 0.88f, 0.12f,
                "艇王の走り、目に焼き付けておけ。"),
            L("松井 繁", "絶対王者", new Color(0.28f, 0.26f, 0.24f),
                0.80f, 0.94f, 0.88f, 0.96f, 0.15f,
                "焦る必要はどこにもない。王者の旋回、見て学びなさい。"),
            L("石野 貴之", "浪速のまくり王", new Color(0.20f, 0.20f, 0.26f),
                0.84f, 0.87f, 0.90f, 0.86f, 0.13f,
                "ごちゃごちゃ考えん。ハンドルひとつで、なんぼでも景色は変わるで。"),
            L("峰 竜太", "艇界の頂点", new Color(0.16f, 0.18f, 0.24f),
                0.92f, 0.95f, 0.93f, 0.90f, 0.12f,
                "全部の周り足が見えている。……悪いが、今日も頂点は譲らないよ。"),
            L("白井 英治", "不動のイン", new Color(0.75f, 0.78f, 0.82f),
                0.84f, 0.88f, 0.82f, 0.93f, 0.14f,
                "イン戦は積み重ねだ。1コースの意味を、レースで教えてやる。"),
            L("桐生 順平", "差しの匠", new Color(0.35f, 0.30f, 0.28f),
                0.85f, 0.92f, 0.84f, 0.86f, 0.13f,
                "ターンの内側には、いつだって道がある。僕はそこを通るだけ。"),
            L("原田 幸哉", "韋駄天", new Color(0.40f, 0.32f, 0.22f),
                0.87f, 0.84f, 0.92f, 0.84f, 0.12f,
                "直線に入ったら、もう誰にも追いつけないよ。"),
            L("丸野 一樹", "若き炎", new Color(0.50f, 0.35f, 0.20f),
                0.83f, 0.84f, 0.86f, 0.82f, 0.14f,
                "若さで全部ひっくり返してやるっすよ！！"),
        };

        /// <summary>名前からレジェンドを引く(いなければnull)。</summary>
        public static LegendRacer Find(string name)
        {
            foreach (var l in All) if (l.name == name) return l;
            return null;
        }
    }
}
