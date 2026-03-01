import { ref, readonly } from "vue";
import type {
  CloudflareRealtimeConfig,
  CfSessionResponse,
  ConnectionRole,
} from "~/types/realtime";

// ---------------------------------------------------------------------------
// useCloudflareRealtime
// ---------------------------------------------------------------------------
// DataChannel の正しい利用フロー（公式: /realtime/sfu/datachannels/）:
//   1. /datachannels/establish でセッションと SCTP トランスポートを確立
//   2. /datachannels/new で publish (local) または subscribe (remote)
//   3. negotiated:true + API が返す id で RTCDataChannel を作成
//
// Yjs は双方向通信が必要なため DataChannel を 2 本使用:
//   sendChannel : 自分が publish  相手が subscribe
//   recvChannel : 相手が publish  自分が subscribe
// ---------------------------------------------------------------------------

const CF_CALLS_API = "https://rtc.live.cloudflare.com/v1/apps";
const DC_NAME = "yjs-sync";

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

function waitForIceGathering(
  pc: RTCPeerConnection,
  timeoutMs = 5_000,
): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      console.warn(
        "[useCloudflareRealtime] ICE Gathering タイムアウト、続行します",
      );
      resolve();
    }, timeoutMs);
    function onStateChange() {
      if (pc.iceGatheringState === "complete") {
        cleanup();
        resolve();
      }
    }
    function cleanup() {
      clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", onStateChange);
    }
    pc.addEventListener("icegatheringstatechange", onStateChange);
  });
}

function waitForChannelOpen(
  ch: RTCDataChannel,
  timeoutMs = 30_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ch.readyState === "open") {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `[useCloudflareRealtime] DataChannel "${ch.label}" open タイムアウト`,
        ),
      );
    }, timeoutMs);
    function onOpen() {
      cleanup();
      resolve();
    }
    function onClose() {
      cleanup();
      reject(
        new Error(
          `[useCloudflareRealtime] DataChannel "${ch.label}" が open 前に閉じました`,
        ),
      );
    }
    function cleanup() {
      clearTimeout(timer);
      ch.removeEventListener("open", onOpen);
      ch.removeEventListener("close", onClose);
      ch.removeEventListener("error", onClose);
    }
    ch.addEventListener("open", onOpen);
    ch.addEventListener("close", onClose);
    ch.addEventListener("error", onClose);
  });
}

// ---------------------------------------------------------------------------
// シグナリング層への依存を注入するインターフェース
// ---------------------------------------------------------------------------

export interface SignalingFns {
  publishSessionId(sessionId: string): Promise<void>;
  waitForPeerSessionId(): Promise<string>;
}

// ---------------------------------------------------------------------------
// コンポーザブル本体
// ---------------------------------------------------------------------------

