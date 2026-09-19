import { Shell, Text, WorkspaceMark } from "@amends/ui/components";
import { A } from "@solidjs/router";
import { href } from "../../routes.tsx";
import { Show } from "solid-js";
import { useWorkspace } from "../../workspace/context.tsx";
import * as s from "../../components/chrome.css.ts";
export function WorkspaceIdentity() {
  const membership = useWorkspace();
  const sidebar = Shell.useSidebar();
  return (
    <A
      class={s.identity}
      href={href.picker({ choose: true })}
      aria-label="Switch workspace"
      onClick={sidebar.close}
    >
      <WorkspaceMark name={membership().workspace.id} />
      <Show when={!sidebar.compact()}>
        <span class={s.identityText}>
          <Text as="strong" variant="bodySmall" class={s.identityLine}>
            {membership().workspace.id}
          </Text>
          <Text as="span" variant="caption" class={s.identityLine}>
            {membership().workspace.ownerMemberId === membership().member.id ? "owner" : "member"} ·{" "}
            {membership().member.identity.id}
          </Text>
        </span>
      </Show>
    </A>
  );
}
