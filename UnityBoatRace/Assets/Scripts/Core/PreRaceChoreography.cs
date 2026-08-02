using System.Collections.Generic;
using UnityEngine;
using BoatRace.Boat;
using BoatRace.Start;

namespace BoatRace.Core
{
    /// <summary>
    /// ピット離れ〜待機行動〜進入隊形までの動きを事前計算経路で正確に再現する。
    /// 実際の競艇の流れ:
    ///   1. ピット離れ(反応差で飛び出し順が変わる)
    ///   2. 待機水面へ出て левカーブ(左回り)でコースを回る
    ///   3. スタートラインの手前(コース別助走距離)に減速して並ぶ
    /// ここは物理制御ではなく振り付け(キネマティック)なので絶対に乱れない。
    /// スタート助走(Approach)以降で物理シミュレーションに引き継ぐ。
    /// </summary>
    public class PreRaceChoreography
    {
        class Lane
        {
            public readonly List<Vector3> pts = new List<Vector3>();
            public float[] cum;
            public float total;
            public float delay;      // ピット離れ反応(秒)
            public float cruise;     // 巡航速度(m/s)
            public float dist;       // 進んだ距離
            public float v;          // 現在速度
            public bool done;
            public int seg;          // 探索キャッシュ
        }

        readonly Lane[] lanes;

        public PreRaceChoreography(int boatCount)
        {
            lanes = new Lane[boatCount];
        }

        /// <summary>
        /// 艇iの経路を構築。実際のピット離れを再現:
        /// 横一列のスタールから全艇一斉に前(+Z)へ飛び出し→左に流して西向きの巡航へ→
        /// スロットの先で左Uターン→進入位置に整列。
        /// </summary>
        public void Build(int i, Vector3 pit, Vector3 slot, int course, float pitDelay, float dashPower)
        {
            var L = new Lane
            {
                delay = pitDelay * 2f,          // ピット離れの反応差(横一列からの飛び出しの差)
                cruise = 15f + dashPower * 4f,  // 数値検証済み: 最悪ケースでも-16秒前に整列
            };
            var pts = L.pts;
            float cruiseZ = WaitingSystem.LaneZ(course) + 11f; // 自分のレーンの少し内側を巡航

            pts.Add(pit);
            Vector3 p1 = pit + new Vector3(0f, 0f, 26f); // 横一列のまま前へ一斉ダッシュ
            pts.Add(p1);

            // 左に流して西向き(-X)の巡航ラインへ合流
            float dz = Mathf.Abs(cruiseZ - p1.z);
            Vector3 mergeEnd = new Vector3(p1.x - 45f, 0f, cruiseZ);
            AddBezier(pts, p1,
                p1 + new Vector3(0f, 0f, dz * 0.5f),
                mergeEnd + new Vector3(42f, 0f, 0f),
                mergeEnd);

            // 西へ巡航(スロットの先まで)
            float xb = Mathf.Min(slot.x - 48f, mergeEnd.x - 12f);
            if (xb + 20f < mergeEnd.x - 2f) pts.Add(new Vector3(xb + 20f, 0f, cruiseZ));
            pts.Add(new Vector3(xb, 0f, cruiseZ));

            // 左Uターン(-X向き → +X向き)。西側を回って降りる
            float r2 = Mathf.Max(7f, Mathf.Abs(slot.z - cruiseZ) * 0.5f);
            AddBezier(pts, new Vector3(xb, 0f, cruiseZ),
                new Vector3(xb - r2 * 1.6f, 0f, cruiseZ),
                new Vector3(xb - r2 * 1.6f, 0f, slot.z),
                new Vector3(xb, 0f, slot.z));

            // スロットへ直進して停止
            pts.Add(slot);

            // 距離テーブル
            L.cum = new float[pts.Count];
            for (int k = 1; k < pts.Count; k++)
                L.cum[k] = L.cum[k - 1] + Vector3.Distance(pts[k - 1], pts[k]);
            L.total = L.cum[pts.Count - 1];
            lanes[i] = L;
        }

        static void AddBezier(List<Vector3> pts, Vector3 p0, Vector3 c0, Vector3 c1, Vector3 p3)
        {
            for (int k = 1; k <= 14; k++)
            {
                float t = k / 14f, u = 1f - t;
                pts.Add(u * u * u * p0 + 3f * u * u * t * c0 + 3f * u * t * t * c1 + t * t * t * p3);
            }
        }

        /// <summary>
        /// 1ステップ進める。エンジンの位置・向き・速度を直接更新する(物理バイパス)。
        /// 戻り値: 経路終端(進入位置)に到達したか。
        /// </summary>
        public bool Update(int i, BoatPhysicsEngine e, float dt, float timeSincePitOpen)
        {
            var L = lanes[i];
            if (L == null) return true;
            if (L.done) { e.Speed = 0f; e.Throttle = 0f; return true; }
            if (timeSincePitOpen < L.delay) { e.Speed = 0f; return false; }

            // 速度プロファイル: 加速→巡航→終端手前で減速停止
            float remaining = L.total - L.dist;
            float vBrake = Mathf.Sqrt(2f * 2.6f * Mathf.Max(0f, remaining)) + 0.4f;
            L.v = Mathf.Min(L.v + 4.5f * dt, L.cruise, vBrake);
            L.dist += L.v * dt;

            if (L.dist >= L.total - 0.05f)
            {
                L.dist = L.total;
                L.done = true;
            }

            Vector3 pos = Sample(L, L.dist);
            Vector3 ahead = Sample(L, Mathf.Min(L.total, L.dist + 1.2f));
            e.Position = pos;
            Vector3 dir = ahead - pos;
            if (dir.sqrMagnitude > 0.0001f)
                e.HeadingDeg = Mathf.Atan2(dir.x, dir.z) * Mathf.Rad2Deg;
            e.Speed = L.v;
            e.Throttle = L.v > 1f ? 0.5f : 0f;
            e.Steer = 0f;
            return L.done;
        }

        Vector3 Sample(Lane L, float d)
        {
            var cum = L.cum;
            if (d <= 0f) return L.pts[0];
            if (d >= L.total) return L.pts[L.pts.Count - 1];
            if (cum[L.seg] > d) L.seg = 0; // 逆行時のみリセット
            while (L.seg < cum.Length - 2 && cum[L.seg + 1] < d) L.seg++;
            float segLen = cum[L.seg + 1] - cum[L.seg];
            float t = segLen > 0.0001f ? (d - cum[L.seg]) / segLen : 0f;
            return Vector3.Lerp(L.pts[L.seg], L.pts[L.seg + 1], t);
        }
    }
}