export function useCloudflareRealtime(config: CloudflareRealtimeConfig) {
  const connectionState = ref<RTCPeerConnectionState>("new");
  const sendChannel = ref<RTCDataChannel | null>(null);
  const recvChannel = ref<RTCDataChannel | null>(null);
  const error = ref<string | null>(null);

  let pc: RTCPeerConnection | null = null;
  let localSessionId = "";

  // ---------- REST ヘルパー ----------

  async function cfPost<T>(path: string, body?: unknown): Promise<T> {
    const hasBody = body !== undefined;
    const res = await fetch(`${CF_CALLS_API}/${config.appId}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
      },
      body: hasBody ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Cloudflare Calls API [${res.status}]: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  // ---------- PC 初期化 ----------

  function createPeerConnection(): RTCPeerConnection {
    const newPc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
      bundlePolicy: "max-bundle",
    });
    newPc.addEventListener("connectionstatechange", () => {
      connectionState.value = newPc.connectionState;
    });
    return newPc;
  }

  // ---------- セッション作成 ----------

  async function createSession(): Promise<void> {
    const data = await cfPost<CfSessionResponse>("/sessions/new");
    localSessionId = data.sessionId;
  }

  // ---------- DataChannel トランスポート確立 ----------
  // 両サイドとも offer SDP 付きで呼び出す。
  // SFU は常に answer を返すだけになり、requiresImmediateRenegotiation パスが不要。

  async function establishTransport(
    offer: RTCSessionDescriptionInit,
  ): Promise<void> {
    type EstablishResp = {
      requiresImmediateRenegotiation?: boolean;
      sessionDescription?: { sdp: string; type: string };
    };

    const resp = await cfPost<EstablishResp>(
      `/sessions/${localSessionId}/datachannels/establish`,
      {
        dataChannel: { location: "remote", dataChannelName: "server-events" },
        sessionDescription: { type: offer.type, sdp: offer.sdp },
      },
    );

    if (resp.requiresImmediateRenegotiation && resp.sessionDescription) {
      // SFU が再ネゴを要求してきた場合 (フォールバック)
      await pc!.setRemoteDescription({
        sdp: resp.sessionDescription.sdp,
        type: resp.sessionDescription.type as RTCSdpType,
      });
      const answer = await pc!.createAnswer();
      await pc!.setLocalDescription(answer);
      await waitForIceGathering(pc!);
      await cfPost(`/sessions/${localSessionId}/datachannels/establish`, {
        dataChannel: { location: "remote", dataChannelName: "server-events" },
        sessionDescription: {
          type: answer.type,
          sdp: pc!.localDescription!.sdp,
        },
      });
    } else if (resp.sessionDescription) {
      // 通常パス: SFU が answer を返す
      await pc!.setRemoteDescription({
        sdp: resp.sessionDescription.sdp,
        type: resp.sessionDescription.type as RTCSdpType,
      });
    }
  }

  // ---------- DataChannel publish / subscribe ----------

  async function publishDataChannel(name: string): Promise<number> {
    type DcNewResp = { dataChannels: { id: number }[] };
    const resp = await cfPost<DcNewResp>(
      `/sessions/${localSessionId}/datachannels/new`,
      { dataChannels: [{ location: "local", dataChannelName: name }] },
    );
    return resp.dataChannels[0].id;
  }

  async function subscribeDataChannel(
    name: string,
    remoteSessionId: string,
  ): Promise<number> {
    type DcNewResp = { dataChannels: { id: number }[] };
    const resp = await cfPost<DcNewResp>(
      `/sessions/${localSessionId}/datachannels/new`,
      {
        dataChannels: [
          {
            location: "remote",
            dataChannelName: name,
            sessionId: remoteSessionId,
          },
        ],
      },
    );
    return resp.dataChannels[0].id;
  }

  // ---------- caller 側の接続処理 ----------

  async function connectAsCaller(signalingFns: SignalingFns): Promise<void> {
    pc = createPeerConnection();

    pc.createDataChannel("server-events");
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGathering(pc);

    await createSession();
    await establishTransport(pc.localDescription!);

    const sendId = await publishDataChannel(DC_NAME);
    const send = pc.createDataChannel(DC_NAME, {
      negotiated: true,
      id: sendId,
    });

    await signalingFns.publishSessionId(localSessionId);
    const calleeSessionId = await signalingFns.waitForPeerSessionId();

    const recvId = await subscribeDataChannel(DC_NAME, calleeSessionId);
    const recv = pc.createDataChannel(`${DC_NAME}-recv`, {
      negotiated: true,
      id: recvId,
    });

    // リスナーを open 前にセット (メッセージのドロップを防ぐため waitForChannelOpen より先に公開)
    sendChannel.value = send;
    recvChannel.value = recv;

    await Promise.all([waitForChannelOpen(send), waitForChannelOpen(recv)]);
  }

  // ---------- callee 側の接続処理 ----------

  async function connectAsCallee(signalingFns: SignalingFns): Promise<void> {
    pc = createPeerConnection();

    // Caller と同様に Offer SDP を作成してから transport を確立する。
    // これにより /datachannels/establish に常に sessionDescription を渡せ、
    // requiresImmediateRenegotiation の複雑なパスを回避できる。
    pc.createDataChannel("server-events");
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGathering(pc);

    await createSession();
    await establishTransport(pc.localDescription!);

    const callerSessionId = await signalingFns.waitForPeerSessionId();

    const recvId = await subscribeDataChannel(DC_NAME, callerSessionId);
    const recv = pc.createDataChannel(`${DC_NAME}-recv`, {
      negotiated: true,
      id: recvId,
    });

    const sendId = await publishDataChannel(DC_NAME);
    const send = pc.createDataChannel(DC_NAME, {
      negotiated: true,
      id: sendId,
    });

    await signalingFns.publishSessionId(localSessionId);

    // リスナーを open 前にセット (メッセージのドロップを防ぐため waitForChannelOpen より先に公開)
    sendChannel.value = send;
    recvChannel.value = recv;

    await Promise.all([waitForChannelOpen(send), waitForChannelOpen(recv)]);
  }

  // ---------- 公開 API ----------

  async function connect(
    role: ConnectionRole,
    signalingFns: SignalingFns,
  ): Promise<void> {
    error.value = null;
    try {
      if (role === "caller") {
        await connectAsCaller(signalingFns);
      } else {
        await connectAsCallee(signalingFns);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      error.value = msg;
      console.error("[useCloudflareRealtime]", msg);
      throw err;
    }
  }

  function disconnect(): void {
    pc?.close();
    pc = null;
    sendChannel.value = null;
    recvChannel.value = null;
    connectionState.value = "closed";
  }

  return {
    connectionState: readonly(connectionState),
    sendChannel: readonly(sendChannel),
    recvChannel: readonly(recvChannel),
    error: readonly(error),
    connect,
    disconnect,
  };
}
