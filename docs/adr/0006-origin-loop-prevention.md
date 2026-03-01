# ADR-0006: ループ防止に origin を使用

- **ステータス**: Accepted
- **日付**: 2025-03
- **関連**: [アーキテクチャ詳細](../architecture.md)

---

## コンテキスト

Yjs の `Y.applyUpdate(doc, update, origin)` でリモート更新を適用すると `doc.on('update')` が発火する。そのイベントで再び送信してしまうと無限ループが発生する。

## 決定

`Y.applyUpdate` の第 3 引数に `DataChannelProvider` インスタンス自身 (`this`) を `origin` として渡し、`handleDocUpdateBi` ハンドラー内で `origin === this` の場合は送信をスキップする。

```typescript
// providers/DataChannelProvider.ts

// 受信時: origin に this を渡す
Y.applyUpdate(this.doc, payload, this);

// 送信ハンドラー: リモート由来の更新はスキップ
private handleDocUpdateBi = (update: Uint8Array, origin: unknown): void => {
  if (origin === this) return;
  this.sendFrame(MSG_UPDATE, update);
};
```

## 理由

- Yjs が公式に推奨するループ防止パターン
- `origin` の比較が参照等価（`===`）のため、偶然の衝突が起きない
- ローカル起因の更新のみを送信するという意図がコードから読み取れる

## トレードオフ

- `origin` が `unknown` 型のため、型安全性のために実行時キャストが必要な場合がある
