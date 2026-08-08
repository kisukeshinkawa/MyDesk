using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace BoatRace.EditorTools
{
    /// <summary>
    /// 艇道のワンクリックビルド。Unityメニューの「艇道ビルド」から書き出す。
    /// 出力先はプロジェクト直下の Builds/ (gitには入らない)。
    /// </summary>
    public static class BuildTools
    {
        const string Product = "艇道 TEIDO";
        const string Company = "DUSTALK";
        const string BundleId = "com.dustalk.teido";

        static string[] Scenes()
        {
            var list = EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).ToArray();
            if (list.Length > 0) return list;
            // Build Settingsにシーン未登録なら、いま開いているシーンを使う
            var cur = UnityEngine.SceneManagement.SceneManager.GetActiveScene().path;
            if (string.IsNullOrEmpty(cur))
            {
                EditorUtility.DisplayDialog("艇道ビルド",
                    "シーンが保存されていません。File > Save (⌘S) でシーンを保存してから実行してください。", "OK");
                return null;
            }
            return new[] { cur };
        }

        const string IconPath = "Assets/Icons/appicon.png";

        static void Common()
        {
            PlayerSettings.productName = Product;
            PlayerSettings.companyName = Company;
            PlayerSettings.defaultInterfaceOrientation = UIOrientation.LandscapeLeft;
            PlayerSettings.allowedAutorotateToLandscapeLeft = true;
            PlayerSettings.allowedAutorotateToLandscapeRight = true;
            PlayerSettings.allowedAutorotateToPortrait = false;
            PlayerSettings.allowedAutorotateToPortraitUpsideDown = false;
        }

        /// <summary>アプリアイコン(Assets/Icons/appicon.png)を全サイズに割り当てる。</summary>
        static void ApplyIcon(NamedBuildTarget target)
        {
            var tex = AssetDatabase.LoadAssetAtPath<Texture2D>(IconPath);
            if (tex == null)
            {
                Debug.LogWarning($"[艇道ビルド] アイコンが見つかりません: {IconPath}（デフォルトのUnityアイコンで進行）");
                return;
            }
            var sizes = PlayerSettings.GetIconSizes(target, IconKind.Application);
            if (sizes == null || sizes.Length == 0) return;
            var icons = new Texture2D[sizes.Length];
            for (int i = 0; i < icons.Length; i++) icons[i] = tex;
            PlayerSettings.SetIcons(target, icons, IconKind.Application);
        }

        static void Report(BuildReport r, string path)
        {
            if (r.summary.result == BuildResult.Succeeded)
            {
                EditorUtility.RevealInFinder(path);
                Debug.Log($"[艇道ビルド] 成功: {path} ({r.summary.totalSize / (1024 * 1024)}MB)");
            }
            else
                Debug.LogError($"[艇道ビルド] 失敗: {r.summary.result}。Consoleのエラーを確認してください。");
        }

        [MenuItem("艇道ビルド/① Mac版アプリを書き出し(まず動作確認はこれ)")]
        public static void BuildMac()
        {
            var scenes = Scenes(); if (scenes == null) return;
            Common();
            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.Standalone, BundleId);
            ApplyIcon(NamedBuildTarget.Standalone);
            string path = "Builds/Mac/TEIDO.app";
            Directory.CreateDirectory("Builds/Mac");
            Report(BuildPipeline.BuildPlayer(scenes, path, BuildTarget.StandaloneOSX, BuildOptions.None), path);
        }

        [MenuItem("艇道ビルド/② WebGL版を書き出し(URLで配って遊べる)")]
        public static void BuildWebGL()
        {
            var scenes = Scenes(); if (scenes == null) return;
            Common();
            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.WebGL, BundleId);
            // どの静的ホスティング(Amplify/S3)でも動くよう圧縮フォールバックON
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Gzip;
            PlayerSettings.WebGL.decompressionFallback = true;
            string path = "Builds/WebGL";
            Directory.CreateDirectory(path);
            Report(BuildPipeline.BuildPlayer(scenes, path, BuildTarget.WebGL, BuildOptions.None), path);
        }

        [MenuItem("艇道ビルド/③ iOS用Xcodeプロジェクトを書き出し(TestFlight配布用)")]
        public static void BuildIOS()
        {
            var scenes = Scenes(); if (scenes == null) return;
            Common();
            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.iOS, BundleId);
            ApplyIcon(NamedBuildTarget.iOS);
            PlayerSettings.iOS.targetDevice = iOSTargetDevice.iPhoneAndiPad;
            PlayerSettings.iOS.targetOSVersionString = "13.0";
            PlayerSettings.iOS.appleEnableAutomaticSigning = true;  // TeamはXcode側で選ぶ
            PlayerSettings.iOS.requiresFullScreen = true;
            PlayerSettings.statusBarHidden = true;
            PlayerSettings.bundleVersion = "1.0";
            // TestFlightは同じビルド番号を受け付けないため、書き出すたびに自動で+1する
            int bn = int.TryParse(PlayerSettings.iOS.buildNumber, out var cur) ? cur + 1 : 1;
            PlayerSettings.iOS.buildNumber = bn.ToString();
            Debug.Log($"[艇道ビルド] iOS ビルド番号 = {bn}（TestFlightアップロードごとに自動で増えます）");

            string path = "Builds/iOS";
            Directory.CreateDirectory(path);
            Report(BuildPipeline.BuildPlayer(scenes, path, BuildTarget.iOS, BuildOptions.None), path);
        }
    }
}
