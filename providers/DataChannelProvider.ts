import * as Y from "yjs";
import type { ProviderEvent } from "~/types/realtime";

// ---------------------------------------------------------------------------
// DataChannelProvider
// ---------------------------------------------------------------------------
// 双方向 DataChannel (attachBidirectional) のメッセージプロトコル:
//
//   MSG_SYNC_REQ   (0x00) : 「あなたの状態を送ってください」リクエスト
//   MSG_SYNC_STATE (0x01) : フル Yjs 状態 (リクエストへの応答)
//   MSG_UPDATE     (0x02) : インクリメンタル Yjs 更新
//
// 同期フロー:
//   1. sendCh.open → MSG_SYNC_REQ を送信 (相手の recvCh に届く)
//   2. recvCh でリクエストを受信 → MSG_SYNC_STATE で自分の状態を応答
//   3. 応答を受け取った側: Y.applyUpdate で適用 → synced = true
//
// このプル型プロトコルにより「sendCh.open が callee より早い」という
// タイミング競合を解消できる。チャンネルが繋がった時点で双方が
// 確実に相手の状態を取得できる。
// ---------------------------------------------------------------------------

// メッセージタイプ定数
const MSG_SYNC_REQ = 0x00; // 状態リクエスト
const MSG_SYNC_STATE = 0x01; // フル状態応答
const MSG_UPDATE = 0x02; // インクリメンタル更新

type Listener = () => void;

export class DataChannelProvider {
  private readonly doc: Y.Doc;
  // unidirectional (旧 attach API) 用
  private channel: RTCDataChannel | null = null;
  // bidirectional (新 attachBidirectional API) 用
  private sendCh: RTCDataChannel | null = null;
  private recvCh: RTCDataChannel | null = null;
  private listeners: Map<ProviderEvent, Set<Listener>> = new Map();

  /** 接続状態フラグ */
  public connected = false;
  /** 初回フルステート同期完了フラグ */
  public synced = false;

  constructor(doc: Y.Doc) {
    this.doc = doc;
  }

  // -------------------------------------------------------------------------
  // 公開 API
  // -------------------------------------------------------------------------

  /**
   * RTCDataChannel をアタッチして同期を開始する (旧 unidirectional API)。
   */
  attach(channel: RTCDataChannel): void {
    if (this.channel) this.detach();
    this.channel = channel;
    channel.binaryType = "arraybuffer";
    channel.addEventListener("open", this.handleOpen);
    channel.addEventListener("message", this.handleMessage);
    channel.addEventListener("close", this.handleClose);
    channel.addEventListener("error", this.handleError);
    if (channel.readyState === "open") this.handleOpen();
  }

  /**
   * 送信用・受信用の 2 本の RTCDataChannel をアタッチして双方向同期を開始する。
   * sendCh: 自分の更新を送る / recvCh: 相手の更新を受け取る
   */
  attachBidirectional(sendCh: RTCDataChannel, recvCh: RTCDataChannel): void {
    this.detachBidirectional();
    this.sendCh = sendCh;
    this.recvCh = recvCh;

    recvCh.binaryType = "arraybuffer";
    recvCh.addEventListener("open", this.handleRecvOpenBi);
    recvCh.addEventListener("message", this.handleMessageBi);
    recvCh.addEventListener("close", this.handleClose);
    recvCh.addEventListener("error", this.handleError);

    sendCh.addEventListener("open", this.handleOpenBi);
    sendCh.addEventListener("close", this.handleClose);
    sendCh.addEventListener("error", this.handleError);

    if (sendCh.readyState === "open") this.handleOpenBi();
    if (recvCh.readyState === "open") this.handleRecvOpenBi();
  }

  /** DataChannel を切り離して同期を停止する */
  detach(): void {
    if (!this.channel) return;
    this.channel.removeEventListener("open", this.handleOpen);
    this.channel.removeEventListener("message", this.handleMessage);
    this.channel.removeEventListener("close", this.handleClose);
    this.channel.removeEventListener("error", this.handleError);
    this.channel = null;
  }

  /** bidirectional DataChannel を切り離す */
  detachBidirectional(): void {
    if (this.sendCh) {
      this.sendCh.removeEventListener("open", this.handleOpenBi);
      this.sendCh.removeEventListener("close", this.handleClose);
      this.sendCh.removeEventListener("error", this.handleError);
      this.sendCh = null;
    }
    if (this.recvCh) {
      this.recvCh.removeEventListener("open", this.handleRecvOpenBi);
      this.recvCh.removeEventListener("message", this.handleMessageBi);
      this.recvCh.removeEventListener("close", this.handleClose);
      this.recvCh.removeEventListener("error", this.handleError);
      this.recvCh = null;
    }
  }

  /** リソースを完全に解放する */
  destroy(): void {
    this.doc.off("update", this.handleDocUpdate);
    this.doc.off("update", this.handleDocUpdateBi);
    this.detach();
    this.detachBidirectional();
    this.connected = false;
    this.synced = false;
    this.listeners.clear();
  }

  // -------------------------------------------------------------------------
  // イベントエミッター
  // -------------------------------------------------------------------------

