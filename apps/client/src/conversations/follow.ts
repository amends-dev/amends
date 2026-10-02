import { useAtomValue } from "@effect/atom-solid";
import { Effect, Exit, Option } from "effect";
import { AsyncResult, type Atom } from "effect/unstable/reactivity";
import { createSignal, type Accessor } from "solid-js";
import { changeFollow, groupsRead, participantsRead, type Follow } from "./api.ts";
import { workspaceFailure, type WorkspaceFailure } from "../api/failures.ts";
import { useMutation } from "../api/mutation.ts";
import { refreshResult } from "../api/refresh.ts";
import { useApiClient } from "../provider.tsx";
import { useWorkspace } from "../session/directory.tsx";

export interface FollowController {
  /** Whether the reader follows, once known; a change being made shows until it answers. */
  readonly following: Accessor<boolean | undefined>;
  /** A change is being made. */
  readonly pending: Accessor<boolean>;
  /** Why the last change failed; what is shown stays as it was. */
  readonly error: Accessor<WorkspaceFailure | undefined>;
  /**
   * It can be followed or unfollowed at all: only in a team group, since everyone in a direct
   * conversation takes part in all of it.
   */
  readonly followable: Accessor<boolean>;
  /** Start following if not, or stop if so. */
  readonly toggle: () => void;
}
/** What becomes of a change the reader makes, `following` being the state it asked for. */
export interface FollowEvents {
  /** The change landed and the read shows it. */
  readonly changed?: (following: boolean) => void;
  /** The change failed; what is shown stays as it was. */
  readonly failed?: (following: boolean, failure: WorkspaceFailure) => void;
}
/**
 * Follow state read from `known`, which `shows`, changed through `change`. A change shows until
 * its request answers, which is once `shows` has been refreshed, so the read has the last word.
 */
function useFollow(
  workspaceId: string,
  known: Accessor<boolean | undefined>,
  shows: Atom.Atom<AsyncResult.AsyncResult<unknown, unknown>> | undefined,
  change: (following: boolean) => Follow | undefined,
  followable: Accessor<boolean>,
  events: FollowEvents,
): FollowController {
  const [expected, setExpected] = createSignal<boolean>(),
    [error, setError] = createSignal<WorkspaceFailure>();
  // A refresh that fails leaves the read as it was.
  const request = useMutation((api, follow: Follow) =>
    changeFollow(workspaceId)(api, follow).pipe(
      Effect.andThen(shows ? Effect.ignore(refreshResult(shows)) : Effect.void),
    ),
  );
  const following = () => (request.pending() ? expected() : undefined) ?? known();
  async function toggle() {
    const current = following();
    if (current === undefined || request.pending() || !followable()) return;
    const follow = change(!current);
    if (!follow) return;
    setError(undefined);
    setExpected(!current);
    const exit = await request.run(follow);
    if (exit === undefined) return;
    setExpected(undefined);
    if (Exit.isSuccess(exit)) {
      if (known() === !current) events.changed?.(!current);
      return;
    }
    const failure = workspaceFailure(exit.cause);
    setError(failure);
    events.failed?.(!current, failure);
  }
  return { following, pending: request.pending, error, followable, toggle: () => void toggle() };
}
/** The reader's entry for a group in their groups list, once read, and the read itself. */
function useGroupItem(workspaceId: string, groupId: string) {
  const read = groupsRead(useApiClient(), workspaceId);
  const groups = read ? useAtomValue(() => read) : () => AsyncResult.initial();
  const item = () =>
    Option.getOrUndefined(AsyncResult.value(groups()))?.find((entry) => entry.group.id === groupId);
  return { item, read };
}
/**
 * Follow a thread of a team group, taking part in it so that its replies reach the reader, or
 * stop. Threads of a direct conversation include everyone in it, so they are not followable.
 */
export function useThreadFollow(
  workspaceId: string,
  groupId: string,
  threadId: string,
  events: FollowEvents = {},
): FollowController {
  const group = useGroupItem(workspaceId, groupId).item;
  const read = participantsRead(useApiClient(), workspaceId, threadId);
  const participants = read ? useAtomValue(() => read) : () => AsyncResult.initial();
  const self = useWorkspace(() => workspaceId);
  const mine = () =>
    Option.map(AsyncResult.value(participants()), (all) =>
      all.find(
        (summary) =>
          summary.participant._tag === "Member" &&
          summary.participant.memberId === self()?.member.id,
      ),
    );
  return useFollow(
    workspaceId,
    () => Option.getOrUndefined(Option.map(mine(), (summary) => summary !== undefined)),
    read,
    (following) => {
      if (following) return { kind: "follow-thread", threadId };
      const summary = Option.getOrUndefined(mine());
      return summary && { kind: "unfollow-thread", threadId, participationId: summary.id };
    },
    () => group()?.group.kind === "Team",
    events,
  );
}
/** Follow a team group, so that threads started there afterwards include the reader, or stop. */
export function useGroupFollow(
  workspaceId: string,
  groupId: string,
  events: FollowEvents = {},
): FollowController {
  const { item, read } = useGroupItem(workspaceId, groupId);
  const self = useWorkspace(() => workspaceId);
  return useFollow(
    workspaceId,
    () => item()?.following,
    read,
    (following) => {
      const memberId = self()?.member.id;
      if (!memberId) return undefined;
      return { kind: following ? "follow-group" : "unfollow-group", groupId, memberId };
    },
    () => item()?.group.kind === "Team",
    events,
  );
}
