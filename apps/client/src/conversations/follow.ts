import { useAtomValue } from "@effect/atom-solid";
import { Exit, Option } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { createEffect, createSignal, type Accessor } from "solid-js";
import { useApiClient } from "../api/context.tsx";
import { followRequest, groupsRead, participantsRead, type Follow } from "../api/conversations.ts";
import { workspaceFailure, type WorkspaceFailure } from "../api/failures.ts";
import { useRequest } from "../request/use-request.ts";
import { useSession } from "../session/provider.tsx";
import { useWorkspace } from "../session/directory.tsx";

export interface FollowController {
  /** Whether the reader follows, once known; a change just made shows until the read agrees. */
  readonly following: Accessor<boolean | undefined>;
  /** A change is being made, or has been made and is not yet shown by the read. */
  readonly pending: Accessor<boolean>;
  /** Why the last change failed; what is shown stays as it was. */
  readonly error: Accessor<WorkspaceFailure | undefined>;
  /** Start following if not, or stop if so. */
  readonly toggle: () => void;
}
/** Follow state read from `known`, changed through `change`, showing each change until it lands. */
function useFollow(
  workspaceId: string,
  known: Accessor<boolean | undefined>,
  change: (following: boolean) => Follow | undefined,
): FollowController {
  const session = useSession();
  const [expected, setExpected] = createSignal<boolean>(),
    [error, setError] = createSignal<WorkspaceFailure>();
  const request = useRequest(
    followRequest(useApiClient(), workspaceId),
    (exit, follow) => {
      if (Exit.isFailure(exit)) {
        setExpected(undefined);
        setError(workspaceFailure(exit.cause));
        return;
      }
      setExpected(follow.kind === "follow-thread" || follow.kind === "follow-group");
    },
    { when: () => session.session !== undefined },
  );
  // Once the read shows the change, it is the read that answers again.
  createEffect(() => {
    if (expected() !== undefined && known() === expected()) setExpected(undefined);
  });
  const following = () => expected() ?? known();
  // A change stays pending until the read shows it: undoing it may need what the read returns.
  const pending = () => request.pending() || (expected() !== undefined && known() !== expected());
  return {
    following,
    pending,
    error,
    toggle: () => {
      const current = following();
      if (current === undefined || pending()) return;
      const follow = change(!current);
      if (!follow) return;
      setError(undefined);
      request.run(follow);
    },
  };
}
/** Follow a thread, taking part in it so that its replies reach the reader, or stop. */
export function useThreadFollow(workspaceId: string, threadId: string): FollowController {
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
  );
}
export interface GroupFollowController extends FollowController {
  /** Only team groups can be followed; everyone in a direct group takes part in all of it. */
  readonly followable: Accessor<boolean>;
}
/** Follow a team group, so that threads started there afterwards include the reader, or stop. */
export function useGroupFollow(workspaceId: string, groupId: string): GroupFollowController {
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
  );
  return { ...controller, followable: () => item()?.group.kind === "Team" };
}
