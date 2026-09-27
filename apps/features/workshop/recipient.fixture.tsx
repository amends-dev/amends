// Workshop harness: an invited identity's workspaces and invitations, for flows that end in
// joining. The apps show these through the ui-v2 WorkspacePicker. Not exported.
import { useWorkspacePicker, type InvitationEntry } from "@amends/client";
import { Dialog } from "@amends/ui/compositions/dialog";
import { Field } from "@amends/ui/compositions/field";
import { ItemList } from "@amends/ui/compositions/item-list";
import { Button } from "@amends/ui/primitives/button";
import { Input } from "@amends/ui/primitives/input";
import { Column } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import { createSignal, createUniqueId, For, Show } from "solid-js";

export function Recipient(props: { readonly workspaceHref: (workspaceId: string) => string }) {
  const picker = useWorkspacePicker();
  const count = () => picker.workspaces().length;
  return (
    <Column gap={4}>
      <Text tone="secondary">
        {count()} {count() === 1 ? "workspace" : "workspaces"}
      </Text>
      <Show when={count()}>
        <ItemList.Root aria-label="Your workspaces">
          <For each={picker.workspaces()}>
            {(workspace) => (
              <ItemList.Item>
                <ItemList.Link href={props.workspaceHref(workspace.id)}>
                  <ItemList.Content>
                    <ItemList.Title>{workspace.name}</ItemList.Title>
                    <ItemList.Description>
                      {workspace.memberCount} {workspace.memberCount === 1 ? "member" : "members"}
                    </ItemList.Description>
                  </ItemList.Content>
                </ItemList.Link>
              </ItemList.Item>
            )}
          </For>
        </ItemList.Root>
      </Show>
      <For each={picker.invitations()}>
        {(invitation) => <Invitation picker={picker} invitation={invitation} />}
      </For>
    </Column>
  );
}

function Invitation(props: {
  readonly picker: ReturnType<typeof useWorkspacePicker>;
  readonly invitation: InvitationEntry;
}) {
  const form = createUniqueId();
  const [open, setOpen] = createSignal(false);
  const [name, setName] = createSignal("");
  const attempt = () => {
    const current = props.picker.accepting();
    return current?.invitationId === props.invitation.id ? current : undefined;
  };
  return (
    <Dialog.Root
      open={open()}
      onOpenChange={(next) => {
        if (attempt()?.pending) return;
        if (next) setName(props.picker.suggestedName());
        setOpen(next);
      }}
    >
      <Dialog.Trigger>Accept invitation</Dialog.Trigger>
      <Dialog.Content>
        <Dialog.Header>
          <Dialog.Title>Join {props.invitation.workspaceName ?? "this workspace"}</Dialog.Title>
          <Dialog.Description>What should people there call you?</Dialog.Description>
        </Dialog.Header>
        <Dialog.Body>
          <form
            id={form}
            onSubmit={(event) => {
              event.preventDefault();
              props.picker.accept(props.invitation.id, name());
            }}
          >
            <Field label="Your name">
              {(control) => (
                <Input
                  {...control}
                  value={name()}
                  onInput={(event) => setName(event.currentTarget.value)}
                />
              )}
            </Field>
            <Show when={attempt()?.error}>
              {(error) => (
                <Text role="alert" tone="danger">
                  {error()}
                </Text>
              )}
            </Show>
          </form>
        </Dialog.Body>
        <Dialog.Footer>
          <Button type="submit" form={form} pending={attempt()?.pending}>
            Join
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
}
