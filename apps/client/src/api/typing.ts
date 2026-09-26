import { Thread, Workspace } from "@amends/api-http";
import { DateTime, Effect } from "effect";
import { Atom } from "effect/unstable/reactivity";
import type { ApiClient } from "./client.ts";
import { command } from "./failures.ts";
import { requestAtom } from "./request.ts";

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

/** Tell a thread's readers that the reader is typing there, for the next few seconds. */
export const typingRequest = (client: ApiClient, workspace: string) =>
  requestAtom(client, (threadId: string) =>
    Effect.gen(function* () {
      const api = yield* client;
      yield* api.changes.typing({
        params: {
          workspaceId: yield* command(Workspace.Id)(workspace),
          threadId: yield* command(Thread.Id)(threadId),
        },
      });
    }),
  );
