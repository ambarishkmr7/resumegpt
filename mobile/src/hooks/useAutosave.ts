import { useEffect, useRef, useState } from "react";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

// Debounced autosave: call `markDirty(next)` on every edit; `save` runs after
// `delayMs` of quiet. Mirrors the web editor's 2s debounced PUT.
export function useAutosave<T>(
  save: (value: T) => Promise<void>,
  delayMs = 2000,
) {
  const [state, setState] = useState<SaveState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<T | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = async () => {
    if (pending.current === null) return;
    const value = pending.current;
    pending.current = null;
    setState("saving");
    try {
      await saveRef.current(value);
      // A newer edit may have arrived while saving.
      setState(pending.current === null ? "saved" : "dirty");
    } catch {
      setState("error");
    }
  };

  const markDirty = (value: T) => {
    pending.current = value;
    setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), delayMs);
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      // Fire-and-forget final save when the screen unmounts mid-edit.
      if (pending.current !== null) void flush();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return { state, markDirty, flushNow: flush };
}
