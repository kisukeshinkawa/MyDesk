using BoatRace.Boat;

namespace BoatRace.AI
{
    /// <summary>コース取りAI。イン志向の強さを判断する。</summary>
    public static class CourseAI
    {
        /// <summary>
        /// イン志向 0-1。経験豊富でスタートが不安な選手ほど内を狙い、
        /// ダッシュ力(モーター加速)があるならアウトからのまくり狙いを許容。
        /// </summary>
        public static float InsideDesire(BoatStats stats)
        {
            float desire = 0.4f
                + stats.player.experience * 0.3f
                + (1f - stats.player.startSkill) * 0.2f;

            // モーターの伸びが良ければダッシュ戦も選択肢に
            if (stats.motor.topSpeed > 22.2f) desire -= 0.2f;
            return UnityEngine.Mathf.Clamp01(desire);
        }
    }
}
