// ---------------------------------------------------------------------------
// server/api/signal/[roomId].get.ts
// ---------------------------------------------------------------------------
// GET /api/signal/:roomId?role=caller|callee
//   → 指定ロールの sessionId を返す (未登録なら 404)

import { defineEventHandler, createError, getQuery } from "h3";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const store: Record<string, any> = ((globalThis as any).__signalingStore ??=
  {});

export default defineEventHandler((event) => {
  const roomId = event.context.params?.roomId;
  if (!roomId)
    throw createError({ statusCode: 400, message: "roomId is required" });

  const { role } = getQuery(event) as { role?: string };
  if (!role || (role !== "caller" && role !== "callee")) {
    throw createError({
      statusCode: 400,
      message: "role query param (caller|callee) is required",
    });
  }

  const entry = store[roomId]?.[role];
  if (!entry) throw createError({ statusCode: 404, message: "Not ready yet" });

  return entry as { sessionId: string; timestamp: number };
});
