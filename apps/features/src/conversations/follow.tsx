import { useGroupFollow, type FollowController } from "@amends/client";
import { Button } from "@amends/ui/primitives/button";
import { Show } from "solid-js";

function Action(props: { readonly controller: FollowController }) {
  return (
    <Show when={props.controller.following() !== undefined}>
      <Button
        variant="secondary"
        pending={props.controller.pending()}
        onClick={() => props.controller.toggle()}
      >
        {props.controller.following() ? "Unfollow" : "Follow"}
      </Button>
    </Show>
  );
}
export interface GroupFollowProps {
  readonly workspaceId: string;
  readonly groupId: string;
}
/** Follow or stop following a team group; direct groups have nothing to follow. */
export function GroupFollowAction(props: GroupFollowProps) {
  const controller = useGroupFollow(props.workspaceId, props.groupId);
  return (
    <Show when={controller.followable()}>
      <Action controller={controller} />
    </Show>
  );
}
/** What following a group means for the reader now, or why changing it failed. */
export function GroupFollowNote(props: GroupFollowProps) {
  const controller = useGroupFollow(props.workspaceId, props.groupId);
  const note = () => {
    if (controller.following() === undefined) return "";
    if (!controller.followable()) return "Everyone here takes part in every thread.";
    return controller.following()
      ? "Following: new threads here include you."
      : "Follow to take part in new threads here.";
  };
  return <>{note()}</>;
}
