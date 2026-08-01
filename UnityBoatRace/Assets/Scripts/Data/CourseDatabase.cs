using System.Collections.Generic;
using System.Linq;

namespace BoatRace.Data
{
    public enum WaterType { Freshwater, Seawater, Brackish, Tidal }

    /// <summary>競艇場ごとの水面特性。</summary>
    [System.Serializable]
    public class VenueData
    {
        public int id;
        public string name;
        public float windEffect;       // 風の影響度 0-1
        public float waveHeight;       // 平均波高(m)
        public float currentStrength;  // 潮流/水流の強さ 0-1
        public float insideAdvantage;  // イン有利度 0-1 (1コース1着率の目安)
        public WaterType waterType;

        public VenueData(int id, string name, float wind, float wave, float current, float inside, WaterType type)
        {
            this.id = id; this.name = name;
            windEffect = wind; waveHeight = wave;
            currentStrength = current; insideAdvantage = inside;
            waterType = type;
        }
    }

    /// <summary>全国24競艇場データベース。</summary>
    public static class CourseDatabase
    {
        public static readonly List<VenueData> All = new List<VenueData>
        {
            new VenueData( 1, "桐生",   0.60f, 0.03f, 0.10f, 0.48f, WaterType.Freshwater),
            new VenueData( 2, "戸田",   0.30f, 0.02f, 0.05f, 0.42f, WaterType.Freshwater),
            new VenueData( 3, "江戸川", 0.90f, 0.12f, 0.90f, 0.44f, WaterType.Tidal),
            new VenueData( 4, "平和島", 0.70f, 0.06f, 0.50f, 0.43f, WaterType.Seawater),
            new VenueData( 5, "多摩川", 0.25f, 0.02f, 0.05f, 0.47f, WaterType.Freshwater),
            new VenueData( 6, "浜名湖", 0.65f, 0.05f, 0.30f, 0.46f, WaterType.Brackish),
            new VenueData( 7, "蒲郡",   0.40f, 0.03f, 0.20f, 0.50f, WaterType.Brackish),
            new VenueData( 8, "常滑",   0.55f, 0.04f, 0.25f, 0.49f, WaterType.Seawater),
            new VenueData( 9, "津",     0.60f, 0.05f, 0.20f, 0.47f, WaterType.Seawater),
            new VenueData(10, "三国",   0.55f, 0.04f, 0.15f, 0.50f, WaterType.Freshwater),
            new VenueData(11, "びわこ", 0.50f, 0.06f, 0.20f, 0.45f, WaterType.Freshwater),
            new VenueData(12, "住之江", 0.35f, 0.03f, 0.10f, 0.52f, WaterType.Freshwater),
            new VenueData(13, "尼崎",   0.30f, 0.02f, 0.10f, 0.51f, WaterType.Freshwater),
            new VenueData(14, "鳴門",   0.65f, 0.07f, 0.60f, 0.46f, WaterType.Seawater),
            new VenueData(15, "丸亀",   0.50f, 0.04f, 0.40f, 0.51f, WaterType.Seawater),
            new VenueData(16, "児島",   0.45f, 0.04f, 0.50f, 0.52f, WaterType.Seawater),
            new VenueData(17, "宮島",   0.55f, 0.05f, 0.55f, 0.48f, WaterType.Seawater),
            new VenueData(18, "徳山",   0.40f, 0.03f, 0.35f, 0.55f, WaterType.Seawater),
            new VenueData(19, "下関",   0.45f, 0.04f, 0.40f, 0.54f, WaterType.Seawater),
            new VenueData(20, "若松",   0.50f, 0.04f, 0.45f, 0.53f, WaterType.Seawater),
            new VenueData(21, "芦屋",   0.20f, 0.01f, 0.05f, 0.55f, WaterType.Freshwater),
            new VenueData(22, "福岡",   0.60f, 0.06f, 0.55f, 0.49f, WaterType.Brackish),
            new VenueData(23, "唐津",   0.55f, 0.05f, 0.30f, 0.50f, WaterType.Freshwater),
            new VenueData(24, "大村",   0.35f, 0.03f, 0.25f, 0.60f, WaterType.Seawater),
        };

        public static VenueData Get(int id) => All.FirstOrDefault(v => v.id == id) ?? All[23];
        public static VenueData GetByName(string name) => All.FirstOrDefault(v => v.name == name) ?? All[23];
    }
}
