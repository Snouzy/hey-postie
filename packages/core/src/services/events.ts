import type { CoreEvents, EventBus } from '../contracts/events';

type Handler = (payload: never) => void;

export function createEventBus(): EventBus {
  const handlers = new Map<keyof CoreEvents, Set<Handler>>();
  return {
    on(event, handler) {
      const set = handlers.get(event) ?? new Set<Handler>();
      handlers.set(event, set);
      set.add(handler as Handler);
      return () => {
        set.delete(handler as Handler);
      };
    },
    emit(event, payload) {
      for (const handler of handlers.get(event) ?? []) handler(payload as never);
    },
  };
}
