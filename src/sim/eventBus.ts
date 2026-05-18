/**
 * Typed in-memory event bus.
 *
 * Gate 1: Drives the local sim → PhoneFrame fan-out (both demo phones share one bus).
 * Gate 4: Will be REPLACED by AppSync subscriptions on the real-time pipeline.
 *         The component API (`useEventBus(...)`) is what insulates UI from that swap.
 */

import { useEffect } from 'react';

export type Listener<T> = (payload: T) => void;

export class TypedEventBus<EventMap extends Record<string, unknown>> {
  private listeners = new Map<keyof EventMap, Set<Listener<unknown>>>();

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<unknown>);
    return () => set!.delete(listener as Listener<unknown>);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    // Snapshot to allow listeners to unsubscribe during dispatch without mutating mid-iteration.
    for (const l of Array.from(set)) {
      try {
        (l as Listener<EventMap[K]>)(payload);
      } catch (err) {
        // Never let one bad listener block the others; surface in console for dev.
        console.error('[eventBus] listener threw:', err);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

/** React hook — auto-subscribes to a bus event and unsubscribes on unmount. */
export function useEventBus<EventMap extends Record<string, unknown>, K extends keyof EventMap>(
  bus: TypedEventBus<EventMap>,
  event: K,
  listener: Listener<EventMap[K]>,
  deps: ReadonlyArray<unknown> = [],
): void {
  useEffect(() => {
    const off = bus.on(event, listener);
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus, event, ...deps]);
}
