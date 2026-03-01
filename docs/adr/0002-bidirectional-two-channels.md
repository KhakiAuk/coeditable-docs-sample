# ADR-0002: DataChannel を 2 本使って双方向通信を実現

- **ステータス**: Accepted
- **日付**: 2025-03
- **関連**: [アーキテクチャ詳細](../architecture.md), [ADR-0001](./0001-cloudflare-realtime-datachannel.md)

---

## コンテキスト

Cloudflare Realtime の DataChannel は、`location: local`（publish）で作成したチャンネルを、相手が `location: remote`（subscribe）することで一方向のチャネルになる。Yjs の同期には双方向の通信が必要。

## 決定

各ピアが**自分の送信用 (sendCh) と受信用 (recvCh) を 1 本ずつ**持ち、計 2 本のチャンネルで双方向を実現する。

```
Caller.sendCh (publish/local)    ──▶  Callee.recvCh (subscribe/remote)
Caller.recvCh (subscribe/remote) ◀──  Callee.sendCh (publish/local)
```

## 理由

- Cloudflare Realtime の制約に素直に従う実装
- チャンネルの責務（送信 / 受信）が明確で実装が追いやすい

## トレードオフ

- セッション確立フローが Caller と Callee で異なる ordering が必要（Callee が先に sendCh を publish してから sessionId を通知することで、Caller の subscribe 時にチャンネルが確実に存在するよう保証している）
