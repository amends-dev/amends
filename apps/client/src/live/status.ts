import { createEffect, createMemo, createSignal, on, onCleanup, type Accessor } from "solid-js";
import { useWorkspaceFeed } from "./workspace-feed.tsx";

/** How long changes may stop arriving before the reader is told, covering a host restart. */
export const liveGrace = 2_000;

/**
 * Whether a live stream has been down for longer than `liveGrace`, so brief reconnections go
 * unmentioned.
 */
export function useLastingDown(down: Accessor<boolean>): Accessor<boolean> {
  const isDown = createMemo(down);
  const [shown, setShown] = createSignal(false);
  createEffect(
    on(isDown, (value) => {
      setShown(false);
      if (!value) return;
      const timer = setTimeout(() => setShown(true), liveGrace);
      onCleanup(() => clearTimeout(timer));
    }),
  );
  return shown;
}

/**
 * Whether workspace changes have stopped arriving, so what the reader sees may be out of date:
 * `connecting` before the first, `reconnecting` after a drop, and undefined while live and through
 * brief reconnections. Mount inside WorkspaceFeedProvider.
 */
export function useLiveStatus(): Accessor<"connecting" | "reconnecting" | undefined> {
  const feed = useWorkspaceFeed();
  const shown = useLastingDown(() => {
    const state = feed.state()._tag;
    return state === "Connecting" || state === "Reconnecting";
  });
  return () => {
    if (!shown()) return undefined;
    return feed.state()._tag === "Connecting" ? "connecting" : "reconnecting";
  };
}
