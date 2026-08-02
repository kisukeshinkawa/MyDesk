using UnityEngine;

namespace BoatRace.Core
{
    /// <summary>
    /// レース演出カメラ。艇団の重心を追いかけ、バラけ具合に応じてズームする。
    /// リプレイ再生中はReplayManagerに任せる。
    /// </summary>
    public class RaceCamera : MonoBehaviour
    {
        RaceManager race;
        ReplayManager replay;
        Vector3 velocity;

        public void Initialize(RaceManager race, ReplayManager replay)
        {
            this.race = race;
            this.replay = replay;
        }

        void LateUpdate()
        {
            if (race == null || race.boats.Count == 0) return;
            if (replay != null && replay.IsPlaying) return;

            // 艇団の重心と広がり
            Vector3 center = Vector3.zero;
            foreach (var b in race.boats) center += b.engine.Position;
            center /= race.boats.Count;
            float spread = 0f;
            foreach (var b in race.boats)
                spread = Mathf.Max(spread, Vector3.Distance(center, b.engine.Position));

            float dist = Mathf.Clamp(spread * 1.5f + 28f, 45f, 160f);
            Vector3 dir = new Vector3(-0.12f, 0.72f, -1f).normalized;
            Vector3 targetPos = center + dir * dist;

            transform.position = Vector3.SmoothDamp(transform.position, targetPos, ref velocity, 0.55f);
            var look = Quaternion.LookRotation(center + Vector3.forward * 4f - transform.position);
            transform.rotation = Quaternion.Slerp(transform.rotation, look, Time.deltaTime * 3f);
        }
    }
}
