import { useCreateGroup, useMembers, useWorkspace, type WorkspaceFailure } from "@amends/client";
import { ChipPicker } from "@amends/ui/compositions/chip-picker";
import { Dialog } from "@amends/ui/compositions/dialog";
import { Field } from "@amends/ui/compositions/field";
import { RadioGroup } from "@amends/ui/compositions/radio-group";
import { Button } from "@amends/ui/primitives/button";
import { Input } from "@amends/ui/primitives/input";
import { Column } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import { createUniqueId, Show } from "solid-js";
import { initials, memberName } from "./presentation.ts";

const messages: { readonly [Failure in WorkspaceFailure]: string } = {
  changed: "Something changed while you were choosing. Try again.",
  denied: "You can no longer create groups here.",
  gone: "Someone you added is no longer in this workspace. Remove them and try again.",
  invalid: "Check the name and try again.",
  failed: "The group could not be created. Try again when the host is available.",
};
export interface NewGroupDialogProps {
  readonly workspaceId: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The group was created, with the reader in it. */
  readonly onCreated: (groupId: string) => void;
}
/** Who can find a new group; either way, only its members read its threads. */
const visibilities = [
  { value: "Private", label: "Private", description: "Only the people you add." },
  {
    value: "Public",
    label: "Public",
    description: "Anyone in the workspace can find it and join.",
  },
] as const;
/**
 * Create a team group: a name, the workspace's people and agents to include, with the reader
 * always among them, and whether anyone else may find and join it. Closing clears it; failures
 * keep what was chosen for another try.
 */
export function NewGroupDialog(props: NewGroupDialogProps) {
  const form = createUniqueId();
  const members = useMembers(props.workspaceId);
  const self = useWorkspace(() => props.workspaceId);
  const group = useCreateGroup(props.workspaceId, (groupId) => {
    props.onOpenChange(false);
    group.reset();
    props.onCreated(groupId);
  });
  const selfId = () => self()?.member.id;
  const options = () =>
    (members.all() ?? [])
      .filter((member) => member.status === "active")
      .map((member) => {
        const name = memberName(member);
        const agent = member.identity._tag === "Agent";
        return {
          value: member.id as string,
          label: name,
          mark: initials(name).toLocaleLowerCase(),
          description: agent ? "agent" : "person",
          ring: agent ? ("dashed" as const) : ("solid" as const),
        };
      });
  const chosen = () => {
    const id = selfId();
    return id === undefined ? [...group.members()] : [id, ...group.members()];
  };
  return (
    <Dialog.Root
      open={props.open}
      onOpenChange={(open) => {
        if (group.pending()) return;
        props.onOpenChange(open);
        if (!open) group.reset();
      }}
    >
      <Dialog.Content>
        <Dialog.Header>
          <Dialog.Title>New group</Dialog.Title>
          <Dialog.Description>
            A group for the people and agents you add. Everyone in it reads its threads.
          </Dialog.Description>
        </Dialog.Header>
        <Dialog.Body>
          <form
            id={form}
            onSubmit={(event) => {
              event.preventDefault();
              group.create();
            }}
          >
            <Column gap={4}>
              <Field label="Name">
                {(control) => (
                  <Input
                    {...control}
                    value={group.name()}
                    onInput={(event) => group.setName(event.currentTarget.value)}
                    autocomplete="off"
                    disabled={group.pending()}
                  />
                )}
              </Field>
              <Field label="Members" description="You are always a member.">
                {(control) => (
                  <ChipPicker.Root
                    options={options()}
                    value={chosen()}
                    onChange={(value) =>
                      group.setMembers(value.filter((memberId) => memberId !== selfId()))
                    }
                    fixed={selfId() === undefined ? {} : { [selfId()!]: "you" }}
                    chipsLabel="Members"
                    input={{ ...control, placeholder: "Add someone…" }}
                    empty="nobody by that name"
                    disabled={group.pending()}
                  />
                )}
              </Field>
              <RadioGroup
                label="Who can find it"
                name={`${form}-visibility`}
                options={visibilities}
                value={group.visibility()}
                onValueChange={(value) =>
                  group.setVisibility(value === "Public" ? "Public" : "Private")
                }
                disabled={group.pending()}
              />
              <Show when={group.error()}>
                {(failure) => (
                  <Text role="alert" tone="danger">
                    {messages[failure()]}
                  </Text>
                )}
              </Show>
            </Column>
          </form>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close variant="secondary" disabled={group.pending()}>
            Cancel
          </Dialog.Close>
          <Button
            type="submit"
            form={form}
            pending={group.pending()}
            disabled={!group.ready() && !group.pending()}
          >
            Create group
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
}
