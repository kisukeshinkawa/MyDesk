using System.Collections.Generic;
using System.Linq;

namespace BoatRace.Data
{
    public enum WaterType { Freshwater, Seawater, Brackish, Tidal }

    /// <summary>競艇場ごとの水面特性(実場の傾向を反映)。</summary>
    [System.Serializable]
    public class VenueData
    {
        public int id;
        public string name;
        public float windEffect;       // 風の影響度 0-1
        public float waveHeight;       // 平均波高(m)
        public float currentStrength;  // 潮流/水流の強さ 0-1
        public float insideAdvantage;  // 1コース1着率(実データの目安)
        public WaterType waterType;
        public float makuriBias;       // まくりの決まりやすさ 0-1 (0.5=標準)
        public float sashiBias;        // 差しの決まりやすさ 0-1 (0.5=標準)
        public float tideRange;        // 干満差の大きさ 0-1 (瀬戸内は大)
        public string trait;           // 水面特性の解説(出走表・分析で表示)

        public VenueData(int id, string name, float wind, float wave, float current,
            float inside, WaterType type, float makuri, float sashi, float tide, string trait)
        {
            this.id = id; this.name = name;
            windEffect = wind; waveHeight = wave;
            currentStrength = current; insideAdvantage = inside;
            waterType = type;
            makuriBias = makuri; sashiBias = sashi; tideRange = tide;
            this.trait = trait;
        }

        /// <summary>水面の性格を一言で(ホーム・出走表のラベル用)。</summary>
        public string Character =>
            insideAdvantage >= 0.58f ? "イン天国" :
            makuriBias >= 0.65f ? "まくり水面" :
            sashiBias >= 0.62f ? "差し水面" :
            waveHeight >= 0.08f ? "荒れ水面" : "標準水面";
    }

