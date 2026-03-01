# ADR-0007: Y.Text の差分更新による Vue バインド

- **ステータス**: Accepted
- **日付**: 2025-03
- **関連**: [アーキテクチャ詳細](../architecture.md)

---

## コンテキスト

`<textarea>` の `input` イベントで取得した文字列全体を `Y.Text` に反映すると、毎回 `delete all + insert all` が発生し、Yjs の CRDT 特性（編集位置の保持）が失われる。また不要な `update` イベントが大量発生する。

## 決定

`useCollaborativeDoc` の `updateText()` で **先頭・末尾からの共通プレフィックス/サフィックスを算出し、変化した中央部分のみ** `ytext.delete` + `ytext.insert` する。

```typescript
// composables/useCollaborativeDoc.ts

function updateText(newValue: string): void {
  const current = ytext.toString();
  if (current === newValue) return;

  const { start, oldEnd, newEnd } = diffIndex(current, newValue);

  ydoc.transact(() => {
    if (oldEnd > start) ytext.delete(start, oldEnd - start);
    if (newEnd > start) ytext.insert(start, newValue.slice(start, newEnd));
  });
}
```

`diffIndex` は先頭・末尾から一致する文字数を求め、変化した範囲 `[start, oldEnd)` / `[start, newEnd)` を返す。

## 理由

- Yjs の CRDT により、2 ユーザーが同時に異なる位置を編集した際の競合解決が正確になる
- `Y.Doc.transact()` でまとめることで、不要な中間 update イベントの発火を抑制できる
- リモート更新（`ytext.observe`）は変更箇所のみ伝播されるため、差分計算と相性が良い

## トレードオフ

- 差分計算のコスト（O(n)）が追加されるが、テキスト編集の実用的な長さでは無視できる
- 同一文字列の繰り返し（例: `aaaaa`）では diff の精度が落ちるが、CRDT の最終整合性は保たれる
