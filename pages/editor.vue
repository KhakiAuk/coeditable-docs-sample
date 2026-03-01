<template>
  <main class="editor-page">
    <header class="editor-header">
      <h1>共同編集エディター</h1>

      <!-- 接続設定パネル -->
      <section
        class="connection-panel"
        :class="{ disabled: isConnecting || connected }"
      >
        <div class="field-group">
          <label for="room-id">Room ID</label>
          <input
            id="room-id"
            v-model="roomId"
            type="text"
            placeholder="room-abc123"
            :disabled="isConnecting || connected"
          />
        </div>

        <div class="field-group">
          <label>ロール</label>
          <div class="role-selector">
            <label>
              <input
                v-model="role"
                type="radio"
                value="caller"
                :disabled="isConnecting || connected"
              />
              Caller（先に起動）
            </label>
            <label>
              <input
                v-model="role"
                type="radio"
                value="callee"
                :disabled="isConnecting || connected"
              />
              Callee（後に起動）
            </label>
          </div>
        </div>

        <button
          class="btn-connect"
          :disabled="!roomId || isConnecting || connected"
          @click="handleConnect"
        >
          {{ isConnecting ? "接続中..." : "接続する" }}
        </button>

        <button
          v-if="connected"
          class="btn-disconnect"
          @click="handleDisconnect"
        >
          切断する
        </button>
      </section>

      <!-- ステータスバー -->
      <div class="status-bar">
        <span class="status-indicator" :class="statusClass">{{
          statusLabel
        }}</span>
        <span v-if="synced" class="sync-badge">同期済み</span>
        <span v-if="errorMessage" class="error-msg">{{ errorMessage }}</span>
      </div>
    </header>

    <!-- テキストエディター -->
    <section class="editor-area">
      <textarea
        class="collaborative-textarea"
        :value="text"
        :disabled="!connected || !synced"
        placeholder="接続後にタイピングを開始してください..."
        @input="handleInput"
      />
      <div class="char-count">{{ text.length }} 文字</div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useCollaborativeDoc } from "~/composables/useCollaborativeDoc";
import { useCloudflareRealtime } from "~/composables/useCloudflareRealtime";
import { useSignaling } from "~/composables/useSignaling";
import type { ConnectionRole } from "~/types/realtime";

// ---------------------------------------------------------------------------
// Cloudflare 認証情報 (nuxt.config.ts の runtimeConfig.public から取得)
// .env に NUXT_PUBLIC_CF_APP_ID / NUXT_PUBLIC_CF_TOKEN を設定すること
// ---------------------------------------------------------------------------
const runtimeConfig = useRuntimeConfig();
const CF_APP_ID = runtimeConfig.public.cfAppId as string;
const CF_TOKEN = runtimeConfig.public.cfToken as string;

// ---------------------------------------------------------------------------
// UI 状態
// ---------------------------------------------------------------------------
const roomId = ref("room-001");
const role = ref<ConnectionRole>("caller");
const isConnecting = ref(false);
const errorMessage = ref<string | null>(null);

// ---------------------------------------------------------------------------
// Yjs ドキュメント管理 (コンポーザブル)
// ---------------------------------------------------------------------------
const { text, connected, synced, updateText, attachChannels } =
  useCollaborativeDoc();

// ---------------------------------------------------------------------------
// Cloudflare Realtime 接続管理 (コンポーザブル)
// ---------------------------------------------------------------------------
const {
  sendChannel,
  recvChannel,
  error: rtcError,
  connect,
  disconnect,
} = useCloudflareRealtime({
  appId: CF_APP_ID,
  token: CF_TOKEN,
});

// 両 DataChannel が確立されたら Provider にアタッチ
// flush:'sync' でリアクティブ変更と同期的に実行し、open イベント前にリスナーをセットする
watch(
  [sendChannel, recvChannel],
  ([send, recv]) => {
    if (send && recv) attachChannels(send, recv);
  },
  { flush: "sync" },
);

// RTCエラーを UI に反映
watch(rtcError, (msg) => {
  errorMessage.value = msg;
});

// ---------------------------------------------------------------------------
// イベントハンドラー
// ---------------------------------------------------------------------------

async function handleConnect() {
  errorMessage.value = null;
  isConnecting.value = true;
  try {
    const signalingFns = useSignaling(roomId.value, role.value);
    await connect(role.value, signalingFns);
  } catch (err) {
    errorMessage.value =
      err instanceof Error ? err.message : "接続に失敗しました";
  } finally {
    isConnecting.value = false;
  }
}

function handleDisconnect() {
  disconnect();
}

function handleInput(event: Event) {
  const target = event.target as HTMLTextAreaElement;
  updateText(target.value);
}

// ---------------------------------------------------------------------------
// 表示用コンピューテッド
// ---------------------------------------------------------------------------

const statusClass = computed(() => {
  if (connected.value) return "status--connected";
  if (isConnecting.value) return "status--connecting";
  return "status--disconnected";
});

const statusLabel = computed(() => {
  if (connected.value) return "接続中";
  if (isConnecting.value) return "接続試行中...";
  return "未接続";
});
</script>

<style scoped>
.editor-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 1.5rem;
  font-family: system-ui, sans-serif;
}

.editor-header {
  margin-bottom: 1.5rem;
}

h1 {
  font-size: 1.5rem;
  margin-bottom: 1rem;
}

/* ───── 接続パネル ───── */
.connection-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: flex-end;
  padding: 1rem;
  background: #f8f9fa;
  border-radius: 8px;
  margin-bottom: 1rem;
}

.connection-panel.disabled {
  opacity: 0.6;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-group label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.field-group input[type="text"] {
  padding: 6px 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 0.9rem;
}

.role-selector {
  display: flex;
  gap: 1rem;
}

.role-selector label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.9rem;
  font-weight: normal;
  text-transform: none;
  letter-spacing: 0;
  cursor: pointer;
}

.btn-connect,
.btn-disconnect {
  padding: 8px 20px;
  border: none;
  border-radius: 4px;
  font-size: 0.9rem;
  cursor: pointer;
  font-weight: 600;
}

.btn-connect {
  background: #0070f3;
  color: white;
}

.btn-connect:disabled {
  background: #aaa;
  cursor: not-allowed;
}

.btn-disconnect {
  background: #e53e3e;
  color: white;
}

/* ───── ステータスバー ───── */
.status-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.85rem;
}

.status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
}

.status-indicator::before {
  content: "";
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #aaa;
}

.status--connected::before {
  background: #38a169;
}
.status--connecting::before {
  background: #dd6b20;
  animation: pulse 1s infinite;
}
.status--disconnected::before {
  background: #aaa;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

.sync-badge {
  background: #e6fffa;
  color: #234e52;
  border: 1px solid #81e6d9;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
}

.error-msg {
  color: #e53e3e;
}

/* ───── テキストエディター ───── */
.editor-area {
  position: relative;
}

.collaborative-textarea {
  width: 100%;
  min-height: 420px;
  padding: 1rem;
  font-size: 1rem;
  line-height: 1.7;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  resize: vertical;
  box-sizing: border-box;
  font-family: "Noto Sans JP", system-ui, sans-serif;
  transition: border-color 0.2s;
}

.collaborative-textarea:not(:disabled):focus {
  outline: none;
  border-color: #0070f3;
}

.collaborative-textarea:disabled {
  background: #f8f9fa;
  cursor: not-allowed;
}

.char-count {
  text-align: right;
  font-size: 0.75rem;
  color: #999;
  margin-top: 4px;
}
</style>
