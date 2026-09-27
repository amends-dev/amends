import { useAtomValue } from "@effect/atom-solid";
import { Exit, Option } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { createSignal, type Accessor } from "solid-js";
import { useApiClient } from "../api/context.tsx";
import { followRequest, groupsRead, participantsRead, type Follow } from "../api/conversations.ts";
import { workspaceFailure, type WorkspaceFailure } from "../api/failures.ts";
import { useRequest } from "../request/use-request.ts";
import { useSession } from "../session/provider.tsx";
import { useWorkspace } from "../session/directory.tsx";

export interface FollowController {
  /** Whether the reader follows, once known; a change being made shows until it answers. */
  readonly following: Accessor<boolean | undefined>;
  /** A change is being made. */
  readonly pending: Accessor<boolean>;
  /** Why the last change failed; what is shown stays as it was. */
  readonly error: Accessor<WorkspaceFailure | undefined>;
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
 * Follow state read from `known`, changed through `change`. A change shows until its request
 * answers, which is once the read has been refreshed, so the read has the last word.
 */
function useFollow(
  workspaceId: string,
  known: Accessor<boolean | undefined>,
  change: (following: boolean) => Follow | undefined,
  events: FollowEvents,
): FollowController {
  const session = useSession();
  const [expected, setExpected] = createSignal<boolean>(),
    [error, setError] = createSignal<WorkspaceFailure>();
  const request = useRequest(
    followRequest(useApiClient(), workspaceId),
    (exit, follow) => {
      setExpected(undefined);
      const wanted = follow.kind === "follow-thread" || follow.kind === "follow-group";
      if (Exit.isSuccess(exit)) {
        if (known() === wanted) events.changed?.(wanted);
        return;
      }
      const failure = workspaceFailure(exit.cause);
      setError(failure);
      events.failed?.(wanted, failure);
    },
    { when: () => session.session !== undefined },
  );
  const following = () => (request.pending() ? expected() : undefined) ?? known();
  return {
    following,
    pending: request.pending,
    error,
    toggle: () => {
      const current = following();
      if (current === undefined || request.pending()) return;
      const follow = change(!current);
      if (!follow) return;
      setError(undefined);
      setExpected(!current);
      request.run(follow);
    },
  };
}
/** Follow a thread, taking part in it so that its replies reach the reader, or stop. */
export function useThreadFollow(
  workspaceId: string,
  threadId: string,
  events: FollowEvents = {},
): FollowController {
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
    (following) => {
      if (following) return { kind: "follow-thread", threadId };
      const summary = Option.getOrUndefined(mine());
      return summary && { kind: "unfollow-thread", threadId, participationId: summary.id };
    },
    events,
  );
}
export interface GroupFollowController extends FollowController {
  /** Only team groups can be followed; everyone in a direct group takes part in all of it. */
  readonly followable: Accessor<boolean>;
}
/** Follow a team group, so that threads started there afterwards include the reader, or stop. */
export function useGroupFollow(
  workspaceId: string,
  groupId: string,
  events: FollowEvents = {},
): GroupFollowController {
  const read = groupsRead(useApiClient(), workspaceId);
  const groups = read ? useAtomValue(() => read) : () => AsyncResult.initial();
  const self = useWorkspace(() => workspaceId);
  const item = () =>
    Option.getOrUndefined(AsyncResult.value(groups()))?.find((entry) => entry.group.id === groupId);
  const controller = useFollow(
    workspaceId,
    () => item()?.following,
    (following) => {
      const memberId = self()?.member.id;
      if (!memberId) return undefined;
      return { kind: following ? "follow-group" : "unfollow-group", groupId, memberId };
    },
    events,
  );
  return { ...controller, followable: () => item()?.group.kind === "Team" };
}
