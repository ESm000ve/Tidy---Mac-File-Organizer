import { useCallback, useEffect, useState } from "react";

/**
 * `useState` that mirrors its value into `localStorage`.
 *
 * Reads once on mount rather than during render, so the first paint is not
 * blocked by storage access and server-less environments without
 * `localStorage` degrade to plain in-memory state.
 *
 * @param key       Storage key. Use one of `STORAGE_KEYS`.
 * @param initial   Value used before anything has been stored.
 * @param serialize Optional codec for non-string values.
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
  serialize?: {
    parse: (raw: string) => T;
    stringify: (value: T) => string;
  },
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return;
      setValue(serialize ? serialize.parse(raw) : (raw as unknown as T));
    } catch {
      // Corrupt or unavailable storage is not worth failing a launch over —
      // the caller's initial value stands.
    }
    // Reading is a mount-time concern; re-running on codec identity would
    // clobber state the user has since changed.
  }, [key]);

  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        if (next === null || next === undefined || next === "") {
          window.localStorage.removeItem(key);
        } else {
          window.localStorage.setItem(
            key,
            serialize ? serialize.stringify(next) : String(next),
          );
        }
      } catch {
        // Quota exceeded or storage disabled: keep the in-memory value.
      }
    },
    [key],
  );

  return [value, update];
}
