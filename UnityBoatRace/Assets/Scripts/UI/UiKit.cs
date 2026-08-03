using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace BoatRace.UI
{
    /// <summary>
    /// スマホゲー風UIをコードだけで組むためのユーティリティ。
    /// 角丸スプライト・グラデ背景・日本語フォント・ボタン/テキスト生成。
    /// </summary>
    public static class UiKit
    {
        static Font jpFont;
        static readonly Dictionary<int, Sprite> roundedCache = new Dictionary<int, Sprite>();

        // ---- 配色(ポップなスポーツゲー風) ----
        public static readonly Color Navy = new Color(0.07f, 0.16f, 0.35f);
        public static readonly Color Sky = new Color(0.42f, 0.78f, 0.98f);
        public static readonly Color Cyan = new Color(0.20f, 0.60f, 0.95f);
        public static readonly Color Yellow = new Color(1f, 0.83f, 0.15f);
        public static readonly Color Red = new Color(0.95f, 0.25f, 0.20f);
        public static readonly Color PanelWhite = new Color(1f, 1f, 1f, 0.96f);
        public static readonly Color TextDark = new Color(0.12f, 0.17f, 0.28f);

        // アニメ調の鮮やかな艇色(1白 2黒 3赤 4青 5黄 6緑)
        public static readonly Color[] BoatColors =
        {
            Color.white, new Color(0.16f, 0.17f, 0.20f), new Color(1f, 0.16f, 0.12f),
            new Color(0.05f, 0.38f, 1f), new Color(1f, 0.86f, 0.05f), new Color(0.05f, 0.8f, 0.32f),
        };

        /// <summary>日本語が出るフォント(Macのヒラギノ等→無ければ内蔵フォント)。</summary>
        public static Font JpFont()
        {
            if (jpFont != null) return jpFont;
            var installed = new HashSet<string>(Font.GetOSInstalledFontNames());
            // 丸ゴシックを最優先(スマホゲーらしい柔らかい太字になる)
            string[] candidates = { "Hiragino Maru Gothic ProN", "Hiragino Maru Gothic Pro",
                                    "ヒラギノ丸ゴ ProN", "Hiragino Sans", "Hiragino Kaku Gothic ProN",
                                    "ヒラギノ角ゴシック", "Yu Gothic", "Meiryo", "Noto Sans CJK JP" };
            foreach (var name in candidates)
            {
                if (!installed.Contains(name)) continue;
                jpFont = Font.CreateDynamicFontFromOSFont(name, 32);
                if (jpFont != null) return jpFont;
            }
            jpFont = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            return jpFont;
        }

        /// <summary>白い角丸スプライト(9-slice)。Image.colorで着色して使う。</summary>
        public static Sprite Rounded(int radius)
        {
            if (roundedCache.TryGetValue(radius, out var cached)) return cached;
            int size = radius * 2 + 6;
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false);
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float cx = Mathf.Clamp(x, radius, size - radius);
                    float cy = Mathf.Clamp(y, radius, size - radius);
                    float d = Vector2.Distance(new Vector2(x, y), new Vector2(cx, cy));
                    float a = Mathf.Clamp01(radius - d + 1f);
                    tex.SetPixel(x, y, new Color(1f, 1f, 1f, a));
                }
            tex.Apply();
            tex.filterMode = FilterMode.Bilinear;
            var sp = Sprite.Create(tex, new Rect(0, 0, size, size), Vector2.one * 0.5f, 100f, 0,
                SpriteMeshType.FullRect, new Vector4(radius + 2, radius + 2, radius + 2, radius + 2));
            roundedCache[radius] = sp;
            return sp;
        }

        static Sprite stripesCache;

        /// <summary>斜めストライプ(タイル用)。背景に薄く敷くとスポーツゲーらしくなる。</summary>
        public static Sprite Stripes()
        {
            if (stripesCache != null) return stripesCache;
            const int size = 64, period = 32;
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false);
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    bool on = ((x + y) / (period / 2)) % 2 == 0;
                    tex.SetPixel(x, y, new Color(1f, 1f, 1f, on ? 1f : 0f));
                }
            tex.Apply();
            tex.wrapMode = TextureWrapMode.Repeat;
            stripesCache = Sprite.Create(tex, new Rect(0, 0, size, size), Vector2.one * 0.5f, 64f);
            return stripesCache;
        }

        /// <summary>薄いストライプのオーバーレイを敷く(クリックは透過)。</summary>
        public static void AddStripeOverlay(GameObject target, Color color, float alpha)
        {
            var go = new GameObject("Stripes");
            Place(go, target.transform, Vector2.zero, Vector2.one, new Vector2(3f, 3f), new Vector2(-3f, -3f));
            var img = go.AddComponent<Image>();
            img.sprite = Stripes();
            img.type = Image.Type.Tiled;
            img.color = new Color(color.r, color.g, color.b, alpha);
            img.raycastTarget = false;
        }

        /// <summary>小さな情報チップ(角丸背景+太字テキスト)。</summary>
        public static GameObject MakeChip(Transform parent, string text, Color bg, Color fg, int fontSize,
            Vector2 anchorMin, Vector2 anchorMax, Vector2 offsetMin, Vector2 offsetMax)
        {
            var chip = MakePanel(parent, bg, 14, anchorMin, anchorMax, offsetMin, offsetMax);
            MakeText(chip.transform, text, fontSize, fg, TextAnchor.MiddleCenter,
                Vector2.zero, Vector2.one, new Vector2(10f, 0f), new Vector2(-10f, 0f), bold: true);
            return chip;
        }

        static Sprite speedLinesCache;

        /// <summary>集中線スプライト(必殺技カットイン用)。中心から放射状の白線。</summary>
        public static Sprite SpeedLines()
        {
            if (speedLinesCache != null) return speedLinesCache;
            const int size = 512;
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false);
            var clear = new Color(1f, 1f, 1f, 0f);
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float dx = x - size * 0.5f, dy = y - size * 0.5f;
                    float dist = Mathf.Sqrt(dx * dx + dy * dy) / (size * 0.5f);
                    float ang = Mathf.Atan2(dy, dx);
                    // 角度で細い線を刻み、外周ほど濃く中心は透明
                    float line = Mathf.PerlinNoise(ang * 9.5f, 0.5f) > 0.62f ? 1f : 0f;
                    float a = line * Mathf.SmoothStep(0f, 1f, (dist - 0.35f) / 0.5f);
                    tex.SetPixel(x, y, a > 0f ? new Color(1f, 1f, 1f, a * 0.85f) : clear);
                }
            tex.Apply();
            speedLinesCache = Sprite.Create(tex, new Rect(0, 0, size, size), Vector2.one * 0.5f);
            return speedLinesCache;
        }

        /// <summary>縦グラデーションスプライト。</summary>
        public static Sprite VerticalGradient(Color top, Color bottom)
        {
            var tex = new Texture2D(1, 128, TextureFormat.RGBA32, false);
            for (int y = 0; y < 128; y++)
                tex.SetPixel(0, y, Color.Lerp(bottom, top, y / 127f));
            tex.Apply();
            tex.wrapMode = TextureWrapMode.Clamp;
            return Sprite.Create(tex, new Rect(0, 0, 1, 128), Vector2.one * 0.5f);
        }

        public static Canvas MakeCanvas()
        {
            var go = new GameObject("UICanvas");
            var canvas = go.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 10;
            var scaler = go.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1600, 900);
            scaler.matchWidthOrHeight = 0.5f;
            go.AddComponent<GraphicRaycaster>();
            return canvas;
        }

        /// <summary>RectTransformをアンカー矩形で配置。</summary>
        public static RectTransform Place(GameObject go, Transform parent,
            Vector2 anchorMin, Vector2 anchorMax, Vector2 offsetMin, Vector2 offsetMax)
        {
            go.transform.SetParent(parent, false);
            var rt = go.GetComponent<RectTransform>();
            if (rt == null) rt = go.AddComponent<RectTransform>();
            rt.anchorMin = anchorMin; rt.anchorMax = anchorMax;
            rt.offsetMin = offsetMin; rt.offsetMax = offsetMax;
            return rt;
        }

        public static GameObject MakePanel(Transform parent, Color color, int radius,
            Vector2 anchorMin, Vector2 anchorMax, Vector2 offsetMin, Vector2 offsetMax)
        {
            var go = new GameObject("Panel");
            Place(go, parent, anchorMin, anchorMax, offsetMin, offsetMax);
            var img = go.AddComponent<Image>();
            img.sprite = Rounded(radius);
            img.type = Image.Type.Sliced;
            img.color = color;
            return go;
        }

        public static Text MakeText(Transform parent, string str, int size, Color color,
            TextAnchor anchor, Vector2 anchorMin, Vector2 anchorMax, Vector2 offsetMin, Vector2 offsetMax,
            bool bold = false, bool shadow = false, bool outline = false)
        {
            var go = new GameObject("Text");
            Place(go, parent, anchorMin, anchorMax, offsetMin, offsetMax);
            var text = go.AddComponent<Text>();
            text.font = JpFont();
            text.text = str;
            text.fontSize = size;
            text.color = color;
            text.alignment = anchor;
            text.fontStyle = bold ? FontStyle.Bold : FontStyle.Normal;
            text.horizontalOverflow = HorizontalWrapMode.Overflow;
            text.verticalOverflow = VerticalWrapMode.Overflow;
            if (outline)
            {
                var ol = go.AddComponent<Outline>();
                ol.effectColor = new Color(0.05f, 0.1f, 0.25f, 0.95f);
                ol.effectDistance = new Vector2(2f, 2f);
            }
            if (shadow)
            {
                var sh = go.AddComponent<Shadow>();
                sh.effectColor = new Color(0f, 0f, 0f, 0.5f);
                sh.effectDistance = new Vector2(2f, -2f);
            }
            return text;
        }

        /// <summary>スマホゲー風ツートンボタン(上ハイライト・下シェード・縁取り文字)。</summary>
        public static Button MakeButton(Transform parent, string label, Color bg, int fontSize,
            Vector2 anchorMin, Vector2 anchorMax, Vector2 offsetMin, Vector2 offsetMax,
            UnityEngine.Events.UnityAction onClick)
        {
            var go = new GameObject("Button_" + label);
            Place(go, parent, anchorMin, anchorMax, offsetMin, offsetMax);
            var img = go.AddComponent<Image>();
            img.sprite = Rounded(18);
            img.type = Image.Type.Sliced;
            img.color = bg;
            var sh = go.AddComponent<Shadow>();
            sh.effectColor = new Color(0f, 0f, 0f, 0.35f);
            sh.effectDistance = new Vector2(0f, -5f);

            // 下部シェード(ツートン)
            var dark = new GameObject("Shade");
            Place(dark, go.transform, new Vector2(0f, 0f), new Vector2(1f, 0.30f),
                new Vector2(3f, 3f), new Vector2(-3f, 0f));
            var darkImg = dark.AddComponent<Image>();
            darkImg.sprite = Rounded(12);
            darkImg.type = Image.Type.Sliced;
            darkImg.color = new Color(bg.r * 0.68f, bg.g * 0.68f, bg.b * 0.68f, bg.a);
            darkImg.raycastTarget = false;

            // 上部ハイライト
            var shine = new GameObject("Shine");
            Place(shine, go.transform, new Vector2(0f, 0.58f), new Vector2(1f, 1f),
                new Vector2(4f, 0f), new Vector2(-4f, -3f));
            var shineImg = shine.AddComponent<Image>();
            shineImg.sprite = Rounded(12);
            shineImg.type = Image.Type.Sliced;
            shineImg.color = new Color(1f, 1f, 1f, 0.20f);
            shineImg.raycastTarget = false;

            var btn = go.AddComponent<Button>();
            btn.targetGraphic = img;
            btn.onClick.AddListener(onClick);
            MakeText(go.transform, label, fontSize, Color.white, TextAnchor.MiddleCenter,
                Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero,
                bold: true, shadow: true, outline: true);
            return btn;
        }

        /// <summary>見出しバナー(紺帯＋黄色アクセント＋縁取り文字。tiltで少し傾けると躍動感)。</summary>
        public static GameObject MakeBanner(Transform parent, string title, int fontSize,
            Vector2 anchorMin, Vector2 anchorMax, float tilt = 0f)
        {
            var bar = MakePanel(parent, Navy, 14, anchorMin, anchorMax, Vector2.zero, Vector2.zero);
            if (tilt != 0f) bar.GetComponent<RectTransform>().localEulerAngles = new Vector3(0f, 0f, tilt);
            AddStripeOverlay(bar, Color.white, 0.06f);
            var accent = new GameObject("Accent");
            Place(accent, bar.transform, new Vector2(0f, 0f), new Vector2(0f, 1f),
                new Vector2(6f, 6f), new Vector2(16f, -6f));
            var accImg = accent.AddComponent<Image>();
            accImg.sprite = Rounded(5);
            accImg.type = Image.Type.Sliced;
            accImg.color = Yellow;
            MakeText(bar.transform, title, fontSize, Color.white, TextAnchor.MiddleCenter,
                Vector2.zero, Vector2.one, new Vector2(20f, 0f), new Vector2(-8f, 0f),
                bold: true, shadow: true, outline: true);
            return bar;
        }

        public static GameObject MakeFullscreenGradient(Transform parent, Color top, Color bottom)
        {
            var go = new GameObject("BG");
            Place(go, parent, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            var img = go.AddComponent<Image>();
            img.sprite = VerticalGradient(top, bottom);
            return go;
        }
    }
}
