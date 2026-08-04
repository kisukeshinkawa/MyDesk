using UnityEngine;

namespace BoatRace.UI
{
    /// <summary>
    /// AI生成の顔シート(Assets/Resources/Art/faces.png)を実行時にスライスして
    /// 選手の顔スプライトを返す。画像が無ければnullを返し、呼び出し側は
    /// 手続き生成のアニメ顔(UiKit.MakeFace)へ自動フォールバックする。
    /// シート構成: 1-12=レジェンド / 13=自分 / 14-21=ライバル1-8。
    /// </summary>
    public static class FaceArt
    {
        static Texture2D sheet;
        static bool tried;
        static readonly Sprite[] cache = new Sprite[22];

        static float[] C(float cx, float cy) => new[] { cx, cy, 0.145f, 0.210f };

        // 正規化セル(中心x, 中心y[下基準])。シートのレイアウトに合わせた推定値
        static readonly float[][] Cells =
        {
            null,
            // 1段目: レジェンド1-6
            C(0.083f, 0.878f), C(0.250f, 0.878f), C(0.417f, 0.878f),
            C(0.583f, 0.878f), C(0.750f, 0.878f), C(0.917f, 0.878f),
            // 2段目: レジェンド7-12
            C(0.083f, 0.607f), C(0.250f, 0.607f), C(0.417f, 0.607f),
            C(0.583f, 0.607f), C(0.750f, 0.607f), C(0.917f, 0.607f),
            // 自分(13)
            C(0.100f, 0.268f),
            // ライバル1-4(14-17)
            C(0.365f, 0.350f), C(0.545f, 0.350f), C(0.725f, 0.350f), C(0.905f, 0.350f),
            // ライバル5-8(18-21)
            C(0.365f, 0.128f), C(0.545f, 0.128f), C(0.725f, 0.128f), C(0.905f, 0.128f),
        };

        public static Sprite Get(int id)
        {
            if (!tried)
            {
                tried = true;
                sheet = Resources.Load<Texture2D>("Art/faces");
            }
            if (sheet == null || id < 1 || id > 21) return null;
            if (cache[id] != null) return cache[id];
            var c = Cells[id];
            float w = c[2] * sheet.width, h = c[3] * sheet.height;
            var rect = new Rect(c[0] * sheet.width - w * 0.5f, c[1] * sheet.height - h * 0.5f, w, h);
            rect.x = Mathf.Clamp(rect.x, 0f, sheet.width - w);
            rect.y = Mathf.Clamp(rect.y, 0f, sheet.height - h);
            cache[id] = Sprite.Create(sheet, rect, new Vector2(0.5f, 0.5f), 100f);
            return cache[id];
        }

        // ---- 艇デザインシート(Art/boats.png 3列×2段)からヒーロー絵を切り出す ----
        static Texture2D boatSheet;
        static bool boatTried;
        static readonly Sprite[] boatCache = new Sprite[6];

        public static Sprite Boat(int idx)
        {
            if (!boatTried)
            {
                boatTried = true;
                boatSheet = Resources.Load<Texture2D>("Art/boats");
            }
            if (boatSheet == null || idx < 0 || idx > 5) return null;
            if (boatCache[idx] != null) return boatCache[idx];
            int col = idx % 3, row = idx / 3; // 上段=1-3号艇, 下段=4-6号艇
            float u0 = col / 3f + 0.015f, u1 = col / 3f + 0.315f;
            float v0 = row == 0 ? 0.60f : 0.10f;
            float v1 = row == 0 ? 0.97f : 0.47f;
            var rect = new Rect(u0 * boatSheet.width, v0 * boatSheet.height,
                (u1 - u0) * boatSheet.width, (v1 - v0) * boatSheet.height);
            boatCache[idx] = Sprite.Create(boatSheet, rect, new Vector2(0.5f, 0.5f), 100f);
            return boatCache[idx];
        }

        // ---- NPC顔シート(Art/npcs.png 2×2: 支部長/実況アナ/記者/整備士) ----
        static Texture2D npcSheet;
        static bool npcTried;
        static readonly Sprite[] npcCache = new Sprite[4];

        public static Sprite Npc(int idx)
        {
            if (!npcTried)
            {
                npcTried = true;
                npcSheet = Resources.Load<Texture2D>("Art/npcs");
            }
            if (npcSheet == null || idx < 0 || idx > 3) return null;
            if (npcCache[idx] != null) return npcCache[idx];
            int col = idx % 2, row = idx / 2; // 左上=支部長, 右上=実況, 左下=記者, 右下=整備士
            var rect = new Rect(
                (col * 0.5f + 0.02f) * npcSheet.width,
                (row == 0 ? 0.52f : 0.02f) * npcSheet.height, // テクスチャ座標は下基準
                0.46f * npcSheet.width, 0.46f * npcSheet.height);
            npcCache[idx] = Sprite.Create(npcSheet, rect, new Vector2(0.5f, 0.5f), 100f);
            return npcCache[idx];
        }

        /// <summary>タイトル用アート(title_kv/logo_teido)。無ければnull。</summary>
        public static Sprite LoadArt(string name)
        {
            var tex = Resources.Load<Texture2D>("Art/" + name);
            if (tex == null) return null;
            return Sprite.Create(tex, new Rect(0f, 0f, tex.width, tex.height),
                new Vector2(0.5f, 0.5f), 100f);
        }
    }
}
