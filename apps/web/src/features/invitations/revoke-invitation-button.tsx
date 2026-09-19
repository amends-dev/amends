import { Show } from "solid-js";
import type { Invitation } from "@amends/core/workspace";
import { Button } from "@amends/ui/components";
import { Invitations } from "../../api/invitations.ts";
import { useCommand } from "../../api/hooks.ts";
import { CommandError } from "../../components/query-view.tsx";
import { useWorkspace } from "../../workspace/context.tsx";
type Props = { invitationId: Invitation.Id };
export function RevokeInvitationButton(props: Props) {
  const membership = useWorkspace();
  return (
    <Show when={JSON.stringify([membership().workspace.id, props.invitationId])} keyed>
      {(identity) => {
        void identity;
        return <RevokeInvitationAction {...props} />;
      }}
    </Show>
  );
}
function RevokeInvitationAction(props: Props) {
  const membership = useWorkspace();
  const command = useCommand(Invitations.makeRevoke());
  return (
    <>
      <Button
        variant="secondary"
        pending={command.pending()}
        onClick={() =>
          void command.run({
            workspaceId: membership().workspace.id,
            invitationId: props.invitationId,
          })
        }
      >
        revoke
      </Button>
      <CommandError result={command.result()} />
    </>
  );
}
