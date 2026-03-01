# coeditable-docs-sample

Cloudflare Realtime SFU の DataChannel をトランスポート層として使用し、Yjs CRDT による二者間リアルタイム共同編集のプロトタイプです。

## 技術スタック

| 要素           | 採用技術                                                           |
| -------------- | ------------------------------------------------------------------ |
| フレームワーク | Nuxt 3 (Vue 3 / TypeScript)                                        |
| CRDT           | [Yjs](https://github.com/yjs/yjs) — `Y.Doc`, `Y.Text`              |
| WebRTC SFU     | [Cloudflare Realtime](https://developers.cloudflare.com/realtime/) |
| DataChannel    | `/datachannels/establish` + `/datachannels/new` API                |
| シグナリング   | Nuxt H3 サーバールート (in-memory ストア、プロトタイプ用)          |

---

## ディレクトリ構成

```
coeditable-docs-sample/
├── types/
│   └── realtime.ts                  # 共通型定義
├── providers/
│   └── DataChannelProvider.ts       # Yjs ↔ DataChannel ブリッジ
├── composables/
│   ├── useCloudflareRealtime.ts     # WebRTC 接続管理
│   ├── useCollaborativeDoc.ts       # Yjs 状態管理 + Vue reactivity
│   └── useSignaling.ts              # シグナリング実装（差し替え可能）
├── pages/
│   └── editor.vue                   # 共同編集 UI
├── server/api/signal/
│   ├── [roomId].get.ts              # シグナリング取得 (?role=caller|callee)
│   └── [roomId].post.ts             # シグナリング投稿 ({ role, sessionId })
├── .env
├── nuxt.config.ts
└── package.json
```

---

## セットアップ

### 1. Cloudflare 認証情報の取得

[Cloudflare ダッシュボード](https://dash.cloudflare.com/) → **Realtime** → アプリを作成し、App ID と Token を取得します。

### 2. 環境変数の設定

```bash
# .env
NUXT_PUBLIC_CF_APP_ID=<あなたの App ID>
NUXT_PUBLIC_CF_TOKEN=<あなたの Token>
```

### 3. 起動

```bash
npm install
npm run dev
```

---

## 動作確認

1. ブラウザを **2 タブ** 開き、どちらも `http://localhost:3000/editor` へアクセス
2. 両タブで同じ **Room ID** を入力
3. 一方を **Caller**（先に接続）、他方を **Callee**（後に接続）に設定
4. 両方の「接続する」ボタンをクリック
5. 双方が「接続中 / 同期済み」になったら、テキスト編集が相互にリアルタイム反映される

> シグナリングの in-memory ストアはサーバー再起動でリセットされます。同じ Room ID で再試行するときはページをリロードしてください。

---

## ドキュメント

| ドキュメント                                   | 内容                                                                             |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| [docs/architecture.md](./docs/architecture.md) | システム全体構成・データフロー・メッセージプロトコル・状態遷移（Mermaid 図付き） |
| [docs/adr/](./docs/adr/README.md)              | アーキテクチャ決定記録（ADR）一覧                                                |

---

## アーキテクチャ

```
editor.vue
  ├── useCollaborativeDoc          Yjs 状態管理 + Vue ref バインド
  │     └── DataChannelProvider   Yjs ↔ DataChannel バイナリブリッジ
  │           └── Y.Doc / Y.Text
  ├── useCloudflareRealtime        RTCPeerConnection + Cloudflare Calls API
  │     ├── sendChannel (publish)
  │     └── recvChannel (subscribe)
  └── useSignaling                 シグナリング (HTTP ポーリング)
        └── /api/signal/:roomId
```

---

## 実装のポイント

### 1. Cloudflare Realtime DataChannel フロー

Cloudflare Realtime の DataChannel は音声・映像トラックとは異なる専用エンドポイントを使います。

```
① /sessions/new                    セッション作成
② /datachannels/establish          SCTP トランスポート確立 (SDP交換)
③ /datachannels/new (local)        自分の DataChannel を publish → id 取得
④ /datachannels/new (remote)       相手の DataChannel を subscribe → id 取得
⑤ createDataChannel({ negotiated: true, id })  API の id で DC を作成
```

Caller / Callee は両方とも `createOffer()` → `/datachannels/establish` の**対称フロー**で接続します。

| ステップ           | Caller                                            | Callee                                                   |
| ------------------ | ------------------------------------------------- | -------------------------------------------------------- |
| トランスポート確立 | Offer SDP を送信 → Answer を受け取る              | Offer SDP を送信 → Answer を受け取る                     |
| sessionId を公開   | `publishSessionId(sessionId)`                     | `waitForPeerSessionId()` → `publishSessionId(sessionId)` |
| DataChannel 操作   | publish → 相手の subscribe 完了を待って subscribe | subscribe(caller) → publish → sessionId を通知           |

> **Callee が先に publish してから sessionId を通知**することで、Caller が subscribe するときに必ずチャンネルが存在する ordering を保証しています。

### 2. DataChannel の双方向化

Cloudflare Realtime の DataChannel は**一方向**（publisher → subscriber）のため、双方向の Yjs 同期には **2 本のチャンネル**を使います。

```
Caller sendCh ──[yjs-sync]──▶ Callee recvCh
Caller recvCh ◀──[yjs-sync]── Callee sendCh
```

### 3. プル型同期プロトコル

`DataChannelProvider` は 3 種類のメッセージで同期を行います。

| タイプ           | バイト | 内容                                           |
| ---------------- | ------ | ---------------------------------------------- |
| `MSG_SYNC_REQ`   | `0x00` | 「あなたの現在状態を送ってください」リクエスト |
| `MSG_SYNC_STATE` | `0x01` | フル Yjs 状態（`encodeStateAsUpdate`）の応答   |
| `MSG_UPDATE`     | `0x02` | インクリメンタルな Yjs 更新                    |

**同期フロー**:

```
sendCh.open
  → MSG_SYNC_REQ を送る
  → 相手が MSG_SYNC_STATE で応答
  → Y.applyUpdate → synced ✓
```

このプル型方式により、「sendCh が open になったとき相手の recvCh がまだ Subscribe 前」というタイミング競合を解消しています。

### 4. ループ防止

`Y.applyUpdate(doc, update, origin)` の第 3 引数 `origin` にプロバイダー自身 (`this`) を渡すことで、`doc.on('update')` ハンドラー内で `origin === this` を判定し、リモートから受信した更新の再送信を防いでいます。

### 5. シグナリングの抽象化

`useCloudflareRealtime` は `SignalingFns` インターフェースのみに依存します。

```ts
interface SignalingFns {
  publishSessionId(sessionId: string): Promise<void>;
  waitForPeerSessionId(): Promise<string>;
}
```

現在の実装は Nuxt H3 への REST ポーリングですが、WebSocket / SSE / Cloudflare Durable Objects に差し替えても WebRTC 接続ロジックは無変更で動作します。

---

## 本番への移行時の注意点

- **シグナリングストア**: サーバー内メモリ (`globalThis.__signalingStore`) を Cloudflare KV / Durable Objects に置き換える
- **認証情報の保護**: `NUXT_PUBLIC_CF_TOKEN` はクライアントに露出します。本番では Nuxt サーバールートを介したトークン発行に切り替えることを推奨
- **エラーハンドリング**: タイムアウト・切断時の再接続ロジックは未実装
