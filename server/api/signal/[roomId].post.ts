// ---------------------------------------------------------------------------
// server/api/signal/[roomId].post.ts
// ---------------------------------------------------------------------------
// POST /api/signal/:roomId
//   Body: { role: "caller" | "callee"; sessionId: string }
//   → ロール別に sessionId を保存する

import { defineEventHandler, readBody, createError } from "h3";

// プロセス内共有ストア (開発用)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const store: Record<string, any> = ((globalThis as any).__signalingStore ??=
  {});

export default defineEventHandler(async (event) => {
  const roomId = event.context.params?.roomId;
  if (!roomId)
    throw createError({ statusCode: 400, message: "roomId is required" });

  const body = await readBody<{ role: "caller" | "callee"; sessionId: string }>(
    event,
  );
  if (!body.role || !body.sessionId) {
    throw createError({
      statusCode: 400,
      message: "role and sessionId are required",
    });
  }

  if (!store[roomId]) store[roomId] = {};
  store[roomId][body.role] = {
    sessionId: body.sessionId,
    timestamp: Date.now(),
  };

  return { ok: true };
});
