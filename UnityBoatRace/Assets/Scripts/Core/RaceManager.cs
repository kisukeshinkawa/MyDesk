using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using BoatRace.AI;
using BoatRace.Boat;
using BoatRace.Data;
using BoatRace.Physics;
using BoatRace.Start;

namespace BoatRace.Core
{
    /// <summary>
    /// レース進行の中枢。フェーズ管理(ピット離れ→待機→助走→本走→ゴール)、
    /// ST判定、周回・順位計算、イベント発火(実況・リプレイが購読)。
    /// </summary>
    public class RaceManager : MonoBehaviour
    {
        [Header("設定")]
        public int venueId = 24;      // 大村
        public int seed = 12345;
        public const int BoatCount = 6;

        // ストーリーモード: プレイヤーが操縦する艇(-1=観戦モード)
        [NonSerialized] public int playerBoatIndex = -1;
        [NonSerialized] public Player.PlayerStats playerOverride;

        // 必殺技システム: 体力ゲージとターン突入通知
        [NonSerialized] public float playerSP;                 // 現在体力
        [NonSerialized] public float playerSPMax = 100f;       // 最大体力(レベルで成長)
        [NonSerialized] public float playerSPInit = 100f;      // 開始時体力(アイテムで増える)
        [NonSerialized] public bool playerMotorBoost;          // 新品ペラ(次レース限り)
        [NonSerialized] public float pAccelBonus, pTopBonus, pTurnBonus; // ガチャ装備+整備ボーナス
        [NonSerialized] public Setup.PropellerSetting playerPropOverride; // ガレージのペラ調整
        public event Action<int> OnPlayerTurnEntry;            // markNo(1/2)
        float playerMoveTimer;
        float playerMoveRadius = 1f;
        float playerMoveThrottle = 1f;
        public bool PlayerMoveActive => playerMoveTimer > 0f;

        [NonSerialized] public VenueData venue;
        [NonSerialized] public WindSystem wind;
        [NonSerialized] public CurrentSystem current;
        [NonSerialized] public WakePhysics wake;
        [NonSerialized] public RaceState state = new RaceState();
        [NonSerialized] public List<BoatController> boats = new List<BoatController>();
        [NonSerialized] public List<BoatStats> statsList = new List<BoatStats>();
        [NonSerialized] public float[] exhibitionTimes;
        [NonSerialized] public bool simulationPaused;
        [NonSerialized] public bool armed; // GameFlowの「レーススタート！」で true になるまで進行停止

        // ---- イベント(実況・HUD・リプレイが購読) ----
        public event Action<RacePhase> OnPhaseChanged;
        public event Action OnStartResults;
        public event Action OnTacticsDecided;
        public event Action<int, int, int> OnMarkRounded;   // boatIndex, markNo(1/2), lap
        public event Action<int> OnLeaderChanged;           // 新リーダーboatIndex
        public event Action<int, int> OnBoatFinished;       // boatIndex, place
        public event Action OnPitOpen;                      // T-100 ピットアウト信号
        public event Action OnFinalLap;                     // 最終周回突入
        public event Action OnRaceFinished;

        [NonSerialized] public string kimarite = "-";       // 決まり手

        System.Random rng;
        PreRaceChoreography choreo;
        float[] pitDelays;
        float[] startProgressOffset;
        float[] prevS;
        bool[] inTurn1, inTurn2;
        int lastLeader = -1;
        int finishCounter;
        int firstTurnLeader = -1;   // 1周1Mを先マイした艇(決まり手判定用)
        bool finalLapFired;
        bool pitOpenFired;

        void Awake()
        {
            SetupRace();
        }

