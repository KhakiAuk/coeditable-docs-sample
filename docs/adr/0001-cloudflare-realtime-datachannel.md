# ADR-0001: Cloudflare Realtime DataChannel をトランスポートに採用

- **ステータス**: Accepted
- **日付**: 2025-03
- **関連**: [アーキテクチャ詳細](../architecture.md)

---

## コンテキスト

リアルタイム共同編集の同期メッセージを送受信するトランスポートが必要。候補として WebSocket、WebRTC DataChannel（P2P）、Cloudflare Realtime DataChannel（SFU 経由）があった。

## 決定

**Cloudflare Realtime の DataChannel** を採用する。

## 理由

- P2P WebRTC は NAT 越えに TURN サーバーが必要で運用コストが高い
- Cloudflare Realtime は STUN/TURN インフラを内包しており、接続成功率が高い
- 音声・映像と同じ API モデルで DataChannel を扱えるため、将来的な機能拡張が容易
- DataChannel は低遅延・順序保証（SCTP）のバイナリ通信が可能で Yjs の update バイト列と相性が良い

## トレードオフ

- Cloudflare Realtime の DataChannel API（`/datachannels/establish` → `/datachannels/new`）は通常の Peer-to-Peer DataChannel とは異なる独自フローが必要
- SFU 経由のため、追加の RTT が発生する
