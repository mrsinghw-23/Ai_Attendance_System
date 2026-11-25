type RealtimeEvent = {
  id: number;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

let eventId = 1;
const events: RealtimeEvent[] = [];

export function publishRealtimeEvent(
  type: string,
  payload: Record<string, unknown>
) {
  const event = {
    id: eventId++,
    type,
    payload,
    createdAt: new Date().toISOString(),
  };
  events.unshift(event);
  events.splice(100);
  return event;
}

export function getRealtimeEvents() {
  return events;
}
