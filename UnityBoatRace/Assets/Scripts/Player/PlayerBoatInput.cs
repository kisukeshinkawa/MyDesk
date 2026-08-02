using UnityEngine;

namespace BoatRace.Player
{
    /// <summary>
    /// プレイヤー艇の操作入力。
    /// [スペース]/[W]/[↑] = 全開スロットル(離すと微速) / [←][→]/[A][D] = 舵。
    /// </summary>
    public static class PlayerBoatInput
    {
        public static float Throttle()
        {
            bool full = Input.GetKey(KeyCode.Space) || Input.GetKey(KeyCode.UpArrow) || Input.GetKey(KeyCode.W);
            return full ? 1f : 0.14f;
        }

        public static float SteerAxis()
        {
            float a = 0f;
            if (Input.GetKey(KeyCode.LeftArrow) || Input.GetKey(KeyCode.A)) a -= 1f;
            if (Input.GetKey(KeyCode.RightArrow) || Input.GetKey(KeyCode.D)) a += 1f;
            return a;
        }
    }
}
