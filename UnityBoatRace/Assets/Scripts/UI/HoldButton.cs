using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
using BoatRace.Player;

namespace BoatRace.UI
{
    /// <summary>
    /// 押している間だけ効く操作ボタン(スマホゲーの仮想パッド式)。
    /// 押下中は明るく光り、指が外れたら確実に離す。
    /// </summary>
    public class HoldButton : MonoBehaviour, IPointerDownHandler, IPointerUpHandler, IPointerExitHandler
    {
        public enum Kind { Throttle, SteerLeft, SteerRight }
        public Kind kind;

        Image img;
        Color baseColor;

        void Awake()
        {
            img = GetComponent<Image>();
            if (img != null) baseColor = img.color;
        }

        void Set(bool held)
        {
            switch (kind)
            {
                case Kind.Throttle: PlayerBoatInput.TouchThrottle = held; break;
                case Kind.SteerLeft: PlayerBoatInput.TouchLeft = held; break;
                case Kind.SteerRight: PlayerBoatInput.TouchRight = held; break;
            }
            if (img != null)
                img.color = held ? Color.Lerp(baseColor, Color.white, 0.4f) : baseColor;
        }

        public void OnPointerDown(PointerEventData e) => Set(true);
        public void OnPointerUp(PointerEventData e) => Set(false);
        public void OnPointerExit(PointerEventData e) => Set(false);
        void OnDisable() => Set(false);
    }
}
