namespace BoatRace.Player
{
    public enum RacerRank { A1, A2, B1, B2 }

    /// <summary>選手データ。ST・旋回力・メンタル等。</summary>
    [System.Serializable]
    public class PlayerStats
    {
        public string playerName;
        public RacerRank rank;
        public float startSkill;       // スタート技術 0-1
        public float turnSkill;        // 旋回技術 0-1
        public float reactionTimeMean; // 平均反応時間(s) 0.10〜0.20
        public float mental;           // メンタル 0-1 (低いとST・攻防でブレる)
        public float experience;       // 経験値 0-1 (展開判断に影響)
        public float weight;           // 体重(kg) 47〜57 (軽いほど加速有利)

        /// <summary>
        /// ST計算: ST = reactionTime + randomVariance。
        /// スタート技術とメンタルが高いほどブレが小さい。
        /// </summary>
        public float ComputeST(System.Random rng, float pressure = 0f)
        {
            float variance = (1f - startSkill) * 0.10f + (1f - mental) * 0.05f + pressure * 0.05f;
            float noise = ((float)rng.NextDouble() * 2f - 1f) * variance;
            return reactionTimeMean + noise; // 負ならフライング域
        }

        /// <summary>旋回能力 = turnSkill × 艇のハンドリング。</summary>
        public float TurnEfficiency(float boatHandling) => turnSkill * boatHandling;

        /// <summary>体重による加速補正(軽量有利、52kgを基準に±3%)。</summary>
        public float WeightAccelModifier => 1f + (52f - weight) * 0.01f;
    }
}
