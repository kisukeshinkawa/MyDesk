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
        static bool bundledFont; // 同梱の極太フォント使用中(疑似ボールド二重掛けを避ける)
        static readonly Dictionary<int, Sprite> roundedCache = new Dictionary<int, Sprite>();

        // ---- 配色(TEIDOアートディレクション: HEX指定準拠) ----
        public static readonly Color Navy = new Color(0.051f, 0.169f, 0.322f);    // #0D2B52 ディープネイビー
        public static readonly Color Sky = new Color(0.310f, 0.765f, 0.969f);     // #4FC3F7 スカイシアン
        public static readonly Color Cyan = new Color(0.039f, 0.431f, 0.812f);    // #0A6ECF テイドブルー
        public static readonly Color Yellow = new Color(1f, 0.839f, 0f);          // #FFD600 サンイエロー
        public static readonly Color Red = new Color(0.898f, 0.224f, 0.208f);     // #E53935 アラートレッド
        public static readonly Color Orange = new Color(1f, 0.541f, 0f);          // #FF8A00 ビクトリーオレンジ
        public static readonly Color Emerald = new Color(0f, 0.749f, 0.647f);     // #00BFA5 ウォーターエメラルド
        public static readonly Color PanelWhite = new Color(1f, 1f, 1f, 0.96f);
        public static readonly Color TextDark = new Color(0.051f, 0.169f, 0.322f);

        // 6艇カラー(艇デザインシート準拠: 蒼天/紅焰/迅雷/碧波/紫電/銀翼)
        public static readonly Color[] BoatColors =
        {
            new Color(0.118f, 0.420f, 0.878f),  // 1号 蒼天 ブルー
            new Color(0.898f, 0.224f, 0.208f),  // 2号 紅焰 レッド
            new Color(1f, 0.769f, 0f),          // 3号 迅雷 イエロー
            new Color(0.180f, 0.620f, 0.310f),  // 4号 碧波 グリーン
            new Color(0.557f, 0.247f, 0.820f),  // 5号 紫電 パープル
            new Color(0.788f, 0.812f, 0.855f),  // 6号 銀翼 シルバー
        };

        /// <summary>日本語フォント。M PLUS Rounded 1c(同梱)最優先→ヒラギノ等→内蔵。</summary>
        public static Font JpFont()
        {
            if (jpFont != null) return jpFont;
            // ゲーム用丸ゴ極太(Assets/Resources/Fonts/)。TEIDO設計書のタイポグラフィ指定
            jpFont = Resources.Load<Font>("Fonts/MPLUSRounded1c-ExtraBold");
            if (jpFont != null) { bundledFont = true; return jpFont; }
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
            // 同梱フォントは元からExtraBold。疑似ボールドを重ねると潰れて見づらくなる
            text.fontStyle = bold && !bundledFont ? FontStyle.Bold : FontStyle.Normal;
            text.horizontalOverflow = HorizontalWrapMode.Overflow;
            text.verticalOverflow = VerticalWrapMode.Overflow;
            // テキストはクリック判定を持たない(下のボタンへのタップを遮らない)。
            // ボタン類は自身のImageがレイキャスト対象なので影響しない。
            text.raycastTarget = false;
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
            img.sprite = Rounded(26);            // ピル型(現代アニメアプリ調)
            img.type = Image.Type.Sliced;
            img.color = bg;
            var sh = go.AddComponent<Shadow>();
            sh.effectColor = new Color(0f, 0f, 0f, 0.22f);
            sh.effectDistance = new Vector2(0f, -3f);

            // ソフトな下部シェード(控えめなツートン)
            var dark = new GameObject("Shade");
            Place(dark, go.transform, new Vector2(0f, 0f), new Vector2(1f, 0.34f),
                new Vector2(3f, 3f), new Vector2(-3f, 0f));
            var darkImg = dark.AddComponent<Image>();
            darkImg.sprite = Rounded(20);
            darkImg.type = Image.Type.Sliced;
            darkImg.color = new Color(bg.r * 0.84f, bg.g * 0.84f, bg.b * 0.84f, bg.a);
            darkImg.raycastTarget = false;

            // 上部ハイライト(薄いガラス感)
            var shine = new GameObject("Shine");
            Place(shine, go.transform, new Vector2(0f, 0.55f), new Vector2(1f, 1f),
                new Vector2(4f, 0f), new Vector2(-4f, -3f));
            var shineImg = shine.AddComponent<Image>();
            shineImg.sprite = Rounded(20);
            shineImg.type = Image.Type.Sliced;
            shineImg.color = new Color(1f, 1f, 1f, 0.13f);
            shineImg.raycastTarget = false;

            var btn = go.AddComponent<Button>();
            btn.targetGraphic = img;
            btn.onClick.AddListener(() => BoatRace.Core.AudioKit.Click()); // 全ボタン共通のクリック音
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

        /// <summary>ガラスパネル(半透明+上辺の細いハイライトライン)。現代アプリUIの定番。</summary>
        public static GameObject MakeGlass(Transform parent, float darkness,
            Vector2 anchorMin, Vector2 anchorMax, Vector2 offsetMin, Vector2 offsetMax)
        {
            var go = MakePanel(parent, new Color(0.02f, 0.05f, 0.14f, darkness), 18,
                anchorMin, anchorMax, offsetMin, offsetMax);
            var line = new GameObject("TopLine");
            Place(line, go.transform, new Vector2(0f, 1f), new Vector2(1f, 1f),
                new Vector2(14f, -2f), new Vector2(-14f, 0f));
            var li = line.AddComponent<Image>();
            li.color = new Color(1f, 1f, 1f, 0.22f);
            li.raycastTarget = false;
            return go;
        }

        public static GameObject MakeFullscreenGradient(Transform parent, Color top, Color bottom)
        {
            var go = new GameObject("BG");
            Place(go, parent, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            var img = go.AddComponent<Image>();
            img.sprite = VerticalGradient(top, bottom);
            return go;
        }

        // ============ イナイレ風デザイン部品(白カード+紺枠・斜めタグ・グラデロゴ) ============

        /// <summary>枠線の紺(TEIDO: #0D2B52 ディープネイビー)。</summary>
        public static readonly Color Border = new Color(0.051f, 0.169f, 0.322f);

        /// <summary>白カード+紺の太ボーダー+影(イナイレの基本パネル)。戻り値は内側の白パネル。</summary>
        public static GameObject MakeCard(Transform parent, Vector2 anchorMin, Vector2 anchorMax,
            Vector2 offsetMin, Vector2 offsetMax, float fillAlpha = 0.97f)
        {
            var outer = MakePanel(parent, Border, 18, anchorMin, anchorMax, offsetMin, offsetMax);
            var sh = outer.AddComponent<Shadow>();
            sh.effectColor = new Color(0.02f, 0.08f, 0.20f, 0.30f);
            sh.effectDistance = new Vector2(0f, -4f);
            var inner = MakePanel(outer.transform, new Color(1f, 1f, 1f, fillAlpha), 14,
                Vector2.zero, Vector2.one, new Vector2(3.5f, 3.5f), new Vector2(-3.5f, -3.5f));
            inner.name = "CardInner";
            return inner;
        }

        /// <summary>斜めタグ(平行四辺形+太字)。「ストーリー」「報酬」等の見出しに。</summary>
        public static GameObject MakeTag(Transform parent, string text, Color bg, Color fg, int fontSize,
            Vector2 anchorMin, Vector2 anchorMax, float skew = 12f)
        {
            var go = MakePanel(parent, bg, 6, anchorMin, anchorMax, Vector2.zero, Vector2.zero);
            go.AddComponent<SkewFx>().skewX = skew;
            var sh = go.AddComponent<Shadow>();
            sh.effectColor = new Color(0f, 0f, 0f, 0.25f);
            sh.effectDistance = new Vector2(2f, -3f);
            MakeText(go.transform, text, fontSize, fg, TextAnchor.MiddleCenter,
                Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero, bold: true);
            return go;
        }

        /// <summary>イナイレ風ナビボタン: 白カード+紺枠、上端アクセント帯+記号アイコン+紺ラベル。</summary>
        public static Button MakeIconNav(Transform parent, string icon, string label, Color accent,
            Vector2 anchorMin, Vector2 anchorMax, UnityEngine.Events.UnityAction onClick)
        {
            var outer = MakePanel(parent, Border, 16, anchorMin, anchorMax, Vector2.zero, Vector2.zero);
            var sh = outer.AddComponent<Shadow>();
            sh.effectColor = new Color(0.02f, 0.08f, 0.20f, 0.30f);
            sh.effectDistance = new Vector2(0f, -3f);
            var inner = MakePanel(outer.transform, Color.white, 12,
                Vector2.zero, Vector2.one, new Vector2(3f, 3f), new Vector2(-3f, -3f));
            var strip = MakePanel(inner.transform, accent, 4,
                new Vector2(0.10f, 0.895f), new Vector2(0.90f, 0.965f), Vector2.zero, Vector2.zero);
            strip.GetComponent<Image>().raycastTarget = false;
            MakeText(inner.transform, icon, 34, accent, TextAnchor.MiddleCenter,
                new Vector2(0f, 0.32f), new Vector2(1f, 0.88f), Vector2.zero, Vector2.zero, bold: true);
            MakeText(inner.transform, label, 18, Border, TextAnchor.MiddleCenter,
                new Vector2(0f, 0.03f), new Vector2(1f, 0.32f), Vector2.zero, Vector2.zero, bold: true);
            var btn = outer.AddComponent<Button>();
            btn.targetGraphic = outer.GetComponent<Image>();
            btn.onClick.AddListener(onClick);
            return btn;
        }

        /// <summary>
        /// アニメ顔アバターをスプライト合成で生成(ウマ娘/イナイレ風の立ち絵代わり)。
        /// seedで髪型・肌・瞳が決まり、同じseedなら常に同じ顔になる。
        /// </summary>
        public static GameObject MakeFace(Transform parent, int seed, Color hair,
            Vector2 anchorMin, Vector2 anchorMax)
        {
            var rng = new System.Random(seed);
            var root = new GameObject("Face");
            Place(root, parent, anchorMin, anchorMax, Vector2.zero, Vector2.zero);

            GameObject Blob(Color c, Vector2 mn, Vector2 mx, int rad = 48)
            {
                var g = MakePanel(root.transform, c, rad, mn, mx, Vector2.zero, Vector2.zero);
                g.GetComponent<Image>().raycastTarget = false;
                return g;
            }

            // 輪郭リング(紺)→後ろ髪→顔→前髪→目→眉→口 の順に重ねる
            Blob(Border, new Vector2(0f, 0f), Vector2.one);
            Blob(hair, new Vector2(0.03f, 0.28f), new Vector2(0.97f, 1.00f));
            Color[] skins =
            {
                new Color(1.00f, 0.88f, 0.76f),
                new Color(0.98f, 0.82f, 0.66f),
                new Color(0.92f, 0.74f, 0.58f),
            };
            Blob(skins[rng.Next(skins.Length)], new Vector2(0.08f, 0.05f), new Vector2(0.92f, 0.88f));

            int bangs = rng.Next(3);
            Blob(hair, new Vector2(0.08f, 0.70f), new Vector2(0.92f, 0.98f)); // ベース前髪
            if (bangs == 0)
            {
                // ギザ前髪(イナイレ風)
                for (int i = 0; i < 3; i++)
                    Blob(hair, new Vector2(0.11f + i * 0.27f, 0.58f), new Vector2(0.35f + i * 0.27f, 0.80f), 24);
            }
            else if (bangs == 1)
            {
                // サイド流し
                Blob(hair, new Vector2(0.08f, 0.60f), new Vector2(0.56f, 0.84f), 24);
            }
            else
            {
                // 両サイドロング(ウマ娘風)
                Blob(hair, new Vector2(0.04f, 0.22f), new Vector2(0.20f, 0.82f), 24);
                Blob(hair, new Vector2(0.80f, 0.22f), new Vector2(0.96f, 0.82f), 24);
            }

            // 大きなアニメ瞳(白目→虹彩→瞳孔→ハイライト)
            Color[] irises =
            {
                new Color(0.15f, 0.38f, 0.78f), new Color(0.58f, 0.28f, 0.16f),
                new Color(0.14f, 0.58f, 0.36f), new Color(0.60f, 0.30f, 0.68f),
                new Color(0.85f, 0.45f, 0.15f),
            };
            Color iris = irises[rng.Next(irises.Length)];
            foreach (var ex in new[] { 0.30f, 0.70f })
            {
                Blob(Color.white, new Vector2(ex - 0.115f, 0.28f), new Vector2(ex + 0.115f, 0.56f), 24);
                Blob(iris, new Vector2(ex - 0.07f, 0.30f), new Vector2(ex + 0.07f, 0.54f), 24);
                Blob(new Color(0.06f, 0.08f, 0.14f), new Vector2(ex - 0.032f, 0.33f), new Vector2(ex + 0.032f, 0.47f), 16);
                Blob(Color.white, new Vector2(ex - 0.055f, 0.455f), new Vector2(ex - 0.005f, 0.52f), 12);
            }
            var brow = new Color(0.26f, 0.19f, 0.16f);
            Blob(brow, new Vector2(0.185f, 0.585f), new Vector2(0.415f, 0.625f), 6);
            Blob(brow, new Vector2(0.585f, 0.585f), new Vector2(0.815f, 0.625f), 6);
            Blob(new Color(0.78f, 0.36f, 0.30f), new Vector2(0.43f, 0.12f), new Vector2(0.57f, 0.175f), 8);
            return root;
        }

        /// <summary>イナイレ風ロゴ文字: 斜体太字+縦グラデ+極太縁取り+傾き。</summary>
        public static Text MakeLogoText(Transform parent, string str, int size, Color top, Color bottom,
            Color edge, float tilt, Vector2 anchorMin, Vector2 anchorMax)
        {
            var t = MakeText(parent, str, size, Color.white, TextAnchor.MiddleCenter,
                anchorMin, anchorMax, Vector2.zero, Vector2.zero);
            t.fontStyle = bundledFont ? FontStyle.Italic : FontStyle.BoldAndItalic;
            var g = t.gameObject.AddComponent<TextGradientFx>();
            g.top = top; g.bottom = bottom;
            // Outlineを3枚重ねて極太の縁取りにする(グラデ→縁取りの順で適用)
            foreach (var d in new[] { new Vector2(5f, 5f), new Vector2(6f, 1.5f), new Vector2(1.5f, 6f) })
            {
                var ol = t.gameObject.AddComponent<Outline>();
                ol.effectColor = edge;
                ol.effectDistance = d;
            }
            var sh = t.gameObject.AddComponent<Shadow>();
            sh.effectColor = new Color(0f, 0f, 0f, 0.45f);
            sh.effectDistance = new Vector2(4f, -6f);
            if (tilt != 0f) t.rectTransform.localEulerAngles = new Vector3(0f, 0f, tilt);
            return t;
        }
    }

    /// <summary>テキスト/画像の頂点カラーを縦グラデにする(イナイレのロゴ・数字表現)。</summary>
    public class TextGradientFx : BaseMeshEffect
    {
        public Color top = Color.white;
        public Color bottom = Color.white;

        public override void ModifyMesh(VertexHelper vh)
        {
            if (!IsActive() || vh.currentVertCount == 0) return;
            var verts = new List<UIVertex>();
            vh.GetUIVertexStream(verts);
            float minY = float.MaxValue, maxY = float.MinValue;
            for (int i = 0; i < verts.Count; i++)
            {
                minY = Mathf.Min(minY, verts[i].position.y);
                maxY = Mathf.Max(maxY, verts[i].position.y);
            }
            float h = Mathf.Max(0.001f, maxY - minY);
            for (int i = 0; i < verts.Count; i++)
            {
                var v = verts[i];
                float u = (v.position.y - minY) / h;
                v.color = Color.Lerp(bottom, top, u) * (Color)v.color;
                verts[i] = v;
            }
            vh.Clear();
            vh.AddUIVertexTriangleStream(verts);
        }
    }

    /// <summary>矩形を平行四辺形に歪める(イナイレの斜めタグ/バナー)。</summary>
    public class SkewFx : BaseMeshEffect
    {
        public float skewX = 12f;

        public override void ModifyMesh(VertexHelper vh)
        {
            if (!IsActive() || vh.currentVertCount == 0) return;
            var verts = new List<UIVertex>();
            vh.GetUIVertexStream(verts);
            float minY = float.MaxValue, maxY = float.MinValue;
            for (int i = 0; i < verts.Count; i++)
            {
                minY = Mathf.Min(minY, verts[i].position.y);
                maxY = Mathf.Max(maxY, verts[i].position.y);
            }
            float h = Mathf.Max(0.001f, maxY - minY);
            for (int i = 0; i < verts.Count; i++)
            {
                var v = verts[i];
                float u = (v.position.y - minY) / h;
                v.position.x += (u - 0.5f) * 2f * skewX;
                verts[i] = v;
            }
            vh.Clear();
            vh.AddUIVertexTriangleStream(verts);
        }
    }
}
