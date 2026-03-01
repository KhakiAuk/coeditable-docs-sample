import { ref, readonly, onUnmounted } from "vue";
import * as Y from "yjs";
import { DataChannelProvider } from "~/providers/DataChannelProvider";

// ---------------------------------------------------------------------------
// useCollaborativeDoc
// ---------------------------------------------------------------------------
// 役割:
//   Yjs Y.Doc のライフサイクルと DataChannelProvider の管理。
//   テキストコンテンツをリアクティブな Vue ref として公開し、
//   UIバインド(v-model等)と Yjs の間の変換を担う。
//
// 責務の分離:
//   - このコンポーザブル: Yjs の状態管理 + Vue リアクティビティ
//   - DataChannelProvider: バイナリ同期の詳細
//   - useCloudflareRealtime: WebRTC 接続の管理
// ---------------------------------------------------------------------------

export function useCollaborativeDoc(textKey = "content") {
  // ---------- Yjs コア ----------
  const ydoc = new Y.Doc();
  const ytext = ydoc.getText(textKey);
  const provider = new DataChannelProvider(ydoc);

  // ---------- リアクティブ状態 ----------
  const text = ref<string>(ytext.toString());
  const connected = ref<boolean>(false);
  const synced = ref<boolean>(false);

  // ---------- Yjs → Vue ref の同期 ----------
  ytext.observe(() => {
    text.value = ytext.toString();
  });

  // ---------- Provider イベント ----------
  provider.on("connected", () => {
    connected.value = true;
  });
  provider.on("disconnected", () => {
    connected.value = false;
    synced.value = false;
  });
  provider.on("synced", () => {
    synced.value = true;
  });

  // ---------- Vue → Yjs への書き込み ----------

  /**
   * テキストエリアの入力を Yjs Y.Text に反映する。
   * Y.Text の差分更新を利用して不要な update イベントを抑制。
   */
  function updateText(newValue: string): void {
    const current = ytext.toString();
    if (current === newValue) return;

    // 差分計算: 先頭と末尾から一致する文字数を求め、中央の変更部分のみを更新
    const { start, oldEnd, newEnd } = diffIndex(current, newValue);

    ydoc.transact(() => {
      if (oldEnd > start) {
        ytext.delete(start, oldEnd - start);
      }
      if (newEnd > start) {
        ytext.insert(start, newValue.slice(start, newEnd));
      }
    });
  }

  // ---------- DataChannel との接続 ----------

  /**
   * 確立済みの RTCDataChannel を受け取り、同期を開始する。
   * useCloudflareRealtime で取得した dataChannel を渡す。
   */
  function attachChannel(channel: RTCDataChannel): void {
    provider.attach(channel);
  }

  /**
   * 送受信用の 2 本の RTCDataChannel を受け取り、双方向同期を開始する。
   * useCloudflareRealtime で取得した sendChannel / recvChannel を渡す。
   */
  function attachChannels(
    sendCh: RTCDataChannel,
    recvCh: RTCDataChannel,
  ): void {
    provider.attachBidirectional(sendCh, recvCh);
  }

  // ---------- クリーンアップ ----------

  function destroy(): void {
    provider.destroy();
    ydoc.destroy();
  }

  onUnmounted(destroy);

  return {
    ydoc,
    ytext,
    provider,
    text: readonly(text),
    connected: readonly(connected),
    synced: readonly(synced),
    updateText,
    attachChannel,
    attachChannels,
    destroy,
  };
}

// ---------------------------------------------------------------------------
// 差分インデックス計算ヘルパー
// ---------------------------------------------------------------------------
// 文字列の先頭・末尾から一致する範囲を除き、変更があった中央部分の
// インデックスを返す。Y.Text への最小書き込みに使用。

interface DiffResult {
  start: number; // 変更開始位置
  oldEnd: number; // 旧文字列側の変更終了位置
  newEnd: number; // 新文字列側の変更終了位置
}

function diffIndex(oldStr: string, newStr: string): DiffResult {
  let start = 0;
  while (
    start < oldStr.length &&
    start < newStr.length &&
    oldStr[start] === newStr[start]
  ) {
    start++;
  }

  let oldEnd = oldStr.length;
  let newEnd = newStr.length;
  while (
    oldEnd > start &&
    newEnd > start &&
    oldStr[oldEnd - 1] === newStr[newEnd - 1]
  ) {
    oldEnd--;
    newEnd--;
  }

  return { start, oldEnd, newEnd };
}