        /// <summary>レース初期化: 選手抽選→モーター抽選→ペラ調整→展示→配置。</summary>
        public void SetupRace()
        {
            rng = new System.Random(seed);
            venue = CourseDatabase.Get(venueId);
            wind = new WindSystem(venue, rng);
            current = new CurrentSystem(venue, rng);
            wake = new WakePhysics(BoatCount);

            var players = PlayerDatabase.PickSix(rng);
            var motors = MotorDatabase.RandomAssign(
                MotorDatabase.GenerateSeasonMotors(60, seed), BoatCount, rng);

            // ストーリーモード: プレイヤーを指定艇に乗せる
            if (playerOverride != null && playerBoatIndex >= 0 && playerBoatIndex < BoatCount)
            {
                players[playerBoatIndex] = playerOverride;
                // アイテム「新品ペラ」: このレースだけモーター強化
                if (playerMotorBoost)
                {
                    motors[playerBoatIndex].acceleration += 0.35f;
                    motors[playerBoatIndex].topSpeed += 0.5f;
                    playerMotorBoost = false;
                }
                // ガチャ装備(プロペラ/チルト)+ガレージ整備のボーナス: 型が出る
                motors[playerBoatIndex].acceleration += pAccelBonus;
                motors[playerBoatIndex].topSpeed += pTopBonus;
                motors[playerBoatIndex].turnPower += pTurnBonus;
            }
            playerSP = Mathf.Min(playerSPInit, 230f);
            playerMoveTimer = 0f;

            statsList.Clear();
            for (int i = 0; i < BoatCount; i++)
            {
                statsList.Add(new BoatStats
                {
                    boatNumber = i + 1,
                    player = players[i],
                    motor = motors[i],
                    propeller = Setup.PropellerSetting.RandomTuned(rng, players[i].experience),
                });
            }
            // ガレージのペラ調整(プレイヤーの永続セッティング)
            if (playerPropOverride != null && playerBoatIndex >= 0 && playerBoatIndex < BoatCount)
                statsList[playerBoatIndex].propeller = playerPropOverride;

            // 展示タイム
            var (times, _) = ExhibitionSystem.RunExhibition(statsList, venue, wind, rng);
            exhibitionTimes = times;

            // ピット離れ・進入コース
            pitDelays = new float[BoatCount];
            for (int i = 0; i < BoatCount; i++)
                pitDelays[i] = PitExitSystem.ExitDelay(statsList[i], i, rng);
            int[] courses = WaitingSystem.AssignCourses(statsList, pitDelays, venueId, rng);

            state = new RaceState();
            // タイムライン(ゲームテンポ版): T-62係留 → T-60ピット離れ →
            // 隊列で待機水面へ → T-12黄針始動=物理引き継ぎ → T=0スタート
            state.clock = -62f;
            armed = false;
            finishCounter = 0;
            lastLeader = -1;
            firstTurnLeader = -1;
            finalLapFired = false;
            pitOpenFired = false;
            kimarite = "-";
            VenueBuilder.SetFinalLamp(false);
            startProgressOffset = new float[BoatCount];
            prevS = new float[BoatCount];
            inTurn1 = new bool[BoatCount];
            inTurn2 = new bool[BoatCount];

            for (int i = 0; i < BoatCount; i++)
            {
                state.boats.Add(new BoatRaceState
                {
                    boatNumber = i + 1,
                    course = courses[i],
                    exhibitionTime = times[i],
                });
                state.standings.Add(i);
                if (i < boats.Count)
                {
                    boats[i].Initialize(i, statsList[i], venue, wind, current, wake);
                    boats[i].engine.Position = PitExitSystem.PitPosition(i, venueId);
                    boats[i].engine.HeadingDeg = 0f; // ピットスタールでコース(+Z)向き
                    boats[i].SyncTransform();
                }
            }

            // ピット離れ〜進入隊形の振り付け経路を事前計算
            choreo = new PreRaceChoreography(BoatCount);
            for (int i = 0; i < BoatCount; i++)
                choreo.Build(i, PitExitSystem.PitPosition(i, venueId),
                    WaitingSystem.ApproachStartPosition(courses[i]), courses[i],
                    pitDelays[i], PitExitSystem.DashPower(statsList[i]));

            SetPhase(RacePhase.PitOut);
        }

