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
            PlayerSettings.iOS.targetDevice = iOSTargetDevice.iPhoneAndiPad;
            string path = "Builds/iOS";
            Directory.CreateDirectory(path);
            Report(BuildPipeline.BuildPlayer(scenes, path, BuildTarget.iOS, BuildOptions.None), path);
        }
    }
}
