using UnityEngine;

namespace BoatRace.Core
{
    /// <summary>
    /// Play開始時にシーンへRaceBootstrapが無ければ自動生成する。
    /// これにより「プロジェクトを開いて▶を押すだけ」でレースが始まる。
    /// 手動でRaceBootstrapを置いた場合(設定変更時)はそちらが優先される。
    /// </summary>
    public static class AutoLaunch
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void EnsureBootstrap()
        {
            if (Object.FindObjectOfType<RaceBootstrap>() != null) return;
            new GameObject("Game").AddComponent<RaceBootstrap>();
        }
    }
}
