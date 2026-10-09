import { useSyncExternalStore } from "react";

let activeRequests = 0;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export const requestLoader = {
  start: () => {
    activeRequests += 1;
    notify();
  },
  finish: () => {
    activeRequests = Math.max(0, activeRequests - 1);
    notify();
  },
  isLoading: () => activeRequests > 0,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useRequestLoading() {
  return useSyncExternalStore(requestLoader.subscribe, requestLoader.isLoading, () => false);
}
