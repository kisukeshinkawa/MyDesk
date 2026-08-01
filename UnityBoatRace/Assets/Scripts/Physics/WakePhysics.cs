using System.Collections.Generic;
using UnityEngine;

namespace BoatRace.Physics
{
    /// <summary>
    /// 航跡(引き波)シミュレーション。
    /// 各艇の通過点をリングバッファに記録し、他艇が航跡上を走ると抵抗増＋挙動乱れ。
    /// 「差し」が引き波を避け、「まくり」が外を回る理由がこの物理で再現される。
    /// </summary>
    public class WakePhysics
    {
        public struct WakePoint
        {
            public Vector3 position;
            public float createdAt;
            public float intensity; // 生成時の艇速に比例
        }

        const float Lifetime = 4.0f;      // 引き波が消えるまでの秒数
        const float Radius = 2.2f;        // 引き波の有効半径(m)
        const float RecordInterval = 0.15f;

        readonly List<WakePoint>[] wakes;
        readonly float[] recordTimers;
        float now;

        public WakePhysics(int boatCount)
        {
            wakes = new List<WakePoint>[boatCount];
            recordTimers = new float[boatCount];
            for (int i = 0; i < boatCount; i++) wakes[i] = new List<WakePoint>(128);
        }

        public void Step(float dt)
        {
            now += dt;
            for (int i = 0; i < wakes.Length; i++)
                wakes[i].RemoveAll(w => now - w.createdAt > Lifetime);
        }

        /// <summary>艇の現在位置を航跡として記録。</summary>
        public void Record(int boatIndex, Vector3 position, float speed, float dt)
        {
            recordTimers[boatIndex] -= dt;
            if (recordTimers[boatIndex] > 0f) return;
            recordTimers[boatIndex] = RecordInterval;
            wakes[boatIndex].Add(new WakePoint
            {
                position = position,
                createdAt = now,
                intensity = Mathf.Clamp01(speed / 20f),
            });
        }

        /// <summary>
        /// 指定位置で受ける引き波抵抗 (0=なし)。自艇の航跡は除外。
        /// 戻り値は追加ドラッグ係数と挙動乱れに使う。
        /// </summary>
        public float GetWakeDrag(int selfIndex, Vector3 position)
        {
            float total = 0f;
            for (int i = 0; i < wakes.Length; i++)
            {
                if (i == selfIndex) continue;
                var list = wakes[i];
                for (int j = 0; j < list.Count; j++)
                {
                    float d = Vector3.Distance(position, list[j].position);
                    if (d > Radius) continue;
                    float age = (now - list[j].createdAt) / Lifetime;
                    total += (1f - d / Radius) * (1f - age) * list[j].intensity;
                }
            }
            return Mathf.Min(total, 2.5f);
        }
    }
}
