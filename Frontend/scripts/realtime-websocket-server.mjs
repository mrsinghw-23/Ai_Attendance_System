// Optional deployment note for raw WebSocket environments.
// The production in-app live feed is available through SSE at:
//   /api/realtime/stream
//
// Raw WebSocket upgrades are environment-dependent in Next.js route handlers.
// For deployment, run a small standalone ws/uWebSockets service and bridge it
// to the same events published by services/realtime.service.ts.

const port = Number(process.env.REALTIME_WS_PORT || 4001);

console.log("Realtime SSE endpoint: /api/realtime/stream");
console.log(
  `Raw WebSocket service placeholder reserved for ws://localhost:${port}`
);
