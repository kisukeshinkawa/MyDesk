using System.Collections.Generic;
using UnityEngine;
using BoatRace.Boat;
using BoatRace.AI;

namespace BoatRace.Start
{
    /// <summary>
    /// 待機行動。進入コースの決定と、コースごとの助走距離(スタート展示と同じロジック)。
    /// イン(1コース)は助走が短く、アウト(6コース)はダッシュで長い助走を取る。
    /// </summary>
    public static class WaitingSystem
    {
        /// <summary>
        /// 進入コース決定。基本は枠なり。前づけ志向の選手がピット離れで勝つと内へ。
        /// ピットが2マーク側の場は進入まで距離がなく前づけが起きにくい(枠なり率が上がる)。
        /// 戻り値: boatIndex順の進入コース(1-6)。
        /// </summary>
        public static int[] AssignCourses(List<BoatStats> boats, float[] pitDelays, int venueId, System.Random rng)
        {
            int n = boats.Count;
            var order = new List<int>();
            for (int i = 0; i < n; i++) order.Add(i);

            // 前づけ判定: 内志向が強く、かつピット離れが速ければ内のコースを奪う
            float maezukeFactor = Data.VenueTraits.PitNear2Mark(venueId) ? 0.3f : 1f;
            for (int i = 1; i < n; i++)
            {
                int idx = order[i];
                float desire = CourseAI.InsideDesire(boats[idx]);
                if (desire > 0.75f && rng.NextDouble() < (desire - 0.5f) * maezukeFactor)
                {
                    int target = order[i - 1];
                    if (pitDelays[idx] < pitDelays[target])
                    {
                        order.RemoveAt(i);
                        order.Insert(i - 1, idx);
                    }
                }
            }

            var courses = new int[n];
            for (int c = 0; c < n; c++) courses[order[c]] = c + 1;
            return courses;
        }

        /// <summary>
        /// コースごとの助走距離(m)。実際の競艇の2段進入:
        /// スロー勢(1-3コース)=150m以内の短い助走 / ダッシュ勢(4-6コース)=200m以上の全速助走。
        /// </summary>
        public static float ApproachDistance(int course)
        {
            return course <= 3
                ? 75f + course * 10f    // スロー: 85/95/105m
                : 165f + course * 10f;  // ダッシュ: 205/215/225m
        }

        /// <summary>スロー勢かどうか。</summary>
        public static bool IsSlowStart(int course) => course <= 3;

        /// <summary>助走開始位置。スタートラインの手前、コースなりのレーン。</summary>
        public static Vector3 ApproachStartPosition(int course)
        {
            float x = Core.TrackPath.StartLineX - ApproachDistance(course);
            float z = LaneZ(course);
            return new Vector3(x, 0f, z);
        }

        /// <summary>コース→ホームストレッチ上のレーンz座標(インほど内側=マーク寄り)。</summary>
        public static float LaneZ(int course)
        {
            return -(13f + (course - 1) * 3.2f);
        }
    }
}