  on(event: ProviderEvent, fn: Listener): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
  }

  off(event: ProviderEvent, fn: Listener): void {
    this.listeners.get(event)?.delete(fn);
  }

  private emit(event: ProviderEvent): void {
    this.listeners.get(event)?.forEach((fn) => fn());
  }

  // -------------------------------------------------------------------------
  // bidirectional ハンドラー
  // -------------------------------------------------------------------------

  /**
   * sendCh が open になったとき:
   *   connected を宣言し、相手に「状態をください」(MSG_SYNC_REQ) を送る。
   *   相手は recvCh でこれを受け取り、フル状態を返してくる。
   */
  private handleOpenBi = (): void => {
    this.connected = true;
    this.emit("connected");
    // 相手に自分の状態を「リクエスト」する (プル型)
    this.sendFrame(MSG_SYNC_REQ, new Uint8Array(0));
    // ローカル更新の監視を開始
    this.doc.on("update", this.handleDocUpdateBi);
  };

  /**
   * recvCh が open になったとき:
   *   sendCh がすでに open なら追加でリクエストを送る。
   *   (sendCh の open タイミングが相手の subscribe より早かった場合のリカバリ)
   */
  private handleRecvOpenBi = (): void => {
    if (this.sendCh?.readyState === "open") {
      this.sendFrame(MSG_SYNC_REQ, new Uint8Array(0));
    }
  };

  /**
   * recvCh でメッセージを受信したとき (bidirectional プロトコル)
   */
  private handleMessageBi = (event: MessageEvent): void => {
    const data = toUint8Array(event.data);
    if (!data || data.length === 0) {
      console.warn(
        "[DataChannelProvider] 空またはバイナリ以外のメッセージ:",
        typeof event.data,
      );
      return;
    }

    const msgType = data[0];
    const payload = data.slice(1);

    switch (msgType) {
      case MSG_SYNC_REQ: {
        // 相手がこちらの状態を要求している → フル状態を返す
        const fullState = Y.encodeStateAsUpdate(this.doc);
        this.sendFrame(MSG_SYNC_STATE, fullState);
        break;
      }
      case MSG_SYNC_STATE: {
        // 相手のフル状態を受け取った → 適用して synced
        Y.applyUpdate(this.doc, payload, this);
        if (!this.synced) {
          this.synced = true;
          this.emit("synced");
        }
        break;
      }
      case MSG_UPDATE: {
        // インクリメンタル更新
        Y.applyUpdate(this.doc, payload, this);
        if (!this.synced) {
          this.synced = true;
          this.emit("synced");
        }
        break;
      }
      default:
        console.warn("[DataChannelProvider] 不明なメッセージタイプ:", msgType);
    }
  };

  /** ローカル更新を sendCh 経由で送信 (bidirectional) */
  private handleDocUpdateBi = (update: Uint8Array, origin: unknown): void => {
    if (origin === this) return;
    this.sendFrame(MSG_UPDATE, update);
  };

  // -------------------------------------------------------------------------
  // unidirectional ハンドラー (旧 attach API 用、後方互換)
  // -------------------------------------------------------------------------

  private handleOpen = (): void => {
    this.connected = true;
    this.emit("connected");
    const fullState = Y.encodeStateAsUpdate(this.doc);
    this.sendBinary(fullState);
    this.doc.on("update", this.handleDocUpdate);
  };

  private handleMessage = (event: MessageEvent): void => {
    const update = toUint8Array(event.data);
    if (!update) {
      console.warn(
        "[DataChannelProvider] 不明なメッセージ形式:",
        typeof event.data,
      );
      return;
    }
    Y.applyUpdate(this.doc, update, this);
    if (!this.synced) {
      this.synced = true;
      this.emit("synced");
    }
  };

  private handleDocUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === this) return;
    if (!this.channel || this.channel.readyState !== "open") return;
    this.sendBinary(update);
  };

  // -------------------------------------------------------------------------
  // 共通ハンドラー
  // -------------------------------------------------------------------------

  private handleClose = (): void => {
    this.doc.off("update", this.handleDocUpdate);
    this.doc.off("update", this.handleDocUpdateBi);
    this.connected = false;
    this.synced = false;
    this.emit("disconnected");
  };

  private handleError = (event: Event): void => {
    console.error("[DataChannelProvider] DataChannel エラー:", event);
  };

  // -------------------------------------------------------------------------
  // 内部ユーティリティ
  // -------------------------------------------------------------------------

  /**
   * 1 バイトのタイプヘッダー + ペイロードを sendCh に送る
   */
  private sendFrame(type: number, payload: Uint8Array): void {
    const ch = this.sendCh;
    if (!ch || ch.readyState !== "open") return;
    const msg = new Uint8Array(1 + payload.length);
    msg[0] = type;
    msg.set(payload, 1);
    try {
      ch.send(msg.buffer as ArrayBuffer);
    } catch (err) {
      console.error("[DataChannelProvider] 送信エラー:", err);
    }
  }

  /** Uint8Array をそのまま channel に送る (旧 unidirectional 用) */
  private sendBinary(data: Uint8Array): void {
    const ch = this.channel;
    if (!ch || ch.readyState !== "open") return;
    try {
      ch.send(data.buffer as ArrayBuffer);
    } catch (err) {
      console.error("[DataChannelProvider] 送信エラー:", err);
    }
  }
}

// ---------------------------------------------------------------------------
// ヘルパー: 受信データを Uint8Array に正規化
// ---------------------------------------------------------------------------

function toUint8Array(data: unknown): Uint8Array | null {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (data instanceof Uint8Array) return data;
  return null;
}
