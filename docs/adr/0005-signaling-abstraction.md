# ADR-0005: シグナリングの抽象化（SignalingFns インターフェース）

- **ステータス**: Accepted
- **日付**: 2025-03
- **関連**: [アーキテクチャ詳細](../architecture.md)

---

## コンテキスト

WebRTC 接続確立に必要な sessionId の交換（シグナリング）の実装は、アプリケーションの要件によって変わりうる（HTTP ポーリング / WebSocket / SSE / Cloudflare Durable Objects など）。

## 決定

`useCloudflareRealtime` はシグナリングの具体実装に依存せず、`SignalingFns` インターフェースのみに依存する。

```typescript
// composables/useCloudflareRealtime.ts
export interface SignalingFns {
  publishSessionId(sessionId: string): Promise<void>;
  waitForPeerSessionId(): Promise<string>;
}
```

現在の実装 `useSignaling` は Nuxt H3 API への HTTP ポーリングだが、このインターフェースを満たす任意の実装に差し替え可能。

## 理由

- WebRTC 接続ロジックとシグナリング実装の **関心の分離**
- プロトタイプから本番への移行時にシグナリング部分だけを変更できる
- テスト時にシグナリングをモックしやすい

## トレードオフ

- 間接参照によるコード量の増加（最小限）
- `publishSessionId / waitForPeerSessionId` の 2 メソッドに固定されるため、より複雑なシグナリングプロトコルには拡張が必要
