// ---------------------------------------------------------------------------
// Cloudflare Realtime + Yjs 共同編集 — 共通型定義
// ---------------------------------------------------------------------------

/** Cloudflare Calls REST API へ接続するための設定値 */
export interface CloudflareRealtimeConfig {
  /** Cloudflare Calls の App ID */
  appId: string;
  /** セッション作成用 Bearer Token */
  token: string;
}

/** POST /sessions/new のレスポンス */
export interface CfSessionResponse {
  sessionId: string;
}

/** DataChannelProvider が emit するイベント */
export type ProviderEvent = "connected" | "disconnected" | "synced";

/** DataChannelProvider の接続ロール */
export type ConnectionRole = "caller" | "callee";
