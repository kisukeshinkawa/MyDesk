using UnityEngine;

namespace BoatRace.Data
{
    /// <summary>
    /// 会場ごとの見た目・形状の個性。
    /// 調査に基づく代表例:
    ///   戸田=日本一狭い水面 / 江戸川=河川(濁った水・流れ) / びわこ=淡水湖のうねり /
    ///   浜名湖=広大な汽水湖 / 大村・徳山・芦屋=静水面のイン天国(海水)
    /// </summary>
    public static class VenueTraits
    {
        /// <summary>水面の奥行き(z方向の半幅, m)。標準170。戸田は狭く、湖系は広い。</summary>
        public static float WaterHalfWidth(int venueId)
        {
            switch (venueId)
            {
                case 2:  return 118f; // 戸田(日本一狭い)
                case 3:  return 132f; // 江戸川(河川で細長い)
                case 4:  return 140f; // 平和島
                case 12: return 148f; // 住之江
                case 6:  return 200f; // 浜名湖(広大)
                case 11: return 190f; // びわこ
                case 7:  return 182f; // 蒲郡
                case 24: return 176f; // 大村
                default: return 168f;
            }
        }

        /// <summary>水の色。河川=濁り、淡水=緑がかった青、海水=青、汽水=中間。</summary>
        public static Color WaterBaseColor(VenueData v)
        {
            switch (v.waterType)
            {
                case WaterType.Tidal:     return new Color(0.16f, 0.30f, 0.30f); // 江戸川の濁り
                case WaterType.Freshwater: return new Color(0.05f, 0.32f, 0.42f);
                case WaterType.Brackish:  return new Color(0.05f, 0.33f, 0.50f);
                default:                  return new Color(0.02f, 0.30f, 0.56f); // 海水
            }
        }

        /// <summary>スタンド屋根・装飾のアクセント色(場ごとに固有)。</summary>
        public static Color AccentColor(int venueId)
        {
            return Color.HSVToRGB((venueId * 0.618034f) % 1f, 0.62f, 0.82f);
        }
    }
}
