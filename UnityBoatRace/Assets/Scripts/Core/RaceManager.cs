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
        public event Action OnRaceFinished;

        System.Random rng;
        PreRaceChoreography choreo;
        float[] pitDelays;
        float[] startProgressOffset;
        float[] prevS;
        bool[] inTurn1, inTurn2;
        int lastLeader = -1;
        int finishCounter;

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

            // 展示タイム
            var (times, _) = ExhibitionSystem.RunExhibition(statsList, venue, wind, rng);
            exhibitionTimes = times;

            // ピット離れ・進入コース
            pitDelays = new float[BoatCount];
            for (int i = 0; i < BoatCount; i++)
                pitDelays[i] = PitExitSystem.ExitDelay(statsList[i], rng);
            int[] courses = WaitingSystem.AssignCourses(statsList, pitDelays, venueId, rng);

            state = new RaceState();
            state.clock = -55f; // ピット離れ〜待機行動〜スタートまで55秒(ダッシュ勢の深い進入対応)
            armed = false;
            finishCounter = 0;
            lastLeader = -1;
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
                    boats[i].engine.HeadingDeg = 90f; // +X向き
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
            boat.engine.HeadingDeg = 90f;
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

        // ---- ピット離れ: 事前計算経路に沿って待機水面へ(左回り) ----
        void StepPitOut(float dt)
        {
            bool allArrived = true;
            float sincePit = state.clock + 55f;
            for (int i = 0; i < BoatCount; i++)
            {
                bool done = choreo.Update(i, boats[i].engine, dt, sincePit);
                allArrived &= done;
                boats[i].SyncTransform();
            }
            if (allArrived || state.clock >= -22f) SetPhase(RacePhase.Waiting);
        }

        // ---- 待機行動: 隊形を整えて静止(未到達艇は経路を続行) ----
        void StepWaiting(float dt)
        {
            float sincePit = state.clock + 55f;
            for (int i = 0; i < BoatCount; i++)
            {
                choreo.Update(i, boats[i].engine, dt, sincePit);
                boats[i].SyncTransform();
            }
            // ダッシュ勢は助走200m超=全開で約13秒かかるため-16秒で物理制御へ
            if (state.clock >= -16f)
            {
                // 進入位置へ正確にスナップして物理制御に引き継ぐ
                for (int i = 0; i < BoatCount; i++)
                {
                    var e = boats[i].engine;
                    e.Position = WaitingSystem.ApproachStartPosition(state.Get(i).course);
                    e.HeadingDeg = 90f;
                    e.Speed = 0f;
                    e.Steer = 0f;
                    boats[i].startAI.Plan(statsList[i], state.Get(i).course, rng);
                    boats[i].SyncTransform();
                }
                SetPhase(RacePhase.Approach);
            }
        }

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

                float laneZ = WaitingSystem.LaneZ(bs.course);
                b.engine.Throttle = b.startAI.GetThrottle(state.clock);
                b.engine.Steer = b.startAI.GetSteer(b.engine, laneZ);

                float prevX = b.engine.Position.x - b.engine.Forward.x * b.engine.Speed * dt;
                if (prevX < TrackPath.StartLineX && b.engine.Position.x >= TrackPath.StartLineX)
                {
                    var (st, flag) = StartSystem.EvaluateCross(state.clock);
                    bs.st = st;
                    bs.startFlag = flag;
                    bs.crossedStart = true;
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
                if (bs.finished) { b.engine.Throttle = 0.15f; b.engine.Steer = boats[i].turnAI.GetSteer(b.engine); continue; }

                b.engine.Steer = b.turnAI.GetSteer(b.engine);
                b.engine.Throttle = b.turnAI.GetThrottle(b.engine);

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
                bs.lap = (int)(bs.totalProgress / lapLen);

                // マーク旋回イベント
                bool t1 = TrackPath.InTurn1Zone(b.engine.Position);
                if (t1 && !inTurn1[i]) OnMarkRounded?.Invoke(i, 1, bs.lap + 1);
                inTurn1[i] = t1;
                bool t2 = TrackPath.InTurn2Zone(b.engine.Position);
                if (t2 && !inTurn2[i]) OnMarkRounded?.Invoke(i, 2, bs.lap + 1);
                inTurn2[i] = t2;

                // ゴール判定(3周)
                if (bs.totalProgress >= TrackPath.TotalLaps * lapLen)
                {
                    bs.finished = true;
                    bs.finishTime = state.raceTime;
                    bs.finalPlace = ++finishCounter;
                    OnBoatFinished?.Invoke(i, bs.finalPlace);
                }
            }

            UpdateStandings();

            if (state.boats.All(b => b.finished) || state.raceTime > 240f)
                SetPhase(RacePhase.Finished);
        }

        void UpdateStandings()
        {
            state.standings.Sort((a, b) =>
            {
                var A = state.Get(a); var B = state.Get(b);
                if (A.finished && B.finished) return A.finalPlace.CompareTo(B.finalPlace);
                if (A.finished) return -1;
                if (B.finished) return 1;
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