        /// <summary>Bootstrapが艇のGameObject生成後に登録する。</summary>
        public void RegisterBoat(BoatController boat)
        {
            boats.Add(boat);
            int i = boats.Count - 1;
            boat.Initialize(i, statsList[i], venue, wind, current, wake);
            boat.engine.Position = PitExitSystem.PitPosition(i, venueId);
            boat.engine.HeadingDeg = 0f; // ピットスタールでコース(+Z)向き
            boat.SyncTransform();
        }

        void FixedUpdate()
        {
            if (!armed || simulationPaused || boats.Count < BoatCount) return;
            float dt = Time.fixedDeltaTime;

            wind.Step(dt);
            current.Step(dt);
            wake.Step(dt);
            state.clock += dt;
            if (state.phase == RacePhase.Racing) state.raceTime += dt;

            switch (state.phase)
            {
                case RacePhase.PitOut:   StepPitOut(dt); break;
                case RacePhase.Waiting:  StepWaiting(dt); break;
                case RacePhase.Approach: StepApproach(dt); break;
                case RacePhase.Racing:   StepRacing(dt); break;
            }

            // 物理シミュレーションはスタート助走以降。それ以前は振り付け(choreo)が
            // 位置・向きを直接制御するので物理は動かさない
            if (state.phase == RacePhase.Approach || state.phase == RacePhase.Racing ||
                state.phase == RacePhase.Finished)
            {
                foreach (var b in boats) b.SimStep(dt);
                ResolveBoatOverlaps();
            }
        }

        /// <summary>
        /// 艇同士の重なり解消。艇の全長約3mを考慮した最小間隔を保ち、
        /// 後ろから突っ込んだ側が減速する(接触・引き波リスクの再現)。
        /// </summary>
        void ResolveBoatOverlaps()
        {
            const float minDist = 3.0f;
            for (int i = 0; i < BoatCount; i++)
            {
                for (int j = i + 1; j < BoatCount; j++)
                {
                    var ei = boats[i].engine;
                    var ej = boats[j].engine;
                    Vector3 d = ej.Position - ei.Position;
                    d.y = 0f;
                    float dist = d.magnitude;
                    if (dist >= minDist || dist < 0.001f) continue;

                    Vector3 push = d.normalized * (minDist - dist) * 0.5f;
                    ei.Position -= push;
                    ej.Position += push;

                    // 相手に向かって進んでいる側(後方から突っ込んだ側)が減速
                    if (Vector3.Dot(ei.Forward, d) > 0f) ei.Speed *= 0.975f;
                    if (Vector3.Dot(ej.Forward, -d) > 0f) ej.Speed *= 0.975f;
                }
            }
        }

        // ---- ピット係留(T-105〜-100)→ピット離れ: 経路に沿って待機水面へ(左回り) ----
        void StepPitOut(float dt)
        {
            if (state.clock < -60f) return; // PitStandby: エンジンアイドリングで係留
            if (!pitOpenFired) { pitOpenFired = true; OnPitOpen?.Invoke(); }

            bool allArrived = true;
            float sincePit = state.clock + 60f;
            for (int i = 0; i < BoatCount; i++)
            {
                bool done = choreo.Update(i, boats[i].engine, dt, sincePit);
                allArrived &= done;
                boats[i].SyncTransform();
            }
            if (allArrived || state.clock >= -20f) SetPhase(RacePhase.Waiting);
        }

