# ADR-0004: Caller / Callee 対称フロー（両者が Offer を生成）

- **ステータス**: Accepted
- **日付**: 2025-03
- **関連**: [アーキテクチャ詳細](../architecture.md), [ADR-0001](./0001-cloudflare-realtime-datachannel.md)

---

## コンテキスト

Cloudflare Realtime の `/datachannels/establish` API は通常、`requiresImmediateRenegotiation: true` レスポンスが返ってくる場合があり、その場合は再ネゴシエーションが必要になる複雑なフローが発生する。

## 決定

Caller / Callee の両方が**先に `createOffer()` を実行してから `/datachannels/establish` に Offer SDP を渡す**。

```
PC.createDataChannel("server-events")  // ← メディアセクション生成のためのダミー
const offer = await pc.createOffer()
await pc.setLocalDescription(offer)
await waitForIceGathering(pc)
// → offerSDP を /datachannels/establish に渡す
```

## 理由

- 事前に Offer SDP を渡すことで、SFU は常に Answer を返すだけでよくなり `requiresImmediateRenegotiation` の複雑なパスが不要になる
- Caller と Callee が対称なコードフローになるため実装・デバッグが容易

## トレードオフ

- `pc.createDataChannel("server-events")` のダミーチャンネル作成が必要（Offer SDP にメディアセクションを含めるため）
