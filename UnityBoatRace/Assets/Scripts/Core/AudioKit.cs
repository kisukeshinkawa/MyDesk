using UnityEngine;

namespace BoatRace.Core
{
    /// <summary>
    /// 効果音・BGMを全てコードで合成するオーディオキット(音源ファイル不要)。
    /// クリック/ホーン/ファンファーレ/歓声/ワゴッシュ/エンジン/BGMループ。
    /// </summary>
    public static class AudioKit
    {
        const int SR = 44100;
        static AudioSource uiSrc, bgmSrc, ambSrc;
        static AudioClip clickClip, whooshClip, hornClip, fanfareClip, cheerClip, crowdClip, engineClip;
        static bool ready;

        public static void Init(GameObject host)
        {
            if (ready) return;
            ready = true;
            uiSrc = host.AddComponent<AudioSource>();
            bgmSrc = host.AddComponent<AudioSource>();
            bgmSrc.loop = true;
            bgmSrc.volume = 0.30f;
            ambSrc = host.AddComponent<AudioSource>();
            ambSrc.loop = true;
            ambSrc.volume = 0f;

            var rng = new System.Random(11);
            float Noise() => (float)rng.NextDouble() * 2f - 1f;
            float Square(float t, float f) => Mathf.Sign(Mathf.Sin(t * f * 6.28318f));

            clickClip = Synth("click", 0.07f,
                t => Mathf.Sin(t * 1150f * 6.28318f) * Mathf.Exp(-t * 34f) * 0.5f);
            whooshClip = Synth("whoosh", 0.38f,
                t => Noise() * Mathf.Sin(3.1416f * t / 0.38f) * 0.8f, lowpass: 4);
            hornClip = Synth("horn", 0.60f,
                t => (Square(t, 440f) + Square(t, 554f) + Square(t, 659f)) / 3f * Mathf.Exp(-t * 3.2f) * 0.65f);
            fanfareClip = Synth("fanfare", 0.92f, t =>
            {
                float f = t < 0.22f ? 523.3f : t < 0.44f ? 659.3f : 784.0f;
                float lt = t % 0.22f;
                return (Square(t, f) * 0.6f + Mathf.Sin(t * f * 6.28318f) * 0.4f)
                       * Mathf.Exp(-lt * 5f) * 0.5f;
            });
            cheerClip = Synth("cheer", 1.4f,
                t => Noise() * Mathf.Sin(3.1416f * t / 1.4f) * 0.9f, lowpass: 7);
            crowdClip = Synth("crowd", 2.0f, t => Noise(), lowpass: 16);
            engineClip = Synth("engine", 1.0f, t =>
            {
                float saw = 2f * (t * 100f - Mathf.Floor(t * 100f + 0.5f));
                float saw2 = 2f * (t * 201f - Mathf.Floor(t * 201f + 0.5f));
                return (saw * 0.5f + saw2 * 0.25f + Noise() * 0.30f) * 0.5f;
            });
            bgmSrc.clip = MakeBgm();
            ambSrc.clip = crowdClip;
            ambSrc.Play();
        }

        /// <summary>波形関数からAudioClipを生成(lowpass=移動平均の窓幅)。</summary>
        static AudioClip Synth(string name, float dur, System.Func<float, float> wave, int lowpass = 0)
        {
            int n = (int)(SR * dur);
            var d = new float[n];
            for (int i = 0; i < n; i++) d[i] = wave((float)i / SR);
            if (lowpass > 1)
            {
                var s = new float[n];
                float acc = 0f;
                for (int i = 0; i < n; i++)
                {
                    acc += d[i];
                    if (i >= lowpass) acc -= d[i - lowpass];
                    s[i] = acc / lowpass;
                }
                d = s;
            }
            var clip = AudioClip.Create(name, n, 1, SR, false);
            clip.SetData(d, 0);
            return clip;
        }

        /// <summary>8秒ループの穏やかなコードBGM(C→F→Am→G)。</summary>
        static AudioClip MakeBgm()
        {
            const float dur = 8f;
            int n = (int)(SR * dur);
            var d = new float[n];
            float[][] chords =
            {
                new[] { 261.6f, 329.6f, 392.0f },  // C
                new[] { 220.0f, 261.6f, 349.2f },  // F(転回)
                new[] { 220.0f, 261.6f, 329.6f },  // Am
                new[] { 196.0f, 246.9f, 293.7f },  // G
            };
            for (int i = 0; i < n; i++)
            {
                float t = (float)i / SR;
                int ci = (int)(t / 2f) % 4;
                float lt = t % 2f;
                float env = Mathf.Min(1f, lt / 0.15f) * Mathf.Min(1f, (2f - lt) / 0.30f);
                float v = 0f;
                foreach (var f in chords[ci]) v += Mathf.Sin(t * f * 6.28318f);
                float bass = Mathf.Sin(t * chords[ci][0] * 0.5f * 6.28318f)
                             * (lt % 0.5f < 0.28f ? 0.8f : 0.25f);
                d[i] = (v / 3f * 0.45f + bass * 0.32f) * env * 0.45f;
            }
            var clip = AudioClip.Create("bgm", n, 1, SR, false);
            clip.SetData(d, 0);
            return clip;
        }

        public static AudioClip EngineLoop() => engineClip;

        public static void Click() { if (ready) uiSrc.PlayOneShot(clickClip, 0.45f); }
        public static void Whoosh() { if (ready) uiSrc.PlayOneShot(whooshClip, 0.9f); }
        public static void Horn() { if (ready) uiSrc.PlayOneShot(hornClip, 0.9f); }
        public static void Fanfare() { if (ready) uiSrc.PlayOneShot(fanfareClip, 0.9f); }
        public static void Cheer(float vol = 0.8f) { if (ready) uiSrc.PlayOneShot(cheerClip, vol); }

        public static void Bgm(bool on)
        {
            if (!ready) return;
            if (on) { if (!bgmSrc.isPlaying) bgmSrc.Play(); }
            else bgmSrc.Stop();
        }

        /// <summary>観客のざわめき音量(0でオフ)。</summary>
        public static void Crowd(float vol) { if (ready) ambSrc.volume = Mathf.Clamp01(vol); }
    }

    /// <summary>艇のエンジン音(3D)。速度でピッチと音量が変わる。</summary>
    public class EngineAudio : MonoBehaviour
    {
        Boat.BoatController boat;
        AudioSource src;

        void Start()
        {
            boat = GetComponent<Boat.BoatController>();
            src = gameObject.AddComponent<AudioSource>();
            src.clip = AudioKit.EngineLoop();
            src.loop = true;
            src.spatialBlend = 1f;
            src.minDistance = 6f;
            src.maxDistance = 120f;
            src.volume = 0f;
            if (src.clip != null) src.Play();
        }

        void Update()
        {
            if (src == null) return;
            if (boat == null || boat.engine == null) { src.volume = 0f; return; }
            float sp = boat.engine.Speed;
            src.pitch = 0.7f + sp * 0.045f;
            src.volume = Mathf.Clamp(0.08f + sp * 0.020f, 0.08f, 0.55f);
        }
    }
}
