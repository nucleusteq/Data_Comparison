"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Persist any JSON-serializable value to localStorage and keep React in sync.
 * Everything in this app (connections, table choices, last results) is stored
 * in the browser via this hook — nothing is persisted on the server.
 */
export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);

  // Load once on mount (client-only; avoids SSR hydration mismatch). Deferred to
  // a microtask so we never set state synchronously inside the effect body.
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      try {
        const raw = window.localStorage.getItem(key);
        if (raw !== null) setValue(JSON.parse(raw) as T);
      } catch {
        /* ignore malformed entries */
      }
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  // Persist on change (after initial load).
  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage full / unavailable */
    }
  }, [key, value, loaded]);

  const clear = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    setValue(initial);
  }, [key, initial]);

  return { value, setValue, clear, loaded } as const;
}