        // ---- 待機行動: 隊形確定。モーター停止禁止のため微速前進で待つ ----
        void StepWaiting(float dt)
        {
            float sincePit = state.clock + 60f;
            for (int i = 0; i < BoatCount; i++)
            {
                bool done = choreo.Update(i, boats[i].engine, dt, sincePit);
                var e = boats[i].engine;
                if (done)
                {
                    // モーター停止は禁止 → 微速前進し続ける = 待つほど助走(起こし位置)が浅くなる。
                    // 熟練選手ほど蛇行で距離を殺し、規定助走の75%を下回るほど深くはしない
                    var bs2 = state.Get(i);
                    float remaining = TrackPath.StartLineX - e.Position.x;
                    float minDist = WaitingSystem.ApproachDistance(bs2.course) * 0.75f;
                    if (remaining > minDist)
                    {
                        float creep = 0.4f * (1.2f - statsList[i].player.experience * 0.6f);
                        e.Position += e.Forward * creep * dt;
                        e.Speed = creep;
                    }
                    else
                    {
                        e.Speed = 0.3f; // 蛇行で前進距離を殺している状態
                    }
                }
                boats[i].SyncTransform();
            }

            // T-12: 黄針(12秒針)始動と同時に物理制御へ引き継ぎ(回頭→助走)
            if (state.clock >= -12f)
            {
                for (int i = 0; i < BoatCount; i++)
                {
                    var e = boats[i].engine;
                    var bs = state.Get(i);
                    Vector3 slot = WaitingSystem.ApproachStartPosition(bs.course);
                    // 経路未達なら整列位置へ。到達済みなら微速前進で深くなったx位置を維持
                    if (Vector3.Distance(e.Position, slot) > 10f) e.Position = slot;
                    e.Position = new Vector3(e.Position.x, 0f, slot.z);
                    e.HeadingDeg = 90f; // 回頭: スタートラインに正対
                    e.Speed = Mathf.Max(e.Speed, 1f);
                    e.Steer = 0f;

                    float actualDist = TrackPath.StartLineX - e.Position.x;
                    boats[i].startAI.Plan(statsList[i], bs.course, rng, actualDist,
                        WaterPhysics.ResistanceFactor(venue));
                    boats[i].SyncTransform();
                }
                SetPhase(RacePhase.Approach);
            }
        }

        static bool IsDisqualified(BoatRaceState bs) =>
            bs.startFlag == StartFlag.Flying || bs.startFlag == StartFlag.Late;

        // ---- 助走〜スタートライン通過(ST判定) ----
        void StepApproach(float dt)
        {
            bool allCrossed = true;
            for (int i = 0; i < BoatCount; i++)
            {
                var b = boats[i];
                var bs = state.Get(i);
                if (bs.crossedStart) continue;
                allCrossed = false;

                // 走行は全艇オート(プレイヤーの操作はターンの技選択のみ)
                float laneZ = WaitingSystem.LaneZ(bs.course);
                b.engine.Throttle = b.startAI.GetThrottle(state.clock, b.engine.Speed);
                b.engine.Steer = b.startAI.GetSteer(b.engine, laneZ);

                float prevX = b.engine.Position.x - b.engine.Forward.x * b.engine.Speed * dt;
                if (prevX < TrackPath.StartLineX && b.engine.Position.x >= TrackPath.StartLineX)
                {
                    var (st, flag) = StartSystem.EvaluateCross(state.clock);
                    bs.st = st;
                    bs.startFlag = flag;
                    bs.crossedStart = true;
                    // 好スタートで体力回復
                    if (i == playerBoatIndex && flag == StartFlag.Normal && st <= 0.12f)
                        playerSP = Mathf.Min(playerSPMax, playerSP + 15f);
                    float r = b.turnAI.laneRadius;
                    startProgressOffset[i] = TrackPath.GetProgress(b.engine.Position, r);
                    prevS[i] = startProgressOffset[i];
                }
            }

            if (allCrossed || state.clock > StartSystem.LateLimit + 0.5f)
            {
                foreach (var bs in state.boats)
                    if (!bs.crossedStart) { bs.crossedStart = true; bs.st = 1.2f; bs.startFlag = StartFlag.Late; }
                DecideTactics();
                OnStartResults?.Invoke();
                SetPhase(RacePhase.Racing);
            }
        }

