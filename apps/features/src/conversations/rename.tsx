import { useRenameGroup, type WorkspaceFailure } from "@amends/client";
import { Dialog } from "@amends/ui/compositions/dialog";
import { Field } from "@amends/ui/compositions/field";
import { Button } from "@amends/ui/primitives/button";
import { Input } from "@amends/ui/primitives/input";
import { Column } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import { createSignal, createUniqueId, Show } from "solid-js";

const messages: { readonly [Failure in Exclude<WorkspaceFailure, "changed">]: string } = {
  denied: "You can no longer rename this group.",
  gone: "This group is no longer available to you.",
  invalid: "Give the group a name.",
  failed: "The name could not be saved. Try again when the host is available.",
};
export interface GroupRenameProps {
  readonly workspaceId: string;
  readonly groupId: string;
}
/**
 * A quiet "Rename" beside a team group's name, for readers who may rename it, opening a dialog
 * that starts from the current name. Direct groups, named by their members, have none.
 */
export function GroupRenameAction(props: GroupRenameProps) {
  const form = createUniqueId();
  const [open, setOpen] = createSignal(false);
  let field: HTMLInputElement | undefined;
  const rename = useRenameGroup(props.workspaceId, props.groupId, () => setOpen(false));
  // A rename made meanwhile is named, so saving again knowingly replaces it.
  const say = (failure: WorkspaceFailure) =>
    failure === "changed"
      ? `Someone renamed it to “${rename.current() ?? ""}” meanwhile. Save again to use your name instead.`
      : messages[failure];
  return (
    <Show when={rename.renamable()}>
      <Dialog.Root
        open={open()}
        // The name is what this dialog is for, so it takes focus, selected for retyping.
        initialFocus={() => {
          queueMicrotask(() => field?.select());
          return field;
        }}
        onOpenChange={(next) => {
          if (rename.pending()) return;
          // Each opening starts from the name the group has now.
          if (next) rename.reset();
          setOpen(next);
        }}
      >
        <Dialog.Trigger variant="ghost">Rename</Dialog.Trigger>
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>Rename group</Dialog.Title>
            <Dialog.Description>Everyone in the group sees the new name.</Dialog.Description>
          </Dialog.Header>
          <Dialog.Body>
            <form
              id={form}
              onSubmit={(event) => {
                event.preventDefault();
                rename.save();
              }}
            >
              <Column gap={3}>
                <Field label="Name">
                  {(control) => (
                    <Input
                      {...control}
                      ref={(element) => {
                        field = element;
                      }}
                      value={rename.name()}
                      onInput={(event) => rename.setName(event.currentTarget.value)}
                      autocomplete="off"
                      disabled={rename.pending()}
                    />
                  )}
                </Field>
                <Show when={rename.error()}>
                  {(failure) => (
                    <Text role="alert" tone="danger">
                      {say(failure())}
                    </Text>
                  )}
                </Show>
              </Column>
            </form>
          </Dialog.Body>
          <Dialog.Footer>
            <Dialog.Close variant="secondary" disabled={rename.pending()}>
              Cancel
            </Dialog.Close>
            <Button
              type="submit"
              form={form}
              pending={rename.pending()}
              disabled={!rename.ready() && !rename.pending()}
            >
              Save name
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Root>
    </Show>
  );
}
