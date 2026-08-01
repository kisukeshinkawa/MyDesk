using System;
using System.IO;
using UnityEngine;
using BoatRace.Core;

namespace BoatRace.Network
{
    /// <summary>
    /// オンライン同期(20Hz)。トランスポート層を差し替え可能にしてあり、
    /// ローカルテストは LoopbackTransport、本番は Unity Netcode for GameObjects の
    /// カスタムメッセージ(または Unity Transport)を ITransport 実装として接続する。
    ///
    /// Netcode導入手順:
    /// 1. Package Manager → com.unity.netcode.gameobjects を追加
    /// 2. NetworkManager + UnityTransport をシーンに配置
    /// 3. ITransport 実装で CustomMessagingManager.SendUnnamedMessage を呼ぶ
    /// </summary>
    public interface ITransport
    {
        void Send(byte[] payload);
        event Action<byte[]> OnReceive;
    }

    /// <summary>ローカル折り返し(シングルプレイ・テスト用)。</summary>
    public class LoopbackTransport : ITransport
    {
        public event Action<byte[]> OnReceive;
        public void Send(byte[] payload) => OnReceive?.Invoke(payload);
    }

    public class NetworkSync : MonoBehaviour
    {
        public const float SyncHz = 20f;

        RaceManager race;
        ITransport transport;
        float timer;
        public bool isHost = true;

        public void Initialize(RaceManager race, ITransport transport)
        {
            this.race = race;
            this.transport = transport;
            transport.OnReceive += OnReceive;
        }

        void FixedUpdate()
        {
            if (race == null || transport == null || !isHost) return;
            timer -= Time.fixedDeltaTime;
            if (timer > 0f) return;
            timer = 1f / SyncHz;
            transport.Send(SerializeState());
        }

        /// <summary>全艇の position/rotation/speed/lap をパック。</summary>
        byte[] SerializeState()
        {
            using (var ms = new MemoryStream())
            using (var w = new BinaryWriter(ms))
            {
                w.Write(race.state.raceTime);
                w.Write((byte)race.state.phase);
                w.Write((byte)race.boats.Count);
                for (int i = 0; i < race.boats.Count; i++)
                {
                    var e = race.boats[i].engine;
                    w.Write(e.Position.x); w.Write(e.Position.z);
                    w.Write(e.HeadingDeg);
                    w.Write(e.Speed);
                    w.Write((byte)race.state.Get(i).lap);
                }
                return ms.ToArray();
            }
        }

        void OnReceive(byte[] payload)
        {
            if (isHost) return; // クライアントのみ適用
            using (var ms = new MemoryStream(payload))
            using (var r = new BinaryReader(ms))
            {
                race.state.raceTime = r.ReadSingle();
                var phase = (RacePhase)r.ReadByte();
                int count = r.ReadByte();
                for (int i = 0; i < count && i < race.boats.Count; i++)
                {
                    var e = race.boats[i].engine;
                    float x = r.ReadSingle(), z = r.ReadSingle();
                    e.Position = new Vector3(x, 0f, z);
                    e.HeadingDeg = r.ReadSingle();
                    e.Speed = r.ReadSingle();
                    race.state.Get(i).lap = r.ReadByte();
                    race.boats[i].SyncTransform();
                }
            }
        }
    }
}
