import type { SignalingFns } from "~/composables/useCloudflareRealtime";

// ---------------------------------------------------------------------------
// useSignaling
// ---------------------------------------------------------------------------
// 役割:
//   SignalingFns インターフェースの具体実装。
//   Nuxt サーバーAPI (/api/signal/:roomId) を使ったシンプルなポーリング方式。
//
//   role を渡すことで、自分の役割 (caller / callee) に応じた
//   publish / subscribe 先を自動的に切り替える。
//
//   シグナリングの抽象化ポイント:
//   useCloudflareRealtime は SignalingFns 型のオブジェクトしか知らないため、
//   ここを WebSocket / SSE / Cloudflare Durable Objects 等に差し替えても
//   WebRTC 接続ロジックは無変更で動作する。
// ---------------------------------------------------------------------------

export function useSignaling(
  roomId: string,
  role: "caller" | "callee",
): SignalingFns {
  const peerRole = role === "caller" ? "callee" : "caller";

  return {
    /** 自分の sessionId をサーバーに公開する */
    async publishSessionId(sessionId: string): Promise<void> {
      const res = await fetch(`/api/signal/${roomId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, sessionId }),
      });
      if (!res.ok) {
        throw new Error(
          `[useSignaling] publishSessionId failed: ${res.status}`,
        );
      }
    },

    /** 相手の sessionId がサーバーに登録されるまでポーリング */
    async waitForPeerSessionId(): Promise<string> {
      const data = await poll<{ sessionId: string }>(
        `/api/signal/${roomId}?role=${peerRole}`,
        { intervalMs: 1_000, timeoutMs: 60_000 },
      );
      return data.sessionId;
    },
  };
}

// ---------------------------------------------------------------------------
// ポーリングヘルパー
// ---------------------------------------------------------------------------

interface PollOptions {
  intervalMs: number;
  timeoutMs: number;
}

async function poll<T>(
  url: string,
  { intervalMs, timeoutMs }: PollOptions,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const res = await fetch(url);
    if (res.ok) return res.json() as Promise<T>;

    if (res.status !== 404) {
      throw new Error(`[useSignaling] Unexpected status: ${res.status}`);
    }
    await sleep(intervalMs);
  }

  throw new Error(`[useSignaling] Timed out waiting for peer (${timeoutMs}ms)`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
