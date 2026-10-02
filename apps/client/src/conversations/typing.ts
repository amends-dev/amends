import { useAtomValue } from "@effect/atom-solid";
import { DateTime } from "effect";
import { Atom } from "effect/reactivity";
import { createEffect, createSignal, onCleanup } from "solid-js";
import { useWorkspace } from "../session/directory.tsx";

/** Who is typing where in one workspace: by thread, each member until when, in epoch ms. */
export type Typists = ReadonlyMap<string, ReadonlyMap<string, number>>;
/** One workspace's typists in a credential scope, written by its change feed. */
export const typistsAtom = Atom.family((_workspaceId: string) =>
  Atom.make<Typists>(new Map()).pipe(Atom.keepAlive),
);
const without = (typists: Typists, now: number, threadId?: string, memberId?: string): Typists => {
  const next = new Map<string, ReadonlyMap<string, number>>();
  for (const [thread, members] of typists) {
    const kept = new Map(
      [...members].filter(
        ([member, until]) => until > now && !(thread === threadId && member === memberId),
      ),
    );
    if (kept.size > 0) next.set(thread, kept);
  }
  return next;
};
/** Record that a member is typing in a thread until a moment, dropping anyone expired. */
export const typing = (
  typists: Typists,
  signal: { readonly threadId: string; readonly memberId: string; readonly until: DateTime.Utc },
  now: number,
): Typists => {
  const next = new Map(without(typists, now));
  const members = new Map(next.get(signal.threadId));
  members.set(signal.memberId, DateTime.toEpochMillis(signal.until));
  next.set(signal.threadId, members);
  return next;
};
/** A member's message arrived, so they are no longer typing it. */
export const posted = (typists: Typists, threadId: string, memberId: string, now: number) =>
  without(typists, now, threadId, memberId);

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