        void DecideTactics()
        {
            var stList = state.boats.Select(b => b.st).ToList();
            var stOrder = Enumerable.Range(0, BoatCount).OrderBy(i => state.Get(i).st).ToList();
            for (int i = 0; i < BoatCount; i++)
            {
                var bs = state.Get(i);
                int stRank = stOrder.IndexOf(i);
                bs.tactic = StrategyAI.Decide(statsList[i], bs.course, stRank, stList, rng);
                boats[i].turnAI.Configure(bs.course, bs.tactic);
            }
            OnTacticsDecided?.Invoke();
        }

        // ---- 本走: 3周・順位・周回・ゴール ----
        void StepRacing(float dt)
        {
            for (int i = 0; i < BoatCount; i++)
            {
                var b = boats[i];
                var bs = state.Get(i);
                if (bs.finished) { b.engine.Throttle = 0.15f; b.engine.Steer = b.turnAI.GetSteer(b.engine, WaitingSystem.LaneZ(bs.course)); continue; }

                if (i == playerBoatIndex && !IsDisqualified(bs))
                {
                    // 体力は走行中じわじわ回復(最大値まで)
                    playerSP = Mathf.Min(playerSPMax, playerSP + dt * 0.6f);

                    if (playerMoveTimer > 0f)
                    {
                        // 技の発動中は選んだ技のライン取りで旋回
                        playerMoveTimer -= dt;
                        b.turnAI.radiusFactor = playerMoveRadius;
                        b.engine.Steer = b.turnAI.GetSteer(b.engine, WaitingSystem.LaneZ(bs.course));
                        b.engine.Throttle = playerMoveThrottle;
                    }
                    else
                    {
                        // それ以外はオート走行(操作は技選択のみ)
                        b.engine.Steer = b.turnAI.GetSteer(b.engine, WaitingSystem.LaneZ(bs.course));
                        b.engine.Throttle = b.turnAI.GetThrottle(b.engine);
                    }
                }
                else
                {
                    b.engine.Steer = b.turnAI.GetSteer(b.engine, WaitingSystem.LaneZ(bs.course));
                    b.engine.Throttle = b.turnAI.GetThrottle(b.engine);
                    // F/L艇は欠場扱い: 走行は続けるが流す(仕様書: 走るが失格表示)
                    if (IsDisqualified(bs)) b.engine.Throttle = Mathf.Min(b.engine.Throttle, 0.55f);
                }

                // 進行度更新(周回ラップ検出)
                float r = b.turnAI.laneRadius;
                float lapLen = TrackPath.LapLength(r);
                float s = TrackPath.GetProgress(b.engine.Position, r);
                float delta = s - prevS[i];
                if (delta < -lapLen * 0.5f) delta += lapLen;
                if (delta > lapLen * 0.5f) delta -= lapLen;
                bs.totalProgress += Mathf.Max(0f, delta);
                prevS[i] = s;
                bs.progress = s;
                int newLap = (int)(bs.totalProgress / lapLen);
                if (i == playerBoatIndex && newLap > bs.lap)
                    playerSP = Mathf.Min(playerSPMax, playerSP + 8f); // 周回走破で体力回復
                bs.lap = newLap;

                // マーク旋回イベント(1周1Mの先マイ艇を決まり手判定用に記録)
                bool t1 = TrackPath.InTurn1Zone(b.engine.Position);
                if (t1 && !inTurn1[i])
                {
                    if (bs.lap == 0 && firstTurnLeader < 0 && !IsDisqualified(bs)) firstTurnLeader = i;
                    OnMarkRounded?.Invoke(i, 1, bs.lap + 1);
                    if (i == playerBoatIndex && !IsDisqualified(bs) && !bs.finished)
                        OnPlayerTurnEntry?.Invoke(1); // 技選択(GameFlowがスロー表示)
                }
                inTurn1[i] = t1;
                bool t2 = TrackPath.InTurn2Zone(b.engine.Position);
                if (t2 && !inTurn2[i])
                {
                    OnMarkRounded?.Invoke(i, 2, bs.lap + 1);
                    if (i == playerBoatIndex && !IsDisqualified(bs) && !bs.finished)
                        OnPlayerTurnEntry?.Invoke(2);
                }
                inTurn2[i] = t2;

                // 最終周回灯点灯
                if (!finalLapFired && !IsDisqualified(bs) && bs.lap >= TrackPath.TotalLaps - 1)
                {
                    finalLapFired = true;
                    VenueBuilder.SetFinalLamp(true);
                    OnFinalLap?.Invoke();
                }

                // ゴール判定(3周)。F/L欠場艇は着順に入らない
                if (bs.totalProgress >= TrackPath.TotalLaps * lapLen)
                {
                    bs.finished = true;
                    bs.finishTime = state.raceTime;
                    if (!IsDisqualified(bs))
                    {
                        bs.finalPlace = ++finishCounter;
                        if (bs.finalPlace == 1) DecideKimarite(i);
                        OnBoatFinished?.Invoke(i, bs.finalPlace);
                    }
                }
            }

            UpdateStandings();

            if (state.boats.All(b => b.finished || IsDisqualified(b)) || state.raceTime > 240f)
                SetPhase(RacePhase.Finished);
        }

