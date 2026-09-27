import { Effect } from "effect";
import { Atom } from "effect/unstable/reactivity";

/**
 * The signals the reader's own requests are about to cause, each until when it is expected, in
 * epoch ms. Such a request refreshes the reads its change affects itself, so when its signal
 * comes back through the change feed there is nothing left to refresh.
 */
export type Echoes = ReadonlyMap<string, number>;
/** One workspace's expected echoes in a credential scope. */
export const echoesAtom = Atom.family((_workspaceId: string) =>
  Atom.make<Echoes>(new Map()).pipe(Atom.keepAlive),
);
/** How long a request's signal is expected after it is sent. */
const expected = 10_000;

/** A read mark's signal names the thread and the position read through, or the group. */
export const threadRead = (threadId: string, through: number) => `thread:${threadId}@${through}`;
export const groupCaughtUp = (groupId: string) => `group:${groupId}`;
/** Seeing one notification's signal names it alone. */
export const notificationSeen = (notificationId: string) => `seen:${notificationId}`;

/** The echo a signal would answer, if it answers any the reader's requests expect. */
export const echoOf = (signal: {
  readonly _tag: string;
  readonly threadId?: string;
  readonly readThrough?: number;
  readonly groupId?: string;
  readonly notificationIds?: ReadonlyArray<string>;
}): string | undefined => {
  switch (signal._tag) {
    case "ThreadRead":
      return signal.threadId === undefined || signal.readThrough === undefined
        ? undefined
        : threadRead(signal.threadId, signal.readThrough);
    case "GroupCaughtUp":
      return signal.groupId === undefined ? undefined : groupCaughtUp(signal.groupId);
    case "NotificationsSeen":
      return signal.notificationIds?.length === 1 && signal.notificationIds[0] !== undefined
        ? notificationSeen(signal.notificationIds[0])
        : undefined;
    default:
      return undefined;
  }
};

const current = (echoes: Echoes, now: number) =>
  new Map([...echoes].filter(([, until]) => until > now));
/** Expect `echo` from now. */
export const anticipate = (echoes: Echoes, echo: string, now: number): Echoes =>
  current(echoes, now).set(echo, now + expected);
/** Stop expecting `echo`, as when its request failed. */
export const forget = (echoes: Echoes, echo: string, now: number): Echoes => {
  const next = current(echoes, now);
  next.delete(echo);
  return next;
};
/** Whether `echo` was expected, and the echoes still expected once it has come. */
export const consume = (
  echoes: Echoes,
  echo: string,
  now: number,
): { readonly expected: boolean; readonly next: Echoes } => {
  const next = current(echoes, now);
  return { expected: next.delete(echo), next };
};

/**
 * Run a request whose change the reader's other sessions hear of as `echo`, expecting that signal
 * for this session too while the request runs and just after. One that fails or is cut off
 * stops expecting it, so a signal from a change it made anyway still refreshes.
 */
export const expecting = <A, E, R>(
  get: Atom.FnContext,
  workspace: string,
  echo: string,
  request: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.suspend(() => {
    const echoes = echoesAtom(workspace);
    get.registry.update(echoes, (current) => anticipate(current, echo, Date.now()));
    return request.pipe(
      Effect.onError(() =>
        Effect.sync(() =>
          get.registry.update(echoes, (current) => forget(current, echo, Date.now())),
        ),
      ),
    );
  });