    /// <summary>
    /// 全国24競艇場データベース。1コース1着率・決まり手傾向・干満差は
    /// 実際の各場の公表傾向に合わせた値。
    /// </summary>
    public static class CourseDatabase
    {
        public static readonly List<VenueData> All = new List<VenueData>
        {
            new VenueData( 1, "桐生",   0.65f, 0.03f, 0.10f, 0.51f, WaterType.Freshwater, 0.52f, 0.52f, 0f,
                "標高が高く気圧が低い淡水ナイター。冬の赤城おろし(向かい風)でダッシュ勢のまくりが伸びる"),
            new VenueData( 2, "戸田",   0.30f, 0.02f, 0.05f, 0.44f, WaterType.Freshwater, 0.90f, 0.38f, 0f,
                "日本一狭い水面で1Mが窮屈。インが流れやすく、カド4のまくりが全国一決まる"),
            new VenueData( 3, "江戸川", 0.90f, 0.12f, 0.90f, 0.45f, WaterType.Tidal, 0.32f, 0.62f, 0.9f,
                "全国唯一の河川コース。風と潮のぶつかる大荒れ水面で、地元巧者の差しと波乗りが光る"),
            new VenueData( 4, "平和島", 0.70f, 0.06f, 0.50f, 0.46f, WaterType.Seawater, 0.58f, 0.72f, 0.5f,
                "1Mホーム側が狭くイン受難。海風の吹く日は差し・まくり差しが決まる穴党の聖地"),
            new VenueData( 5, "多摩川", 0.25f, 0.02f, 0.05f, 0.52f, WaterType.Freshwater, 0.60f, 0.50f, 0f,
                "「日本一の静水面」。実力とモーターが素直に出て、センターのまくりも決まる"),
            new VenueData( 6, "浜名湖", 0.65f, 0.05f, 0.30f, 0.51f, WaterType.Brackish, 0.60f, 0.55f, 0.3f,
                "全国最大の広い汽水面。風向きが変わりやすく、スピード戦でセンター勢が活躍"),
            new VenueData( 7, "蒲郡",   0.40f, 0.03f, 0.20f, 0.55f, WaterType.Brackish, 0.48f, 0.56f, 0.2f,
                "夜は無風の鏡水面になる汽水ナイター。イン信頼+2コース差しが本線"),
            new VenueData( 8, "常滑",   0.55f, 0.04f, 0.25f, 0.53f, WaterType.Seawater, 0.50f, 0.52f, 0.3f,
                "伊勢湾の海水面。季節風が強い日は乗り心地勝負でモーターの差が出る"),
            new VenueData( 9, "津",     0.60f, 0.05f, 0.20f, 0.51f, WaterType.Seawater, 0.50f, 0.56f, 0.3f,
                "鈴鹿おろしの吹く日は白波が立つ。向かい風の日はまくり差しに妙味"),
            new VenueData(10, "三国",   0.55f, 0.04f, 0.15f, 0.54f, WaterType.Freshwater, 0.42f, 0.60f, 0f,
                "防風壁のおかげで波は穏やか。追い風基調でスロー勢の差しが利く"),
            new VenueData(11, "びわこ", 0.50f, 0.06f, 0.20f, 0.49f, WaterType.Freshwater, 0.46f, 0.56f, 0f,
                "琵琶湖特有のうねりで握りにくい難水面。モーターの善し悪しが正直に出る"),
            new VenueData(12, "住之江", 0.35f, 0.03f, 0.10f, 0.56f, WaterType.Freshwater, 0.45f, 0.56f, 0f,
                "「ボートの聖地」。淡水プールの硬い水面でイン強豪が順当に逃げるナイター"),
            new VenueData(13, "尼崎",   0.30f, 0.02f, 0.10f, 0.55f, WaterType.Freshwater, 0.42f, 0.60f, 0f,
                "静水プールでイン安定。相手筋は2の差し・3のまくり差し"),
            new VenueData(14, "鳴門",   0.65f, 0.07f, 0.60f, 0.48f, WaterType.Seawater, 0.66f, 0.50f, 0.7f,
                "鳴門海峡のうねりが入る難水面。うねりを越えたダッシュのまくりが波に乗る"),
            new VenueData(15, "丸亀",   0.50f, 0.04f, 0.40f, 0.55f, WaterType.Seawater, 0.46f, 0.55f, 0.5f,
                "瀬戸内の穏やかな海のナイター。夜凪の時間帯はイン信頼度がさらに上がる"),
            new VenueData(16, "児島",   0.45f, 0.04f, 0.50f, 0.54f, WaterType.Seawater, 0.50f, 0.52f, 0.9f,
                "干満差約3mの瀬戸内水面。満ち引きで表情が一変し、潮読みが勝負を分ける"),
            new VenueData(17, "宮島",   0.55f, 0.05f, 0.55f, 0.51f, WaterType.Seawater, 0.45f, 0.62f, 0.9f,
                "大鳥居を望む観光水面。干満差が大きく、古くから「差し水面」と呼ばれる"),
            new VenueData(18, "徳山",   0.40f, 0.03f, 0.35f, 0.61f, WaterType.Seawater, 0.36f, 0.50f, 0.6f,
                "全国屈指のイン天国。2M側ピットで枠なり進入が基本、1号艇から狙うのが鉄則"),
            new VenueData(19, "下関",   0.45f, 0.04f, 0.40f, 0.59f, WaterType.Seawater, 0.40f, 0.50f, 0.5f,
                "関門海峡そばの静かな海のナイター。イン逃げ率が高く本命党向き"),
            new VenueData(20, "若松",   0.50f, 0.04f, 0.45f, 0.57f, WaterType.Seawater, 0.45f, 0.50f, 0.5f,
                "洞海湾のナイター。風の無い夜はイン、北風の吹く日は波乱含み"),
            new VenueData(21, "芦屋",   0.20f, 0.01f, 0.05f, 0.60f, WaterType.Freshwater, 0.36f, 0.55f, 0f,
                "遠賀川そばの静水面。モーニング開催のイン逃げ王国で1コース信頼"),
            new VenueData(22, "福岡",   0.60f, 0.06f, 0.55f, 0.50f, WaterType.Brackish, 0.40f, 0.66f, 0.6f,
                "博多湾と那珂川がぶつかる1Mに独特のうねり。まくりが流れて差しが決まる"),
            new VenueData(23, "唐津",   0.55f, 0.05f, 0.30f, 0.52f, WaterType.Freshwater, 0.50f, 0.55f, 0f,
                "松浦川河口のモーニング水面。朝一は静水、風が出るとセンター台頭"),
            new VenueData(24, "大村",   0.35f, 0.03f, 0.25f, 0.65f, WaterType.Seawater, 0.32f, 0.46f, 0.4f,
                "ボートレース発祥の地。全国一のイン天国ナイターで1コース1着率65%超"),
        };

        public static VenueData Get(int id) => All.FirstOrDefault(v => v.id == id) ?? All[23];
        public static VenueData GetByName(string name) => All.FirstOrDefault(v => v.name == name) ?? All[23];
    }
}
