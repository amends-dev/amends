import { Workspace } from "@amends/core/workspace";
import { Button, Dialog, Field, FormActions, FormLayout, TextField } from "@amends/ui/components";
import { Exit, Schema } from "effect";
import { createSignal } from "solid-js";
import { useCommand } from "../../api/hooks.ts";
import { Workspaces } from "../../api/workspaces.ts";
import { CommandError } from "../../components/query-view.tsx";

export function CreateWorkspaceDialog(props: {
  onClose: () => void;
  onCreated: (workspaceId: Workspace.Id) => void;
}) {
  const [name, setName] = createSignal("");
  const command = useCommand(Workspaces.makeCreate());
  let input: HTMLInputElement | undefined;
  const valid = () => Schema.is(Workspace.Name)(name().trim());
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!valid() || command.pending()) return;
    const exit = await command.run({ name: name().trim() });
    if (exit && Exit.isSuccess(exit)) props.onCreated(exit.value.id);
  };
  return (
    <Dialog
      open
      title="New workspace"
      description="Choose a name for your workspace. You’ll become its owner."
      initialFocus={() => input}
      dismissible={!command.pending()}
      onOpenChange={(open) => {
        if (!open && !command.pending()) props.onClose();
      }}
    >
      <FormLayout onSubmit={(event) => void submit(event)}>
        <Field label="Workspace name" required>
          <TextField
            ref={(node) => {
              input = node;
            }}
            name="name"
            autocomplete="off"
            value={name()}
            readOnly={command.pending()}
            onInput={(event) => setName(event.currentTarget.value)}
          />
        </Field>
        <CommandError result={command.result()} />
        <FormActions
          secondary={
            <Button variant="secondary" disabled={command.pending()} onClick={props.onClose}>
              Cancel
            </Button>
          }
          primary={
            <Button type="submit" pending={command.pending()} disabled={!valid()}>
              Create workspace
            </Button>
          }
        />
      </FormLayout>
    </Dialog>
  );
}
