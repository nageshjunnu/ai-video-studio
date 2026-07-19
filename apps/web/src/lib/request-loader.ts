"use client";

type Listener = (count: number) => void;

let pending = 0;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener(pending));
}

export function subscribeRequestLoader(listener: Listener) {
  listeners.add(listener);
  listener(pending);
  return () => {
    listeners.delete(listener);
  };
}

export function startRequest() {
  pending += 1;
  emit();
}

export function finishRequest() {
  pending = Math.max(0, pending - 1);
  emit();
}

export async function trackedFetch(input: RequestInfo | URL, init?: RequestInit) {
  startRequest();
  try {
    return await fetch(input, init);
  } finally {
    finishRequest();
  }
}
