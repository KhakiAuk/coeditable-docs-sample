# ADR — アーキテクチャ決定記録

このディレクトリには、プロジェクトの重要な設計判断を記録した ADR（Architecture Decision Record）が格納されています。

各 ADR は **Context（背景）→ Decision（決定）→ 理由 → トレードオフ** の形式で記述されています。

---

## 一覧

| #                                                     | タイトル                                               | ステータス |
| ----------------------------------------------------- | ------------------------------------------------------ | ---------- |
| [ADR-0001](./0001-cloudflare-realtime-datachannel.md) | Cloudflare Realtime DataChannel をトランスポートに採用 | Accepted   |
| [ADR-0002](./0002-bidirectional-two-channels.md)      | DataChannel を 2 本使って双方向通信を実現              | Accepted   |
| [ADR-0003](./0003-pull-sync-protocol.md)              | プル型同期プロトコルの採用                             | Accepted   |
| [ADR-0004](./0004-symmetric-offer-flow.md)            | Caller / Callee 対称フロー（両者が Offer を生成）      | Accepted   |
| [ADR-0005](./0005-signaling-abstraction.md)           | シグナリングの抽象化（SignalingFns インターフェース）  | Accepted   |
| [ADR-0006](./0006-origin-loop-prevention.md)          | ループ防止に origin を使用                             | Accepted   |
| [ADR-0007](./0007-ytext-diff-update.md)               | Y.Text の差分更新による Vue バインド                   | Accepted   |

---

関連ドキュメント: [アーキテクチャ詳細](../architecture.md)
