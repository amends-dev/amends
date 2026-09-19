import { Show } from "solid-js";
import type { Invitation, Workspace } from "@amends/core/workspace";
import { Button } from "@amends/ui/components";
import { Exit } from "effect";
import { Invitations } from "../../api/invitations.ts";
import { useCommand } from "../../api/hooks.ts";
import { CommandError } from "../../components/query-view.tsx";
type Props = {
  workspaceId: Workspace.Id;
  invitationId: Invitation.Id;
  onAccepted: (workspaceId: Workspace.Id) => void;
};
export function AcceptInvitationButton(props: Props) {
  return (
    <Show when={JSON.stringify([props.workspaceId, props.invitationId])} keyed>
      {(identity) => {
        void identity;
        return <AcceptInvitationAction {...props} />;
      }}
    </Show>
  );
}
function AcceptInvitationAction(props: Props) {
  const command = useCommand(Invitations.makeAccept());
  const accept = async () => {
    const workspaceId = props.workspaceId;
    const exit = await command.run({ workspaceId, invitationId: props.invitationId });
    if (exit && Exit.isSuccess(exit)) props.onAccepted(workspaceId);
  };
  return (
    <>
      <Button pending={command.pending()} onClick={() => void accept()}>
        accept
      </Button>
      <CommandError result={command.result()} />
    </>
  );
}
