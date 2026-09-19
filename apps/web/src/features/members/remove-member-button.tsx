import { Show } from "solid-js";
import type { Member } from "@amends/core/workspace";
import { ActionGroup, Button } from "@amends/ui/components";
import { Exit } from "effect";
import { Members } from "../../api/members.ts";
import { useCommand } from "../../api/hooks.ts";
import { CommandError } from "../../components/query-view.tsx";
import { useWorkspace } from "../../workspace/context.tsx";
type Props = {
  memberId: Member.Id;
  onRemoved?: ((memberId: Member.Id) => void) | undefined;
};
export function RemoveMemberButton(props: Props) {
  const membership = useWorkspace();
  return (
    <Show when={JSON.stringify([membership().workspace.id, props.memberId])} keyed>
      {(identity) => {
        void identity;
        return <RemoveMemberAction {...props} />;
      }}
    </Show>
  );
}
function RemoveMemberAction(props: Props) {
  const membership = useWorkspace();
  const command = useCommand(Members.makeRemove());
  const owner = () => props.memberId === membership().workspace.ownerMemberId;
  const me = () => props.memberId === membership().member.id;
  const remove = async () => {
    if (owner()) return;
    const memberId = props.memberId;
    const exit = await command.run({ workspaceId: membership().workspace.id, memberId });
    if (exit && Exit.isSuccess(exit)) props.onRemoved?.(memberId);
  };
  return (
    <>
      <ActionGroup
        description={
          owner()
            ? "The current owner cannot be removed. Ownership transfer is a separate workflow."
            : me()
              ? "You lose access immediately. Your history stays on the workspace's record."
              : "They lose access immediately, and their pending invitations are revoked. Their history stays readable."
        }
      >
        <Button
          variant="secondary"
          tone="danger"
          disabled={owner()}
          pending={command.pending()}
          onClick={() => void remove()}
        >
          {me() ? "leave the workspace" : "remove from the workspace"}
        </Button>
      </ActionGroup>
      <CommandError result={command.result()} />
    </>
  );
}
