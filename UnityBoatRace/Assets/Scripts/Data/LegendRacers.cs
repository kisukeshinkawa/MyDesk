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

        public static readonly LegendRacer[] All =
        {
            // オールラウンド最強格(モデル: 艇界の頂点に立つ賞金王)
            L("峯 竜大", "艇界の頂点", new Color(0.16f, 0.18f, 0.24f),
                0.92f, 0.95f, 0.93f, 0.90f, 0.12f,
                "全部の周り足が見えている。……悪いが、今日も頂点は譲らないよ。"),
            // 絶対王者(モデル: 歴代最多賞金の大王者)
            L("松居 茂", "絶対王者", new Color(0.30f, 0.28f, 0.30f),
                0.80f, 0.94f, 0.88f, 0.96f, 0.15f,
                "焦る必要はどこにもない。王者の旋回、見て学びなさい。"),
            // まくりの怪物(モデル: 出足と伸びで沈めるまくり屋)
            L("毒嶋 真", "まくりの弾丸", new Color(0.55f, 0.30f, 0.15f),
                0.86f, 0.82f, 0.96f, 0.85f, 0.13f,
                "外からでも関係ない。全部まとめて、飲み込むだけだ。"),
            // ST職人(モデル: 全国トップの超速スタート)
            L("菊池 幸平", "ST職人", new Color(0.20f, 0.22f, 0.28f),
                0.97f, 0.78f, 0.80f, 0.88f, 0.09f,
                "大時計は友達でね。コンマ09の世界、君に見えるかな？"),
            // 差しの匠(モデル: 展示から仕上げる技巧派)
            L("霧生 純平", "差しの匠", new Color(0.35f, 0.30f, 0.28f),
                0.85f, 0.92f, 0.84f, 0.86f, 0.13f,
                "ターンの内側には、いつだって道がある。僕はそこを通るだけ。"),
            // イン守護神(モデル: 逃げ切りの鉄人)
            L("白居 英次", "不動のイン", new Color(0.75f, 0.78f, 0.82f),
                0.84f, 0.88f, 0.82f, 0.93f, 0.14f,
                "イン戦は積み重ねだ。1コースの意味を、レースで教えてやる。"),
            // 鋼のメンタル(モデル: 大舞台に強い九州の大エース)
            L("宇龍 正義", "鋼の心臓", new Color(0.25f, 0.28f, 0.35f),
                0.88f, 0.86f, 0.85f, 0.95f, 0.12f,
                "プレッシャー？ それはご馳走の匂いって意味かい。"),
            // 女王(モデル: 史上初の女子SG制覇)
            L("遠堂 エミリ", "史上初の女王", new Color(0.55f, 0.35f, 0.25f),
                0.86f, 0.90f, 0.83f, 0.90f, 0.13f,
                "性別は水面には関係ない。私は勝ちに来ただけです。"),
            // 総大将(モデル: 地区を束ねるオールラウンダー)
            L("池谷 浩司", "愛知の総大将", new Color(0.28f, 0.26f, 0.24f),
                0.88f, 0.88f, 0.87f, 0.88f, 0.13f,
                "穴はない。強いて言えば、全部が得意ってことくらいだ。"),
            // 浪速のまくり王(モデル: 豪快な旋回のSG常連)
            L("石乃 貴行", "浪速のまくり王", new Color(0.20f, 0.20f, 0.26f),
                0.84f, 0.87f, 0.90f, 0.86f, 0.13f,
                "ごちゃごちゃ考えん。ハンドルひとつで、なんぼでも景色は変わるで。"),
            // 韋駄天(モデル: スピード自慢の岡山のエース)
            L("萱原 悠騎", "岡山の韋駄天", new Color(0.40f, 0.32f, 0.22f),
                0.87f, 0.84f, 0.92f, 0.84f, 0.12f,
                "直線に入ったら、もう誰にも追いつけないよ。"),
            // 祭りの男(モデル: 場を沸かせる人気者ファイター)
            L("西森 貴浩", "祭りの男", new Color(0.50f, 0.35f, 0.20f),
                0.83f, 0.84f, 0.86f, 0.82f, 0.14f,
                "盛り上がっていくぞーー！！ 舟券、俺に賭けた奴は正解だ！"),
        };

        /// <summary>名前からレジェンドを引く(いなければnull)。</summary>
        public static LegendRacer Find(string name)
        {
            foreach (var l in All) if (l.name == name) return l;
            return null;
        }
    }
}
