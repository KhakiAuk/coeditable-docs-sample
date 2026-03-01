# Architecture（インデックス）

> 詳細ドキュメントは `docs/` ディレクトリに移行しました。

## ドキュメント一覧

| ドキュメント                                   | 内容                                                                               |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| [docs/architecture.md](./docs/architecture.md) | システム全体構成・コンポーネント責務・データフロー・メッセージプロトコル・状態遷移 |
| [docs/adr/](./docs/adr/README.md)              | アーキテクチャ決定記録（ADR）一覧                                                  |

## ADR 一覧

| #                                                              | タイトル                                               |
| -------------------------------------------------------------- | ------------------------------------------------------ |
| [ADR-0001](./docs/adr/0001-cloudflare-realtime-datachannel.md) | Cloudflare Realtime DataChannel をトランスポートに採用 |
| [ADR-0002](./docs/adr/0002-bidirectional-two-channels.md)      | DataChannel を 2 本使って双方向通信を実現              |
| [ADR-0003](./docs/adr/0003-pull-sync-protocol.md)              | プル型同期プロトコルの採用                             |
| [ADR-0004](./docs/adr/0004-symmetric-offer-flow.md)            | Caller / Callee 対称フロー（両者が Offer を生成）      |
| [ADR-0005](./docs/adr/0005-signaling-abstraction.md)           | シグナリングの抽象化（SignalingFns インターフェース）  |
| [ADR-0006](./docs/adr/0006-origin-loop-prevention.md)          | ループ防止に origin を使用                             |
| [ADR-0007](./docs/adr/0007-ytext-diff-update.md)               | Y.Text の差分更新による Vue バインド                   |
