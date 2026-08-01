using UnityEngine;

namespace BoatRace.Physics
{
    /// <summary>ターン物理: 旋回半径・遠心力・外流れ(ドリフト)。</summary>
    public static class TurnPhysics
    {
        public const float DriftCoefficient = 0.045f;

        /// <summary>旋回半径 turnRadius = speed / turnPower。</summary>
        public static float TurnRadius(float speed, float turnPower)
        {
            return Mathf.Max(4f, speed / Mathf.Max(0.1f, turnPower));
        }

        /// <summary>遠心力 force = speed^2 / turnRadius。</summary>
        public static float CentrifugalForce(float speed, float turnRadius)
        {
            return speed * speed / Mathf.Max(1f, turnRadius);
        }

        /// <summary>外流れ量 drift = centrifugalForce * driftCoefficient / 安定性。</summary>
        public static float OutwardDrift(float speed, float turnRadius, float stability)
        {
            float force = CentrifugalForce(speed, turnRadius);
            return force * DriftCoefficient * (1.5f - stability * 0.5f);
        }

        /// <summary>その速度で舵を切れる最大ヨー角速度 (deg/s)。</summary>
        public static float MaxYawRate(float speed, float turnPower)
        {
            float radius = TurnRadius(speed, turnPower);
            return Mathf.Rad2Deg * speed / radius;
        }
    }
}