        /// <summary>技の発動(GameFlowの技選択パネルから呼ばれる)。体力を削って発動。</summary>
        public void ApplyPlayerMove(Career.SkillMove move, int moveLevel)
        {
            if (playerBoatIndex < 0) return;
            playerSP = Mathf.Max(0f, playerSP - move.CostAt(moveLevel));
            float dur = move.DurationAt(moveLevel);
            playerMoveTimer = dur;
            playerMoveRadius = move.RadiusAt(moveLevel);
            playerMoveThrottle = move.throttle;
            var e = boats[playerBoatIndex].engine;
            e.BoostTime = dur;
            e.BoostTopMul = move.TopAt(moveLevel);
            e.BoostAccelMul = move.AccelAt(moveLevel);
            e.BoostWakeImmune = move.wakeImmune;
            boats[playerBoatIndex].SetBoostColor(move.color); // 航跡が技の色に光る
        }

        /// <summary>決まり手判定: 逃げ/差し/まくり/まくり差し/抜き/恵まれ。</summary>
        void DecideKimarite(int winnerIdx)
        {
            var w = state.Get(winnerIdx);
            if (winnerIdx == firstTurnLeader)
            {
                kimarite = w.course == 1 ? "逃げ" : AI.StrategyAI.TacticName(w.tactic);
            }
            else if (firstTurnLeader >= 0 && IsDisqualified(state.Get(firstTurnLeader)))
            {
                kimarite = "恵まれ";
            }
            else
            {
                kimarite = "抜き";
            }
        }

        void UpdateStandings()
        {
            // グループ順: 有効艇(完走→走行中) → F/L欠場艇は最下位固定
            int Group(BoatRaceState s) => IsDisqualified(s) ? 2 : (s.finished ? 0 : 1);
            state.standings.Sort((a, b) =>
            {
                var A = state.Get(a); var B = state.Get(b);
                int g = Group(A).CompareTo(Group(B));
                if (g != 0) return g;
                if (A.finished && B.finished && !IsDisqualified(A))
                    return A.finalPlace.CompareTo(B.finalPlace);
                return B.totalProgress.CompareTo(A.totalProgress);
            });
            int leader = state.standings[0];
            if (leader != lastLeader)
            {
                if (lastLeader >= 0) OnLeaderChanged?.Invoke(leader);
                lastLeader = leader;
            }
        }

        void SetPhase(RacePhase p)
        {
            if (state.phase == p && p != RacePhase.PitOut) return;
            state.phase = p;
            if (p == RacePhase.Finished) OnRaceFinished?.Invoke();
            OnPhaseChanged?.Invoke(p);
        }
    }
}
