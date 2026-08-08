#if UNITY_IOS
using System.IO;
using UnityEditor;
using UnityEditor.Callbacks;
using UnityEditor.iOS.Xcode;
using UnityEngine;

namespace BoatRace.EditorTools
{
    /// <summary>
    /// iOS書き出し後にInfo.plistを補正する。
    /// ITSAppUsesNonExemptEncryption=NO を入れておくと、TestFlightに上げるたびに
    /// 「輸出コンプライアンス(暗号化の使用)」を聞かれずに済む。
    /// (このゲームは独自の暗号化を一切使っていないためNOで正しい)
    /// </summary>
    public static class IOSPostBuild
    {
        [PostProcessBuild(999)]
        public static void OnPostprocessBuild(BuildTarget target, string pathToBuiltProject)
        {
            if (target != BuildTarget.iOS) return;
            string plistPath = Path.Combine(pathToBuiltProject, "Info.plist");
            if (!File.Exists(plistPath)) return;

            var plist = new PlistDocument();
            plist.ReadFromFile(plistPath);
            plist.root.SetBoolean("ITSAppUsesNonExemptEncryption", false);
            plist.root.SetBoolean("UIRequiresFullScreen", true);
            plist.WriteToFile(plistPath);
            Debug.Log("[艇道ビルド] Info.plistを補正しました(輸出コンプライアンス質問をスキップ)");
        }
    }
}
#endif
