import type { Workspace } from "@amends/core/workspace";
import { Button } from "@amends/ui/components";
import { createSignal, Show } from "solid-js";
import { CreateWorkspaceDialog } from "./create-workspace-dialog.tsx";
export function CreateWorkspaceButton(props: { onCreated: (workspaceId: Workspace.Id) => void }) {
  const [open, setOpen] = createSignal(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        New workspace
      </Button>
      <Show when={open()}>
        <CreateWorkspaceDialog
          onClose={() => setOpen(false)}
          onCreated={(workspaceId) => {
            setOpen(false);
            props.onCreated(workspaceId);
          }}
        />
      </Show>
    </>
  );
}
