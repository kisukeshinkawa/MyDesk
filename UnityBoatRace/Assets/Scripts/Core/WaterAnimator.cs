using UnityEngine;

namespace BoatRace.Core
{
    /// <summary>
    /// 水面の見た目。パーリンノイズで波模様テクスチャを生成し、
    /// ゆっくりスクロールさせて「動いている水」に見せる。
    /// </summary>
    public class WaterAnimator : MonoBehaviour
    {
        Material mat;
        Vector2 offset;

        public void Initialize(Material material)
        {
            mat = material;
            mat.mainTexture = GenerateWaveTexture();
            mat.mainTextureScale = new Vector2(14f, 7f);
        }

        void Update()
        {
            if (mat == null) return;
            offset += new Vector2(0.010f, 0.006f) * Time.deltaTime;
            mat.mainTextureOffset = offset;
        }

        static Texture2D GenerateWaveTexture()
        {
            const int size = 256;
            var tex = new Texture2D(size, size, TextureFormat.RGB24, true);
            var deep = new Color(0.02f, 0.26f, 0.47f);
            var mid = new Color(0.05f, 0.36f, 0.60f);
            var light = new Color(0.35f, 0.62f, 0.80f);

            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float n = Mathf.PerlinNoise(x * 0.035f, y * 0.035f) * 0.65f
                            + Mathf.PerlinNoise(x * 0.11f, y * 0.11f) * 0.35f;
                    Color c = n < 0.55f ? Color.Lerp(deep, mid, n / 0.55f)
                                        : Color.Lerp(mid, light, (n - 0.55f) / 0.45f);
                    tex.SetPixel(x, y, c);
                }
            tex.Apply();
            tex.wrapMode = TextureWrapMode.Repeat;
            tex.filterMode = FilterMode.Bilinear;
            return tex;
        }
    }
}
