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

        public static readonly Color[] BoatColors =
        {
            Color.white, new Color(0.15f, 0.15f, 0.15f), new Color(0.9f, 0.15f, 0.1f),
            new Color(0.1f, 0.3f, 0.9f), new Color(0.95f, 0.8f, 0.1f), new Color(0.1f, 0.7f, 0.25f),
        };

        /// <summary>日本語が出るフォント(Macのヒラギノ等→無ければ内蔵フォント)。</summary>
        public static Font JpFont()
        {
            if (jpFont != null) return jpFont;
            var installed = new HashSet<string>(Font.GetOSInstalledFontNames());
            string[] candidates = { "Hiragino Sans", "Hiragino Kaku Gothic ProN", "ヒラギノ角ゴシック",
                                    "Yu Gothic", "Meiryo", "Noto Sans CJK JP", "Arial Unicode MS" };
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
            bool bold = false, bool shadow = false)
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
            if (shadow)
            {
                var sh = go.AddComponent<Shadow>();
                sh.effectColor = new Color(0f, 0f, 0f, 0.5f);
                sh.effectDistance = new Vector2(2f, -2f);
            }
            return text;
        }

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
            sh.effectDistance = new Vector2(0f, -4f);
            var btn = go.AddComponent<Button>();
            btn.targetGraphic = img;
            btn.onClick.AddListener(onClick);
            MakeText(go.transform, label, fontSize, Color.white, TextAnchor.MiddleCenter,
                Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero, bold: true, shadow: true);
            return btn;
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
