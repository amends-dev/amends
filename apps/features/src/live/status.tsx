import { useWorkspaceFeed } from "@amends/client";
import { Status as Presentation } from "@amends/ui/primitives/status";
import { Text } from "@amends/ui/primitives/text";
import { createEffect, createMemo, createSignal, on, onCleanup, Show } from "solid-js";

/** How long changes may stop arriving before the reader is told, covering a host restart. */
export const grace = 2_000;

/**
 * Tells the reader when workspace changes have stopped arriving, so what they see may be out
 * of date. Silent while live and through brief reconnections. The live region stays mounted,
 * so the change is announced. Mount inside WorkspaceFeedProvider.
 */
export function Status() {
  const feed = useWorkspaceFeed();
  const down = createMemo(() => {
    const state = feed.state()._tag;
    return state === "Connecting" || state === "Reconnecting";
  });
  const [shown, setShown] = createSignal(false);
  createEffect(
    on(down, (isDown) => {
      setShown(false);
      if (!isDown) return;
      const timer = setTimeout(() => setShown(true), grace);
      onCleanup(() => clearTimeout(timer));
    }),
  );
  return (
    <Text as="span" role="status" aria-atomic="true">
      <Show when={shown()}>
        <Presentation.Root tone={feed.state()._tag === "Connecting" ? "pending" : "warning"}>
          <Presentation.Indicator />
          <Presentation.Label>
            {feed.state()._tag === "Connecting" ? "Connecting…" : "Reconnecting…"}
          </Presentation.Label>
        </Presentation.Root>
      </Show>
    </Text>
  );
}
