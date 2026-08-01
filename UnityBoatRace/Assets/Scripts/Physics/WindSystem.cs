using UnityEngine;
using BoatRace.Data;

namespace BoatRace.Physics
{
    /// <summary>風シミュレーション。向い風/追い風で速度・旋回に影響。</summary>
    public class WindSystem
    {
        public float directionDeg;  // 風が「吹いていく」方角 (0=+Z)
        public float speed;         // 風速 m/s
        readonly VenueData venue;
        readonly System.Random rng;
        float gustTimer;
        float gust;

        public WindSystem(VenueData venue, System.Random rng)
        {
            this.venue = venue;
            this.rng = rng;
            directionDeg = (float)rng.NextDouble() * 360f;
            speed = (float)rng.NextDouble() * 6f * venue.windEffect;
        }

        /// <summary>突風などの揺らぎ更新。</summary>
        public void Step(float dt)
        {
            gustTimer -= dt;
            if (gustTimer <= 0f)
            {
                gustTimer = 2f + (float)rng.NextDouble() * 4f;
                gust = ((float)rng.NextDouble() * 2f - 1f) * speed * 0.3f;
            }
        }

        public Vector3 WindVector =>
            Quaternion.Euler(0f, directionDeg, 0f) * Vector3.forward * (speed + gust);

        /// <summary>進行方向に対する速度補正 (m/s^2 相当の押し)。</summary>
        public float SpeedPush(Vector3 boatForward)
        {
            return Vector3.Dot(WindVector, boatForward) * 0.05f * venue.windEffect;
        }

        /// <summary>横風による旋回乱れ 0-1。</summary>
        public float TurnDisturbance(Vector3 boatForward)
        {
            Vector3 side = Vector3.Cross(Vector3.up, boatForward);
            return Mathf.Abs(Vector3.Dot(WindVector, side)) * 0.04f * venue.windEffect;
        }
    }
}
