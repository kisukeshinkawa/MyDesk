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
            // 実艇のスタートホーン風: 415Hz基音+倍音の電子ホーンを1.1秒サステイン
            hornClip = Synth("horn", 1.15f, t =>
            {
                float body = Mathf.Sin(t * 415f * 6.28318f)
                           + 0.55f * Mathf.Sin(t * 830f * 6.28318f)
                           + 0.25f * Mathf.Sin(t * 1245f * 6.28318f);
                float vib = 1f + 0.05f * Mathf.Sin(t * 9f * 6.28318f);
                float attack = Mathf.Min(1f, t / 0.03f);
                float release = Mathf.Exp(-Mathf.Max(0f, t - 0.85f) * 9f);
                return body * vib * attack * release * 0.33f;
            });
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

            // ---- 音源ファイル優先(Assets/Resources/Sounds/ に置くだけで差し替わる) ----
            // se_click / se_whoosh / se_horn / se_fanfare / se_cheer / se_crowd /
            // se_engine / bgm_menu / bgm_race (.wav .mp3 .ogg)
            AudioClip F(string name) => Resources.Load<AudioClip>("Sounds/" + name);
            clickClip = F("se_click") ?? clickClip;
            whooshClip = F("se_whoosh") ?? whooshClip;
            hornClip = F("se_horn") ?? hornClip;
            fanfareClip = F("se_fanfare") ?? fanfareClip;
            cheerClip = F("se_cheer") ?? cheerClip;
            engineClip = F("se_engine") ?? engineClip;
            var crowdFile = F("se_crowd");
            if (crowdFile != null) { crowdClip = crowdFile; ambSrc.clip = crowdClip; ambSrc.Play(); }
            var menuFile = F("bgm_menu");
            if (menuFile != null) bgmSrc.clip = menuFile;
            raceBgmClip = F("bgm_race");
            int files = 0;
            foreach (var n in new[] { "se_click","se_whoosh","se_horn","se_fanfare","se_cheer","se_crowd","se_engine","bgm_menu","bgm_race" })
                if (F(n) != null) files++;
            Debug.Log($"[音源チェック] Sounds/フォルダのファイル: {files}/9 (無い音は内蔵シンセで再生)");
            LoadVolumes(); // 保存済みの音量設定を反映
        }

        static AudioClip raceBgmClip;

        // ---- 音量設定(0-1。PlayerPrefsに保存され次回起動でも有効) ----
        public static float BgmVol { get; private set; } = 1f;
        public static float SeVol { get; private set; } = 1f;
        static float crowdBase; // Crowd()で指定された基準音量

        public static void LoadVolumes()
        {
            BgmVol = PlayerPrefs.GetFloat("br_vol_bgm", 1f);
            SeVol = PlayerPrefs.GetFloat("br_vol_se", 1f);
            ApplyVolumes();
        }

        public static void SetBgmVolume(float v)
        {
            BgmVol = Mathf.Clamp01(v);
            PlayerPrefs.SetFloat("br_vol_bgm", BgmVol);
            ApplyVolumes();
        }

        public static void SetSeVolume(float v)
        {
            SeVol = Mathf.Clamp01(v);
            PlayerPrefs.SetFloat("br_vol_se", SeVol);
            ApplyVolumes();
        }

        static void ApplyVolumes()
        {
            if (!ready) return;
            bgmSrc.volume = 0.30f * BgmVol;
            uiSrc.volume = SeVol;
            ambSrc.volume = crowdBase * SeVol;
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

        /// <summary>
        /// 15秒ループのアップテンポなチップチューンBGM(128BPM・王道進行 C→G→Am→F。
        /// パッド+8分ベース+16分アルペジオ+キック/ハット)。
        /// </summary>
        static AudioClip MakeBgm()
        {
            const float bpm = 128f;
            float beat = 60f / bpm;
            float dur = beat * 32f; // 8小節ちょうどでループ
            int n = (int)(SR * dur);
            var d = new float[n];
            float[][] chords =
            {
                new[] { 261.6f, 329.6f, 392.0f },  // C
                new[] { 196.0f, 246.9f, 293.7f },  // G
                new[] { 220.0f, 261.6f, 329.6f },  // Am
                new[] { 174.6f, 220.0f, 261.6f },  // F
            };
            float[] bassRoot = { 130.8f, 98.0f, 110.0f, 87.3f };
            int[] arpSeq = { 0, 1, 2, 1, 0, 2, 1, 2 };
            var drumRng = new System.Random(5);
            for (int i = 0; i < n; i++)
            {
                float t = (float)i / SR;
                int ci = (int)(t / (beat * 4f)) % 4;
                // パッド(和音を柔らかく)
                float pad = 0f;
                foreach (var f in chords[ci]) pad += Mathf.Sin(t * f * 6.28318f);
                pad *= 0.085f;
                // ベース(8分の矩形。減衰で刻む)
                float ph8 = (t / (beat * 0.5f)) % 1f;
                float bass = Mathf.Sign(Mathf.Sin(t * bassRoot[ci] * 6.28318f))
                             * Mathf.Exp(-ph8 * 5f) * 0.15f;
                // アルペジオ(1オクターブ上を16分で駆ける)
                int step = (int)(t / (beat * 0.5f)) % 8;
                float af = chords[ci][arpSeq[step]] * 2f;
                float arp = Mathf.Sin(t * af * 6.28318f) * Mathf.Exp(-ph8 * 6f) * 0.13f;
                // ドラム: キック(拍頭)+ハット(8分)
                float inBeat = (t / beat) % 1f;
                float kick = Mathf.Sin(58f * 6.28318f * inBeat) * Mathf.Exp(-inBeat * 28f) * 0.42f;
                float hat = ((float)drumRng.NextDouble() * 2f - 1f) * Mathf.Exp(-ph8 * 42f) * 0.07f;
                d[i] = pad + bass + arp + kick + hat;
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

        static AudioClip menuBgmCache;

        /// <summary>BGM切替。on=メニュー曲 / off=レース(bgm_raceがあれば流す、無ければ無音)。</summary>
        public static void Bgm(bool on)
        {
            if (!ready) return;
            if (menuBgmCache == null) menuBgmCache = bgmSrc.clip;
            if (on)
            {
                if (bgmSrc.clip != menuBgmCache) { bgmSrc.clip = menuBgmCache; bgmSrc.Play(); }
                else if (!bgmSrc.isPlaying) bgmSrc.Play();
            }
            else if (raceBgmClip != null)
            {
                // レース用BGMファイルがあれば控えめ音量で流す
                if (bgmSrc.clip != raceBgmClip) { bgmSrc.clip = raceBgmClip; bgmSrc.Play(); }
            }
            else bgmSrc.Stop();
        }

        /// <summary>観客のざわめき音量(0でオフ)。</summary>
        public static void Crowd(float vol)
        {
            if (!ready) return;
            crowdBase = Mathf.Clamp01(vol);
            ambSrc.volume = crowdBase * SeVol;
        }
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
            src.volume = Mathf.Clamp(0.08f + sp * 0.020f, 0.08f, 0.55f) * AudioKit.SeVol;
        }
    }
}
