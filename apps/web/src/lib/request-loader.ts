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

type TrackedRequestInit = RequestInit & { skipGlobalLoader?: boolean };

export async function trackedFetch(input: RequestInfo | URL, init?: TrackedRequestInit) {
  const skip = init?.skipGlobalLoader;
  if (!skip) startRequest();
  try {
    const { skipGlobalLoader, ...requestInit } = init ?? {};
    return await fetch(input, requestInit);
  } finally {
    if (!skip) finishRequest();
  }
}
