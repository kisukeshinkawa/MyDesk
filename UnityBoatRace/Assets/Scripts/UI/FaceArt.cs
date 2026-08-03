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
