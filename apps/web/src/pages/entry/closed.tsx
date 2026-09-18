import type { WorkspaceDirectory } from "@amends/gateway/directory";
import { Button, Notice, Text } from "@amends/ui/components";
import { useNavigate } from "@solidjs/router";
import { Show } from "solid-js";
import { href } from "../../routes.tsx";
import * as s from "./entry.css.ts";
import { Entry } from "./shell.tsx";

/** The membership ended, or never existed. Rejoining needs a fresh invitation. */
export function ClosedWorkspace(props: { membership?: WorkspaceDirectory.Membership | undefined }) {
  const navigate = useNavigate();
  return (
    <Entry title="That workspace is closed to you">
      <div class={s.stack}>
        <Show
          when={props.membership}
          fallback={
            <Notice tone="danger">
              You are not a member of this workspace. If someone shared a link with you, ask them
              for an invitation.
            </Notice>
          }
        >
          {(membership) => (
            <Notice tone="danger">
              <Text as="span" variant="label" tone="danger">
                NO LONGER A MEMBER
              </Text>
              <Text>
                Your membership of {membership().workspace.id} has ended. The work you did stays on
                that workspace's record; you cannot open it.
              </Text>
            </Notice>
          )}
        </Show>
        <Text tone="secondary">Rejoining needs a fresh invitation. An old link will not work.</Text>
        <div class={s.actions}>
          <Button variant="primary" onClick={() => navigate(href.picker({ choose: true }))}>
            your other workspaces
          </Button>
        </div>
      </div>
    </Entry>
  );
}
