import { useAtomValue } from "@effect/atom-solid";
import { createEffect, createSignal, onCleanup } from "solid-js";
import { typistsAtom } from "../api/typing.ts";
import { useWorkspace } from "../session/directory.tsx";

/**
 * Who is typing in each thread of a workspace now, from its change feed, without the reader.
 * An entry lasts until the moment its signal named, or until that member's message arrives.
 */
export function useTyping(workspaceId: string): (threadId: string) => ReadonlyArray<string> {
  const typists = useAtomValue(() => typistsAtom(workspaceId));
  const self = useWorkspace(() => workspaceId);
  const [now, setNow] = createSignal(Date.now());
  // Look again when the soonest entry runs out.
  createEffect(() => {
    const current = now();
    let soonest = Number.POSITIVE_INFINITY;
    for (const members of typists().values())
      for (const until of members.values()) if (until > current) soonest = Math.min(soonest, until);
    if (!Number.isFinite(soonest)) return;
    const timer = setTimeout(() => setNow(Date.now()), soonest - current + 10);
    onCleanup(() => clearTimeout(timer));
  });
  return (threadId) => {
    const current = Math.max(now(), Date.now());
    return [...(typists().get(threadId) ?? [])]
      .filter(([memberId, until]) => until > current && memberId !== self()?.member.id)
      .map(([memberId]) => memberId);
  };
}
