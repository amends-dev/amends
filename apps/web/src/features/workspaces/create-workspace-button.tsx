import type { Workspace } from "@amends/core/workspace";
import { Button } from "@amends/ui/components";
import { Exit } from "effect";
import { Workspaces } from "../../api/workspaces.ts";
import { useCommand } from "../../api/hooks.ts";
import { CommandError } from "../../components/query-view.tsx";
export function CreateWorkspaceButton(props: { onCreated: (workspaceId: Workspace.Id) => void }) {
  const command = useCommand(Workspaces.makeCreate());
  const create = async () => {
    const exit = await command.run(undefined);
    if (exit && Exit.isSuccess(exit)) props.onCreated(exit.value.id);
  };
  return (
    <>
      <Button variant="secondary" pending={command.pending()} onClick={() => void create()}>
        make a workspace
      </Button>
      <CommandError result={command.result()} />
    </>
  );
}
