using UnityEngine;

namespace BoatRace.Player
{
    /// <summary>
    /// プレイヤー艇の操作入力。画面上のボタン(HoldButton)とキーボードの両対応。
    /// 全開 = 画面の[全開]ボタン / [スペース][W][↑]。舵 = [◀][▶]ボタン / [←][→][A][D]。
    /// </summary>
    public static class PlayerBoatInput
    {
        // 画面ボタン(HoldButton)が押下中に立てるフラグ
        public static bool TouchThrottle;
        public static bool TouchLeft;
        public static bool TouchRight;

        public static float Throttle()
        {
            bool full = TouchThrottle
                || Input.GetKey(KeyCode.Space) || Input.GetKey(KeyCode.UpArrow) || Input.GetKey(KeyCode.W);
            return full ? 1f : 0.14f;
        }

        public static float SteerAxis()
        {
            float a = 0f;
            if (TouchLeft || Input.GetKey(KeyCode.LeftArrow) || Input.GetKey(KeyCode.A)) a -= 1f;
            if (TouchRight || Input.GetKey(KeyCode.RightArrow) || Input.GetKey(KeyCode.D)) a += 1f;
            return a;
        }
    }
}
