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
        if (raw !== null) {
          const parsed = JSON.parse(raw) as T;
          // Merge over the default so fields added in newer versions aren't
          // left undefined when an older persisted value is loaded.
          if (
            initial &&
            typeof initial === "object" &&
            !Array.isArray(initial) &&
            parsed &&
            typeof parsed === "object" &&
            !Array.isArray(parsed)
          ) {
            setValue({ ...(initial as object), ...(parsed as object) } as T);
          } else {
            setValue(parsed);
          }
        }
      } catch {
        /* ignore malformed entries */
      }
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
    // `initial` is a load-once default; re-running on its identity would clobber
    // restored/edited state, so it is intentionally excluded from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
